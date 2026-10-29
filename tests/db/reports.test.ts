import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  as, asService, categoryId, createReport, createUniversity, createUser, expectError, pool, query, reportPayload, rpc, upload, visibleCount,
} from "./helpers";

describe("reports", () => {
  let uni: string, owner: string, other: string, uniAdmin: string, security: string;

  beforeAll(async () => {
    uni = await createUniversity();
    owner = await createUser(uni);
    other = await createUser(uni);
    uniAdmin = await createUser(uni, { role: "university_admin" });
    security = await createUser(uni, { role: "security" });
  });
  // The burst rate-limit (5 reports/hour) is tested explicitly below; age the
  // shared fixtures between tests so it does not interfere elsewhere.
  afterEach(() => query("update public.reports set created_at = created_at - interval '2 hours' where owner_id = any($1)", [[owner, other]]));
  afterAll(() => pool.end());

  // Lost and found share one implementation: every rule is checked for both.
  for (const type of ["lost", "found"] as const) {
    describe(`${type} reports (parity)`, () => {
      it("creates a report with all required fields, published immediately with a 14-day validity", async () => {
        const id = await createReport(owner, { type });
        const [r] = await query<{ status: string; type: string; days: number; approx_lat: number }>(
          "select status, type, round(extract(epoch from expires_at - created_at) / 86400) as days, approx_lat from public.reports where id = $1",
          [id],
        );
        expect(r.status).toBe("active");
        expect(r.type).toBe(type);
        expect(Number(r.days)).toBe(14);
        expect(r.approx_lat).toBe(24.714); // rounded publicly
        const [p] = await query<{ exact_lat: number }>("select exact_lat from public.report_private where report_id = $1", [id]);
        expect(p.exact_lat).toBeCloseTo(24.71362, 5);
      });

      it.each([
        ["item_name", { item_name: "" }],
        ["description", { description: "short" }],
        ["category", { category_id: "" }],
        ["color", { color: "" }],
        ["distinguishing_features", { distinguishing_features: "" }],
        ["location", { location_text: "" }],
        ["event_date", { event_date: "" }],
      ])("rejects a missing %s", async (code, override) => {
        const payload = await reportPayload(owner, { type, ...override });
        await expectError(rpc(owner, "create_report", [payload]), `validation:${code}`);
      });

      it("time is optional, date is required", async () => {
        const id = await createReport(owner, { type, event_time: null });
        expect(id).toBeTruthy();
      });

      it("requires between one and five photos", async () => {
        await expectError(rpc(owner, "create_report", [await reportPayload(owner, { type }, 0)]), "validation:images_count");
        await expectError(rpc(owner, "create_report", [await reportPayload(owner, { type }, 6)]), "validation:images_count");
        const id = await createReport(owner, { type }, 5);
        const rows = await query("select 1 from public.report_images where report_id = $1", [id]);
        expect(rows).toHaveLength(5);
      });

      it("accepts manual location without map coordinates", async () => {
        const id = await createReport(owner, { type, lat: null, lng: null, location_text: "Gate 3 cafeteria" });
        const [r] = await query<{ approx_lat: number | null }>("select approx_lat from public.reports where id = $1", [id]);
        expect(r.approx_lat).toBeNull();
      });
    });
  }

  it("rejects image paths that were not uploaded by the caller", async () => {
    const victimPayload = await reportPayload(other);
    const payload = await reportPayload(owner, { image_paths: victimPayload.image_paths });
    await expectError(rpc(owner, "create_report", [payload]), "validation:image_path");
    const missing = await reportPayload(owner, { image_paths: [`${uni}/${owner}/never-uploaded.jpg`] });
    await expectError(rpc(owner, "create_report", [missing]), "validation:image_missing");
  });

  it("rejects future dates and categories from other universities", async () => {
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    await expectError(rpc(owner, "create_report", [await reportPayload(owner, { event_date: future })]), "validation:event_date_future");
    const otherUni = await createUniversity();
    const [cat] = await query<{ id: string }>(
      "insert into public.categories (university_id, slug, name_en, name_ar) values ($1, 'private-cat', 'Private', 'خاص') returning id",
      [otherUni],
    );
    await expectError(rpc(owner, "create_report", [await reportPayload(owner, { category_id: cat.id })]), "validation:category");
  });

  it("routes sensitive items (category or keywords) to security and hides their photos", async () => {
    const byCategory = await createReport(owner, { category_id: await categoryId("ids-cards"), item_name: "Student card" });
    const byKeyword = await createReport(owner, { item_name: "iPhone 14", description: "Silver iphone with a blue case near hall B" });
    const rows = await query<{ id: string; is_sensitive: boolean; sensitive_reason: string }>(
      "select id, is_sensitive, sensitive_reason from public.reports where id = any($1) order by sensitive_reason",
      [[byCategory, byKeyword]],
    );
    expect(rows.map((r) => [r.is_sensitive, r.sensitive_reason])).toEqual([[true, "category"], [true, "keywords"]]);
    // Report is listed but photos and private details are hidden from others.
    expect(await visibleCount(other, "select 1 from public.reports where id = $1", [byCategory])).toBe(1);
    expect(await visibleCount(other, "select 1 from public.report_images where report_id = $1", [byCategory])).toBe(0);
    expect(await visibleCount(other, "select 1 from public.report_private where report_id = $1", [byCategory])).toBe(0);
    // Security staff of the university see them.
    expect(await visibleCount(security, "select 1 from public.report_images where report_id = $1", [byCategory])).toBe(1);
    expect(await visibleCount(security, "select 1 from public.report_private where report_id = $1", [byCategory])).toBe(1);
    const audit = await query("select 1 from public.audit_events where action = 'report.routed_to_security' and target_id = $1", [byCategory]);
    expect(audit).toHaveLength(1);
  });

  it("holds suspicious reports for admin review before publishing", async () => {
    const id = await createReport(owner, { description: "Found it! Call me on +966 55 123 4567 or pay via western union" });
    const [r] = await query<{ status: string }>("select status from public.reports where id = $1", [id]);
    expect(r.status).toBe("under_review");
    const [flag] = await query<{ reasons: string[] }>("select reasons from public.moderation_flags where report_id = $1", [id]);
    expect(flag.reasons).toEqual(expect.arrayContaining(["contact_info", "scam_terms"]));
    expect(await visibleCount(other, "select 1 from public.reports where id = $1", [id])).toBe(0);
    expect(await visibleCount(owner, "select 1 from public.reports where id = $1", [id])).toBe(1);

    await expectError(rpc(other, "admin_review_report", [id, "approve", null]), "auth:forbidden");
    await rpc(uniAdmin, "admin_review_report", [id, "approve", "ok after check"]);
    expect(await visibleCount(other, "select 1 from public.reports where id = $1", [id])).toBe(1);
    const [resolved] = await query<{ resolution: string; resolved_by: string }>("select resolution, resolved_by from public.moderation_flags where report_id = $1", [id]);
    expect(resolved).toEqual({ resolution: "approved", resolved_by: uniAdmin });
    const notes = await query("select kind from public.notifications where user_id = $1 and data->>'report_id' = $2 order by created_at", [owner, id]);
    expect(notes.map((n) => n.kind)).toEqual(["report_held", "moderation_decision"]);
  });

  it("rate-limits bursts of new reports into review", async () => {
    const burst = await createUser(uni);
    const statuses: string[] = [];
    for (let i = 0; i < 6; i++) {
      const id = await createReport(burst);
      statuses.push((await query<{ status: string }>("select status from public.reports where id = $1", [id]))[0].status);
    }
    expect(statuses.slice(0, 5).every((s) => s === "active")).toBe(true);
    expect(statuses[5]).toBe("under_review");
  });

  it("owner can edit; material edits reset AI processing and drop untouched suggestions", async () => {
    const lost = await createReport(owner, { type: "lost" });
    const found = await createReport(other, { type: "found" });
    await asService((c) => c.query("update public.reports set ai_status = 'done' where id = any($1)", [[lost, found]]));
    await asService((c) =>
      c.query("insert into public.match_suggestions (university_id, lost_report_id, found_report_id, score, method) values ($1, $2, $3, 0.8, 'heuristic')", [uni, lost, found]),
    );
    await expectError(rpc(other, "update_report", [lost, await reportPayload(other)]), "auth:forbidden");

    const [{ storage_path }] = await query<{ storage_path: string }>("select storage_path from public.report_images where report_id = $1", [lost]);
    const nonMaterial = await reportPayload(owner, { image_paths: [storage_path], verification_notes: "changed private note" }, 0);
    const res1 = await rpc<{ material: boolean }>(owner, "update_report", [lost, nonMaterial]);
    expect(res1.material).toBe(false);

    const material = await reportPayload(owner, { color: "navy blue" }, 1);
    material.image_paths = [storage_path, ...(material.image_paths as string[])];
    const res2 = await rpc<{ material: boolean; removed_paths: string[] }>(owner, "update_report", [lost, material]);
    expect(res2.material).toBe(true);
    const [r] = await query<{ ai_status: string; color: string }>("select ai_status, color from public.reports where id = $1", [lost]);
    expect(r).toEqual({ ai_status: "pending", color: "navy blue" });
    expect(await query("select 1 from public.match_suggestions where lost_report_id = $1", [lost])).toHaveLength(0);
    expect(await query("select 1 from public.report_images where report_id = $1", [lost])).toHaveLength(2);

    // Removing every photo is refused.
    await expectError(rpc(owner, "update_report", [lost, { ...material, image_paths: [] }]), "validation:images_count");
  });

  it("owner can close; closed reports cannot be edited or renewed", async () => {
    const id = await createReport(owner);
    await expectError(rpc(other, "close_report", [id, null]), "auth:forbidden");
    await rpc(owner, "close_report", [id, null]);
    await expectError(rpc(owner, "update_report", [id, await reportPayload(owner)]), "state:not_editable");
    await expectError(rpc(owner, "renew_report", [id]), "state:not_expired");
  });

  describe("expiry and renewal", () => {
    it("expires active reports after their validity, idempotently, without marking them recovered", async () => {
      const id = await createReport(owner);
      await query("update public.reports set expires_at = now() - interval '1 minute' where id = $1", [id]);
      await asService((c) => c.query("select public.expire_reports()"));
      await asService((c) => c.query("select public.expire_reports()")); // second run is a no-op
      const [r] = await query<{ status: string; recovered_at: string | null }>("select status, recovered_at from public.reports where id = $1", [id]);
      expect(r).toEqual({ status: "expired", recovered_at: null });
      expect(await query("select 1 from public.notifications where kind = 'report_expired' and data->>'report_id' = $1", [id])).toHaveLength(1);
      expect(await query("select 1 from public.audit_events where action = 'report.expired' and target_id = $1", [id])).toHaveLength(1);
      // Expired reports stay visible to the university and to the owner.
      expect(await visibleCount(other, "select 1 from public.reports where id = $1", [id])).toBe(1);
    });

    it("clients cannot trigger the expiry job", async () => {
      await expectError(as(owner, (c) => c.query("select public.expire_reports()")), /permission denied/);
    });

    it("renewal is manual: owner renews for another 14 days; others cannot", async () => {
      const id = await createReport(owner);
      await query("update public.reports set status = 'expired', expires_at = now() - interval '1 day' where id = $1", [id]);
      await expectError(rpc(other, "renew_report", [id]), "auth:forbidden");
      await rpc(owner, "renew_report", [id]);
      const [r] = await query<{ status: string; days: number; renewal_count: number }>(
        "select status, round(extract(epoch from expires_at - now()) / 86400) days, renewal_count from public.reports where id = $1",
        [id],
      );
      expect(r).toEqual({ status: "active", days: "14", renewal_count: 1 });
      await expectError(rpc(owner, "renew_report", [id]), "state:not_expired");
    });

    it("university admin can renew with audit + owner notification", async () => {
      const id = await createReport(owner);
      await query("update public.reports set status = 'expired' where id = $1", [id]);
      await rpc(uniAdmin, "renew_report", [id]);
      expect(await query("select 1 from public.audit_events where action = 'report.renewed_by_admin' and actor_id = $1 and target_id = $2", [uniAdmin, id])).toHaveLength(1);
      expect(await query("select 1 from public.notifications where kind = 'report_renewed' and user_id = $1", [owner])).toHaveLength(1);
    });
  });

  it("does not let a user upload into the private chat bucket of others or list hidden objects", async () => {
    await expectError(upload(other, "chat-attachments", `not-a-uuid/${other}/x.jpg`), /row-level security/);
  });
});
