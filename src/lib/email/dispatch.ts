import "server-only";
import { getServiceSupabase, hasServiceRole } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";
import { publicEnv } from "@/lib/env";
import { renderNotificationEmail } from "./templates";

export interface EmailMessage { to: string; subject: string; html: string; text: string }
export type EmailSender = (msg: EmailMessage) => Promise<void>;

export const resendSender: EmailSender = async (msg) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${serverEnv.resendApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: serverEnv.emailFrom, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`email provider HTTP ${res.status}`);
};

const consoleSender: EmailSender = async (msg) => {
  console.info(`[email:console] to=${msg.to.replace(/(^.).*(@.*$)/, "$1***$2")} subject=${msg.subject}`);
};

export function configuredSender(): EmailSender | null {
  if (serverEnv.emailProvider === "resend" && serverEnv.resendApiKey) return resendSender;
  if (serverEnv.emailProvider === "console") return consoleSender;
  return null;
}

/**
 * Sends queued notification emails. Rows are claimed atomically (FOR UPDATE
 * SKIP LOCKED) so concurrent runs never double-send; failures are retried with
 * exponential backoff up to 3 attempts. In-app notifications are unaffected
 * by email failures.
 */
export async function dispatchEmails(limit = 25, sender: EmailSender | null = configuredSender()) {
  if (!hasServiceRole() || !sender) return { sent: 0, failed: 0, skipped: true };
  const sb = getServiceSupabase();
  const { data: batch, error } = await sb.rpc("claim_email_notifications", { p_limit: limit });
  if (error) throw new Error(`claim failed: ${error.message}`);
  let sent = 0, failed = 0;
  for (const n of (batch ?? []) as Array<{ id: string; kind: string; data: Record<string, unknown>; email: string | null; locale: string | null }>) {
    try {
      if (!n.email) throw new Error("no email address");
      const msg = renderNotificationEmail(n.kind, n.data, n.locale === "en" ? "en" : "ar", publicEnv.siteUrl);
      await sender({ to: n.email, ...msg });
      await sb.rpc("complete_email_notification", { p_id: n.id, p_ok: true });
      sent++;
    } catch (e) {
      await sb.rpc("complete_email_notification", { p_id: n.id, p_ok: false, p_error: (e as Error).message });
      failed++;
    }
  }
  return { sent, failed, skipped: false };
}
