/**
 * Move to Patient — end-to-end test
 *
 * Verifies that when a clinician long-presses a photo to enter select mode and
 * moves it to a different patient, the change appears immediately on both the
 * source and destination patient screens (i.e. the React Query cache is fully
 * invalidated for both patients after the PATCH requests succeed).
 *
 * Requires:
 *   - Expo Metro dev server running at http://localhost:8081 (npm run dev)
 *   - API server running at http://localhost:8080 (api-server dev workflow)
 *   - Seeded superadmin user: jmorales3 / jrm38212
 *
 * Cleanup: test patients are deleted with ?force=true in afterAll even if the
 * test fails, so repeated runs don't accumulate stale data.
 */

import { test, expect, type Page } from "@playwright/test";

// ─── Seeded superadmin credentials (refreshed on every API server start) ──────
const ADMIN_USERNAME = "jmorales3";
const ADMIN_PASSWORD = "jrm38212";

// ─── API base — same origin as Metro dev server port ─────────────────────────
// The dev-proxy strips /mobile before forwarding, so /api hits the API server
// only when the Replit router is in front.  Calling the API server directly on
// its own port avoids that routing and works for local test runs.
const API_BASE = "http://localhost:8080";

// ─── Minimal 1×1 JPEG (base64) used as the test image payload ────────────────
// Generated with: convert -size 1x1 xc:white jpeg:- | base64
const TINY_JPEG_B64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVIP/2Q==";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiCall(
  method: string,
  path: string,
  body?: unknown,
  sessionCookie?: string
): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionCookie) headers["Cookie"] = sessionCookie;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

/** Login via the API and return the Set-Cookie header value. */
async function getSessionCookie(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const cookie = res.headers.get("set-cookie");
  if (!cookie) throw new Error("No session cookie returned by login");
  // Keep only the name=value part (strip path/httpOnly/etc.)
  return cookie.split(";")[0];
}

/** Upload a tiny JPEG to the given patient, return the image id. */
async function uploadTestImage(patientId: number, sessionCookie: string): Promise<number> {
  const bytes = Uint8Array.from(atob(TINY_JPEG_B64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "image/jpeg" });
  const fd = new FormData();
  fd.append("patientId", String(patientId));
  fd.append("file", blob, "test.jpg");
  const res = await fetch(`${API_BASE}/api/images`, {
    method: "POST",
    headers: { Cookie: sessionCookie },
    body: fd,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Image upload failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { id: number };
  return data.id;
}

/** Log in through the mobile app's UI and wait for the patient list. */
async function loginViaUI(page: Page): Promise<void> {
  // Pre-set the server URL in localStorage before the app React code runs.
  // ServerContext reads the "server_url" key from AsyncStorage (backed by
  // localStorage on web) and defaults to the production URL when it is absent.
  // Setting it here ensures the in-browser app talks to the local API server,
  // not to the production deployment, so the test fixtures created in beforeAll
  // are visible to the browser-side API calls.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("server_url", "http://localhost:8080");
    } catch {
      // ignore in case localStorage is unavailable
    }
  });

  await page.goto("/mobile/");
  // Wait for the login screen (up to 30s for Metro bundle to load and render)
  await page.waitForSelector('[data-testid="username-input"]', { timeout: 30_000 });
  await page.fill('[data-testid="username-input"]', ADMIN_USERNAME);
  await page.fill('[data-testid="password-input"]', ADMIN_PASSWORD);
  await page.click('[data-testid="login-button"]');
  // Wait for the patient list to appear after login
  await page.waitForSelector('[data-testid="patient-search"]', { timeout: 10_000 });
}

/** Long-press an element by holding the mouse button down for 700 ms. */
async function longPress(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector);
  const box = await el.boundingBox();
  if (!box) throw new Error(`Element not found: ${selector}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
}

// ─── Test ─────────────────────────────────────────────────────────────────────

test.describe("Move to Patient", () => {
  let sessionCookie: string;
  let sourcePatientId: number;
  let destPatientId: number;
  let imageId: number;

  // Unique suffixes prevent collisions if a prior run's cleanup was skipped
  const suffix = Date.now();

  test.beforeAll(async () => {
    sessionCookie = await getSessionCookie();

    // Create source and destination patients
    const src = (await apiCall(
      "POST",
      "/api/patients",
      { name: `Move Test Source ${suffix}`, patientCode: `MTSRC${suffix}` },
      sessionCookie
    )) as { id: number };
    sourcePatientId = src.id;

    const dst = (await apiCall(
      "POST",
      "/api/patients",
      { name: `Move Test Dest ${suffix}`, patientCode: `MTDST${suffix}` },
      sessionCookie
    )) as { id: number };
    destPatientId = dst.id;

    // Upload a test image to the source patient
    imageId = await uploadTestImage(sourcePatientId, sessionCookie);
  });

  test.afterAll(async () => {
    // Clean up test data regardless of test outcome
    if (destPatientId) {
      await apiCall("DELETE", `/api/patients/${destPatientId}?force=true`, undefined, sessionCookie).catch(() => {});
    }
    if (sourcePatientId) {
      await apiCall("DELETE", `/api/patients/${sourcePatientId}?force=true`, undefined, sessionCookie).catch(() => {});
    }
  });

  test(
    "moved photo disappears from source and appears on destination immediately",
    async ({ page }) => {
      // ── 1. Log in ───────────────────────────────────────────────────────────
      await loginViaUI(page);

      // ── 2. Open the source patient ──────────────────────────────────────────
      await page.fill('[data-testid="patient-search"]', `Move Test Source ${suffix}`);
      await page.waitForSelector(`[data-testid="patient-row-${sourcePatientId}"]`, { timeout: 5_000 });
      await page.click(`[data-testid="patient-row-${sourcePatientId}"]`);

      // ── 3. Confirm the test image is visible on the source patient screen ───
      await page.waitForSelector(`[data-testid="image-item-${imageId}"]`, { timeout: 10_000 });
      await expect(page.locator(`[data-testid="image-item-${imageId}"]`)).toBeVisible();

      // ── 4. Long-press the image to enter select mode ─────────────────────────
      await longPress(page, `[data-testid="image-item-${imageId}"]`);
      await page.waitForTimeout(500); // allow React state to settle

      // Select mode is active when the Move button appears
      await page.waitForSelector('[data-testid="move-to-patient-button"]', { timeout: 5_000 });
      await expect(page.locator('[data-testid="move-to-patient-button"]')).toBeVisible();

      // ── 5. Open the Move to Patient modal ────────────────────────────────────
      await page.click('[data-testid="move-to-patient-button"]');
      // Wait for the modal to slide in
      await page.waitForTimeout(1_500);

      // ── 6. Search for and select the destination patient ─────────────────────
      // The modal's search input has testID="move-to-patient-search"
      const searchBox = page.locator('[data-testid="move-to-patient-search"]');
      await searchBox.waitFor({ state: "visible", timeout: 8_000 });
      await searchBox.fill(`Move Test Dest ${suffix}`);
      await page.waitForTimeout(500);

      // Click the patient row that matches the destination name
      await page.getByText(`Move Test Dest ${suffix}`).first().click();

      // Wait for the PATCH requests and cache invalidation to finish
      await page.waitForTimeout(3_000);

      // ── 7. Verify source patient screen: image must be gone ──────────────────
      await expect(
        page.locator(`[data-testid="image-item-${imageId}"]`)
      ).toBeHidden({ timeout: 5_000 });

      // ── 8. Navigate to destination patient and verify image arrived ───────────
      // Go back in browser history to the patient list.  Expo Router integrates
      // with browser history, so pressing Back navigates to the previous route
      // without re-fetching the Metro bundle.
      await page.goBack();
      await page.waitForSelector('[data-testid="patient-search"]', { timeout: 15_000 });
      await page.fill('[data-testid="patient-search"]', `Move Test Dest ${suffix}`);
      await page.waitForSelector(`[data-testid="patient-row-${destPatientId}"]`, { timeout: 8_000 });
      await page.click(`[data-testid="patient-row-${destPatientId}"]`);

      // ── 9. Verify the moved photo is visible on the destination patient ───────
      await page.waitForSelector(`[data-testid="image-item-${imageId}"]`, { timeout: 10_000 });
      await expect(
        page.locator(`[data-testid="image-item-${imageId}"]`)
      ).toBeVisible();
    }
  );
});
