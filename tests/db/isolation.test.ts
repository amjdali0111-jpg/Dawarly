import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  as, asAnon, createReport, createUniversity, createUser, expectError, pool, query, rpc, upload, visibleCount,
} from "./helpers";

// Multi-university isolation: authentication alone never grants access to
// another university's data, whether through tables, RPCs or storage.
describe("multi-university isolation", () => {
  let uniA: string, uniB: string;
  let a1: string, a2: string, b1: string, adminA: string, adminB: string, globalAdmin: string, unverified: string;
  let reportA: string;

  beforeAll(async () => {
    uniA = await createUniversity();
    uniB = await createUniversity();
    a1 = await createUser(uniA);
    a2 = await createUser(uniA);
    b1 = await createUser(uniB);
    adminA = await createUser(uniA, { role: "university_admin" });
    adminB = await createUser(uniB, { role: "university_admin" });
    globalAdmin = await createUser(uniB, { role: "global_admin" });
    unverified = await createUser(uniA, { confirmed: false });
    reportA = await createReport(a1);
  });
  afterAll(() => pool.end());

  it("same-university members see the report, other universities do not", async () => {
    expect(await visibleCount(a2, "select 1 from public.reports where id = $1", [reportA])).toBe(1);
    expect(await visibleCount(b1, "select 1 from public.reports where id = $1", [reportA])).toBe(0);
    expect(await visibleCount(b1, "select 1 from public.report_images where report_id = $1", [reportA])).toBe(0);
    expect(await visibleCount(b1, "select 1 from public.profiles where id = $1", [a1])).toBe(0);
  });

  it("anonymous and unverified users cannot read reports", async () => {
    await expectError(asAnon((c) => c.query("select * from public.reports")), /permission denied/);
    expect(await visibleCount(unverified, "select 1 from public.reports where id = $1", [reportA])).toBe(0);
    // Storage refuses their uploads, and the RPC refuses them even with a forged payload.
    await expectError(upload(unverified, "report-images", `${uniA}/${unverified}/x.jpg`), /row-level security/);
    await expectError(rpc(unverified, "create_report", [{ type: "lost", image_paths: ["x"] }]), "auth:not_active");
  });

  it("direct table writes are refused (writes go through checked functions)", async () => {
    await expectError(
      as(b1, (c) => c.query("insert into public.reports (university_id, owner_id, type, item_name, description, category_id, color, distinguishing_features, location_text, event_date) select $1, $2, 'lost', 'xx', 'xxxxxxxxxxxx', id, 'red', 'none', 'here', current_date from public.categories limit 1", [uniA, b1])),
      /permission denied/,
    );
    await expectError(as(a2, (c) => c.query("update public.reports set status = 'recovered' where id = $1", [reportA])), /permission denied/);
    await expectError(as(a1, (c) => c.query("delete from public.reports where id = $1", [reportA])), /permission denied/);
  });

  it("users cannot escalate their role or change university", async () => {
    await expectError(as(a1, (c) => c.query("update public.profiles set role = 'global_admin' where id = $1", [a1])), /permission denied/);
    await expectError(as(a1, (c) => c.query("update public.profiles set university_id = $2 where id = $1", [a1, uniB])), /permission denied/);
    await expectError(as(a1, (c) => c.query("update public.profile_private set restricted_until = null where id = $1", [a1])), /permission denied/);
    // Allowed: own display fields.
    await as(a1, (c) => c.query("update public.profiles set full_name = 'Renamed' where id = $1", [a1]));
    const [row] = await query<{ full_name: string; role: string }>("select full_name, role from public.profiles where id = $1", [a1]);
    expect(row).toEqual({ full_name: "Renamed", role: "user" });
  });

  it("RPCs refuse identifiers from another university", async () => {
    await expectError(rpc(b1, "create_recovery_request", [reportA, "mine", null, null]), "auth:forbidden");
    await expectError(rpc(b1, "start_conversation", [reportA]), "auth:forbidden");
    await expectError(rpc(b1, "close_report", [reportA, null]), "auth:forbidden");
    await expectError(rpc(b1, "submit_abuse_report", ["report", reportA, "spam", null]), "auth:forbidden");
  });

  it("university admins cannot act on another university", async () => {
    await expectError(rpc(adminB, "admin_review_report", [reportA, "remove", null]), "auth:forbidden");
    await expectError(rpc(adminB, "university_analytics", [uniA]), "auth:forbidden");
    await expectError(rpc(adminB, "admin_list_users", [uniA, null]), "auth:forbidden");
    await expectError(rpc(adminB, "admin_restrict_user", [a1, 3, "test reason"]), "auth:forbidden");
    await expectError(rpc(adminB, "admin_set_role", [a1, "security"]), "auth:forbidden");
    expect(await visibleCount(adminB, "select 1 from public.reports where id = $1", [reportA])).toBe(0);
    // Own university works.
    const analytics = await rpc<{ total: number }>(adminA, "university_analytics", [uniA]);
    expect(Number(analytics.total)).toBeGreaterThanOrEqual(1);
  });

  it("regular users cannot use admin functions in their own university", async () => {
    await expectError(rpc(a2, "admin_review_report", [reportA, "remove", null]), "auth:forbidden");
    await expectError(rpc(a2, "university_analytics", [uniA]), "auth:forbidden");
    await expectError(rpc(a2, "admin_set_role", [a1, "security"]), "auth:forbidden");
    await expectError(rpc(a2, "global_analytics", []), "auth:forbidden");
    await expectError(as(a2, (c) => c.query("insert into public.universities (slug, name_en, name_ar) values ('evil-uni','Evil','شر')")), /row-level security/);
    await expectError(as(a2, (c) => c.query("insert into public.categories (university_id, slug, name_en, name_ar) values ($1, 'x-cat', 'X', 'اكس')", [uniA])), /row-level security/);
  });

  it("global admin has platform-wide access", async () => {
    expect(await visibleCount(globalAdmin, "select 1 from public.reports where id = $1", [reportA])).toBe(1);
    const g = await rpc<unknown[]>(globalAdmin, "global_analytics", []);
    expect(g.length).toBeGreaterThanOrEqual(2);
  });

  it("storage: uploads only into own university/user folder; reads follow report visibility", async () => {
    await expectError(upload(b1, "report-images", `${uniA}/${b1}/x.jpg`), /row-level security/);
    await expectError(upload(a2, "report-images", `${uniA}/${a1}/x.jpg`), /row-level security/);
    const [{ storage_path }] = await query<{ storage_path: string }>("select storage_path from public.report_images where report_id = $1", [reportA]);
    expect(await visibleCount(a2, "select 1 from storage.objects where name = $1", [storage_path])).toBe(1);
    expect(await visibleCount(b1, "select 1 from storage.objects where name = $1", [storage_path])).toBe(0);
  });

  it("audit log is visible to the right admins only", async () => {
    await rpc(adminA, "admin_set_role", [a2, "security"]);
    expect(await visibleCount(adminA, "select 1 from public.audit_events where action = 'user.role_changed' and target_id = $1", [a2])).toBe(1);
    expect(await visibleCount(adminB, "select 1 from public.audit_events where target_id = $1", [a2])).toBe(0);
    expect(await visibleCount(a1, "select 1 from public.audit_events", [])).toBe(0);
  });
});
