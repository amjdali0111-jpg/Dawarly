import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/validation";

// Handles email confirmation, password recovery and magic links.
// Supports both the token_hash flow and the PKCE ?code= flow.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNext(searchParams.get("next"), "/reports");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const supabase = await getServerSupabase();

  let ok = false;
  let failure: { status?: number; code?: string } | null = null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
    if (error) failure = { status: error.status, code: error.code };
  } else if (code) {
    // PKCE: only works in the browser that started sign-up (code verifier cookie).
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
    if (error) failure = { status: error.status, code: error.code };
  } else {
    failure = { code: "missing_token" };
  }
  if (failure) console.warn("[auth/confirm] verification failed", { flow: tokenHash ? "token_hash" : code ? "pkce" : "none", type, ...failure });
  const dest = request.nextUrl.clone();
  dest.search = "";
  if (ok) {
    dest.pathname = type === "recovery" ? "/reset-password" : next;
    if (type !== "recovery" && next === "/reports") dest.searchParams.set("verified", "1");
  } else {
    dest.pathname = "/login";
    dest.searchParams.set("error", "link");
  }
  return NextResponse.redirect(dest);
}
