"use server";
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { fail, okKey } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";

export async function markAllRead(_: ActionResult | null): Promise<ActionResult> {
  const s = await requireSession();
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", s.userId).is("read_at", null);
  if (error) return fail(error);
  revalidatePath("/notifications");
  return okKey("common.success");
}
