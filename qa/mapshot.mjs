/**
 * Regenerates qa/screenshots/27-two-rivers-baghdad.png from the
 * offline Chromium flow (same mocked Nominatim as the suite).
 *
 * Why not a live-tiles shot: in this sandbox the embed cannot render
 * — Firefox has no WebGL (openstreetmap.org's embed requires it) and
 * Chromium cannot use the authenticated egress proxy (AGENTS.md
 * lesson 1). The live path itself IS verified: qa/python-smoke.mjs
 * drives the real Nominatim search in Firefox and asserts the embed
 * re-centers on Baghdad; on a real browser the embed paints tiles.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3225;
const BASE = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore",
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 30000, step = 150) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    if (Date.now() - start > timeout) return null;
    await sleep(step);
  }
}

try {
  await waitFor(async () => (await fetch(BASE).catch(() => null))?.ok, 30000);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="login-screen"]', { timeout: 30000 });
  if (await page.locator('[data-testid="account-name-input"]').isVisible().catch(() => false)) {
    await page.fill('[data-testid="account-name-input"]', "Mustafa");
    await page.click('[data-testid="account-create-submit"]');
  } else {
    await page.click('[data-testid="login-button"]');
  }
  await page.waitForSelector('[data-testid="dock"]', { timeout: 25000 });
  await page.route("https://nominatim.openstreetmap.org/**", (route) =>
    route.fulfill({
      json: [
        {
          display_name: "Baghdad, Iraq",
          lat: "33.3152",
          lon: "44.3661",
          boundingbox: ["33.1000", "33.5000", "44.2000", "44.5000"],
        },
      ],
    }),
  );
  await page.click('[data-testid="dock-icon-maps"]');
  await page.waitForSelector('[data-testid="window-maps"]', { timeout: 15000 });
  await page.fill('[data-testid="maps-search"]', "Baghdad");
  await page.click('[data-testid="maps-search-btn"]');
  await page.waitForSelector('[data-testid="maps-result-0"]', { timeout: 15000 });
  await page.click('[data-testid="maps-result-0"]');
  await sleep(900);
  await page.screenshot({ path: path.join(ROOT, "qa", "screenshots", "27-two-rivers-baghdad.png") });
  console.log("screenshot 27 regenerated (offline flow)");
  await browser.close();
} finally {
  server.kill();
}
