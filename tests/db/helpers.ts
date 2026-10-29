import { Pool, type PoolClient } from "pg";
import { randomUUID } from "node:crypto";

export const DB_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/dawarly_test";
export const pool = new Pool({ connectionString: DB_URL, max: 4 });

export type Ctx = PoolClient;

/** Run as superuser (setup / assertions that must bypass RLS). */
export async function admin<T>(fn: (c: Ctx) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}

async function withClaims<T>(role: "authenticated" | "anon" | "service_role", sub: string | null, fn: (c: Ctx) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(sub ? { sub, role } : { role }),
    ]);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/** Run as an authenticated end user (RLS enforced, like PostgREST). */
export const as = <T>(userId: string, fn: (c: Ctx) => Promise<T>) => withClaims("authenticated", userId, fn);
export const asAnon = <T>(fn: (c: Ctx) => Promise<T>) => withClaims("anon", null, fn);
export const asService = <T>(fn: (c: Ctx) => Promise<T>) => withClaims("service_role", null, fn);

export async function rpc<T = unknown>(userId: string, fn: string, args: unknown[] = []): Promise<T> {
  return as(userId, async (c) => {
    const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
    const res = await c.query(`select public.${fn}(${placeholders}) as v`, args);
    return res.rows[0]?.v as T;
  });
}

export async function expectError(p: Promise<unknown>, match: RegExp | string) {
  try {
    await p;
  } catch (e) {
    const msg = (e as Error).message;
    if (typeof match === "string" ? !msg.includes(match) : !match.test(msg)) {
      throw new Error(`Expected error matching ${match}, got: ${msg}`);
    }
    return;
  }
  throw new Error(`Expected error matching ${match}, but the call succeeded`);
}

export async function createUniversity(slug = `uni-${randomUUID().slice(0, 8)}`) {
  return admin(async (c) => {
    const r = await c.query(
      "insert into public.universities (slug, name_en, name_ar) values ($1, $2, $3) returning id",
      [slug, `University ${slug}`, `جامعة ${slug}`],
    );
    return r.rows[0].id as string;
  });
}

export async function createUser(
  universityId: string,
  opts: { confirmed?: boolean; role?: "user" | "security" | "university_admin" | "global_admin"; name?: string; emailNotifications?: boolean } = {},
) {
  return admin(async (c) => {
    const email = `${randomUUID()}@example.test`;
    const r = await c.query(
      "insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3) returning id",
      [email, opts.confirmed === false ? null : new Date(), { university_id: universityId, full_name: opts.name ?? "Test User", member_type: "student" }],
    );
    const id = r.rows[0].id as string;
    if (opts.role && opts.role !== "user") {
      await c.query("update public.profiles set role = $2 where id = $1", [id, opts.role]);
    }
    if (opts.emailNotifications === false) {
      await c.query("update public.profile_private set email_notifications = false where id = $1", [id]);
    }
    return id;
  });
}

export async function categoryId(slug: string) {
  return admin(async (c) => (await c.query("select id from public.categories where slug = $1 and university_id is null", [slug])).rows[0].id as string);
}

/** Upload a fake object as the user (exercises the storage insert policy). */
export async function upload(userId: string, bucket: string, path: string) {
  return as(userId, (c) => c.query("insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)", [bucket, path, userId]));
}

export async function universityOf(userId: string) {
  return admin(async (c) => (await c.query("select university_id from public.profiles where id = $1", [userId])).rows[0].university_id as string);
}

export async function reportPayload(userId: string, overrides: Record<string, unknown> = {}, imageCount = 1) {
  const uni = await universityOf(userId);
  const paths: string[] = [];
  for (let i = 0; i < imageCount; i++) {
    const p = `${uni}/${userId}/${randomUUID()}.jpg`;
    await upload(userId, "report-images", p);
    paths.push(p);
  }
  return {
    type: "lost",
    item_name: "Black backpack",
    description: "A black backpack with a water bottle pocket, lost near the library.",
    category_id: await categoryId("bags"),
    color: "black",
    distinguishing_features: "Small tear near the zipper",
    location_text: "Central library, 2nd floor",
    lat: 24.71362,
    lng: 46.67532,
    event_date: new Date().toISOString().slice(0, 10),
    event_time: "14:30",
    image_paths: paths,
    verification_notes: "Name tag inside says A.M.",
    ...overrides,
  };
}

export async function createReport(userId: string, overrides: Record<string, unknown> = {}, imageCount = 1) {
  const payload = await reportPayload(userId, overrides, imageCount);
  return rpc<string>(userId, "create_report", [payload]);
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return admin(async (c) => (await c.query(sql, params)).rows as T[]);
}

export async function visibleCount(userId: string, sql: string, params: unknown[] = []) {
  return as(userId, async (c) => (await c.query(sql, params)).rowCount ?? 0);
}
