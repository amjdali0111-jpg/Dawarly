import { describe, expect, it, vi } from "vitest";
import { renderNotificationEmail } from "@/lib/email/templates";

describe("notification emails", () => {
  it("are localized and contain no item details or private data", () => {
    const ar = renderNotificationEmail("request_status", { status: "accepted", request_id: "r1", secret: "ID 1234" }, "ar", "https://app.example");
    expect(ar.html).toContain('dir="rtl"');
    expect(ar.subject).toContain("تم ترتيب التسليم");
    expect(ar.html).not.toContain("1234");
    const en = renderNotificationEmail("new_message", { conversation_id: "c" }, "en", "https://app.example");
    expect(en.subject).toContain("New message");
    expect(en.text).toContain("https://app.example/notifications");
  });
  it("escapes HTML", () => {
    const e = renderNotificationEmail("<script>", {}, "en", "https://x");
    expect(e.html).not.toContain("<script>");
  });
});

describe("email dispatch", () => {
  it("marks failures for retry and keeps going; success marks sent", async () => {
    vi.resetModules();
    const calls: Array<[string, Record<string, unknown>]> = [];
    const batch = [
      { id: "n1", kind: "request_received", data: {}, email: "a@example.com", locale: "en" },
      { id: "n2", kind: "request_received", data: {}, email: "b@example.com", locale: "ar" },
    ];
    vi.doMock("@/lib/supabase/admin", () => ({
      hasServiceRole: () => true,
      getServiceSupabase: () => ({
        rpc: async (fn: string, args: Record<string, unknown>) => {
          calls.push([fn, args]);
          return fn === "claim_email_notifications" ? { data: batch, error: null } : { data: null, error: null };
        },
      }),
    }));
    const { dispatchEmails } = await import("@/lib/email/dispatch");
    const sender = vi.fn(async (m: { to: string }) => { if (m.to.startsWith("b")) throw new Error("smtp down"); });
    const res = await dispatchEmails(10, sender);
    expect(res).toEqual({ sent: 1, failed: 1, skipped: false });
    expect(calls.filter(([f]) => f === "complete_email_notification").map(([, a]) => [a.p_id, a.p_ok])).toEqual([["n1", true], ["n2", false]]);
  });
  it("is a no-op without a configured sender (in-app notifications unaffected)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/admin", () => ({ hasServiceRole: () => true, getServiceSupabase: () => ({}) }));
    const { dispatchEmails } = await import("@/lib/email/dispatch");
    expect(await dispatchEmails(10, null)).toEqual({ sent: 0, failed: 0, skipped: true });
  });
});
