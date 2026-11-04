import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import en from "@/i18n/en";
import ar from "@/i18n/ar";
import { makeT } from "@/i18n/translate";
import { errorCode, errorMessage } from "@/lib/errors";
import { isProtectedPath } from "@/lib/routes";
import { notificationHref } from "@/lib/notification-links";

function keys(o: object, prefix = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [prefix + k] : keys(v, `${prefix}${k}.`)));
}

describe("i18n", () => {
  it("Arabic and English dictionaries have identical keys and no empty strings", () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort());
    for (const k of keys(ar)) expect(makeT("ar")(k as never).trim().length).toBeGreaterThan(0);
  });
  it("interpolates variables and falls back to the key", () => {
    expect(makeT("en")("reports.listSubtitle", { university: "KSU" })).toContain("KSU");
    expect(makeT("en")("nope.key" as never)).toBe("nope.key");
  });
  it("every database error code has a translation", () => {
    const sql = ["20261029000003_workflows.sql", "20261029000002_access_control.sql"].map((f) => readFileSync(`supabase/migrations/${f}`, "utf8")).join("\n");
    const codes = new Set([...sql.matchAll(/raise exception '((?:auth|validation|state):[a-z_]+)'/g)].map((m) => m[1]));
    expect(codes.size).toBeGreaterThan(20);
    for (const c of codes) expect(Object.keys(en.errors), c).toContain(c);
  });
});

describe("error mapping", () => {
  it("extracts stable codes and never leaks raw messages", () => {
    const t = makeT("en");
    expect(errorCode({ message: "state:duplicate_request" })).toBe("state:duplicate_request");
    expect(errorCode({ message: "x", code: "42501" })).toBe("auth:forbidden");
    expect(errorMessage(t, { message: 'duplicate key value violates unique constraint "secret_idx"' })).toBe(en.common.genericError);
  });
});

describe("routing", () => {
  it("protects every authenticated area but not the public pages", () => {
    for (const p of ["/reports", "/reports/abc", "/reports/new", "/my-reports", "/matches", "/requests", "/messages/x", "/notifications", "/map", "/profile", "/settings", "/admin", "/admin/reports/1", "/users/1"]) {
      expect(isProtectedPath(p), p).toBe(true);
    }
    for (const p of ["/", "/login", "/register", "/forgot-password", "/reset-password", "/reportsx"]) expect(isProtectedPath(p), p).toBe(false);
  });
  it("notification links carry ids only", () => {
    expect(notificationHref("new_message", { conversation_id: "c1" })).toBe("/messages/c1");
    expect(notificationHref("report_expired", { report_id: "r1" })).toBe("/reports/r1");
  });
});

describe("service worker caching policy", () => {
  const listeners: Record<string, unknown> = {};
  const self: Record<string, unknown> = { location: { origin: "https://app.example" }, addEventListener: (n: string, f: unknown) => (listeners[n] = f) };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), { self, caches: {}, fetch: () => undefined, URL });
  const cacheable = self.__dawarlyIsCacheable as (u: URL, r: { method: string }) => boolean;
  const check = (path: string, method = "GET") => cacheable(new URL(path, "https://app.example"), { method });

  it("caches only public static assets", () => {
    expect(check("/_next/static/chunks/app.js")).toBe(true);
    expect(check("/icons/icon-192.png")).toBe(true);
    expect(check("/offline.html")).toBe(true);
  });
  it("never caches pages, APIs, auth, private data or cross-origin requests", () => {
    for (const p of ["/reports", "/reports/123", "/messages/1", "/api/cron/expire", "/auth/confirm?code=x", "/", "/admin"]) expect(check(p), p).toBe(false);
    expect(check("/icons/icon-192.png", "POST")).toBe(false);
    expect(cacheable(new URL("https://proj.supabase.co/storage/v1/object/sign/report-images/a.jpg?token=t"), { method: "GET" })).toBe(false);
    expect(check("/images/x.webp?token=abc")).toBe(false);
  });
});
