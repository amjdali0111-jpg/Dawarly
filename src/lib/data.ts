import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category } from "@/lib/types";

export async function getCategories(supabase: SupabaseClient, includeInactive = false) {
  let q = supabase.from("categories").select("id, university_id, slug, name_en, name_ar, icon, is_sensitive, is_active, sort_order").order("sort_order");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data } = await q;
  return (data ?? []) as Category[];
}

/**
 * Short-lived signed URLs, created with the viewer's session so storage RLS
 * decides what they may see (e.g. sensitive-item photos stay hidden).
 */
export async function signedUrls(supabase: SupabaseClient, bucket: string, paths: string[], ttl = 900) {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, ttl);
  for (const row of data ?? []) if (row.signedUrl && row.path) out.set(row.path, row.signedUrl);
  return out;
}

/** First visible photo per report (RLS on report_images applies). */
export async function coverImages(supabase: SupabaseClient, reportIds: string[]) {
  if (!reportIds.length) return new Map<string, string>();
  const { data } = await supabase.from("report_images").select("report_id, storage_path, position").in("report_id", reportIds).eq("position", 0);
  const urls = await signedUrls(supabase, "report-images", (data ?? []).map((r) => r.storage_path));
  const out = new Map<string, string>();
  for (const r of data ?? []) {
    const u = urls.get(r.storage_path);
    if (u) out.set(r.report_id, u);
  }
  return out;
}

export async function profileNames(supabase: SupabaseClient, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, { full_name: string; avatar_path: string | null; deleted: boolean }>();
  const { data } = await supabase.from("profiles").select("id, full_name, avatar_path, deleted_at").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id as string, { full_name: p.full_name as string, avatar_path: p.avatar_path as string | null, deleted: Boolean(p.deleted_at) }]));
}

export const categoryLabel = (c: Pick<Category, "name_en" | "name_ar"> | undefined | null, locale: string) =>
  c ? (locale === "ar" ? c.name_ar : c.name_en) : "";

export function formatDate(d: string | Date, locale: string, withTime = false) {
  const date = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00" : d) : d;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", {
    year: "numeric", month: "short", day: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}
