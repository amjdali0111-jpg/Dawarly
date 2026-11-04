import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/lib/cron";
import { dispatchEmails } from "@/lib/email/dispatch";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await dispatchEmails(100));
  } catch {
    return NextResponse.json({ error: "dispatch failed" }, { status: 500 });
  }
}
