import { expect, test } from "@playwright/test";

// These run against the production build. Without Supabase credentials every
// visitor is anonymous, which is exactly what the public surface must handle.

test.describe("public landing page", () => {
  test("shows the approved hero, search and both report actions — and no report feed", async ({ page }) => {
    await page.goto("/");
    const hero = page.getByTestId("hero");
    await expect(hero.getByRole("heading", { level: 1 })).toContainText("ضاع منك حاجة؟");
    await expect(hero.getByRole("search")).toBeVisible();
    await expect(page.getByRole("link", { name: "إبلاغ عن مفقود" })).toHaveAttribute("href", "/reports/new?type=lost");
    await expect(page.getByRole("link", { name: "إبلاغ عن معثور عليه" })).toHaveAttribute("href", "/reports/new?type=found");
    await expect(page.locator('img[src*="hero-characters"]')).toBeVisible();
    // No "latest/recent reports" section and no links to individual reports.
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/أحدث البلاغات|آخر البلاغات|latest reports|recent reports/i);
    expect(await page.locator('a[href^="/reports/"]:not([href^="/reports/new"])').count()).toBe(0);
  });

  test("Arabic is RTL by default and the language switch flips to English LTR", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await page.getByRole("button", { name: "اللغة" }).first().click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Lost something?");
  });

  test("has no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("authorization gate", () => {
  for (const path of ["/reports", "/reports/new?type=lost", "/reports/00000000-0000-0000-0000-000000000000", "/my-reports", "/matches", "/requests", "/messages", "/notifications", "/map", "/profile", "/settings", "/admin", "/admin/reports", "/admin/users", "/admin/categories", "/admin/analytics", "/users/00000000-0000-0000-0000-000000000000"]) {
    test(`redirects anonymous visitors from ${path} to login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
      expect(decodeURIComponent(new URL(page.url()).searchParams.get("next") ?? "")).toBe(path);
    });
  }

  test("the hero search requires sign-in", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("hero").getByRole("textbox").fill("حقيبة");
    await page.getByTestId("hero").getByRole("textbox").press("Enter");
    await expect(page).toHaveURL(/\/login\?next=%2Freports%3Fq%3D/);
  });

  test("cron endpoints refuse unauthenticated calls", async ({ request }) => {
    for (const p of ["/api/cron/expire", "/api/cron/notifications", "/api/cron/matching"]) {
      const res = await request.get(p, { headers: { authorization: "Bearer wrong" } });
      expect([401, 503]).toContain(res.status());
    }
  });
});

test.describe("auth pages", () => {
  test("registration offers university selection, member type and any email", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByLabel("الجامعة")).toBeVisible();
    await expect(page.getByLabel("البريد الإلكتروني")).toHaveAttribute("type", "email");
    await expect(page.getByText("طالب", { exact: true })).toBeVisible();
    await expect(page.locator('input[name="role"]')).toHaveCount(0);
  });

  test("login, forgot and reset password pages render", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
    await page.getByRole("link", { name: "نسيت كلمة المرور؟" }).click();
    await expect(page).toHaveURL(/forgot-password/);
    await page.goto("/reset-password");
    await expect(page.getByLabel("كلمة المرور الجديدة")).toBeVisible();
  });
});

test.describe("PWA", () => {
  test("serves a valid manifest with icons", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m.display).toBe("standalone");
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  });

  test("service worker is never cached and the offline page exists", async ({ request }) => {
    const sw = await request.get("/sw.js");
    expect(sw.headers()["cache-control"]).toContain("no-store");
    expect((await request.get("/offline.html")).ok()).toBe(true);
  });

  test("registers the service worker", async ({ page }) => {
    await page.goto("/");
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toMatch(/\/$/);
  });
});

test("captures screenshots of the public pages", async ({ page }, info) => {
  for (const [name, path] of [["home", "/"], ["login", "/login"], ["register", "/register"]] as const) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `test-results/screens/${info.project.name}-${name}.png`, fullPage: name === "home" });
  }
});
