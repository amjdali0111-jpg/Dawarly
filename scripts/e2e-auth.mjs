// Builds the app against the mock Supabase (tests/e2e-auth/mock-supabase.mjs)
// and runs the login -> /reports browser regression tests.
// NOTE: this overwrites .next with a mock-configured build; run `npm run build`
// afterwards before `npm start` against the real project.
import { spawnSync } from "node:child_process";

const MOCK_PORT = process.env.MOCK_SUPABASE_PORT ?? "54399";
const PORT = process.env.AUTH_E2E_PORT ?? "3202";
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${MOCK_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
  NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
};
const run = (args) => {
  const r = spawnSync("npx", args, { env, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run(["next", "build"]);
run(["playwright", "test", "-c", "playwright.auth.config.ts", ...process.argv.slice(2)]);
