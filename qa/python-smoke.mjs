/**
 * Uruk OS — Phase 5 Firefox smoke: Python (Pyodide) + real map tiles.
 *
 * The sandbox's Chromium browser has no direct internet, so the
 * Pyodide CDN is unreachable there and the offline suite can only
 * assert the honest failure state. Firefox accepts the authenticated
 * egress proxy as a structured option (the live-smoke pattern), which
 * makes the real Python path testable end-to-end:
 *   print(6*7) → 42 · sibling-file bridge via open() · the spec's
 *   sum-of-squares → 285 · input() fed from the stdin box.
 * It also captures the Two Rivers screenshot with real OSM tiles.
 *
 * Usage:
 *   node qa/python-smoke.mjs                        # local prod server (:3221, spawned)
 *   node qa/python-smoke.mjs https://uruk-os.vercel.app
 */
import { firefox } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const argBase = process.argv[2];
const PORT = 3221;
const BASE = argBase ?? `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, "qa", "screenshots");

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 30000, step = 200) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* keep polling */
    }
    if (Date.now() - start > timeout) return null;
    await sleep(step);
  }
}

let server = null;
if (!argBase) {
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
    { cwd: ROOT, stdio: "ignore" },
  );
}

try {
  const up = await waitFor(async () => (await fetch(BASE).catch(() => null))?.ok, 30000);
  if (!up) throw new Error(`server at ${BASE} did not come up`);

  const browser = await firefox.launch({
    proxy: { server: process.env.https_proxy, bypass: "localhost,127.0.0.1" },
    // Headless Firefox disables WebGL by default; openstreetmap.org's
    // embed renderer needs it. Software GL is fine for a screenshot.
    firefoxUserPrefs: {
      "webgl.disabled": false,
      "webgl.force-enabled": true,
      "gfx.webrender.software": true,
    },
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 250)));

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="login-screen"]', { timeout: 30000 });
  if (await page.locator('[data-testid="account-name-input"]').isVisible().catch(() => false)) {
    await page.fill('[data-testid="account-name-input"]', "Mustafa");
    await page.click('[data-testid="account-create-submit"]');
  } else {
    await page.click('[data-testid="login-button"]');
  }
  await page.waitForSelector('[data-testid="dock"]', { timeout: 25000 });
  console.log("— python smoke: logged in —");

  const term = async (cmd) => {
    await page.click('[data-testid="terminal-input"]');
    await page.keyboard.type(cmd, { delay: 6 });
    await page.keyboard.press("Enter");
    await sleep(400);
  };
  await page.click('[data-testid="dock-icon-terminal"]');
  await page.waitForSelector('[data-testid="window-terminal"]', { timeout: 15000 });
  await term(`echo 'print(6 * 7)' > Documents/py42.py`);
  await term(`echo 'wedges and rivers' > Documents/sibling.txt`);
  await term(`echo 'print(open("sibling.txt").read())' > Documents/reader.py`);
  await term(`echo 'print(sum(i*i for i in range(10)))' > Documents/sumsq.py`);
  await term(`echo 'name = input("Name? "); print("Hello, " + name)' > Documents/greeter.py`);
  await page.locator('[data-testid="window-terminal"]').getByLabel("Close").click();
  await sleep(400);

  await page.click('[data-testid="dock-icon-code"]');
  await page.waitForSelector('[data-testid="window-code"]', { timeout: 15000 });
  const openInCode = async (name) => {
    await page.click('[data-testid="code-open"]');
    await page.locator('[data-testid="code-open-list"] button', { hasText: name }).first().click();
    await page.waitForSelector(`[data-testid="code-tab-${name}"]`, { timeout: 15000 });
  };
  const outputText = () => page.locator('[data-testid="code-output"]').innerText().catch(() => "");

  console.log("— python smoke: print(6*7) → 42 (first run loads Pyodide) —");
  const runAndWait = async (needle, timeout) => {
    await page.click('[data-testid="code-run"]');
    return waitFor(async () => {
      const t = await outputText();
      return needle.test(t) ? t : null;
    }, timeout);
  };
  await openInCode("py42.py");
  let out42 = await runAndWait(/(^|\n)42(\n|$)/, 180000);
  if (!out42) {
    // A stalled CDN fetch through the sandbox proxy has no timeout of
    // its own; reload (the browser's HTTP cache keeps what arrived)
    // and run once more before declaring failure.
    console.log("  …first attempt stalled — reloading and retrying once");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="login-screen"]', { timeout: 30000 }).catch(() => null);
    if (await page.locator('[data-testid="login-button"]').isVisible().catch(() => false)) {
      await page.click('[data-testid="login-button"]');
    }
    await page.waitForSelector('[data-testid="dock"]', { timeout: 25000 });
    await page.click('[data-testid="dock-icon-code"]');
    await page.waitForSelector('[data-testid="window-code"]', { timeout: 15000 });
    await openInCode("py42.py");
    out42 = await runAndWait(/(^|\n)42(\n|$)/, 180000);
  }
  check("python: print(6 * 7) prints 42", !!out42, (out42 ?? "").slice(0, 300));
  await sleep(600);
  await page.screenshot({ path: path.join(SHOTS, "26-code-python.png") });

  console.log("— python smoke: file bridge (open a sibling file) —");
  await openInCode("reader.py");
  const outBridge = await runAndWait(/wedges and rivers/, 120000);
  check("python: open('sibling.txt').read() returns the bridged file", !!outBridge, (outBridge ?? "").slice(0, 200));

  console.log("— python smoke: sum of squares → 285 —");
  await openInCode("sumsq.py");
  const out285 = await runAndWait(/(^|\n)285(\n|$)/, 120000);
  check("python: print(sum(i*i for i in range(10))) prints 285", !!out285, (out285 ?? "").slice(0, 200));

  console.log("— python smoke: input() fed from the stdin box —");
  await openInCode("greeter.py");
  const eofHint = await runAndWait(/ran out of stdin/, 120000);
  check("python: input() with an empty stdin fails honestly (EOFError hint)", !!eofHint, (eofHint ?? "").slice(0, 200));
  await page.fill('[data-testid="code-stdin"]', "Gilgamesh");
  const outGreet = await runAndWait(/Hello, Gilgamesh/, 120000);
  check("python: input() reads the stdin box → 'Hello, Gilgamesh'", !!outGreet, (outGreet ?? "").slice(0, 200));

  console.log("— maps smoke: real Nominatim + real OSM tiles —");
  await page.click('[data-testid="dock-icon-maps"]');
  await page.waitForSelector('[data-testid="window-maps"]', { timeout: 15000 });
  await page.fill('[data-testid="maps-search"]', "Baghdad");
  await page.click('[data-testid="maps-search-btn"]');
  const mRes = await waitFor(
    () => page.locator('[data-testid="maps-result-0"]').isVisible().catch(() => false),
    45000,
  );
  check("maps: live Nominatim returns Baghdad", !!mRes);
  if (mRes) {
    await page.click('[data-testid="maps-result-0"]');
    await sleep(6000); // let the real tiles paint
    const place = await page.locator('[data-testid="maps-place"]').innerText().catch(() => "");
    check("maps: embed re-centered on the Baghdad result", place.includes("Baghdad"), place);
    await page.screenshot({ path: path.join(SHOTS, "27-two-rivers-baghdad.png") });
  }

  await browser.close();
  console.log(`\npython-smoke: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
} finally {
  if (server) server.kill();
}
