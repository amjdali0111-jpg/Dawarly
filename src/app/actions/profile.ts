"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase, hasServiceRole } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth";
import { profileSchema } from "@/lib/validation";
import { fail, failKey, okKey, str } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";

export async function updateProfile(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  const parsed = profileSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return failKey("auth.errors.nameRequired");
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("profiles").update({
    full_name: parsed.data.full_name,
    member_type: parsed.data.member_type,
    faculty: parsed.data.faculty || null,
    academic_year: parsed.data.member_type === "student" ? parsed.data.academic_year : null,
  }).eq("id", s.userId);
  if (error) return fail(error);
  revalidatePath("/profile");
  return okKey("profile.saved");
}

export async function setAvatar(path: string): Promise<ActionResult> {
  const s = await requireSession();
  if (!path.startsWith(`${s.userId}/`) || path.includes("..")) return failKey("errors.validation:image_path");
  const supabase = await getServerSupabase();
  const old = s.profile.avatar_path;
  const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", s.userId);
  if (error) return fail(error);
  if (old && old !== path) await supabase.storage.from("avatars").remove([old]);
  revalidatePath("/profile");
  return okKey("profile.saved");
}

export async function updateSettings(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("profile_private").update({ email_notifications: fd.get("email_notifications") === "on" }).eq("id", s.userId);
  if (error) return fail(error);
  revalidatePath("/settings");
  return okKey("common.success");
}

/**
 * Self-service account deletion. The database reports blockers (open reports,
 * outstanding requests, ratings) for which the product policy is not yet
 * decided; deletion is refused while any exist. Otherwise personal data is
 * removed and retained records are anonymised (see handle_deleted_user()).
 */
export async function deleteAccount(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (str(fd, "confirm") !== "DELETE") return failKey("settings.deleteConfirmLabel");
  const supabase = await getServerSupabase();
  const { data: blockers, error } = await supabase.rpc("account_deletion_blockers");
  if (error) return fail(error);
  if ((blockers as string[]).length) return failKey("settings.deleteBlocked");
  if (!hasServiceRole()) return failKey("common.genericError");

  const admin = getServiceSupabase();
  const { data: files } = await admin.storage.from("avatars").list(s.userId);
  if (files?.length) await admin.storage.from("avatars").remove(files.map((f) => `${s.userId}/${f.name}`));
  const { error: delErr } = await admin.auth.admin.deleteUser(s.userId);
  if (delErr) return fail(delErr);
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
