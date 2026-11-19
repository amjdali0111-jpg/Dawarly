import { expect, test, type Page } from "@playwright/test";

// Regression tests for the "dark blank page after login" bug. Each user maps
// to a scenario in mock-supabase.mjs.
const MOCK = `http://localhost:${process.env.MOCK_SUPABASE_PORT ?? 54399}`;
const PASSWORD = "Passw0rd!";

async function login(page: Page, user: string, password = PASSWORD) {
  await page.goto("/login");
  await page.locator("#email").fill(`${user}@test.local`);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
}

/** Number of auth checks hitting the backend over a quiet period. A redirect loop keeps calling it. */
async function authCallsWhileIdle(page: Page, ms = 3000) {
  // Let one-off link prefetches finish; a redirect loop never goes idle.
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.request.get(`${MOCK}/__log`); // clear
  await page.waitForTimeout(ms);
  const log = (await (await page.request.get(`${MOCK}/__log`)).json()) as { p: string }[];
  return log.filter((e) => e.p === "/auth/v1/user").length;
}

test("verified user with profile and university lands on a rendered /reports", async ({ page }) => {
  await login(page, "ok");
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
  await expect(page.getByText("Blue backpack")).toBeVisible();
  await expect(page.getByText("Test University").first()).toBeVisible();
  expect(await authCallsWhileIdle(page)).toBe(0);

  // Session persists across a full reload and client navigation.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
  await page.goto("/login"); // signed-in users are sent back into the app
  await expect(page).toHaveURL(/\/reports$/);
});

test("successful login never redirects back to /login (even with next=/login)", async ({ page }) => {
  await page.goto("/login?next=%2Flogin");
  await page.locator("#email").fill("ok@test.local");
  await page.locator("#password").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
});

for (const [user, text] of [
  ["noprofile", "your Dawarly profile was not found"],
  ["deleted", "This account has been deleted"],
  ["inactive", "Your university is not currently active"],
] as const) {
  test(`${user}: reaches /account-issue instead of a redirect loop`, async ({ page }) => {
    await login(page, user);
    await expect(page).toHaveURL(/\/account-issue\?reason=/);
    await expect(page.getByRole("heading", { name: "We couldn't open your account" })).toBeVisible();
    await expect(page.getByText(text)).toBeVisible();
    expect(await authCallsWhileIdle(page)).toBe(0);
  });
}

test("account-issue page lets the user sign out", async ({ page }) => {
  await login(page, "noprofile");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/reports");
  await expect(page).toHaveURL(/\/login\?next=%2Freports/);
});

test("database failure while loading the session shows an error, not /login", async ({ page }) => {
  await login(page, "dbfail");
  await expect(page.getByText("Something went wrong. Please try again.")).toBeVisible();
  expect(new URL(page.url()).pathname).not.toBe("/login");
  expect(await authCallsWhileIdle(page)).toBe(0);
});

test("reports query failure is visible inside the rendered app shell", async ({ page }) => {
  await login(page, "reportsfail");
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Something went wrong" })).toBeVisible();
});

test("Content-Security-Policy is sent and blocks nothing the app needs", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (load|execute|connect|apply|frame)/i.test(m.text())) violations.push(m.text());
  });
  await login(page, "ok");
  await expect(page).toHaveURL(/\/reports$/);
  const csp = (await page.request.get("/login")).headers()["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  for (const path of ["/reports", "/reports/new?type=lost", "/my-reports", "/map", "/matches", "/messages", "/notifications", "/profile", "/settings", "/requests", "/"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => undefined);
  }
  expect(violations).toEqual([]);
});

test("wrong password and unconfirmed email show clear messages", async ({ page }) => {
  await login(page, "ok", "wrong-password1");
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await login(page, "unconfirmed");
  await expect(page.getByText("Please confirm your email before logging in.")).toBeVisible();
});
