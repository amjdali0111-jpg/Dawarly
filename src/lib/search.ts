import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expandSearchToken, searchWords, toIlikePattern } from "@/lib/matching/text";
import { REPORT_COLUMNS, type Report, type ReportStatus } from "@/lib/types";

export interface ReportFilters {
  q?: string;
  type?: string;
  category?: string;
  color?: string;
  from?: string;
  to?: string;
  location?: string;
  status?: string;
  page?: string;
}

export const PAGE_SIZE = 20;
const PUBLIC_STATUSES: ReportStatus[] = ["active", "expired", "recovered", "closed"];
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isUuid = (s?: string) => !!s && /^[0-9a-f-]{36}$/i.test(s);

/**
 * Conventional search over the caller's university. RLS restricts rows to the
 * caller's university as well; the explicit filter keeps queries efficient.
 */
export async function searchReports(supabase: SupabaseClient, universityId: string, f: ReportFilters, opts: { staff: boolean }) {
  let q = supabase.from("reports").select(REPORT_COLUMNS, { count: "exact" }).eq("university_id", universityId);

  const allowed: ReportStatus[] = opts.staff ? [...PUBLIC_STATUSES, "under_review", "removed"] : PUBLIC_STATUSES;
  const status = (f.status ?? "active") as ReportStatus | "all";
  if (status === "all") q = q.in("status", allowed);
  else q = q.eq("status", allowed.includes(status) ? status : "active");

  if (f.type === "lost" || f.type === "found") q = q.eq("type", f.type);
  if (isUuid(f.category)) q = q.eq("category_id", f.category!);
  if (isDate(f.from)) q = q.gte("event_date", f.from!);
  if (isDate(f.to)) q = q.lte("event_date", f.to!);
  if (f.color?.trim()) {
    const alts = expandSearchToken(f.color.trim()).map(toIlikePattern).filter(Boolean);
    q = q.or(alts.map((a) => `color.ilike.%${a}%`).join(","));
  }
  if (f.location?.trim()) q = q.ilike("location_text", `%${toIlikePattern(f.location)}%`);

  for (const word of searchWords(f.q ?? "")) {
    const alts = expandSearchToken(word).map(toIlikePattern).filter(Boolean);
    const cols = ["item_name", "description", "distinguishing_features", "color", "location_text"];
    q = q.or(alts.flatMap((a) => cols.map((c) => `${c}.ilike.%${a}%`)).join(","));
  }

  const page = Math.max(1, Math.min(500, Number(f.page) || 1));
  q = q.order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data, count, error } = await q;
  return { reports: (data ?? []) as unknown as Report[], count: count ?? 0, page, error };
}
