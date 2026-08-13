import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the patient-images-mobile e2e test suite.
 *
 * The tests run against the Expo Metro dev server (served via the dev-proxy
 * at port 8081), which maps the /mobile path prefix correctly.  In CI the
 * server must already be running; locally you can start it with:
 *
 *   pnpm --filter @workspace/patient-images-mobile run dev
 *   pnpm --filter @workspace/api-server run dev
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    // The Replit proxy exposes the app at /mobile through localhost:80.
    // Port 8081 is the Metro dev-proxy; /mobile/ is the artifact path prefix.
    baseURL: "http://localhost:8081",
    // Use the artifact's sub-path so bundle asset URLs resolve correctly.
    // (dev-proxy strips /mobile before forwarding to Metro.)
    headless: true,
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
