import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/lib/cron";
import { processPendingReports } from "@/lib/matching/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Retries AI processing for reports whose AI step failed or never ran.
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;
  const results = await processPendingReports(15);
  return NextResponse.json({ processed: results.length, results });
}
