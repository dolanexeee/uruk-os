/**
 * Live-production smoke test against https://uruk-os.vercel.app.
 *
 * Uses Playwright Firefox with the sandbox's authenticated egress proxy
 * passed as a structured proxy option (Chromium rejects credentials in
 * --proxy-server, and the proxy's TLS interception requires
 * ignoreHTTPSErrors inside the sandbox — the production cert itself is
 * valid; this only affects this harness).
 *
 * Phase 4A: the fresh Firefox profile has no accounts yet, so the
 * smoke creates the first account through the real create form; it
 * also fetches the production /api/proxy route for example.org.
 */
import { firefox } from "playwright";

const browser = await firefox.launch({
  proxy: { server: process.env.https_proxy, bypass: "localhost,127.0.0.1" },
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
await page.goto("https://uruk-os.vercel.app", { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="login-screen"]', { timeout: 25000 });
if (await page.locator('[data-testid="account-name-input"]').isVisible().catch(() => false)) {
  await page.fill('[data-testid="account-name-input"]', "Mustafa");
  await page.click('[data-testid="account-create-submit"]');
} else {
  await page.click('[data-testid="login-button"]');
}
await page.waitForSelector('[data-testid="dock"]', { timeout: 20000 });
await page.click('[data-testid="dock-icon-terminal"]');
await page.waitForSelector('[data-testid="window-terminal"]', { timeout: 15000 });
await page.click('[data-testid="terminal-input"]');
await page.keyboard.type("urukfetch");
await page.keyboard.press("Enter");
await page.waitForTimeout(900);
const txt = await page.locator('[data-testid="terminal"]').innerText();
console.log("live urukfetch contains URUK OS 0.5.0:", txt.includes("URUK OS 0.5.0"));
await page.screenshot({ path: "qa/screenshots/06-live-production.png" });
await browser.close();

// The production proxy route must fetch a real site.
const px = await fetch(
  "https://uruk-os.vercel.app/api/proxy?url=" + encodeURIComponent("https://example.org"),
);
const pxBody = await px.text();
console.log(
  "live /api/proxy example.org:",
  px.status,
  "contains 'Example Domain':",
  pxBody.includes("Example Domain"),
);
