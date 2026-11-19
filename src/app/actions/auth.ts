"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { configuredSiteUrl, isSupabaseConfigured, publicEnv } from "@/lib/env";
import { passwordSchema, registerSchema, safeNext } from "@/lib/validation";
import { failKey, okKey, str } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  // Persist the preference for email language when signed in (RLS: own row only).
  if (!isSupabaseConfigured()) return;
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await supabase.from("profile_private").update({ locale }).eq("id", user.id);
}

/**
 * Base URL for links in auth emails. An explicitly configured
 * NEXT_PUBLIC_SITE_URL wins; otherwise the current request's host is used
 * (publicEnv.siteUrl falls back to localhost, which must never end up in a
 * production email). Supabase only honours URLs on its redirect allow-list.
 */
async function origin() {
  if (configuredSiteUrl) return configuredSiteUrl;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return publicEnv.siteUrl;
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

const isServiceError = (status: number | undefined) => !status || status >= 500;

export async function login(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return failKey("common.notConfigured");
  const email = str(fd, "email").trim().toLowerCase();
  const password = str(fd, "password");
  if (!email || !password) return failKey("auth.errors.invalidCredentials");
  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed" || /confirm/i.test(error.message)) return failKey("auth.errors.emailNotConfirmed");
    if (error.status === 429) return failKey("auth.errors.rateLimited");
    if (isServiceError(error.status)) {
      console.error("[auth] signInWithPassword failed", { status: error.status, code: error.code });
      return failKey("auth.errors.serviceUnavailable");
    }
    return failKey("auth.errors.invalidCredentials");
  }
  // Never redirect back to an auth page (the middleware would bounce it anyway).
  const next = safeNext(str(fd, "next"));
  redirect(/^\/(login|register|forgot-password|account-issue)(\/|\?|$)/.test(next) ? "/reports" : next);
}

export async function register(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message ?? "nameRequired";
    return failKey(`auth.errors.${code}` as "auth.errors.nameRequired");
  }
  const v = parsed.data;
  if (!isSupabaseConfigured()) return failKey("common.notConfigured");
  const { locale } = await getT();
  const supabase = await getServerSupabase();
  // Profile is created by a database trigger from this metadata. Role is never
  // taken from the client: every new account starts as a regular user.
  const { data, error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      emailRedirectTo: `${await origin()}/auth/confirm?next=/reports`,
      data: {
        full_name: v.full_name,
        university_id: v.university_id,
        member_type: v.member_type,
        faculty: v.faculty || null,
        academic_year: v.academic_year ?? null,
        locale,
      },
    },
  });
  if (error) {
    if (error.status === 429) return failKey("auth.errors.rateLimited");
    if (error.code === "user_already_exists" || /registered|exists/i.test(error.message)) return failKey("auth.errors.alreadyRegistered");
    if (error.code === "weak_password" || /password/i.test(error.message)) return failKey("auth.errors.weakPassword");
    // The confirmation email could not be sent (e.g. Supabase's built-in mailer
    // only delivers to project members until a custom SMTP provider is set).
    if (error.code === "email_address_not_authorized" || /sending (confirmation|magic link) email|email address not authorized/i.test(error.message)) {
      console.error("[auth] signUp confirmation email not sent", { status: error.status, code: error.code });
      return failKey("auth.errors.emailDeliveryFailed");
    }
    // handle_new_user() raises "signup:university" for a missing/inactive
    // university; GoTrue hides it behind a generic 500 "Database error saving
    // new user" (sometimes without an error code).
    if (/university|database error saving new user/i.test(error.message) || error.code === "unexpected_failure") {
      console.error("[auth] signUp rejected by database trigger", { status: error.status, code: error.code, message: error.message });
      return failKey("auth.errors.universityUnavailable");
    }
    console.error("[auth] signUp failed", { status: error.status, code: error.code, message: error.message });
    return failKey(isServiceError(error.status) ? "auth.errors.serviceUnavailable" : "common.genericError");
  }
  // Supabase returns a user with no identities when the email already exists
  // (to avoid account enumeration we show the same "check your email" screen).
  // If email confirmation is disabled in Supabase a session is returned
  // immediately; the user can go straight in.
  if (data.session) redirect("/reports");
  return okKey("auth.checkEmailBody", undefined, { email: v.email });
}

export async function forgotPassword(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const email = str(fd, "email").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return failKey("auth.errors.invalidEmail");
  const supabase = await getServerSupabase();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await origin()}/auth/confirm?next=/reset-password` });
  // Same response whether or not the account exists.
  return okKey("auth.resetSent");
}

export async function updatePassword(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const pw = passwordSchema.safeParse(str(fd, "password"));
  if (!pw.success) return failKey("auth.errors.weakPassword");
  if (str(fd, "password") !== str(fd, "confirm_password")) return failKey("auth.errors.passwordMismatch");
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failKey("auth.linkInvalid");
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) return failKey("auth.errors.weakPassword");
  return okKey("auth.passwordUpdated");
}

export async function signOut() {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  redirect("/");
}
