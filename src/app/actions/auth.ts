"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { publicEnv } from "@/lib/env";
import { passwordSchema, registerSchema, safeNext } from "@/lib/validation";
import { failKey, okKey, str } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  // Persist the preference for email language when signed in (RLS: own row only).
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await supabase.from("profile_private").update({ locale }).eq("id", user.id);
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return publicEnv.siteUrl || (host ? `${proto}://${host}` : "");
}

export async function login(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email: str(fd, "email").trim().toLowerCase(), password: str(fd, "password") });
  if (error) {
    if (/confirm/i.test(error.message) || error.code === "email_not_confirmed") return failKey("auth.errors.emailNotConfirmed");
    if (error.status === 429) return failKey("auth.errors.rateLimited");
    return failKey("auth.errors.invalidCredentials");
  }
  redirect(safeNext(str(fd, "next")));
}

export async function register(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message ?? "nameRequired";
    return failKey(`auth.errors.${code}` as "auth.errors.nameRequired");
  }
  const v = parsed.data;
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
    if (/registered|exists/i.test(error.message)) return failKey("auth.errors.alreadyRegistered");
    if (/password/i.test(error.message)) return failKey("auth.errors.weakPassword");
    if (/university/i.test(error.message)) return failKey("auth.errors.universityRequired");
    return failKey("common.genericError");
  }
  // Supabase returns a user with no identities when the email already exists
  // (to avoid account enumeration we show the same "check your email" screen).
  void data;
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
