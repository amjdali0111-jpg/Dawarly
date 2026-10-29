import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { Profile, University } from "@/lib/types";

export interface SessionContext {
  userId: string;
  email: string | null;
  profile: Profile;
  university: University;
  restrictedUntil: string | null;
  locale: "ar" | "en";
  emailNotifications: boolean;
}

/**
 * Resolves the signed-in, email-verified user with profile and university.
 * Uses getUser() (validated with the auth server), never the raw cookie.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email_confirmed_at) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, university_id, full_name, avatar_path, member_type, role, faculty, academic_year, created_at, deleted_at")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  if (!profile || profile.deleted_at) return null;

  const [{ data: university }, { data: priv }] = await Promise.all([
    supabase.from("universities").select("id, slug, name_en, name_ar, center_lat, center_lng, is_active").eq("id", profile.university_id).maybeSingle<University>(),
    supabase.from("profile_private").select("restricted_until, locale, email_notifications").eq("id", user.id).maybeSingle(),
  ]);
  if (!university) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
    university,
    restrictedUntil: (priv?.restricted_until as string | null) ?? null,
    locale: priv?.locale === "en" ? "en" : "ar",
    emailNotifications: priv?.email_notifications ?? true,
  };
});

export async function requireSession(next?: string): Promise<SessionContext> {
  const s = await getSession();
  if (!s) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return s;
}

export const isUniversityAdmin = (s: SessionContext) => s.profile.role === "university_admin" || s.profile.role === "global_admin";
export const isGlobalAdmin = (s: SessionContext) => s.profile.role === "global_admin";
export const isSecurityStaff = (s: SessionContext) => s.profile.role === "security" || isUniversityAdmin(s);

/** Admin area guard (server-side). The database re-checks every action. */
export async function requireStaff(kind: "security" | "admin" | "global" = "admin") {
  const s = await requireSession("/admin");
  const ok = kind === "global" ? isGlobalAdmin(s) : kind === "admin" ? isUniversityAdmin(s) : isSecurityStaff(s);
  if (!ok) redirect("/reports?forbidden=1");
  return s;
}
