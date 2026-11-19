import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
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

/** Why a signed-in, verified user cannot use the app (see /account-issue). */
export type AccountIssue = "profile_missing" | "profile_deleted" | "university_unavailable";
export const ACCOUNT_ISSUES: readonly AccountIssue[] = ["profile_missing", "profile_deleted", "university_unavailable"];

export type SessionState =
  | { status: "anonymous" }
  | { status: "incomplete"; reason: AccountIssue; userId: string }
  | { status: "ok"; session: SessionContext };

/** Thrown for infrastructure failures so the error boundary (with retry) renders. */
class SessionLoadError extends Error {
  constructor(stage: string) {
    super(`Session could not be loaded (${stage})`);
    this.name = "SessionLoadError";
  }
}

/**
 * Resolves the signed-in, email-verified user with profile and university.
 * Uses getUser() (validated with the auth server), never the raw cookie.
 *
 * The three outcomes must stay distinct: the middleware treats every verified
 * auth user as signed in and bounces them away from /login, so sending a
 * signed-in user with no usable profile to /login would loop forever
 * (rendering a blank page). Database/auth outages throw instead.
 */
export const getSessionState = cache(async (): Promise<SessionState> => {
  if (!isSupabaseConfigured()) return { status: "anonymous" };
  const supabase = await getServerSupabase();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError && isAuthRetryableFetchError(userError)) {
    console.error("[auth] getUser failed (auth server unreachable)", { status: userError.status });
    throw new SessionLoadError("auth");
  }
  if (!user || !user.email_confirmed_at) return { status: "anonymous" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, university_id, full_name, avatar_path, member_type, role, faculty, academic_year, created_at, deleted_at")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  if (profileError) {
    console.error("[auth] profile query failed", { userId: user.id, code: profileError.code, message: profileError.message });
    throw new SessionLoadError("profile");
  }
  if (!profile) {
    console.warn("[auth] verified user has no profile row", { userId: user.id });
    return { status: "incomplete", reason: "profile_missing", userId: user.id };
  }
  if (profile.deleted_at) return { status: "incomplete", reason: "profile_deleted", userId: user.id };

  const [uniRes, privRes] = await Promise.all([
    supabase.from("universities").select("id, slug, name_en, name_ar, center_lat, center_lng, is_active").eq("id", profile.university_id).maybeSingle<University>(),
    supabase.from("profile_private").select("restricted_until, locale, email_notifications").eq("id", user.id).maybeSingle(),
  ]);
  if (uniRes.error) {
    console.error("[auth] university query failed", { userId: user.id, code: uniRes.error.code, message: uniRes.error.message });
    throw new SessionLoadError("university");
  }
  const university = uniRes.data;
  if (!university) {
    console.warn("[auth] user's university is missing or inactive", { userId: user.id, universityId: profile.university_id });
    return { status: "incomplete", reason: "university_unavailable", userId: user.id };
  }
  // Private settings are optional for rendering: fall back to defaults.
  if (privRes.error) console.warn("[auth] profile_private query failed", { userId: user.id, code: privRes.error.code });
  const priv = privRes.data;

  return {
    status: "ok",
    session: {
      userId: user.id,
      email: user.email ?? null,
      profile,
      university,
      restrictedUntil: (priv?.restricted_until as string | null) ?? null,
      locale: priv?.locale === "en" ? "en" : "ar",
      emailNotifications: priv?.email_notifications ?? true,
    },
  };
});

export const getSession = cache(async (): Promise<SessionContext | null> => {
  const s = await getSessionState();
  return s.status === "ok" ? s.session : null;
});

export async function requireSession(next?: string): Promise<SessionContext> {
  const s = await getSessionState();
  if (s.status === "ok") return s.session;
  if (s.status === "incomplete") redirect(`/account-issue?reason=${s.reason}`);
  redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
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
