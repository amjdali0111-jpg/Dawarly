import { beforeEach, describe, expect, it, vi } from "vitest";

// The register action must turn GoTrue/database failures into accurate,
// actionable messages instead of a generic "service unavailable".
type SignUpResult = { data: { user: unknown; session: unknown }; error: { status?: number; code?: string; message: string } | null };
let signUpResult: SignUpResult;
let lastSignUp: { email: string; options: { data: Record<string, unknown>; emailRedirectTo: string } } | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, getAll: () => [] }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("@/lib/env", async (orig) => ({ ...(await orig<typeof import("@/lib/env")>()), isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => ({
    auth: {
      signUp: async (args: typeof lastSignUp) => {
        lastSignUp = args;
        return signUpResult;
      },
    },
  }),
}));

const { register } = await import("@/app/actions/auth");
const UNI = "8b874d85-119a-4aab-829a-4d631a997533";

const form = () => {
  const fd = new FormData();
  fd.set("full_name", "Test Student");
  fd.set("email", "Student@Test.local");
  fd.set("password", "Passw0rd!");
  fd.set("confirm_password", "Passw0rd!");
  fd.set("university_id", UNI);
  fd.set("member_type", "faculty");
  fd.set("faculty", "Engineering");
  fd.set("academic_year", "3");
  fd.set("terms", "on");
  return fd;
};
const fail = (error: SignUpResult["error"]) => ({ data: { user: null, session: null }, error });

describe("register action", () => {
  beforeEach(() => {
    signUpResult = { data: { user: { id: "u1", identities: [{}] }, session: null }, error: null };
    lastSignUp = null;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("sends the university and profile fields as signup metadata and asks the user to check their email", async () => {
    const res = await register(null, form());
    expect(res).toMatchObject({ ok: true });
    expect(lastSignUp?.email).toBe("student@test.local");
    expect(lastSignUp?.options.data).toMatchObject({ university_id: UNI, member_type: "faculty", faculty: "Engineering", academic_year: 3, full_name: "Test Student" });
    expect(lastSignUp?.options.emailRedirectTo).toMatch(/\/auth\/confirm\?next=\/reports$/);
    expect(lastSignUp?.options.data).not.toHaveProperty("role");
  });

  it.each([
    ["database trigger rejection without a code (seen in production)", { status: 500, message: "Database error saving new user" }, /not available for registration|غير متاحة للتسجيل/],
    ["database trigger rejection with unexpected_failure", { status: 500, code: "unexpected_failure", message: "Database error saving new user" }, /not available for registration|غير متاحة للتسجيل/],
    ["built-in mailer refusing a non-member address", { status: 400, code: "email_address_not_authorized", message: "Email address not authorized" }, /confirmation email|رسالة التأكيد/],
    ["SMTP failure while sending the confirmation", { status: 500, message: "Error sending confirmation email" }, /confirmation email|رسالة التأكيد/],
    ["existing account", { status: 422, code: "user_already_exists", message: "User already registered" }, /already exists|يوجد حساب/],
    ["weak password", { status: 422, code: "weak_password", message: "Password should be at least 8 characters" }, /at least 8|8 أحرف/],
    ["rate limit", { status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" }, /Too many attempts|محاولات كثيرة/],
    ["network failure", { status: 0, message: "fetch failed" }, /temporarily unavailable|غير متاحة مؤقتاً/],
  ])("maps %s to an accurate message", async (_, error, expected) => {
    signUpResult = fail(error);
    const res = await register(null, form());
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(expected) });
  });

  it("rejects an invalid university id before calling Supabase", async () => {
    const fd = form();
    fd.set("university_id", "not-a-uuid");
    const res = await register(null, fd);
    expect(res).toMatchObject({ ok: false });
    expect(lastSignUp).toBeNull();
  });
});
