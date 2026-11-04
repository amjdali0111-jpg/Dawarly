import Link from "next/link";
import { ImageOff, Info, Sparkles } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { coverImages, formatDate } from "@/lib/data";
import { REPORT_COLUMNS, type MatchSuggestion, type Report } from "@/lib/types";
import { TypeBadge } from "@/components/Badges";
import { MatchActions } from "@/components/MatchActions";
import { RefreshMatchesButton } from "@/components/RefreshMatchesButton";
import type { TKey } from "@/i18n/translate";

export const metadata = { title: "AI matches" };

// Suggestions are shown in-app only. Discovering a match never sends a
// notification; users review and confirm before starting a recovery.
export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const session = await requireSession("/matches");
  const { t, locale } = await getT();
  const { report: reportFilter } = await searchParams;
  const supabase = await getServerSupabase();

  const { data: mine } = await supabase.from("reports").select(REPORT_COLUMNS).eq("owner_id", session.userId).in("status", ["active", "expired", "recovered", "under_review"]);
  const myReports = new Map(((mine ?? []) as unknown as Report[]).map((r) => [r.id, r]));
  const myIds = [...myReports.keys()].filter((id) => !reportFilter || id === reportFilter);

  let suggestions: MatchSuggestion[] = [];
  if (myIds.length) {
    const ids = myIds.join(",");
    const { data } = await supabase
      .from("match_suggestions")
      .select("id, university_id, lost_report_id, found_report_id, score, components, reasons, method, lost_decision, found_decision, created_at")
      .or(`lost_report_id.in.(${ids}),found_report_id.in.(${ids})`)
      .order("score", { ascending: false })
      .limit(100);
    suggestions = (data ?? []) as MatchSuggestion[];
  }
  const otherIds = suggestions.map((s) => (myReports.has(s.lost_report_id) ? s.found_report_id : s.lost_report_id));
  const { data: others } = otherIds.length
    ? await supabase.from("reports").select(REPORT_COLUMNS).in("id", otherIds)
    : { data: [] };
  const otherMap = new Map(((others ?? []) as unknown as Report[]).map((r) => [r.id, r]));
  const covers = await coverImages(supabase, [...myIds, ...otherIds]);

  const activeMine = [...myReports.values()].filter((r) => r.status === "active");
  const aiFailed = activeMine.some((r) => r.ai_status === "failed");
  const aiSkipped = activeMine.length > 0 && activeMine.every((r) => r.ai_status === "skipped");

  const Thumb = ({ r }: { r: Report }) => (
    <Link href={`/reports/${r.id}`} className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <span className="h-24 w-24 overflow-hidden rounded-xl bg-night-900">
        {covers.get(r.id) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={covers.get(r.id)} alt="" className="h-full w-full object-cover" />
        ) : <span className="flex h-full items-center justify-center text-slate-600"><ImageOff className="h-6 w-6" aria-hidden /></span>}
      </span>
      <TypeBadge type={r.type} />
      <span className="line-clamp-2 text-sm font-semibold text-white">{r.item_name}</span>
      <span className="text-xs text-slate-400">{formatDate(r.event_date, locale)}</span>
    </Link>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><Sparkles className="h-6 w-6 text-teal-300" aria-hidden />{t("matches.title")}</h1>
          <p className="muted">{t("matches.subtitle")}</p>
        </div>
        <RefreshMatchesButton />
      </div>
      <p className="alert-info flex gap-2"><Info className="h-4 w-4 shrink-0" aria-hidden />{t("matches.disclaimer")}</p>
      {aiFailed && <p className="alert-warn">{t("matches.aiUnavailable")}</p>}
      {!aiFailed && aiSkipped && <p className="alert-warn">{t("matches.aiNotConfigured")}</p>}

      {suggestions.length === 0 ? (
        <p className="card text-center text-slate-400">{t("matches.empty")}</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {suggestions.map((s) => {
            const mineIsLost = myReports.has(s.lost_report_id);
            const my = myReports.get(mineIsLost ? s.lost_report_id : s.found_report_id);
            const other = otherMap.get(mineIsLost ? s.found_report_id : s.lost_report_id);
            if (!my || !other) return null; // counterpart hidden (e.g. under review)
            const decision = mineIsLost ? s.lost_decision : s.found_decision;
            const pct = Math.round(s.score * 100);
            return (
              <li key={s.id} className="card space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1"><p className="mb-1 text-center text-xs text-slate-400">{t("matches.yourReport")}</p><Thumb r={my} /></div>
                  <div className="flex flex-col items-center" title={t("matches.similarityHelp")}>
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-teal-400/80 text-xl font-bold text-teal-200" style={{ background: `conic-gradient(rgba(63,227,212,.25) ${pct}%, transparent 0)` }}>
                      {pct}%
                    </div>
                    <span className="mt-1 text-xs text-slate-400">{t("matches.similarity")}</span>
                    <span className="badge-muted mt-1">{s.method === "ai" ? t("matches.methodAi") : t("matches.methodHeuristic")}</span>
                  </div>
                  <div className="flex-1"><p className="mb-1 text-center text-xs text-slate-400">{t("matches.theirReport")}</p><Thumb r={other} /></div>
                </div>
                {s.reasons.length > 0 && (
                  <div>
                    <p className="mb-1 text-sm font-semibold text-white">{t("matches.reasonsTitle")}</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {s.reasons.map((r) => <li key={r} className="badge bg-teal-400/10 text-teal-100">✓ {t(`matches.reasons.${r}` as TKey)}</li>)}
                    </ul>
                  </div>
                )}
                <MatchActions matchId={s.id} decision={decision} counterpartId={other.id} counterpartActive={other.status === "active"} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
