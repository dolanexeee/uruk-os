import { chromium } from "playwright";

const browser = await chromium.launch({
  args: [`--proxy-server=${process.env.https_proxy}`, "--proxy-bypass-list=localhost;127.0.0.1"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("https://uruk-os.vercel.app", { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="login-screen"]', { timeout: 20000 });
await page.click('[data-testid="login-button"]');
await page.waitForSelector('[data-testid="dock"]', { timeout: 10000 });
await page.click('[data-testid="dock-icon-terminal"]');
await page.waitForSelector('[data-testid="window-terminal"]', { timeout: 10000 });
await page.click('[data-testid="terminal-input"]');
await page.keyboard.type("urukfetch");
await page.keyboard.press("Enter");
await page.waitForTimeout(700);
const txt = await page.locator('[data-testid="terminal"]').innerText();
console.log("live urukfetch contains URUK OS 0.2.0:", txt.includes("URUK OS 0.2.0"));
await page.screenshot({ path: "qa/screenshots/06-live-production.png" });
await browser.close();
