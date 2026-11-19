import { beforeEach, describe, expect, it, vi } from "vitest";

// The login action must redirect into the app (never back to an auth page,
// which the middleware would bounce) and report errors honestly.
let signInResult: { error: { status?: number; code?: string; message: string } | null } = { error: null };

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
  getServerSupabase: async () => ({ auth: { signInWithPassword: async () => signInResult } }),
}));

const { login } = await import("@/app/actions/auth");

const form = (next = "") => {
  const fd = new FormData();
  fd.set("email", "Someone@Test.local");
  fd.set("password", "Passw0rd!");
  fd.set("next", next);
  return fd;
};
const redirectOf = async (p: Promise<unknown>) => {
  try {
    return { result: await p };
  } catch (e) {
    return { url: (e as { url?: string }).url };
  }
};

describe("login action", () => {
  beforeEach(() => {
    signInResult = { error: null };
  });

  it.each([
    ["", "/reports"],
    ["/my-reports?x=1", "/my-reports?x=1"],
    ["/login", "/reports"],
    ["/login?next=/reports", "/reports"],
    ["/register", "/reports"],
    ["/account-issue?reason=profile_missing", "/reports"],
    ["//evil.example", "/reports"],
    ["https://evil.example", "/reports"],
  ])("next=%j redirects to %s", async (next, expected) => {
    expect(await redirectOf(login(null, form(next)))).toEqual({ url: expected });
  });

  it("maps errors to clear messages", async () => {
    signInResult = { error: { status: 400, code: "invalid_credentials", message: "Invalid login credentials" } };
    expect(await login(null, form())).toMatchObject({ ok: false, error: expect.stringMatching(/البريد الإلكتروني أو كلمة المرور|Incorrect/) });
    signInResult = { error: { status: 400, code: "email_not_confirmed", message: "Email not confirmed" } };
    expect(await login(null, form())).toMatchObject({ ok: false, error: expect.stringMatching(/تأكيد|confirm/) });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    signInResult = { error: { status: 0, message: "fetch failed" } };
    expect(await login(null, form())).toMatchObject({ ok: false, error: expect.stringMatching(/غير متاحة|unavailable/) });
  });
});
