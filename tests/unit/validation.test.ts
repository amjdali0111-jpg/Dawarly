import { describe, expect, it } from "vitest";
import { MAX_PHOTOS, registerSchema, reportSchema, safeNext, validatePhotoFile } from "@/lib/validation";

const today = new Date().toISOString().slice(0, 10);
const valid = {
  type: "lost", item_name: "Keys", description: "Three keys on a red ring", category_id: "6f1d1f3a-1c2b-4d5e-8f90-123456789abc",
  color: "red", distinguishing_features: "Car key fob", location_text: "Gate 2", lat: null, lng: null,
  event_date: today, event_time: "", image_paths: ["u/x/1.jpg"],
};

describe("report validation (shared by lost and found)", () => {
  for (const type of ["lost", "found"]) {
    it(`accepts a complete ${type} report; time optional, map optional`, () => {
      const r = reportSchema.safeParse({ ...valid, type });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.event_time).toBeNull();
    });
  }
  it.each([
    ["item_name", { item_name: "" }, "validation:item_name"],
    ["description", { description: "short" }, "validation:description"],
    ["category", { category_id: "nope" }, "validation:category"],
    ["color", { color: "" }, "validation:color"],
    ["features", { distinguishing_features: "" }, "validation:distinguishing_features"],
    ["location", { location_text: "" }, "validation:location"],
    ["date", { event_date: "" }, "validation:event_date"],
    ["future date", { event_date: "2999-01-01" }, "validation:event_date_future"],
    ["no photos", { image_paths: [] }, "validation:images_count"],
    ["too many photos", { image_paths: Array.from({ length: MAX_PHOTOS + 1 }, (_, i) => `p${i}`) }, "validation:images_count"],
    ["duplicate photos", { image_paths: ["abc", "abc"] }, "validation:images_duplicate"],
    ["half coordinates", { lat: 24.7, lng: null }, "validation:coordinates"],
  ])("rejects %s", (_, override, code) => {
    const r = reportSchema.safeParse({ ...valid, ...override });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.message)).toContain(code);
  });
  it("validates photo files", () => {
    expect(validatePhotoFile({ type: "image/gif", size: 10 })).toBe("validation:image_type");
    expect(validatePhotoFile({ type: "image/jpeg", size: 6 * 1024 * 1024 })).toBe("validation:image_size");
    expect(validatePhotoFile({ type: "image/webp", size: 1000 })).toBeNull();
  });
});

describe("registration validation", () => {
  const ok = { full_name: "Sara Ali", email: "Sara@Example.com", password: "secret123", confirm_password: "secret123", university_id: valid.category_id, member_type: "student", terms: "on" };
  it("accepts any email domain (no university domain restriction)", () => {
    const r = registerSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("sara@example.com");
  });
  it("requires matching strong passwords, a university and terms", () => {
    expect(registerSchema.safeParse({ ...ok, confirm_password: "x" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, password: "short", confirm_password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, university_id: "" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, terms: undefined }).success).toBe(false);
  });
  it("ignores any client-supplied role", () => {
    const r = registerSchema.safeParse({ ...ok, role: "global_admin" });
    expect(r.success && "role" in r.data).toBe(false);
  });
});

describe("safe redirects", () => {
  it("blocks open redirects", () => {
    expect(safeNext("/reports/1")).toBe("/reports/1");
    expect(safeNext("//evil.com")).toBe("/reports");
    expect(safeNext("https://evil.com")).toBe("/reports");
    expect(safeNext("/\\evil.com")).toBe("/reports");
  });
});
