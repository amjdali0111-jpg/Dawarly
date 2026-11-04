import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  as, asService, categoryId, createReport, createUniversity, createUser, expectError, pool, query, rpc, upload, visibleCount,
} from "./helpers";

const status = async (table: string, id: string) =>
  (await query<{ status: string }>(`select status from public.${table} where id = $1`, [id]))[0].status;

describe("recovery requests, handover, ratings", () => {
  let uni: string, otherUni: string;
  let finder: string, claimant1: string, claimant2: string, security: string, otherSecurity: string, uniAdmin: string, outsider: string;

  beforeAll(async () => {
    uni = await createUniversity();
    otherUni = await createUniversity();
    finder = await createUser(uni);
    claimant1 = await createUser(uni);
    claimant2 = await createUser(uni);
    security = await createUser(uni, { role: "security" });
    uniAdmin = await createUser(uni, { role: "university_admin" });
    otherSecurity = await createUser(otherUni, { role: "security" });
    outsider = await createUser(otherUni);
  });
  afterEach(() => query("update public.reports set created_at = created_at - interval '2 hours'"));
  afterAll(() => pool.end());

  it("accepts multiple requests from different users but not duplicates from the same user", async () => {
    const found = await createReport(finder, { type: "found" });
    const r1 = await rpc<string>(claimant1, "create_recovery_request", [found, "It's mine", "It has a sticker", null]);
    const r2 = await rpc<string>(claimant2, "create_recovery_request", [found, "Mine too?", null, null]);
    expect(r1).not.toBe(r2);
    await expectError(rpc(claimant1, "create_recovery_request", [found, "again", null, null]), "state:duplicate_request");
    await expectError(rpc(finder, "create_recovery_request", [found, null, null, null]), "state:own_report");
    // The report owner is notified; requests are private to the parties.
    expect(await query("select 1 from public.notifications where user_id = $1 and kind = 'request_received'", [finder])).toHaveLength(2);
    expect(await visibleCount(claimant2, "select 1 from public.recovery_requests where id = $1", [r1])).toBe(0);
    expect(await visibleCount(finder, "select 1 from public.recovery_requests where report_id = $1", [found])).toBe(2);
  });

  it("direct handover: owner accepts, one confirmation stays pending, both confirmations complete it", async () => {
    const found = await createReport(finder, { type: "found" });
    const req = await rpc<string>(claimant1, "create_recovery_request", [found, "mine", "answer", null]);
    const req2 = await rpc<string>(claimant2, "create_recovery_request", [found, "mine?", null, null]);

    await expectError(rpc(claimant2, "respond_recovery_request", [req, true, "direct", null]), "auth:forbidden");
    await expectError(rpc(claimant1, "confirm_handover", [req]), "state:invalid"); // not accepted yet
    await rpc(finder, "respond_recovery_request", [req, true, "direct", "Library entrance at 2pm"]);
    await expectError(rpc(finder, "respond_recovery_request", [req2, true, "direct", null]), "state:already_accepted");
    expect(await status("recovery_requests", req)).toBe("accepted");

    // Item owner here is the claimant (found report). One side only → still pending.
    expect(await rpc(claimant1, "confirm_handover", [req])).toBe("pending");
    expect(await rpc(claimant1, "confirm_handover", [req])).toBe("pending"); // idempotent
    expect(await status("recovery_requests", req)).toBe("accepted");
    expect(await status("reports", found)).toBe("active");
    await expectError(rpc(claimant2, "confirm_handover", [req]), "auth:forbidden");
    // Even long after, nothing auto-completes on a timer.
    await asService((c) => c.query("select public.expire_reports()"));
    expect(await status("recovery_requests", req)).toBe("accepted");

    expect(await rpc(finder, "confirm_handover", [req])).toBe("completed");
    expect(await status("recovery_requests", req)).toBe("completed");
    expect(await status("reports", found)).toBe("recovered");
    expect(await status("recovery_requests", req2)).toBe("cancelled");
    expect(await query("select 1 from public.audit_events where action = 'recovery.completed' and target_id = $1", [req])).toHaveLength(1);
  });

  it("ratings: only the item owner, only after completion, only once, visible within the university", async () => {
    const lost = await createReport(claimant1, { type: "lost" });
    const req = await rpc<string>(finder, "create_recovery_request", [lost, "I found it", null, null]);
    // For a LOST report the requester is the finder; the report owner owns the item.
    await expectError(rpc(claimant1, "submit_rating", [req, 5, "thanks"]), "state:not_completed");
    await rpc(claimant1, "respond_recovery_request", [req, true, "direct", null]);
    await rpc(claimant1, "confirm_handover", [req]);
    await expectError(rpc(claimant1, "submit_rating", [req, 5, null]), "state:not_completed");
    await rpc(finder, "confirm_handover", [req]);

    await expectError(rpc(finder, "submit_rating", [req, 5, null]), "auth:forbidden");
    await expectError(rpc(claimant1, "submit_rating", [req, 6, null]), "validation:stars");
    await expectError(rpc(claimant1, "submit_rating", [req, 0, null]), "validation:stars");
    const ratingId = await rpc<string>(claimant1, "submit_rating", [req, 4, "Very helpful"]);
    await expectError(rpc(claimant1, "submit_rating", [req, 5, null]), "state:already_rated");

    const [row] = await query<{ ratee_id: string; rater_id: string }>("select ratee_id, rater_id from public.ratings where id = $1", [ratingId]);
    expect(row).toEqual({ ratee_id: finder, rater_id: claimant1 });
    expect(await visibleCount(claimant2, "select 1 from public.ratings where id = $1", [ratingId])).toBe(1);
    expect(await visibleCount(outsider, "select 1 from public.ratings where id = $1", [ratingId])).toBe(0);
    const [summaryOut] = await as(outsider, async (c) => (await c.query("select * from public.user_rating_summary($1)", [finder])).rows);
    expect(Number(summaryOut.total)).toBe(0);
    const [summaryIn] = await as(claimant2, async (c) => (await c.query("select * from public.user_rating_summary($1)", [finder])).rows);
    expect(Number(summaryIn.total)).toBe(1);

    // Abusive feedback can be reported and hidden by an admin.
    const abuse = await rpc<string>(finder, "submit_abuse_report", ["rating", ratingId, "harassment", "not true"]);
    await rpc(uniAdmin, "admin_resolve_abuse", [abuse, "action", "hide", true]);
    expect(await visibleCount(claimant2, "select 1 from public.ratings where id = $1", [ratingId])).toBe(0);
  });

  it("sensitive items are routed to security, which reviews and co-confirms the handover", async () => {
    const found = await createReport(finder, { type: "found", category_id: await categoryId("wallets"), item_name: "Brown wallet" });
    const req = await rpc<string>(claimant1, "create_recovery_request", [found, "my wallet", "3 cards and a photo", null]);
    expect(await status("recovery_requests", req)).toBe("security_review");
    expect(await query("select 1 from public.notifications where user_id = $1 and kind = 'security_case'", [security])).toHaveLength(1);
    expect(await query("select 1 from public.notifications where user_id = $1", [otherSecurity])).toHaveLength(0);

    // Owner cannot approve; other universities' security cannot see or act.
    await expectError(rpc(finder, "respond_recovery_request", [req, true, "direct", null]), "state:security_required");
    await expectError(rpc(otherSecurity, "security_review_request", [req, true, null]), "auth:forbidden");
    expect(await visibleCount(otherSecurity, "select 1 from public.recovery_requests where id = $1", [req])).toBe(0);
    expect(await visibleCount(security, "select verification_answer from public.recovery_requests where id = $1", [req])).toBe(1);

    await rpc(security, "security_review_request", [req, true, "Collect at security office, building 1"]);
    const [rr] = await query<{ status: string; handover_method: string }>("select status, handover_method from public.recovery_requests where id = $1", [req]);
    expect(rr).toEqual({ status: "accepted", handover_method: "security" });

    // Security + item owner confirmations complete a security-assisted handover.
    expect(await rpc(security, "confirm_handover", [req])).toBe("pending");
    expect(await rpc(claimant1, "confirm_handover", [req])).toBe("completed");
    expect(await query("select 1 from public.audit_events where action like 'security.%' and target_id = $1", [req])).toHaveLength(2);
  });

  it("failed handovers and disputes; admins resolve but cannot complete on behalf of parties", async () => {
    const found = await createReport(finder, { type: "found" });
    const req = await rpc<string>(claimant1, "create_recovery_request", [found, "mine", null, null]);
    await rpc(finder, "respond_recovery_request", [req, true, "direct", null]);
    await expectError(rpc(claimant2, "open_dispute", [req, "not involved"]), "auth:forbidden");
    const dispute = await rpc<string>(finder, "open_dispute", [req, "Claimant could not describe the item"]);
    expect(await status("recovery_requests", req)).toBe("disputed");
    await expectError(rpc(claimant1, "confirm_handover", [req]), "state:invalid");
    await expectError(rpc(claimant2, "admin_resolve_dispute", [dispute, "cancel", "x"]), "auth:forbidden");
    await rpc(uniAdmin, "admin_resolve_dispute", [dispute, "cancel", "Claim not verified"]);
    expect(await status("recovery_requests", req)).toBe("cancelled");
    expect(await status("reports", found)).toBe("active");

    const req2 = await rpc<string>(claimant2, "create_recovery_request", [found, "mine", null, null]);
    await rpc(finder, "respond_recovery_request", [req2, true, "security", null]);
    await rpc(claimant2, "report_handover_failed", [req2, "No show"]);
    expect(await status("recovery_requests", req2)).toBe("failed");
  });

  it("match suggestions never create notifications and must be confirmed before a linked request", async () => {
    const lost = await createReport(claimant1, { type: "lost" });
    const found = await createReport(finder, { type: "found" });
    const before = await query("select 1 from public.notifications");
    const [m] = await asService(async (c) =>
      (await c.query("insert into public.match_suggestions (university_id, lost_report_id, found_report_id, score, method, reasons) values ($1, $2, $3, 0.82, 'ai', '{same_category}') returning id", [uni, lost, found])).rows,
    );
    expect(await query("select 1 from public.notifications")).toHaveLength(before.length);

    expect(await visibleCount(claimant1, "select 1 from public.match_suggestions where id = $1", [m.id])).toBe(1);
    expect(await visibleCount(claimant2, "select 1 from public.match_suggestions where id = $1", [m.id])).toBe(0);
    await expectError(rpc(claimant2, "decide_match", [m.id, "confirmed"]), "auth:forbidden");
    await expectError(rpc(claimant1, "create_recovery_request", [found, "via match", null, m.id]), "state:match_not_confirmed");
    await rpc(claimant1, "decide_match", [m.id, "confirmed"]);
    const req = await rpc<string>(claimant1, "create_recovery_request", [found, "via match", null, m.id]);
    await rpc(finder, "respond_recovery_request", [req, true, "direct", null]);
    await rpc(finder, "confirm_handover", [req]);
    await rpc(claimant1, "confirm_handover", [req]);
    // Both sides of the confirmed match become recovered.
    expect(await status("reports", lost)).toBe("recovered");
    expect(await status("reports", found)).toBe("recovered");
  });

  it("rejects cross-university match suggestions at the database level", async () => {
    const lost = await createReport(claimant1, { type: "lost" });
    const foreign = await createReport(outsider, { type: "found" });
    await expectError(
      asService((c) => c.query("insert into public.match_suggestions (university_id, lost_report_id, found_report_id, score, method) values ($1, $2, $3, 0.9, 'ai')", [uni, lost, foreign])),
      "integrity:match_scope",
    );
  });

  describe("internal chat", () => {
    it("anyone in the university can start a conversation from the report page without a request", async () => {
      const found = await createReport(finder, { type: "found" });
      const conv = await rpc<string>(claimant1, "start_conversation", [found]);
      expect(await rpc<string>(claimant1, "start_conversation", [found])).toBe(conv); // reused
      await as(claimant1, (c) => c.query("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hi, is this mine?')", [conv, claimant1]));
      await as(finder, (c) => c.query("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Describe it please')", [conv, finder]));
      expect(await visibleCount(finder, "select 1 from public.messages where conversation_id = $1", [conv])).toBe(2);
      expect(await visibleCount(claimant2, "select 1 from public.messages where conversation_id = $1", [conv])).toBe(0);
      expect(await visibleCount(uniAdmin, "select 1 from public.messages where conversation_id = $1", [conv])).toBe(0);
      // Spoofing the sender or posting into someone else's conversation fails.
      await expectError(as(claimant2, (c) => c.query("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'x')", [conv, claimant2])), /row-level security/);
      await expectError(as(claimant1, (c) => c.query("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'x')", [conv, finder])), /row-level security/);
      // One message notification per hour per conversation per recipient.
      await as(claimant1, (c) => c.query("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'again')", [conv, claimant1]));
      expect(await query("select 1 from public.notifications where user_id = $1 and kind = 'new_message' and data->>'conversation_id' = $2", [finder, conv])).toHaveLength(1);
    });

    it("attachments: participants only, in their own folder", async () => {
      const found = await createReport(finder, { type: "found" });
      const conv = await rpc<string>(claimant2, "start_conversation", [found]);
      await upload(claimant2, "chat-attachments", `${conv}/${claimant2}/photo.jpg`);
      await expectError(upload(claimant1, "chat-attachments", `${conv}/${claimant1}/photo.jpg`), /row-level security/);
      await expectError(upload(finder, "chat-attachments", `${conv}/${claimant2}/fake.jpg`), /row-level security/);
      await as(claimant2, (c) => c.query("insert into public.messages (conversation_id, sender_id, attachment_path) values ($1, $2, $3)", [conv, claimant2, `${conv}/${claimant2}/photo.jpg`]));
      await expectError(
        as(claimant2, (c) => c.query("insert into public.messages (conversation_id, sender_id, attachment_path) values ($1, $2, $3)", [conv, claimant2, `other/${claimant2}/photo.jpg`])),
        /row-level security/,
      );
      expect(await visibleCount(finder, "select 1 from storage.objects where bucket_id = 'chat-attachments' and name = $1", [`${conv}/${claimant2}/photo.jpg`])).toBe(1);
      expect(await visibleCount(claimant1, "select 1 from storage.objects where bucket_id = 'chat-attachments' and name = $1", [`${conv}/${claimant2}/photo.jpg`])).toBe(0);
    });

    it("blocking stops new conversations, requests and messages; admins see chats only via abuse reports", async () => {
      const found = await createReport(finder, { type: "found" });
      const conv = await rpc<string>(claimant1, "start_conversation", [found]);
      const [msg] = await as(claimant1, async (c) => (await c.query("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'rude') returning id", [conv, claimant1])).rows);
      await as(finder, (c) => c.query("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [finder, claimant1]));
      await expectError(as(claimant1, (c) => c.query("insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'x')", [conv, claimant1])), /row-level security/);
      await expectError(rpc(claimant1, "create_recovery_request", [found, null, null, null]), "state:blocked");
      await expectError(as(finder, (c) => c.query("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [finder, outsider])), /row-level security/);

      expect(await visibleCount(uniAdmin, "select 1 from public.messages where conversation_id = $1", [conv])).toBe(0);
      const abuse = await rpc<string>(finder, "submit_abuse_report", ["message", msg.id, "harassment", null]);
      expect(await visibleCount(uniAdmin, "select 1 from public.messages where conversation_id = $1", [conv])).toBe(1);
      await rpc(uniAdmin, "admin_resolve_abuse", [abuse, "action", "hidden", true]);
      expect(await visibleCount(uniAdmin, "select 1 from public.messages where conversation_id = $1", [conv])).toBe(0);
      const [hidden] = await query<{ hidden_at: string | null }>("select hidden_at from public.messages where id = $1", [msg.id]);
      expect(hidden.hidden_at).not.toBeNull();
    });

    it("security can join conversations only for security cases", async () => {
      const plain = await createReport(finder, { type: "found" });
      const conv = await rpc<string>(claimant2, "start_conversation", [plain]);
      await expectError(rpc(security, "security_join_conversation", [conv]), "state:not_security_case");
      const sensitive = await createReport(finder, { type: "found", category_id: await categoryId("electronics"), item_name: "Phone" });
      const conv2 = await rpc<string>(claimant2, "start_conversation", [sensitive]);
      await expectError(rpc(otherSecurity, "security_join_conversation", [conv2]), "auth:forbidden");
      await rpc(security, "security_join_conversation", [conv2]);
      expect(await visibleCount(security, "select 1 from public.conversations where id = $1", [conv2])).toBe(1);
    });
  });
});
