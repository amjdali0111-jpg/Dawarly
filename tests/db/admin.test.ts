import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  as, asService, createReport, createUniversity, createUser, expectError, pool, query, rpc,
} from "./helpers";

describe("moderation, roles, notifications, account deletion", () => {
  let uni: string, otherUni: string;
  let user: string, reporter: string, uniAdmin: string, globalAdmin: string, otherAdmin: string;

  beforeAll(async () => {
    uni = await createUniversity();
    otherUni = await createUniversity();
    user = await createUser(uni);
    reporter = await createUser(uni);
    uniAdmin = await createUser(uni, { role: "university_admin" });
    otherAdmin = await createUser(otherUni, { role: "university_admin" });
    globalAdmin = await createUser(otherUni, { role: "global_admin" });
  });
  afterEach(() => query("update public.reports set created_at = created_at - interval '2 hours'"));
  afterAll(() => pool.end());

  it("graduated response to confirmed false reports: warning → restriction → escalation", async () => {
    const offender = await createUser(uni);
    const kinds: string[] = [];
    const reports = [await createReport(offender), await createReport(offender), await createReport(offender)];
    for (const report of reports) {
      const abuse = await rpc<string>(reporter, "submit_abuse_report", ["report", report, "false_report", "not real"]);
      kinds.push(await rpc<string>(uniAdmin, "admin_resolve_abuse", [abuse, "confirm_false_report", "confirmed", true]));
    }
    expect(kinds).toEqual(["warning", "temporary_restriction", "temporary_restriction"]);
    const sanctions = await query<{ kind: string }>("select kind from public.user_sanctions where user_id = $1 order by created_at, kind", [offender]);
    expect(sanctions.map((s) => s.kind)).toEqual(["warning", "temporary_restriction", "temporary_restriction", "escalation"]);

    // Restricted users cannot create reports or requests, but no permanent ban exists.
    await expectError(createReport(offender), /row-level security|auth:restricted/);
    const [pp] = await query<{ restricted_until: string }>("select restricted_until from public.profile_private where id = $1", [offender]);
    expect(new Date(pp.restricted_until).getTime()).toBeGreaterThan(Date.now());
    // Admin can lift.
    await rpc(uniAdmin, "admin_lift_restriction", [offender]);
    expect(await createReport(offender)).toBeTruthy();
  });

  it("dismissed abuse reports sanction nobody; duplicates are refused", async () => {
    const report = await createReport(user);
    const abuse = await rpc<string>(reporter, "submit_abuse_report", ["report", report, "spam", null]);
    await expectError(rpc(reporter, "submit_abuse_report", ["report", report, "spam", null]), "state:already_reported");
    await expectError(rpc(reporter, "submit_abuse_report", ["report", report, "invalid-reason", null]), "validation:reason");
    await rpc(uniAdmin, "admin_resolve_abuse", [abuse, "dismiss", null, false]);
    expect(await query("select 1 from public.user_sanctions where user_id = $1", [user])).toHaveLength(0);
    await expectError(rpc(uniAdmin, "admin_resolve_abuse", [abuse, "dismiss", null, false]), "state:invalid");
  });

  it("AI/admin hold puts a published report back under review", async () => {
    const report = await createReport(user);
    await asService((c) => c.query("select public.hold_report($1, '{ai_unsafe_image}', 'ai')", [report]));
    expect((await query<{ status: string }>("select status from public.reports where id = $1", [report]))[0].status).toBe("under_review");
    await expectError(rpc(reporter, "hold_report", [report, ["x"], "admin"]), "auth:forbidden");
  });

  it("role management respects scope", async () => {
    const target = await createUser(uni);
    await rpc(uniAdmin, "admin_set_role", [target, "security"]);
    await expectError(rpc(uniAdmin, "admin_set_role", [target, "university_admin"]), "auth:forbidden");
    await expectError(rpc(uniAdmin, "admin_set_role", [uniAdmin, "global_admin"]), "state:self");
    await expectError(rpc(otherAdmin, "admin_set_role", [target, "user"]), "auth:forbidden");
    await rpc(globalAdmin, "admin_set_role", [target, "university_admin"]);
    await expectError(rpc(uniAdmin, "admin_restrict_user", [target, 3, "abuse"]), "auth:forbidden"); // peer admin
    const [p] = await query<{ role: string }>("select role from public.profiles where id = $1", [target]);
    expect(p.role).toBe("university_admin");
  });

  it("university admins manage only their own categories", async () => {
    await as(uniAdmin, (c) => c.query("insert into public.categories (university_id, slug, name_en, name_ar) values ($1, 'lab-gear', 'Lab gear', 'معدات مختبر')", [uni]));
    await expectError(
      as(uniAdmin, (c) => c.query("insert into public.categories (university_id, slug, name_en, name_ar) values ($1, 'lab-gear', 'Lab gear', 'معدات مختبر')", [otherUni])),
      /row-level security/,
    );
    await expectError(as(uniAdmin, (c) => c.query("insert into public.categories (university_id, slug, name_en, name_ar) values (null, 'global-x', 'Global', 'عام')")), /row-level security/);
    const updated = await as(uniAdmin, (c) => c.query("update public.categories set is_active = false where university_id is null"));
    expect(updated.rowCount).toBe(0);
  });

  describe("notification outbox", () => {
    it("deduplicates, claims once, retries with backoff and stops after the maximum attempts", async () => {
      const someone = await createUser(uni);
      await query("select public._notify($1, 'test', '{}', 'dedupe-test-1')", [someone]);
      await query("select public._notify($1, 'test', '{}', 'dedupe-test-1')", [someone]);
      expect(await query("select 1 from public.notifications where dedupe_key = 'dedupe-test-1'")).toHaveLength(1);

      await query("update public.notifications set email_status = 'skipped' where dedupe_key <> 'dedupe-test-1' and email_status = 'pending'");
      const claim = () => asService(async (c) => (await c.query("select * from public.claim_email_notifications(100)")).rows.filter((r) => r.kind === "test"));
      const first = await claim();
      expect(first).toHaveLength(1);
      expect(first[0].email).toMatch(/@example\.test$/);
      expect(await claim()).toHaveLength(0); // already claimed: no double send

      for (let attempt = 1; attempt <= 3; attempt++) {
        if (attempt > 1) {
          await query("update public.notifications set next_attempt_at = now() where dedupe_key = 'dedupe-test-1'");
          expect(await claim()).toHaveLength(1);
        }
        await asService((c) => c.query("select public.complete_email_notification($1, false, 'smtp down')", [first[0].id]));
      }
      const [n] = await query<{ email_status: string; email_attempts: number }>("select email_status, email_attempts from public.notifications where id = $1", [first[0].id]);
      expect(n).toEqual({ email_status: "failed", email_attempts: 3 });
    });

    it("respects the email opt-out and keeps the in-app notification", async () => {
      const quiet = await createUser(uni, { emailNotifications: false });
      await query("select public._notify($1, 'test', '{}', 'dedupe-test-2')", [quiet]);
      const [n] = await query<{ email_status: string }>("select email_status from public.notifications where dedupe_key = 'dedupe-test-2'");
      expect(n.email_status).toBe("skipped");
    });

    it("users read only their own notifications and can only mark them read", async () => {
      const [n] = await query<{ id: string; user_id: string }>("select id, user_id from public.notifications where dedupe_key = 'dedupe-test-1'");
      const count = await as(reporter, async (c) => (await c.query("select 1 from public.notifications where id = $1", [n.id])).rowCount);
      expect(count).toBe(0);
      await expectError(as(n.user_id, (c) => c.query("update public.notifications set kind = 'x' where id = $1", [n.id])), /permission denied/);
      await as(n.user_id, (c) => c.query("update public.notifications set read_at = now() where id = $1", [n.id]));
      await expectError(as(reporter, (c) => c.query("select public._notify($1, 'spoof', '{}', 'spoof')", [reporter])), /permission denied/);
    });
  });

  describe("account deletion", () => {
    it("reports blockers while open items exist (product decision pending)", async () => {
      const u = await createUser(uni);
      expect(await rpc<string[]>(u, "account_deletion_blockers")).toEqual([]);
      const report = await createReport(u);
      expect(await rpc<string[]>(u, "account_deletion_blockers")).toEqual(["open_reports"]);
      await rpc(u, "close_report", [report, null]);
      expect(await rpc<string[]>(u, "account_deletion_blockers")).toEqual([]);
    });

    it("deleting the auth user anonymises the profile and removes personal data", async () => {
      const u = await createUser(uni, { name: "Private Person" });
      await query("select public._notify($1, 'test', '{}', 'deletion-test')", [u]);
      await query("delete from auth.users where id = $1", [u]);
      const [p] = await query<{ full_name: string; deleted_at: string | null }>("select full_name, deleted_at from public.profiles where id = $1", [u]);
      expect(p.full_name).toBe("Deleted user");
      expect(p.deleted_at).not.toBeNull();
      expect(await query("select 1 from public.notifications where user_id = $1", [u])).toHaveLength(0);
      expect(await query("select 1 from public.audit_events where action = 'account.deleted' and target_id = $1", [u])).toHaveLength(1);
    });
  });

  it("anonymous visitors only get aggregate public stats", async () => {
    const stats = await asService(async (c) => (await c.query("select public.public_stats() as s")).rows[0].s);
    expect(Object.keys(stats).sort()).toEqual(["recovered", "reports", "universities"]);
  });
});
