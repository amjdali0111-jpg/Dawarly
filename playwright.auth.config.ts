import { defineConfig } from "@playwright/test";

// Browser regression tests for login -> /reports against a mock Supabase
// (tests/e2e-auth/mock-supabase.mjs). Run with `npm run test:e2e:auth`, which
// builds the app with the mock URL baked into NEXT_PUBLIC_SUPABASE_URL.
const PORT = Number(process.env.AUTH_E2E_PORT ?? 3202);
const MOCK_PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54399);

export default defineConfig({
  testDir: "tests/e2e-auth",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.AUTH_E2E_BASE_URL ?? `http://localhost:${PORT}`,
    locale: "en-US",
    // Uses the locally installed browser; set PW_CHANNEL="" to use Playwright's Chromium.
    channel: process.env.PW_CHANNEL ?? "msedge",
    trace: "retain-on-failure",
  },
  webServer: process.env.AUTH_E2E_BASE_URL
    ? undefined
    : [
        { command: `node tests/e2e-auth/mock-supabase.mjs ${MOCK_PORT}`, port: MOCK_PORT, reuseExistingServer: true },
        { command: `npx next start -p ${PORT}`, port: PORT, reuseExistingServer: true, timeout: 120_000 },
      ],
});
