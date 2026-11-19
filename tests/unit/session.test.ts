import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression tests for the post-login blank page: a signed-in, verified user
// whose profile/university cannot be used must NOT be sent to /login (the
// middleware bounces verified users back to /reports -> endless redirect).

type Result = { data: unknown; error: { code?: string; message: string } | null };
const state: { user: unknown; userError: unknown; tables: Record<string, Result> } = { user: null, userError: null, tables: {} };

function query(table: string) {
  const res = () => state.tables[table] ?? { data: null, error: null };
  const q = { select: () => q, eq: () => q, maybeSingle: async () => res() };
  return q;
}

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: state.userError }) },
    from: (t: string) => query(t),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));

const { getSessionState, requireSession } = await import("@/lib/auth");

const verified = { id: "u1", email: "a@b.c", email_confirmed_at: "2026-01-01T00:00:00Z" };
const profile = { id: "u1", university_id: "uni1", full_name: "A B", avatar_path: null, member_type: "student", role: "user", faculty: null, academic_year: null, created_at: "", deleted_at: null };
const university = { id: "uni1", slug: "x", name_en: "X", name_ar: "س", center_lat: null, center_lng: null, is_active: true };

async function redirectOf(p: Promise<unknown>) {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { url?: string }).url ?? `threw:${(e as Error).name}`;
  }
}

describe("session resolution", () => {
  beforeEach(() => {
    state.user = verified;
    state.userError = null;
    state.tables = { profiles: { data: profile, error: null }, universities: { data: university, error: null }, profile_private: { data: { locale: "en" }, error: null } };
  });

  it("returns a full session for a valid user", async () => {
    const s = await getSessionState();
    expect(s.status).toBe("ok");
    if (s.status === "ok") expect(s.session.locale).toBe("en");
  });

  it("anonymous and unverified users are sent to /login with next", async () => {
    state.user = null;
    expect(await redirectOf(requireSession("/reports"))).toBe("/login?next=%2Freports");
    state.user = { ...verified, email_confirmed_at: null };
    expect(await redirectOf(requireSession())).toBe("/login");
  });

  it.each([
    ["profile_missing", () => { state.tables.profiles = { data: null, error: null }; }],
    ["profile_deleted", () => { state.tables.profiles = { data: { ...profile, deleted_at: "2026-01-01" }, error: null }; }],
    ["university_unavailable", () => { state.tables.universities = { data: null, error: null }; }],
  ])("verified user with %s goes to /account-issue, never /login", async (reason, setup) => {
    setup();
    expect(await redirectOf(requireSession("/reports"))).toBe(`/account-issue?reason=${reason}`);
  });

  it("database errors throw (error boundary) instead of redirecting", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.tables.profiles = { data: null, error: { code: "42501", message: "permission denied" } };
    expect(await redirectOf(requireSession())).toBe("threw:SessionLoadError");
  });

  it("missing private settings fall back to defaults", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    state.tables.profile_private = { data: null, error: { code: "PGRST", message: "x" } };
    const s = await getSessionState();
    expect(s.status === "ok" && s.session.locale).toBe("ar");
  });
});

describe("normalizeSiteUrl", async () => {
  const { normalizeSiteUrl } = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  it.each([
    ["https://dawarly.vercel.app/", "https://dawarly.vercel.app"],
    ["dawarly.vercel.app", "https://dawarly.vercel.app"],
    ["  http://localhost:3000 ", "http://localhost:3000"],
    ["", ""],
    [undefined, ""],
    ["http://", ""],
  ])("%s -> %s", (input, out) => expect(normalizeSiteUrl(input)).toBe(out));
});
