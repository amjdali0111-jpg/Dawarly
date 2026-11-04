import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, categoryId, createReport, createUniversity, createUser, expectError, pool, query, rpc, upload, visibleCount } from "./helpers";

describe("security workspace, audit and storage extras", () => {
  let uni: string, otherUni: string, owner: string, claimant: string, security: string, otherSecurity: string, outsider: string, uniAdmin: string;
  beforeAll(async () => {
    uni = await createUniversity();
    otherUni = await createUniversity();
    owner = await createUser(uni);
    claimant = await createUser(uni);
    security = await createUser(uni, { role: "security" });
    uniAdmin = await createUser(uni, { role: "university_admin" });
    otherSecurity = await createUser(otherUni, { role: "security" });
    outsider = await createUser(otherUni);
  });
  afterAll(() => pool.end());

  it("security staff list (metadata only) and join conversations of security cases", async () => {
    const sensitive = await createReport(owner, { type: "found", category_id: await categoryId("wallets"), item_name: "Wallet" });
    const conv = await rpc<string>(claimant, "start_conversation", [sensitive]);
    const list = await as(security, async (c) => (await c.query("select * from public.security_case_conversations($1)", [sensitive])).rows);
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]).sort()).toEqual(["conversation_id", "created_at", "joined", "last_message_at"]);
    expect(list[0].joined).toBe(false);
    await expectError(as(otherSecurity, (c) => c.query("select * from public.security_case_conversations($1)", [sensitive])), "auth:forbidden");
    await expectError(as(claimant, (c) => c.query("select * from public.security_case_conversations($1)", [sensitive])), "auth:forbidden");
    // Before joining, security cannot read the chat; after joining it can.
    expect(await visibleCount(security, "select 1 from public.conversations where id = $1", [conv])).toBe(0);
    await rpc(security, "security_join_conversation", [conv]);
    expect(await visibleCount(security, "select 1 from public.conversations where id = $1", [conv])).toBe(1);
    expect(await query("select 1 from public.audit_events where action = 'security.joined_conversation' and target_id = $1", [conv])).toHaveLength(1);
  });

  it("photos of sensitive items become visible to a claimant only after acceptance", async () => {
    const sensitive = await createReport(owner, { type: "found", category_id: await categoryId("electronics"), item_name: "Phone" });
    const req = await rpc<string>(claimant, "create_recovery_request", [sensitive, "mine", "lock screen photo of a cat", null]);
    expect(await visibleCount(claimant, "select 1 from public.report_images where report_id = $1", [sensitive])).toBe(0);
    await rpc(security, "security_review_request", [req, true, "Security office"]);
    expect(await visibleCount(claimant, "select 1 from public.report_images where report_id = $1", [sensitive])).toBe(1);
  });

  it("audits university and category configuration changes", async () => {
    await as(uniAdmin, (c) => c.query("insert into public.categories (university_id, slug, name_en, name_ar) values ($1, 'audited-cat', 'Audited', 'مدقق')", [uni]));
    const rows = await query<{ actor_id: string; university_id: string }>("select actor_id, university_id from public.audit_events where action = 'categories.insert' and university_id = $1", [uni]);
    expect(rows).toEqual([{ actor_id: uniAdmin, university_id: uni }]);
  });

  it("avatars are private to the user's university", async () => {
    await upload(owner, "avatars", `${owner}/a.jpg`);
    await expectError(upload(claimant, "avatars", `${owner}/b.jpg`), /row-level security/);
    expect(await visibleCount(claimant, "select 1 from storage.objects where bucket_id = 'avatars' and name = $1", [`${owner}/a.jpg`])).toBe(1);
    expect(await visibleCount(outsider, "select 1 from storage.objects where bucket_id = 'avatars' and name = $1", [`${owner}/a.jpg`])).toBe(0);
  });

  it("other universities cannot see profiles, ratings summaries or categories of a university", async () => {
    await as(uniAdmin, (c) => c.query("insert into public.categories (university_id, slug, name_en, name_ar) values ($1, 'private-x', 'Private X', 'خاص')", [uni]));
    expect(await visibleCount(outsider, "select 1 from public.categories where slug = 'private-x'")).toBe(0);
    expect(await visibleCount(outsider, "select 1 from public.profiles where university_id = $1", [uni])).toBe(0);
  });
});
