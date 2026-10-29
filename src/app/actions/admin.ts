"use server";
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { isGlobalAdmin, isUniversityAdmin, requireSession } from "@/lib/auth";
import { fail, failKey, kickEmailOutbox, okKey, optStr, str } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";

// Every action is re-authorized by RLS / SECURITY DEFINER functions in the
// database; the checks here only provide early, friendly failures.
async function adminRpc(fn: string, args: Record<string, unknown>, path: string): Promise<ActionResult> {
  const s = await requireSession();
  if (!isUniversityAdmin(s)) return failKey("errors.auth:forbidden");
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc(fn, args);
  if (error) return fail(error);
  kickEmailOutbox();
  revalidatePath(path, "layout");
  return okKey("common.success");
}

export const reviewReport = async (_: ActionResult | null, fd: FormData) =>
  adminRpc("admin_review_report", { p_report: str(fd, "report_id"), p_decision: str(fd, "decision"), p_note: optStr(fd, "note") }, "/admin");

export const holdReport = async (_: ActionResult | null, fd: FormData) =>
  adminRpc("hold_report", { p_report: str(fd, "report_id"), p_reasons: ["admin"], p_source: "admin" }, "/admin");

export const adminCloseReport = async (_: ActionResult | null, fd: FormData) =>
  adminRpc("close_report", { p_report: str(fd, "report_id"), p_note: optStr(fd, "note") }, "/admin");

export const adminRenewReport = async (_: ActionResult | null, fd: FormData) =>
  adminRpc("renew_report", { p_report: str(fd, "report_id") }, "/admin");

export const setRole = async (_: ActionResult | null, fd: FormData) =>
  adminRpc("admin_set_role", { p_user: str(fd, "user_id"), p_role: str(fd, "role") }, "/admin/users");

export const restrictUser = async (_: ActionResult | null, fd: FormData) =>
  adminRpc("admin_restrict_user", { p_user: str(fd, "user_id"), p_days: Number(str(fd, "days")), p_reason: str(fd, "reason") }, "/admin/users");

export const liftRestriction = async (_: ActionResult | null, fd: FormData) =>
  adminRpc("admin_lift_restriction", { p_user: str(fd, "user_id") }, "/admin/users");

export const resolveAbuse = async (_: ActionResult | null, fd: FormData) =>
  adminRpc("admin_resolve_abuse", {
    p_abuse: str(fd, "abuse_id"), p_action: str(fd, "action"), p_note: optStr(fd, "note"), p_remove_content: fd.get("remove_content") === "on",
  }, "/admin/abuse");

export const resolveDispute = async (_: ActionResult | null, fd: FormData) =>
  adminRpc("admin_resolve_dispute", { p_dispute: str(fd, "dispute_id"), p_outcome: str(fd, "outcome"), p_resolution: str(fd, "resolution") }, "/admin/disputes");

export async function saveCategory(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!isUniversityAdmin(s)) return failKey("errors.auth:forbidden");
  const supabase = await getServerSupabase();
  const id = optStr(fd, "id");
  const fields = {
    name_en: str(fd, "name_en").trim().slice(0, 80),
    name_ar: str(fd, "name_ar").trim().slice(0, 80),
    is_sensitive: fd.get("is_sensitive") === "on",
    is_active: fd.get("is_active") === "on",
    sort_order: Number(str(fd, "sort_order")) || 100,
  };
  if (fields.name_en.length < 2 || fields.name_ar.length < 2) return failKey("errors.validation:category");
  const { error } = id
    ? await supabase.from("categories").update(fields).eq("id", id)
    : await supabase.from("categories").insert({
        ...fields,
        slug: str(fd, "slug").trim().toLowerCase(),
        university_id: fd.get("scope") === "global" && isGlobalAdmin(s) ? null : str(fd, "university_id") || s.university.id,
      });
  if (error) return fail(error);
  revalidatePath("/admin/categories");
  return okKey("common.success");
}

export async function saveUniversity(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!isGlobalAdmin(s)) return failKey("errors.auth:forbidden");
  const supabase = await getServerSupabase();
  const id = optStr(fd, "id");
  const num = (k: string) => (str(fd, k).trim() === "" ? null : Number(str(fd, k)));
  const fields = {
    name_en: str(fd, "name_en").trim(),
    name_ar: str(fd, "name_ar").trim(),
    center_lat: num("center_lat"),
    center_lng: num("center_lng"),
    is_active: fd.get("is_active") === "on",
  };
  const { error } = id
    ? await supabase.from("universities").update(fields).eq("id", id)
    : await supabase.from("universities").insert({ ...fields, slug: str(fd, "slug").trim().toLowerCase() });
  if (error) return fail(error);
  revalidatePath("/admin/universities");
  return okKey("common.success");
}
