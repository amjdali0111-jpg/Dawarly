import "server-only";
import type { SessionContext } from "@/lib/auth";
import { isGlobalAdmin } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * University an admin page operates on. University admins are pinned to their
 * own university; global admins may pick one with ?u=<id>.
 */
export async function adminScope(session: SessionContext, requested?: string) {
  if (isGlobalAdmin(session) && requested && /^[0-9a-f-]{36}$/i.test(requested)) {
    const supabase = await getServerSupabase();
    const { data } = await supabase.from("universities").select("id, name_en, name_ar").eq("id", requested).maybeSingle();
    if (data) return data as { id: string; name_en: string; name_ar: string };
  }
  return { id: session.university.id, name_en: session.university.name_en, name_ar: session.university.name_ar };
}
