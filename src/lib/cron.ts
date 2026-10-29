import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/server-env";

/** Cron endpoints require `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it). */
export function authorizeCron(req: NextRequest): NextResponse | null {
  const secret = serverEnv.cronSecret;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || secret.length < 16) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  const a = Buffer.from(given), b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}
