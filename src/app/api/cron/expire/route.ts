import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/lib/cron";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { dispatchEmails } from "@/lib/email/dispatch";

export const dynamic = "force-dynamic";

// Idempotent: safe to run alongside pg_cron.
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;
  const { data, error } = await getServiceSupabase().rpc("expire_reports");
  if (error) return NextResponse.json({ error: "expire failed" }, { status: 500 });
  const emails = await dispatchEmails(50).catch(() => null);
  return NextResponse.json({ expired: data, emails });
}
