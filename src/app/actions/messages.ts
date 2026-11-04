"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { fail, okKey, str } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";

export async function blockUser(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("blocks").insert({ blocker_id: s.userId, blocked_id: str(fd, "user_id") });
  if (error && error.code !== "23505") return fail(error);
  revalidatePath("/messages", "layout");
  return okKey("common.success");
}

export async function unblockUser(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("blocks").delete().eq("blocker_id", s.userId).eq("blocked_id", str(fd, "user_id"));
  if (error) return fail(error);
  revalidatePath("/settings");
  revalidatePath("/messages", "layout");
  return okKey("common.success");
}

export async function joinAsSecurity(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("security_join_conversation", { p_conversation: str(fd, "conversation_id") });
  if (error) return fail(error);
  redirect(`/messages/${str(fd, "conversation_id")}`);
}

export async function markConversationRead(conversationId: string) {
  const s = await requireSession();
  const supabase = await getServerSupabase();
  await supabase.from("conversation_participants").update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId).eq("user_id", s.userId);
}
