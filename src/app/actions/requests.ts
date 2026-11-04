"use server";
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { fail, kickEmailOutbox, okKey, optStr, str } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";

async function call(fn: string, args: Record<string, unknown>, okMessage: Parameters<typeof okKey>[0] = "common.success"): Promise<ActionResult> {
  await requireSession();
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc(fn, args);
  if (error) return fail(error);
  kickEmailOutbox();
  revalidatePath("/requests");
  return okKey(okMessage);
}

export async function respondRequest(_: ActionResult | null, fd: FormData) {
  const method = str(fd, "method") === "security" ? "security" : "direct";
  return call("respond_recovery_request", {
    p_request: str(fd, "request_id"), p_accept: str(fd, "accept") === "true", p_method: method, p_details: optStr(fd, "details"),
  });
}

export async function securityReview(_: ActionResult | null, fd: FormData) {
  return call("security_review_request", { p_request: str(fd, "request_id"), p_approve: str(fd, "approve") === "true", p_details: optStr(fd, "details") });
}

export async function withdrawRequest(_: ActionResult | null, fd: FormData) {
  return call("withdraw_recovery_request", { p_request: str(fd, "request_id") });
}

export async function confirmHandover(_: ActionResult | null, fd: FormData) {
  return call("confirm_handover", { p_request: str(fd, "request_id") });
}

export async function reportHandoverFailed(_: ActionResult | null, fd: FormData) {
  return call("report_handover_failed", { p_request: str(fd, "request_id"), p_reason: str(fd, "reason").slice(0, 500) });
}

export async function openDispute(_: ActionResult | null, fd: FormData) {
  return call("open_dispute", { p_request: str(fd, "request_id"), p_reason: str(fd, "reason").slice(0, 1000) }, "requests.disputeOpened");
}

export async function submitRating(_: ActionResult | null, fd: FormData) {
  return call("submit_rating", { p_request: str(fd, "request_id"), p_stars: Number(str(fd, "stars")), p_comment: optStr(fd, "comment") }, "requests.ratingSent");
}
