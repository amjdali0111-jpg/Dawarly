import "server-only";
import { getServiceSupabase, hasServiceRole } from "@/lib/supabase/admin";
import { aiConfig, analyzeImage, embedTexts, type ImageAnalysis } from "./ai";
import { embeddingText, MATCH_THRESHOLD, scorePair, type MatchableReport } from "./score";

const MAX_SUGGESTIONS_PER_REPORT = 20;
const CANDIDATE_LIMIT = 300;
const CANDIDATE_WINDOW_DAYS = 60;
const MAX_AI_ATTEMPTS = 5;

type ImageRow = { id: string; storage_path: string; ai_analysis: ImageAnalysis | null; ai_embedding: number[] | null };
type ReportRow = MatchableReport & {
  university_id: string;
  status: string;
  is_sensitive: boolean;
  ai_status: string;
  ai_attempts: number;
  report_images: ImageRow[];
  categories: { name_en: string } | null;
};

const SELECT =
  "id, university_id, type, status, is_sensitive, item_name, description, distinguishing_features, category_id, color, location_text, approx_lat, approx_lng, event_date, embedding, ai_status, ai_attempts, categories(name_en), report_images(id, storage_path, ai_analysis, ai_embedding)";

export interface ProcessResult {
  reportId: string;
  ai: "done" | "failed" | "skipped";
  suggestions: number;
}

const addDays = (d: string, n: number) => new Date(new Date(d + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);

/**
 * (Re)computes AI features and match suggestions for one report.
 * Idempotent: suggestions are upserted on (lost_report_id, found_report_id) and
 * users' decisions are never overwritten. Creates no notifications.
 */
export async function processReport(reportId: string): Promise<ProcessResult | null> {
  if (!hasServiceRole()) return null;
  const sb = getServiceSupabase();
  const { data: report, error } = await sb.from("reports").select(SELECT).eq("id", reportId).maybeSingle<ReportRow>();
  if (error || !report) return null;

  const cfg = aiConfig();
  let aiOutcome: ProcessResult["ai"] = cfg.embeddings || cfg.vision ? "done" : "skipped";

  if (aiOutcome === "done" && (report.ai_status !== "done" || !report.embedding)) {
    try {
      await enrichWithAi(report);
    } catch (e) {
      console.warn("[matching] AI processing failed; using non-AI matching", { reportId, error: (e as Error).message });
      aiOutcome = "failed";
    }
  }

  await sb.from("reports").update({
    ai_status: aiOutcome,
    ai_attempts: aiOutcome === "failed" ? report.ai_attempts + 1 : 0,
    ai_processed_at: new Date().toISOString(),
    ...(report.embedding ? { embedding: report.embedding, embedding_model: "configured" } : {}),
  }).eq("id", report.id);

  if (report.status !== "active") return { reportId, ai: aiOutcome, suggestions: 0 };
  const suggestions = await refreshSuggestions(report);
  return { reportId, ai: aiOutcome, suggestions };
}

async function enrichWithAi(report: ReportRow) {
  const sb = getServiceSupabase();
  const cfg = aiConfig();

  if (cfg.vision) {
    for (const img of report.report_images.slice(0, 3)) {
      if (img.ai_analysis) continue;
      const { data: blob, error } = await sb.storage.from("report-images").download(img.storage_path);
      if (error || !blob) throw new Error("image download failed");
      const analysis = await analyzeImage(new Uint8Array(await blob.arrayBuffer()), blob.type);
      img.ai_analysis = analysis;
      await sb.from("report_images").update({ ai_analysis: analysis }).eq("id", img.id);
      await applyImageSafetySignals(report, analysis);
    }
  }

  if (cfg.embeddings) {
    const imgs = report.report_images.filter((i) => i.ai_analysis && !i.ai_embedding);
    const texts = [
      embeddingText(report, report.categories?.name_en),
      ...imgs.map((i) => `${i.ai_analysis!.description}\ncolors: ${i.ai_analysis!.colors.join(", ")}\nobjects: ${i.ai_analysis!.objects.join(", ")}`),
    ];
    const vectors = await embedTexts(texts);
    report.embedding = vectors[0];
    for (let k = 0; k < imgs.length; k++) {
      imgs[k].ai_embedding = vectors[k + 1];
      await sb.from("report_images").update({ ai_embedding: vectors[k + 1] }).eq("id", imgs[k].id);
    }
  }
}

/** AI image signals may only escalate protection (never relax it). */
async function applyImageSafetySignals(report: ReportRow, analysis: ImageAnalysis) {
  const sb = getServiceSupabase();
  if (analysis.contains_identity_document && !report.is_sensitive) {
    report.is_sensitive = true;
    await sb.from("reports").update({ is_sensitive: true, sensitive_reason: "ai_image" }).eq("id", report.id);
    await sb.from("audit_events").insert({
      university_id: report.university_id, actor_id: null, action: "report.routed_to_security",
      target_type: "report", target_id: report.id, metadata: { reason: "ai_image" },
    });
  }
  if (analysis.unsafe && report.status === "active") {
    await sb.rpc("hold_report", { p_report: report.id, p_reasons: ["ai_unsafe"], p_source: "ai" });
    report.status = "under_review";
  }
}

function toMatchable(r: ReportRow): MatchableReport {
  return {
    ...r,
    embedding: r.embedding ?? null,
    imageEmbeddings: r.report_images.map((i) => i.ai_embedding).filter((e): e is number[] => Array.isArray(e) && e.length > 0),
  };
}

async function refreshSuggestions(report: ReportRow) {
  const sb = getServiceSupabase();
  const opposite = report.type === "lost" ? "found" : "lost";
  const { data: candidates } = await sb
    .from("reports")
    .select(SELECT)
    .eq("university_id", report.university_id) // never match across universities
    .eq("type", opposite)
    .eq("status", "active")
    .gte("event_date", addDays(report.event_date, -CANDIDATE_WINDOW_DAYS))
    .lte("event_date", addDays(report.event_date, CANDIDATE_WINDOW_DAYS))
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_LIMIT)
    .returns<ReportRow[]>();

  const self = toMatchable(report);
  const scored = (candidates ?? [])
    .filter((c) => c.university_id === report.university_id)
    .map((c) => ({ c, result: scorePair(self, toMatchable(c)) }))
    .filter((x) => x.result.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, MAX_SUGGESTIONS_PER_REPORT);

  if (scored.length) {
    const rows = scored.map(({ c, result }) => ({
      university_id: report.university_id,
      lost_report_id: report.type === "lost" ? report.id : c.id,
      found_report_id: report.type === "found" ? report.id : c.id,
      score: result.score,
      components: result.components,
      reasons: result.reasons,
      method: result.method,
    }));
    const { error } = await sb.from("match_suggestions").upsert(rows, { onConflict: "lost_report_id,found_report_id" });
    if (error) console.error("[matching] upsert failed", error.message);
  }
  return scored.length;
}

/** Background sweep: reports never processed or whose AI step failed. */
export async function processPendingReports(limit = 20) {
  if (!hasServiceRole()) return [];
  const sb = getServiceSupabase();
  const { data } = await sb
    .from("reports")
    .select("id")
    .in("ai_status", ["pending", "failed"])
    .lt("ai_attempts", MAX_AI_ATTEMPTS)
    .in("status", ["active", "under_review"])
    .order("updated_at", { ascending: true })
    .limit(limit);
  const out: ProcessResult[] = [];
  for (const row of data ?? []) {
    const r = await processReport(row.id);
    if (r) out.push(r);
  }
  return out;
}
