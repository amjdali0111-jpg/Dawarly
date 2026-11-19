import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { asAnon, createReport, createUser, pool, query, visibleCount } from "./helpers";

const MIGRATION = "supabase/migrations/20261030000007_add_assiut_region_universities.sql";
const NEW_UNIVERSITIES = [
  { slug: "sphinx-university", name_en: "Sphinx University", name_ar: "جامعة سفينكس" },
  { slug: "assiut-national-university", name_en: "Assiut National University", name_ar: "جامعة أسيوط الأهلية" },
  { slug: "assiut-university", name_en: "Assiut University", name_ar: "جامعة أسيوط" },
];

const idOf = async (slug: string) => (await query<{ id: string }>("select id from public.universities where slug = $1", [slug]))[0].id;

describe("registration universities: Sphinx, Assiut National, Assiut", () => {
  afterAll(() => pool.end());

  it("are listed, active, to anonymous visitors on the registration page", async () => {
    // Same query as the registration page (src/app/(auth)/register/page.tsx).
    const rows = await asAnon(async (c) => (await c.query("select slug, name_en, name_ar from public.universities where is_active order by name_en")).rows);
    for (const u of NEW_UNIVERSITIES) expect(rows).toContainEqual(u);
    // Anonymous visitors still only see active universities.
    await query("update public.universities set is_active = false where slug = 'sphinx-university'");
    const hidden = await asAnon(async (c) => (await c.query("select 1 from public.universities where slug = 'sphinx-university'")).rowCount);
    await query("update public.universities set is_active = true where slug = 'sphinx-university'");
    expect(hidden).toBe(0);
  });

  it("anonymous visitors can read platform-default categories but nothing private", async () => {
    const rows = await asAnon(async (c) => (await c.query("select university_id from public.categories")).rows);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.university_id === null)).toBe(true);
    await expect(asAnon((c) => c.query("select 1 from public.profiles"))).rejects.toThrow(/permission denied/);
  });

  it("migration is idempotent and never duplicates (by slug or by name)", async () => {
    const sql = readFileSync(MIGRATION, "utf8");
    await query(sql);
    await query(sql);
    for (const u of NEW_UNIVERSITIES) {
      const rows = await query("select 1 from public.universities where slug = $1 or name_en = $2 or name_ar = $3", [u.slug, u.name_en, u.name_ar]);
      expect(rows, u.slug).toHaveLength(1);
    }
  });

  it("does not insert when the same university already exists under another slug", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("update public.universities set slug = 'au-legacy' where slug = 'assiut-university'");
      await c.query(readFileSync(MIGRATION, "utf8"));
      const { rows } = await c.query("select slug from public.universities where name_en = 'Assiut University'");
      expect(rows).toEqual([{ slug: "au-legacy" }]);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it.each(NEW_UNIVERSITIES)("registration with $name_en saves the selected university on the profile", async (u) => {
    const uni = await idOf(u.slug);
    const user = await createUser(uni); // inserts auth.users with sign-up metadata → handle_new_user()
    const [p] = await query<{ university_id: string; role: string }>("select university_id, role from public.profiles where id = $1", [user]);
    expect(p).toEqual({ university_id: uni, role: "user" });
    const [pp] = await query<{ university_id: string }>("select university_id from public.profile_private where id = $1", [user]);
    expect(pp.university_id).toBe(uni);
  });

  it("university-specific content stays within each of the new universities", async () => {
    const [sphinx, national, assiut] = await Promise.all(NEW_UNIVERSITIES.map((u) => idOf(u.slug)));
    const sphinxA = await createUser(sphinx);
    const sphinxB = await createUser(sphinx);
    const nationalUser = await createUser(national);
    const assiutUser = await createUser(assiut);

    const report = await createReport(sphinxA);
    const [r] = await query<{ university_id: string }>("select university_id from public.reports where id = $1", [report]);
    expect(r.university_id).toBe(sphinx);

    expect(await visibleCount(sphinxB, "select 1 from public.reports where id = $1", [report])).toBe(1);
    expect(await visibleCount(nationalUser, "select 1 from public.reports where id = $1", [report])).toBe(0);
    expect(await visibleCount(assiutUser, "select 1 from public.reports where id = $1", [report])).toBe(0);
    expect(await visibleCount(assiutUser, "select 1 from public.profiles where id = $1", [sphinxA])).toBe(0);
    expect(await visibleCount(nationalUser, "select 1 from public.profiles where id = $1", [assiutUser])).toBe(0);
  });
});
