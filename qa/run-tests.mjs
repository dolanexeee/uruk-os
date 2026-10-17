/**
 * Uruk OS — Phase 1 end-to-end suite (Playwright, Chromium).
 * Runs against the PRODUCTION static export served by scripts/serve-out.mjs.
 * Usage: node qa/run-tests.mjs   (expects `npm run build` to have run)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3217;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, "qa", "screenshots");
mkdirSync(SHOTS, { recursive: true });

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function waitFor(fn, timeout = 9000, step = 120) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* keep polling */
    }
    if (Date.now() - start > timeout) return null;
    await new Promise((r) => setTimeout(r, step));
  }
}

const server = spawn("node", ["scripts/serve-out.mjs", "-p", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore",
});

async function focusWindowViaMenu(page, titleRe) {
  await page.click('[data-testid="menubar-window"]');
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: titleRe }).last().click();
  await page.waitForTimeout(250);
}

async function termType(page, cmd) {
  await page.click('[data-testid="terminal-input"]');
  await page.keyboard.type(cmd, { delay: 8 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);
}

async function main() {
  // wait for server
  const up = await waitFor(async () => {
    const r = await fetch(BASE).catch(() => null);
    return r && r.ok;
  }, 15000);
  if (!up) throw new Error("static server did not come up");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 300)));

  console.log("— boot & login —");
  await page.goto(BASE, { waitUntil: "networkidle" });
  check("boot screen appears", await page.locator('[data-testid="boot-screen"]').isVisible().catch(() => false));
  const loginVisible = await waitFor(() => page.locator('[data-testid="login-screen"]').isVisible().catch(() => false));
  check("login screen after boot", !!loginVisible);
  await page.click('[data-testid="login-button"]');
  const desktopUp = await waitFor(() => page.locator('[data-testid="dock"]').isVisible().catch(() => false));
  check("desktop + dock after login", !!desktopUp);
  check("menu bar clock renders", !!(await page.locator('[data-testid="menubar-clock"]').textContent().catch(() => ""))?.includes("M"));
  check("desktop shows seeded Welcome.txt", await page.locator('[data-testid="desktop-icon-Welcome.txt"]').isVisible().catch(() => false));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, "01-desktop.png") });

  console.log("— finder: create folder via UI —");
  await page.click('[data-testid="dock-icon-finder"]');
  const finderUp = await waitFor(() => page.locator('[data-testid="window-finder"]').isVisible().catch(() => false));
  check("finder opens from dock", !!finderUp);
  check("finder starts on Desktop with Welcome.txt", await page.locator('[data-testid="finder-item-Welcome.txt"]').isVisible().catch(() => false));
  await page.click('[data-testid="finder-new-folder"]');
  const renameInput = page.locator('[data-testid="finder-rename-input"]');
  const renameShown = await waitFor(() => renameInput.isVisible().catch(() => false));
  check("new folder starts inline rename", !!renameShown);
  await renameInput.press("Control+a");
  await renameInput.type("TestFolder");
  await renameInput.press("Enter");
  const folderThere = await waitFor(() => page.locator('[data-testid="finder-item-TestFolder"]').isVisible().catch(() => false));
  check("folder 'TestFolder' created and listed", !!folderThere);
  await page.screenshot({ path: path.join(SHOTS, "02-finder.png") });

  console.log("— terminal: real interpreter over the shared FS —");
  await page.click('[data-testid="dock-icon-terminal"]');
  const termUp = await waitFor(() => page.locator('[data-testid="window-terminal"]').isVisible().catch(() => false));
  check("terminal opens", !!termUp);
  await termType(page, "echo hello > Documents/a.txt");
  await termType(page, "cat Documents/a.txt");
  const termText1 = await page.locator('[data-testid="terminal"]').innerText();
  check("cat prints 'hello'", /hello/.test(termText1));
  await termType(page, "ls Documents");
  const termText2 = await page.locator('[data-testid="terminal"]').innerText();
  check("ls Documents shows a.txt", /a\.txt/.test(termText2));
  await termType(page, "urukfetch");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, "03-terminal-urukfetch.png") });

  console.log("— shared FS: terminal file appears in Finder —");
  await focusWindowViaMenu(page, /Desktop/);
  await page.click('[data-testid="finder-sidebar-documents"]');
  const aInFinder = await waitFor(() => page.locator('[data-testid="finder-item-a.txt"]').isVisible().catch(() => false));
  check("a.txt created in Terminal is visible in Finder", !!aInFinder);

  console.log("— editor: open, modify, save, verify in terminal —");
  await page.dblclick('[data-testid="finder-item-a.txt"]');
  const editorUp = await waitFor(() => page.locator('[data-testid="window-editor"]').isVisible().catch(() => false));
  check("editor opens a.txt", !!editorUp);
  const area = page.locator('[data-testid="editor-textarea"]');
  check("editor content is 'hello'", ((await area.inputValue()) ?? "").trim() === "hello");
  await area.click();
  await area.press("Control+a");
  await area.type("hello from the editor");
  await area.press("Control+s");
  await page.waitForTimeout(400);
  check("editor reports Saved after Ctrl+S", (await page.locator('[data-testid="window-editor"]').innerText()).includes("Saved"));
  await focusWindowViaMenu(page, /Terminal/);
  await termType(page, "cat Documents/a.txt");
  const termText3 = await page.locator('[data-testid="terminal"]').innerText();
  check("terminal cat shows editor-saved text", /hello from the editor/.test(termText3));

  console.log("— window flows: minimize / restore / maximize / close —");
  await focusWindowViaMenu(page, /Documents/);
  const finderWin = page.locator('[data-testid="window-finder"]');
  await finderWin.getByLabel("Minimize").click();
  await page.waitForTimeout(450);
  check("finder minimized (window removed)", (await page.locator('[data-testid="window-finder"]').count()) === 0);
  await page.click('[data-testid="dock-icon-finder"]');
  const restored = await waitFor(() => page.locator('[data-testid="window-finder"]').isVisible().catch(() => false));
  check("finder restored via dock click", !!restored);
  await focusWindowViaMenu(page, /Terminal/);
  const termWin = page.locator('[data-testid="window-terminal"]');
  const before = await termWin.boundingBox();
  await termWin.getByLabel("Zoom").click();
  await page.waitForTimeout(250);
  const after = await termWin.boundingBox();
  check(
    "terminal maximized to full work area",
    !!before && !!after && after.height > before.height + 100 && after.y <= 29,
    `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
  );
  await termWin.getByLabel("Zoom").click();
  await page.waitForTimeout(250);
  await termWin.getByLabel("Close").click();
  await page.waitForTimeout(400);
  check("terminal closed via traffic light", (await page.locator('[data-testid="window-terminal"]').count()) === 0);

  console.log("— settings: wallpaper + appearance —");
  await page.click('[data-testid="dock-icon-settings"]');
  const settingsUp = await waitFor(() => page.locator('[data-testid="window-settings"]').isVisible().catch(() => false));
  check("settings opens", !!settingsUp);
  await page.click('[data-testid="settings-pane-wallpaper"]');
  await page.click('[data-testid="settings-wallpaper-dunes"]');
  await page.waitForTimeout(300);
  const settingsAfterWp = await page.evaluate(() => localStorage.getItem("uruk-os-settings-v1") ?? "");
  check("wallpaper choice persisted to storage", settingsAfterWp.includes("dunes"), settingsAfterWp);
  await page.click('[data-testid="settings-pane-appearance"]');
  await page.click('[data-testid="settings-theme-light"]');
  await page.waitForTimeout(300);
  const rootClass1 = await page.getAttribute('[data-testid="os-root"]', "class");
  check("light mode applied (no .dark on root)", !(rootClass1 ?? "").includes("dark"), rootClass1 ?? "");
  await page.screenshot({ path: path.join(SHOTS, "04-settings.png") });
  await page.locator('[data-testid="window-settings"]').getByLabel("Close").click();
  await page.waitForTimeout(350);

  console.log("— persistence across reload —");
  await page.reload({ waitUntil: "networkidle" });
  const login2 = await waitFor(() => page.locator('[data-testid="login-screen"]').isVisible().catch(() => false), 12000);
  check("login screen after reload", !!login2);
  await page.click('[data-testid="login-button"]');
  await waitFor(() => page.locator('[data-testid="dock"]').isVisible().catch(() => false));
  const settingsPersisted = await page.evaluate(() => localStorage.getItem("uruk-os-settings-v1") ?? "");
  check("settings persisted (dunes + light)", settingsPersisted.includes("dunes") && settingsPersisted.includes("light"), settingsPersisted);
  const rootClass2 = await page.getAttribute('[data-testid="os-root"]', "class");
  check("light mode still applied after reload", !(rootClass2 ?? "").includes("dark"));
  await page.click('[data-testid="dock-icon-terminal"]');
  await waitFor(() => page.locator('[data-testid="window-terminal"]').isVisible().catch(() => false));
  await termType(page, "cat Documents/a.txt");
  const termText4 = await page.locator('[data-testid="terminal"]').innerText();
  check("FS persisted: a.txt still contains editor text", /hello from the editor/.test(termText4));
  await termType(page, "ls Desktop");
  const termText5 = await page.locator('[data-testid="terminal"]').innerText();
  check("FS persisted: TestFolder still on Desktop", /TestFolder/.test(termText5));
  await page.screenshot({ path: path.join(SHOTS, "05-after-reload.png") });

  await browser.close();
  server.kill();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) console.log("failures:", failures.join(" | "));
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  server.kill();
  process.exit(1);
});
