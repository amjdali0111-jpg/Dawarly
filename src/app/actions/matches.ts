"use server";
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { processReport } from "@/lib/matching/engine";
import { fail, failKey, okKey, str } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";

export async function decideMatch(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const decision = str(fd, "decision");
  if (!["confirmed", "dismissed", "pending"].includes(decision)) return failKey("errors.validation:match");
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("decide_match", { p_match: str(fd, "match_id"), p_decision: decision });
  if (error) return fail(error);
  revalidatePath("/matches");
  return okKey("common.success");
}

const lastRefresh = new Map<string, number>();

/** Re-runs matching for the caller's own active reports (rate-limited). */
export async function refreshMatches(_: ActionResult | null, __: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const now = Date.now();
  if (now - (lastRefresh.get(session.userId) ?? 0) < 60_000) return failKey("auth.errors.rateLimited");
  lastRefresh.set(session.userId, now);
  const supabase = await getServerSupabase();
  const { data } = await supabase.from("reports").select("id").eq("owner_id", session.userId).eq("status", "active").limit(10);
  for (const r of data ?? []) await processReport(r.id);
  revalidatePath("/matches");
  return okKey("matches.refreshed");
}
