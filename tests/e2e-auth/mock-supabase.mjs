// Minimal Supabase stand-in (GoTrue + PostgREST subset) for browser tests of
// the login -> /reports flow. It implements only the endpoints that path uses.
// Each test user (selected by email) exercises one failure mode.
//
//   node tests/e2e-auth/mock-supabase.mjs [port]
//
// GET /__log returns and clears the request log (used to detect redirect loops).
import { createServer } from "node:http";

const PORT = Number(process.argv[2] ?? process.env.MOCK_SUPABASE_PORT ?? 54399);
export const PASSWORD = "Passw0rd!";
const UNI = { id: "11111111-1111-4111-8111-111111111111", slug: "test-uni", name_en: "Test University", name_ar: "جامعة الاختبار", center_lat: null, center_lng: null, is_active: true };
const CATEGORY = { id: "22222222-2222-4222-8222-222222222222", university_id: null, slug: "bags", name_en: "Bags", name_ar: "حقائب", icon: "backpack", is_sensitive: false, is_active: true, sort_order: 50 };

// scenario name = email local part
const SCENARIOS = ["ok", "noprofile", "deleted", "inactive", "dbfail", "reportsfail", "unconfirmed"];
const idOf = (s) => `00000000-0000-4000-8000-${String(SCENARIOS.indexOf(s) + 1).padStart(12, "0")}`;
const scenarioOfId = (id) => SCENARIOS.find((s) => idOf(s) === id);

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwtFor = (s) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: idOf(s), email: `${s}@test.local`, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const scenarioOfAuth = (req) => {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  try {
    return scenarioOfId(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub);
  } catch {
    return undefined;
  }
};
const userOf = (s) => ({
  id: idOf(s), aud: "authenticated", role: "authenticated", email: `${s}@test.local`,
  email_confirmed_at: s === "unconfirmed" ? null : "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email" }, user_metadata: {}, identities: [], created_at: "2026-01-01T00:00:00Z",
});

let log = [];
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const readBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  if (path === "/__log") { const out = log; log = []; return send(res, 200, out); }
  const who = scenarioOfAuth(req);
  log.push({ t: Date.now(), m: req.method, p: path, who });

  // ---- GoTrue ----
  if (path === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
    const { email = "", password = "" } = JSON.parse((await readBody(req)) || "{}");
    const s = email.split("@")[0];
    if (!SCENARIOS.includes(s) || password !== PASSWORD) return send(res, 400, { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" });
    if (s === "unconfirmed") return send(res, 400, { code: "email_not_confirmed", error_code: "email_not_confirmed", msg: "Email not confirmed" });
    return send(res, 200, { access_token: jwtFor(s), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `refresh-${s}`, user: userOf(s) });
  }
  if (path === "/auth/v1/user") return who ? send(res, 200, userOf(who)) : send(res, 403, { code: "bad_jwt", error_code: "bad_jwt", msg: "invalid JWT" });
  if (path === "/auth/v1/logout") return send(res, 204);

  // ---- PostgREST ----
  if (path === "/rest/v1/rpc/public_stats") return send(res, 200, { universities: 1, reports: 1, recovered: 0 });
  const table = path.startsWith("/rest/v1/") ? path.slice(9) : null;
  const count = (n) => ({ "content-range": n ? `0-${n - 1}/${n}` : "*/0" });
  const fail = () => send(res, 500, { code: "XX000", message: "simulated database failure", details: null, hint: null });
  switch (table) {
    case "universities":
      return send(res, 200, who === "inactive" ? [] : [UNI]);
    case "profiles":
      if (who === "dbfail") return fail();
      if (!who || who === "noprofile") return send(res, 200, []);
      return send(res, 200, [{ id: idOf(who), university_id: UNI.id, full_name: "Test User", avatar_path: null, member_type: "student", role: "user", faculty: null, academic_year: null, created_at: "2026-01-01T00:00:00Z", deleted_at: who === "deleted" ? "2026-02-01T00:00:00Z" : null }]);
    case "profile_private":
      return send(res, 200, who ? [{ restricted_until: null, locale: "en", email_notifications: true }] : []);
    case "notifications":
      return send(res, 200, req.method === "HEAD" ? undefined : [], { "content-range": "*/2" });
    case "conversation_participants":
      return send(res, 200, []);
    case "categories":
      return send(res, 200, [CATEGORY]);
    case "reports":
      if (who === "reportsfail") return fail();
      return send(res, 200, [{
        id: "33333333-3333-4333-8333-333333333333", university_id: UNI.id, owner_id: idOf("ok"), type: "lost", item_name: "Blue backpack",
        description: "A blue backpack with notebooks", category_id: CATEGORY.id, color: "blue", distinguishing_features: "keychain",
        location_text: "Library", approx_lat: null, approx_lng: null, event_date: "2026-11-01", event_time: null, status: "active",
        is_sensitive: false, expires_at: "2026-12-01T00:00:00Z", renewal_count: 0, closed_at: null, recovered_at: null,
        created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
      }], count(1));
    case "report_images":
      return send(res, 200, []);
    default:
      return send(res, 404, { code: "PGRST205", message: `mock: unhandled ${req.method} ${path}` });
  }
}).listen(PORT, () => console.log(`mock supabase listening on ${PORT}`));
