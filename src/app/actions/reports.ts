"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { reportSchema } from "@/lib/validation";
import { processReport } from "@/lib/matching/engine";
import { fail, kickEmailOutbox, okKey, optStr, str } from "@/lib/actions";
import { errorCode, type ActionResult } from "@/lib/errors";

function parsePayload(raw: string) {
  try {
    return reportSchema.safeParse(JSON.parse(raw));
  } catch {
    return reportSchema.safeParse({});
  }
}

function scheduleMatching(reportId: string) {
  // Runs after the response is sent; failures fall back to the cron sweep.
  after(async () => {
    try {
      await processReport(reportId);
    } catch (e) {
      console.error("[matching] background processing failed", (e as Error).message);
    }
  });
}

export async function createReport(raw: string): Promise<ActionResult<{ id: string; held: boolean }>> {
  await requireSession();
  const parsed = parsePayload(raw);
  if (!parsed.success) return fail(new Error(parsed.error.issues[0]?.message ?? "validation:type"));
  const supabase = await getServerSupabase();
  const { data: id, error } = await supabase.rpc("create_report", { p: parsed.data });
  if (error) return fail(error);
  const { data: row } = await supabase.from("reports").select("status").eq("id", id).single();
  scheduleMatching(id as string);
  kickEmailOutbox();
  revalidatePath("/my-reports");
  const held = row?.status === "under_review";
  return okKey(held ? "reports.createdHeld" : "reports.created", { id: id as string, held });
}

export async function updateReport(reportId: string, raw: string): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = parsePayload(raw);
  if (!parsed.success) return fail(new Error(parsed.error.issues[0]?.message ?? "validation:type"));
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("update_report", { p_report: reportId, p: parsed.data });
  if (error) return fail(error);
  const result = data as { material: boolean; removed_paths: string[] };
  if (result.removed_paths?.length) {
    // Owner's own uploads; storage RLS allows deleting only own files.
    await supabase.storage.from("report-images").remove(result.removed_paths);
  }
  if (result.material) scheduleMatching(reportId);
  revalidatePath(`/reports/${reportId}`);
  return okKey("reports.updated", { id: reportId });
}

export async function closeReport(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("close_report", { p_report: str(fd, "report_id"), p_note: optStr(fd, "note") });
  if (error) return fail(error);
  revalidatePath(`/reports/${str(fd, "report_id")}`);
  return okKey("common.success");
}

export async function renewReport(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const supabase = await getServerSupabase();
  const id = str(fd, "report_id");
  const { error } = await supabase.rpc("renew_report", { p_report: id });
  if (error) return fail(error);
  scheduleMatching(id);
  revalidatePath(`/reports/${id}`);
  return okKey("reports.renewed");
}

export async function requestRecovery(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("create_recovery_request", {
    p_report: str(fd, "report_id"),
    p_message: optStr(fd, "message"),
    p_verification_answer: optStr(fd, "verification_answer"),
    p_match: optStr(fd, "match_id"),
  });
  if (error) return fail(error);
  kickEmailOutbox();
  revalidatePath("/requests");
  return okKey("reports.requestSent");
}

export async function startConversation(fd: FormData) {
  await requireSession();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("start_conversation", { p_report: str(fd, "report_id") });
  if (error) redirect(`/reports/${str(fd, "report_id")}?error=${encodeURIComponent(errorCode(error) ?? "state:invalid")}`);
  redirect(`/messages/${data}`);
}

export async function submitAbuseReport(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("submit_abuse_report", {
    p_target_type: str(fd, "target_type"),
    p_target: str(fd, "target_id"),
    p_reason: str(fd, "reason"),
    p_details: optStr(fd, "details"),
  });
  if (error) return fail(error);
  return okKey("abuse.sent");
}
