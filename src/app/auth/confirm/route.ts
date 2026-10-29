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
  if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }
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
