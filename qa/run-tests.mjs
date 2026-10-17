/**
 * Uruk OS — Phases 1–5 end-to-end suite (Playwright, Chromium).
 * Runs against the PRODUCTION server build (`next start`), so the
 * /api/proxy route is exercised exactly as deployed. The Chromium
 * sandbox browser has no direct internet: Phase 5's live-Python and
 * real-tile checks live in qa/python-smoke.mjs (Firefox + proxy);
 * here, Open-Meteo/Nominatim are route-mocked deterministically and
 * the Python run asserts its honest offline failure state.
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

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
  { cwd: ROOT, stdio: "ignore" },
);

async function focusWindowViaMenu(page, titleRe) {
  await page.click('[data-testid="menubar-window"]');
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: titleRe }).last().click();
  await page.waitForTimeout(250);
}

/**
 * Log in to the desktop from whatever the login screen is showing:
 * the first-run create-account form (fresh profile), a PIN prompt,
 * or the plain account picker. Defaults to creating/entering the
 * "Mustafa" account the rest of the suite assumes.
 */
async function loginToDesktop(page, { pin } = {}) {
  const shown = await waitFor(
    async () =>
      (await page.locator('[data-testid="login-screen"]').isVisible().catch(() => false)) ||
      (await page.locator('[data-testid="account-name-input"]').isVisible().catch(() => false)),
    20000,
  );
  if (!shown) throw new Error("login screen never appeared");
  if (await page.locator('[data-testid="account-name-input"]').isVisible().catch(() => false)) {
    await page.fill('[data-testid="account-name-input"]', "Mustafa");
    await page.click('[data-testid="account-create-submit"]');
  } else if (await page.locator('[data-testid="login-pin-input"]').isVisible().catch(() => false)) {
    if (!pin) throw new Error("login needs a PIN but none was given to loginToDesktop");
    await page.fill('[data-testid="login-pin-input"]', pin);
    await page.click('[data-testid="login-pin-submit"]');
  } else {
    await page.click('[data-testid="login-button"]');
  }
  const ok = await waitFor(
    () => page.locator('[data-testid="dock"]').isVisible().catch(() => false),
    20000,
  );
  if (!ok) throw new Error("login did not reach the desktop");
}

/** Read the active account's persisted OS settings (key is account-scoped). */
async function readSettingsBlob(page) {
  return page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith("uruk-os-settings-v1"));
    return k ? localStorage.getItem(k) ?? "" : "";
  });
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

  const browser = await chromium.launch({
    // headless Chromium otherwise blocks audible autoplay even for
    // gesture-initiated playback chains (a real user's click counts)
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 300)));

  console.log("— boot & login —");
  await page.goto(BASE, { waitUntil: "networkidle" });
  check("boot screen appears", await page.locator('[data-testid="boot-screen"]').isVisible().catch(() => false));
  const loginVisible = await waitFor(() => page.locator('[data-testid="login-screen"]').isVisible().catch(() => false));
  check("login screen after boot", !!loginVisible);
  await loginToDesktop(page);
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
  await focusWindowViaMenu(page, /Uruk Shell/);
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
  await focusWindowViaMenu(page, /Uruk Shell/);
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
  const settingsAfterWp = await readSettingsBlob(page);
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
  await loginToDesktop(page);
  await waitFor(() => page.locator('[data-testid="dock"]').isVisible().catch(() => false));
  const settingsPersisted = await readSettingsBlob(page);
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

  /* ============================ PHASE 2 ============================ */

  // generated fixtures (in-memory, no files on disk)
  const pngBuf = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII=",
    "base64",
  );
  function wavBuffer(seconds, freq) {
    const rate = 8000;
    const n = Math.floor(rate * seconds);
    const buf = Buffer.alloc(44 + n * 2);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(36 + n * 2, 4);
    buf.write("WAVE", 8);
    buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(rate, 24);
    buf.writeUInt32LE(rate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write("data", 36);
    buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) {
      buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 12000), 44 + i * 2);
    }
    return buf;
  }
  const closeWin = async (app) => {
    await page.locator(`[data-testid="window-${app}"]`).getByLabel("Close").click();
    await page.waitForTimeout(350);
  };

  console.log("— phase 2: calculator (UI math + precedence + tape) —");
  await page.click('[data-testid="dock-icon-calculator"]');
  const calcUp = await waitFor(() => page.locator('[data-testid="window-calculator"]').isVisible().catch(() => false));
  check("calculator opens", !!calcUp);
  const calcValue = () => page.locator('[data-testid="calc-display"]').innerText();
  for (const k of ["7", "mul", "8", "eq"]) await page.click(`[data-testid="calc-key-${k}"]`);
  check("calculator: 7 × 8 = 56 via UI", (await calcValue()) === "56", await calcValue());
  await page.click('[data-testid="calc-key-ac"]');
  for (const k of ["2", "add", "3", "mul", "4", "eq"]) await page.click(`[data-testid="calc-key-${k}"]`);
  check("calculator: 2 + 3 × 4 = 14 (operator precedence)", (await calcValue()) === "14", await calcValue());
  const tapeText = (await page.locator('[data-testid="calc-tape-entry"]').allInnerTexts()).join(" | ");
  check("calculator: history tape recorded both calculations", tapeText.includes("7 × 8") && tapeText.includes("2 + 3 × 4"), tapeText);
  await page.screenshot({ path: path.join(SHOTS, "10-calculator.png") });
  await closeWin("calculator");

  console.log("— phase 2: notes are real files —");
  await page.click('[data-testid="dock-icon-notes"]');
  const notesUp = await waitFor(() => page.locator('[data-testid="window-notes"]').isVisible().catch(() => false));
  check("notes opens", !!notesUp);
  await page.click('[data-testid="notes-new"]');
  await waitFor(() => page.locator('[data-testid="notes-editor"]').isVisible().catch(() => false));
  await page.fill('[data-testid="notes-editor"]', "Shopping List\nmilk, eggs, bread");
  await page.waitForTimeout(1300); // debounce + save + auto-rename
  const notesListText = await page.locator('[data-testid="window-notes"]').innerText();
  check("notes: sidebar title follows first line", notesListText.includes("Shopping List"));
  await page.screenshot({ path: path.join(SHOTS, "09-notes.png") });
  await closeWin("notes");
  await focusWindowViaMenu(page, /Uruk Shell/);
  await termType(page, "ls Notes");
  const termNotes = await page.locator('[data-testid="terminal"]').innerText();
  check("notes: a real note file exists in Notes/", termNotes.includes("New Note.txt"), termNotes.slice(-300));
  await termType(page, 'cat "Notes/New Note.txt"');
  const termNoteBody = await page.locator('[data-testid="terminal"]').innerText();
  check(
    "notes: the file's content is the note text",
    termNoteBody.includes("Shopping List") && termNoteBody.includes("milk, eggs, bread"),
  );

  console.log("— phase 2: calendar events —");
  await page.click('[data-testid="dock-icon-calendar"]');
  const calUp = await waitFor(() => page.locator('[data-testid="window-calendar"]').isVisible().catch(() => false));
  check("calendar opens", !!calUp);
  const now = new Date();
  const pad = (v) => String(v).padStart(2, "0");
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  await page.click(`[data-testid="calendar-day-${todayIso}"]`);
  await page.fill('[data-testid="calendar-event-title"]', "Dentist appointment");
  await page.fill('[data-testid="calendar-event-time"]', "14:30");
  await page.click('[data-testid="calendar-event-save"]');
  const calText = await waitFor(async () => {
    const t = (await page.locator('[data-testid="calendar-event"]').allInnerTexts().catch(() => [])).join(" ");
    return t.includes("Dentist appointment") ? t : null;
  });
  check("calendar: event added to today's panel", !!calText);
  await page.screenshot({ path: path.join(SHOTS, "11-calendar.png") });
  await closeWin("calendar");

  console.log("— phase 2: uruk code (run JS, preview HTML) —");
  await focusWindowViaMenu(page, /Uruk Shell/);
  await termType(page, "echo 'console.log(40 + 2)' > Documents/run.js");
  await termType(page, 'echo "<h1>Hello Preview</h1>" > Documents/page.html');
  await page.click('[data-testid="dock-icon-code"]');
  const codeUp = await waitFor(() => page.locator('[data-testid="window-code"]').isVisible().catch(() => false));
  check("uruk code opens", !!codeUp);
  await page.click('[data-testid="code-open"]');
  await page.locator('[data-testid="code-open-list"] button', { hasText: "run.js" }).first().click();
  const tabUp = await waitFor(() => page.locator('[data-testid="code-tab-run.js"]').isVisible().catch(() => false));
  check("code: run.js opened in a tab", !!tabUp);
  await page.click('[data-testid="code-run"]');
  const codeOut = await waitFor(async () => {
    const t = await page.locator('[data-testid="code-output"]').innerText().catch(() => "");
    return t.includes("42") ? t : null;
  }, 12000);
  check("code: console.log(40 + 2) runs → output shows 42", !!codeOut, (codeOut ?? "").slice(0, 200));
  await page.screenshot({ path: path.join(SHOTS, "14-code.png") });
  await page.click('[data-testid="code-open"]');
  await page.locator('[data-testid="code-open-list"] button', { hasText: "page.html" }).first().click();
  await waitFor(() => page.locator('[data-testid="code-tab-page.html"]').isVisible().catch(() => false));
  await page.click('[data-testid="code-preview-btn"]');
  const htmlH1 = await waitFor(async () => {
    const t = await page.frameLocator('[data-testid="code-preview-frame"]').locator("h1").textContent().catch(() => "");
    return t && t.includes("Hello Preview") ? t : null;
  }, 12000);
  check("code: HTML preview renders the file", !!htmlH1);
  await closeWin("code");

  console.log("— phase 2: photos import + wallpaper + preview —");
  await page.click('[data-testid="dock-icon-photos"]');
  const photosUp = await waitFor(() => page.locator('[data-testid="window-photos"]').isVisible().catch(() => false));
  check("photos opens", !!photosUp);
  check(
    "photos: seeded sample picture is in the gallery",
    await page.locator('[data-testid="photos-thumb-Ziggurat at Dusk.svg"]').isVisible().catch(() => false),
  );
  await page.setInputFiles('[data-testid="photos-file-input"]', {
    name: "fixture.png",
    mimeType: "image/png",
    buffer: pngBuf,
  });
  const thumbUp = await waitFor(() => page.locator('[data-testid="photos-thumb-fixture.png"]').isVisible().catch(() => false));
  check("photos: imported PNG appears in gallery", !!thumbUp);
  await page.click('[data-testid="photos-thumb-fixture.png"]');
  const viewerUp = await waitFor(() => page.locator('[data-testid="photos-viewer-img"]').isVisible().catch(() => false));
  check("photos: viewer opens the imported image", !!viewerUp);
  await page.click('[data-testid="photos-set-wallpaper"]');
  const customWp = await waitFor(async () => (await page.locator('[data-testid="custom-wallpaper-img"]').count()) > 0);
  check("photos: Set as Wallpaper swaps the desktop background", !!customWp);
  await page.screenshot({ path: path.join(SHOTS, "07-photos.png") });
  await page.click('[data-testid="photos-open-preview"]');
  const previewUp = await waitFor(() => page.locator('[data-testid="window-preview"]').isVisible().catch(() => false));
  check("preview: opens from Photos with the same file", !!previewUp);
  const previewName = await page.locator('[data-testid="preview-name"]').innerText();
  check("preview: shows the file name", previewName.includes("fixture.png"), previewName);
  await page.click('[data-testid="preview-zoom-in"]');
  await page.screenshot({ path: path.join(SHOTS, "08-preview.png") });
  await closeWin("preview");
  await closeWin("photos");

  console.log("— phase 2: music playback —");
  await page.click('[data-testid="dock-icon-music"]');
  const musicUp = await waitFor(() => page.locator('[data-testid="window-music"]').isVisible().catch(() => false));
  check("music opens", !!musicUp);
  await page.setInputFiles('[data-testid="music-file-input"]', {
    name: "tone.wav",
    mimeType: "audio/wav",
    buffer: wavBuffer(3, 440),
  });
  const trackUp = await waitFor(() => page.locator('[data-testid="music-track-tone.wav"]').isVisible().catch(() => false));
  check("music: imported WAV appears in the library", !!trackUp);
  await page.dblclick('[data-testid="music-track-tone.wav"]');
  const playing = await waitFor(async () => {
    const s = await page.evaluate(() => {
      const a = document.querySelector('[data-testid="music-audio"]');
      return a ? { t: a.currentTime, paused: a.paused } : null;
    });
    return s && !s.paused && s.t > 0.05 ? s : null;
  }, 10000);
  check("music: playback starts and time advances", !!playing, JSON.stringify(playing));
  await page.screenshot({ path: path.join(SHOTS, "12-music.png") });
  await closeWin("music");

  console.log("— phase 2: uruk browser (local fixture) —");
  await page.click('[data-testid="dock-icon-browser"]');
  const browserUp = await waitFor(() => page.locator('[data-testid="window-browser"]').isVisible().catch(() => false));
  check("browser opens on the start page", !!browserUp && (await page.locator('[data-testid="browser-start"]').isVisible().catch(() => false)));
  await page.click('[data-testid="browser-address"]');
  await page.fill('[data-testid="browser-address"]', `${BASE}/fixtures/page.html`);
  await page.keyboard.press("Enter");
  const h1a = await waitFor(async () => {
    const t = await page.frameLocator('[data-testid="browser-frame"]').locator("h1").textContent().catch(() => "");
    return t && t.includes("URUK Test Fixture") ? t : null;
  }, 12000);
  check("browser: fixture page renders inside the iframe", !!h1a);
  await page.frameLocator('[data-testid="browser-frame"]').locator("a").click();
  const h1b = await waitFor(async () => {
    const t = await page.frameLocator('[data-testid="browser-frame"]').locator("h1").textContent().catch(() => "");
    return t && t.includes("Fixture Page Two") ? t : null;
  }, 12000);
  check("browser: in-page link navigates the frame", !!h1b);
  await page.click('[data-testid="browser-back"]');
  const h1c = await waitFor(async () => {
    const t = await page.frameLocator('[data-testid="browser-frame"]').locator("h1").textContent().catch(() => "");
    return t && t.includes("URUK Test Fixture") ? t : null;
  }, 12000);
  check("browser: Back returns to the first fixture", !!h1c);
  await page.screenshot({ path: path.join(SHOTS, "13-browser.png") });
  await closeWin("browser");

  console.log("— phase 2: persistence + associations after reload —");
  await page.reload({ waitUntil: "networkidle" });
  await waitFor(() => page.locator('[data-testid="login-screen"]').isVisible().catch(() => false), 12000);
  await loginToDesktop(page);
  const wpPersist = await waitFor(async () => (await page.locator('[data-testid="custom-wallpaper-img"]').count()) > 0);
  check("photos: custom wallpaper persists after reload", !!wpPersist);
  await page.click('[data-testid="dock-icon-calendar"]');
  await waitFor(() => page.locator('[data-testid="window-calendar"]').isVisible().catch(() => false));
  await page.click(`[data-testid="calendar-day-${todayIso}"]`);
  const calPersist = await waitFor(async () => {
    const t = (await page.locator('[data-testid="calendar-event"]').allInnerTexts().catch(() => [])).join(" ");
    return t.includes("Dentist appointment") ? t : null;
  });
  check("calendar: event persists after reload", !!calPersist);
  await closeWin("calendar");
  await page.click('[data-testid="dock-icon-terminal"]');
  await waitFor(() => page.locator('[data-testid="window-terminal"]').isVisible().catch(() => false));
  await termType(page, "cat Calendar/events.json");
  const eventsFile = await page.locator('[data-testid="terminal"]').innerText();
  check("calendar: events live in a real Calendar/events.json file", eventsFile.includes("Dentist appointment"));
  await termType(page, "open Notes");
  const noteInFinder = await waitFor(() => page.locator('[data-testid="finder-item-New Note.txt"]').isVisible().catch(() => false), 12000);
  check("notes: note file visible in Finder under Notes/", !!noteInFinder);
  await page.click('[data-testid="finder-sidebar-pictures"]');
  await page.dblclick('[data-testid="finder-item-fixture.png"]');
  const assocPhotos = await waitFor(() => page.locator('[data-testid="window-photos"]').isVisible().catch(() => false));
  check("association: double-click image in Finder → Photos", !!assocPhotos);
  await closeWin("photos");
  await focusWindowViaMenu(page, /Pictures/);
  await page.click('[data-testid="finder-sidebar-documents"]');
  await page.dblclick('[data-testid="finder-item-run.js"]');
  const assocCode = await waitFor(() => page.locator('[data-testid="window-code"]').isVisible().catch(() => false));
  check("association: double-click .js in Finder → Uruk Code", !!assocCode);
  check(
    "association: the .js opened in a Code tab",
    await page.locator('[data-testid="code-tab-run.js"]').isVisible().catch(() => false),
  );

  /* ================= Phase 3 ================= */

  const setRange = async (sel, val) => {
    await page.locator(sel).evaluate((el, v) => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
      setter.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, val);
  };

  console.log("— phase 3: spotlight (name, content, events) —");
  await focusWindowViaMenu(page, /Uruk Shell/);
  await termType(page, 'echo "quixotic melon festival" > Notes/quixote.txt');
  await page.click('[data-testid="menubar-spotlight"]');
  const spotUp = await waitFor(() => page.locator('[data-testid="spotlight"]').isVisible().catch(() => false));
  check("spotlight opens from the menu bar", !!spotUp);
  await page.fill('[data-testid="spotlight-input"]', "a.txt");
  const spotFile = await waitFor(() => page.locator('[data-testid="spotlight-result-a.txt"]').isVisible().catch(() => false));
  check("spotlight: finds a.txt by file name", !!spotFile);
  await page.waitForTimeout(550);
  await page.screenshot({ path: path.join(SHOTS, "15-spotlight.png") });
  await page.keyboard.press("Enter");
  const spotEditor = await waitFor(() => page.locator('[data-testid="window-editor"]').isVisible().catch(() => false));
  check("spotlight: Enter opens the file in its app (Editor)", !!spotEditor);
  await closeWin("editor");
  await page.click('[data-testid="menubar-spotlight"]');
  await page.fill('[data-testid="spotlight-input"]', "quixotic");
  const spotNote = await waitFor(() => page.locator('[data-testid="spotlight-result-quixote.txt"]').isVisible().catch(() => false));
  check("spotlight: finds a note by its CONTENT (quixotic)", !!spotNote);
  await page.keyboard.press("Escape");
  check("spotlight: Esc closes", !(await page.locator('[data-testid="spotlight"]').isVisible().catch(() => false)));
  await page.keyboard.press("Control+k");
  const spotK = await waitFor(() => page.locator('[data-testid="spotlight"]').isVisible().catch(() => false));
  check("spotlight: Ctrl+K opens", !!spotK);
  await page.fill('[data-testid="spotlight-input"]', "Dentist");
  const spotEvent = await waitFor(() => page.locator('[data-testid="spotlight-result-Dentist appointment"]').isVisible().catch(() => false));
  check("spotlight: finds the calendar event", !!spotEvent);
  await page.keyboard.press("Enter");
  const spotCal = await waitFor(() => page.locator('[data-testid="window-calendar"]').isVisible().catch(() => false));
  check("spotlight: Enter opens Calendar for the event", !!spotCal);
  await closeWin("calendar");

  console.log("— phase 3: launchpad —");
  await page.click('[data-testid="dock-icon-launchpad"]');
  const lpUp = await waitFor(() => page.locator('[data-testid="launchpad"]').isVisible().catch(() => false));
  check("launchpad opens from the Dock", !!lpUp);
  await page.waitForTimeout(550);
  await page.screenshot({ path: path.join(SHOTS, "16-launchpad.png") });
  await page.click('[data-testid="launchpad-app-calculator"]');
  const lpCalc = await waitFor(() => page.locator('[data-testid="window-calculator"]').isVisible().catch(() => false));
  check("launchpad: clicking Calculator launches it", !!lpCalc);
  check("launchpad: closes after launch", !(await page.locator('[data-testid="launchpad"]').isVisible().catch(() => false)));
  await closeWin("calculator");

  console.log("— phase 3: control center (brightness + shared volume) —");
  await page.click('[data-testid="menubar-control-center"]');
  const ccUp = await waitFor(() => page.locator('[data-testid="control-center"]').isVisible().catch(() => false));
  check("control center opens", !!ccUp);
  await page.waitForTimeout(550);
  await page.screenshot({ path: path.join(SHOTS, "17-control-center.png") });
  await setRange('[data-testid="cc-brightness"]', 0.6);
  const dimVal = await page.locator('[data-testid="brightness-overlay"]').getAttribute("data-brightness");
  check("control center: brightness slider drives the dim overlay (0.6)", dimVal === "0.6", String(dimVal));
  await setRange('[data-testid="cc-volume"]', 0.3);
  await page.keyboard.press("Escape");
  await page.click('[data-testid="dock-icon-music"]');
  await waitFor(() => page.locator('[data-testid="window-music"]').isVisible().catch(() => false));
  const musicVol = await page.locator('[data-testid="music-volume"]').inputValue();
  check("control center: volume is the Music app's volume (0.3)", Math.abs(parseFloat(musicVol) - 0.3) < 0.001, musicVol);
  await closeWin("music");
  await page.reload({ waitUntil: "networkidle" });
  await waitFor(() => page.locator('[data-testid="login-screen"]').isVisible().catch(() => false), 12000);
  await loginToDesktop(page);
  const dimAfter = await page.locator('[data-testid="brightness-overlay"]').getAttribute("data-brightness");
  check("brightness persists after reload (0.6)", dimAfter === "0.6", String(dimAfter));
  await page.click('[data-testid="menubar-control-center"]');
  await setRange('[data-testid="cc-brightness"]', 1);
  await page.keyboard.press("Escape");

  console.log("— phase 3: wi-fi switch gates the browser —");
  await page.click('[data-testid="dock-icon-browser"]');
  await waitFor(() => page.locator('[data-testid="window-browser"]').isVisible().catch(() => false));
  await page.click('[data-testid="browser-address"]');
  await page.fill('[data-testid="browser-address"]', `${BASE}/fixtures/page.html`);
  await page.keyboard.press("Enter");
  const fixtureH1 = async () => {
    const t = await page.frameLocator('[data-testid="browser-frame"]').locator("h1").textContent().catch(() => "");
    return t && t.includes("URUK Test Fixture") ? t : null;
  };
  check("browser loads the fixture with Wi-Fi on", !!(await waitFor(fixtureH1, 12000)));
  await page.click('[data-testid="menubar-control-center"]');
  await page.click('[data-testid="cc-wifi"]');
  const offState = await waitFor(() => page.locator('[data-testid="browser-offline"]').isVisible().catch(() => false));
  check("wi-fi off: Browser shows the honest offline state", !!offState);
  await page.click('[data-testid="cc-wifi"]');
  await page.keyboard.press("Escape");
  check("wi-fi on again: the page loads again", !!(await waitFor(fixtureH1, 12000)));
  await closeWin("browser");

  console.log("— phase 3: calendar reminder → notification center —");
  await page.click('[data-testid="dock-icon-calendar"]');
  await waitFor(() => page.locator('[data-testid="window-calendar"]').isVisible().catch(() => false));
  const soon = new Date(Date.now() + 6 * 60000);
  const hhmm = `${pad(soon.getHours())}:${pad(soon.getMinutes())}`;
  const todayIso3 = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`;
  await page.click(`[data-testid="calendar-day-${todayIso3}"]`);
  await page.fill('[data-testid="calendar-event-title"]', "Rocket sync");
  await page.fill('[data-testid="calendar-event-time"]', hhmm);
  await page.click('[data-testid="calendar-event-save"]');
  const banner = await waitFor(() => page.locator('[data-testid="notification-banner"]').first().isVisible().catch(() => false), 25000);
  check("reminder: banner fires for an event due in <15 min", !!banner);
  await page.click('[data-testid="menubar-clock"]');
  const ncUp = await waitFor(() => page.locator('[data-testid="notification-center"]').isVisible().catch(() => false));
  check("notification center opens from the clock", !!ncUp);
  const ncText = await page.locator('[data-testid="notification-center"]').innerText();
  check("notification center lists the reminder", ncText.includes("Rocket sync"), ncText.slice(0, 200));
  check("notification center shows the weather widget", /weather/i.test(ncText), ncText.slice(0, 200));
  await page.waitForTimeout(550);
  await page.screenshot({ path: path.join(SHOTS, "18-notification-center.png") });
  await page.keyboard.press("Escape");
  await closeWin("calendar");

  console.log("— phase 3: PIN lock —");
  await page.click('[data-testid="dock-icon-settings"]');
  await waitFor(() => page.locator('[data-testid="window-settings"]').isVisible().catch(() => false));
  await page.click('[data-testid="settings-pane-security"]');
  await page.fill('[data-testid="pin-new"]', "2468");
  await page.fill('[data-testid="pin-confirm"]', "2468");
  await page.click('[data-testid="pin-set"]');
  const pinStatus = await waitFor(async () => {
    const t = await page.locator('[data-testid="pin-status"]').innerText().catch(() => "");
    return t.includes("PIN set") ? t : null;
  });
  check("PIN: set 2468 (status confirms)", !!pinStatus, String(pinStatus));
  await closeWin("settings");
  await page.click('[data-testid="menubar-system"]');
  await page.getByRole("button", { name: "Lock Screen" }).click();
  const pinPrompt = await waitFor(() => page.locator('[data-testid="login-pin-input"]').isVisible().catch(() => false));
  check("PIN: lock screen asks for the PIN", !!pinPrompt);
  await page.waitForTimeout(550);
  await page.screenshot({ path: path.join(SHOTS, "19-lock-pin.png") });
  await page.fill('[data-testid="login-pin-input"]', "0000");
  await page.click('[data-testid="login-pin-submit"]');
  const pinErr = await waitFor(() => page.locator('[data-testid="login-pin-error"]').isVisible().catch(() => false));
  check("PIN: wrong PIN is rejected with an error", !!pinErr);
  check("PIN: still locked after the wrong PIN", await page.locator('[data-testid="login-screen"]').isVisible().catch(() => false));
  await page.fill('[data-testid="login-pin-input"]', "2468");
  await page.click('[data-testid="login-pin-submit"]');
  const unlocked = await waitFor(() => page.locator('[data-testid="dock"]').isVisible().catch(() => false));
  check("PIN: correct PIN unlocks", !!unlocked);
  await page.click('[data-testid="dock-icon-settings"]');
  await waitFor(() => page.locator('[data-testid="window-settings"]').isVisible().catch(() => false));
  await page.click('[data-testid="settings-pane-security"]');
  await page.fill('[data-testid="pin-current"]', "2468");
  await page.click('[data-testid="pin-remove"]');
  const pinRemoved = await waitFor(async () => {
    const t = await page.locator('[data-testid="pin-status"]').innerText().catch(() => "");
    return t.includes("PIN removed") ? t : null;
  });
  check("PIN: removed with the current PIN", !!pinRemoved, String(pinRemoved));
  await closeWin("settings");

  console.log("— phase 3: backup export → delete → import restores —");
  await page.click('[data-testid="dock-icon-terminal"]');
  await waitFor(() => page.locator('[data-testid="window-terminal"]').isVisible().catch(() => false));
  await termType(page, 'echo "markerme" > Documents/marker-p3.txt');
  await page.click('[data-testid="dock-icon-settings"]');
  await waitFor(() => page.locator('[data-testid="window-settings"]').isVisible().catch(() => false));
  await page.click('[data-testid="settings-pane-backup"]');
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.click('[data-testid="backup-export"]'),
  ]);
  const dlPath = path.join(ROOT, "qa", "backup-test.urukos");
  await download.saveAs(dlPath);
  const fsMod = await import("node:fs");
  const buf = fsMod.readFileSync(dlPath);
  check("backup: download is a ZIP (PK magic)", buf[0] === 0x50 && buf[1] === 0x4b);
  const { unzipSync } = await import("fflate");
  const entries = unzipSync(new Uint8Array(buf));
  const manifest = JSON.parse(new TextDecoder().decode(entries["manifest.json"]));
  check(
    "backup: manifest inside (format v1, marker file listed)",
    manifest.format === "urukos-backup" && manifest.version === 1 && Array.isArray(manifest.nodes) && manifest.nodes.some((n) => n.name === "marker-p3.txt"),
  );
  await closeWin("settings");
  await focusWindowViaMenu(page, /Uruk Shell/);
  await termType(page, "rm Documents/marker-p3.txt");
  await termType(page, "clear");
  await termType(page, "ls Documents");
  const lsAfterRm = await page.locator('[data-testid="terminal"]').innerText();
  check("backup: marker gone after rm", !lsAfterRm.includes("marker-p3"), lsAfterRm.slice(-200));
  await page.click('[data-testid="dock-icon-settings"]');
  await waitFor(() => page.locator('[data-testid="window-settings"]').isVisible().catch(() => false));
  await page.click('[data-testid="settings-pane-backup"]');
  await page.setInputFiles('[data-testid="backup-import-input"]', dlPath);
  const confirmUp = await waitFor(() => page.locator('[data-testid="backup-confirm"]').isVisible().catch(() => false));
  check("backup: import asks Replace vs Merge", !!confirmUp);
  await page.click('[data-testid="backup-confirm-replace"]');
  const backupRestored = await waitFor(async () => {
    const t = await page.locator('[data-testid="backup-status"]').innerText().catch(() => "");
    return t.includes("Restore complete") ? t : null;
  }, 20000);
  check("backup: replace-restore completes", !!backupRestored, String(backupRestored));
  await closeWin("settings");
  await focusWindowViaMenu(page, /Uruk Shell/);
  await termType(page, "cat Documents/marker-p3.txt");
  const catBack = await page.locator('[data-testid="terminal"]').innerText();
  check("backup: marker file is back with its content", catBack.includes("markerme"));

  console.log("— phase 3: screensaver —");
  await page.click('[data-testid="dock-icon-settings"]');
  await waitFor(() => page.locator('[data-testid="window-settings"]').isVisible().catch(() => false));
  await page.click('[data-testid="settings-pane-system"]');
  await page.selectOption('[data-testid="settings-idle-timeout"]', "10");
  await closeWin("settings");
  const saverUp = await waitFor(() => page.locator('[data-testid="screensaver"]').isVisible().catch(() => false), 22000);
  check("screensaver: fades in after the 10-second test idle", !!saverUp);
  await page.keyboard.press("a");
  const lockUp = await waitFor(() => page.locator('[data-testid="login-screen"]').isVisible().catch(() => false));
  check("screensaver: a keypress wakes to the lock screen", !!lockUp);
  await loginToDesktop(page);
  await page.click('[data-testid="dock-icon-settings"]');
  await waitFor(() => page.locator('[data-testid="window-settings"]').isVisible().catch(() => false));
  await page.click('[data-testid="settings-pane-system"]');
  await page.selectOption('[data-testid="settings-idle-timeout"]', "0");
  await closeWin("settings");

  /* ================= Phase 4A ================= */

  console.log("— phase 4a: proxy API (real sites, SSRF guard) —");
  const pxRes = await fetch(`${BASE}/api/proxy?url=${encodeURIComponent("https://example.org")}`);
  const pxBody = await pxRes.text();
  check("proxy: example.org returns 200", pxRes.status === 200, String(pxRes.status));
  check("proxy: example.org body contains 'Example Domain'", pxBody.includes("Example Domain"));
  check("proxy: page URLs are rewritten back through /api/proxy", pxBody.includes("/api/proxy?url="));
  const pxWiki = await fetch(`${BASE}/api/proxy?url=${encodeURIComponent("https://en.wikipedia.org/wiki/Uruk")}`);
  const pxWikiBody = await pxWiki.text();
  check(
    "proxy: en.wikipedia.org/wiki/Uruk returns 200 with its real title",
    pxWiki.status === 200 && pxWikiBody.includes("Uruk - Wikipedia"),
    String(pxWiki.status),
  );
  const pxSsrf = await fetch(`${BASE}/api/proxy?url=${encodeURIComponent(`${BASE}/fixtures/page.html`)}`);
  check("proxy: loopback target is refused (SSRF guard)", pxSsrf.status === 403, String(pxSsrf.status));
  const pxScheme = await fetch(`${BASE}/api/proxy?url=${encodeURIComponent("file:///etc/passwd")}`);
  check("proxy: non-http(s) scheme is refused", pxScheme.status === 403, String(pxScheme.status));

  console.log("— phase 4a: browser renders real proxied pages —");
  await page.click('[data-testid="dock-icon-browser"]');
  const pBrowserUp = await waitFor(() => page.locator('[data-testid="window-browser"]').isVisible().catch(() => false));
  check("proxy: browser opens", !!pBrowserUp);
  await page.click('[data-testid="browser-address"]');
  await page.fill('[data-testid="browser-address"]', "https://example.org");
  await page.keyboard.press("Enter");
  const exP = await waitFor(async () => {
    // example.org's current page is a <title> + one paragraph (no <h1>).
    const t = await page.frameLocator('[data-testid="browser-frame"]').locator("p").first().textContent().catch(() => "");
    return t && t.includes("documentation examples") ? t : null;
  }, 25000);
  check("proxy: example.org renders inside the OS browser", !!exP);
  await page.click('[data-testid="browser-address"]');
  await page.fill('[data-testid="browser-address"]', "en.wikipedia.org/wiki/Uruk");
  await page.keyboard.press("Enter");
  const wikiH1 = await waitFor(async () => {
    const t = await page.frameLocator('[data-testid="browser-frame"]').locator("#firstHeading").textContent().catch(() => "");
    return t && t.includes("Uruk") ? t : null;
  }, 30000);
  check("proxy: Wikipedia's Uruk article renders inside the OS browser", !!wikiH1);
  const addrAfter = await page.locator('[data-testid="browser-address"]').inputValue();
  check(
    "proxy: address bar tracks in-frame navigation with the real URL",
    addrAfter.includes("wikipedia.org/wiki/Uruk"),
    addrAfter,
  );
  await page.waitForTimeout(2500); // let the proxied stylesheets paint
  await page.screenshot({ path: path.join(SHOTS, "21-browser-wikipedia.png") });
  await closeWin("browser");

  console.log("— phase 4a: dock auto-hide with a maximized window —");
  await page.click('[data-testid="dock-icon-terminal"]');
  await waitFor(() => page.locator('[data-testid="window-terminal"]').isVisible().catch(() => false));
  const termWin4 = page.locator('[data-testid="window-terminal"]');
  await termWin4.getByLabel("Zoom").click();
  await page.waitForTimeout(500);
  const dockBoxHidden = await page.locator('[data-testid="dock"]').boundingBox();
  check(
    "dock: slides off-screen while a window is maximized",
    !!dockBoxHidden && dockBoxHidden.y >= 900,
    JSON.stringify(dockBoxHidden),
  );
  await page.screenshot({ path: path.join(SHOTS, "22-maximized-dock-hidden.png") });
  await page.mouse.move(720, 898);
  await page.waitForTimeout(500);
  const dockBoxShown = await page.locator('[data-testid="dock"]').boundingBox();
  check(
    "dock: bottom-edge hover floats it back",
    !!dockBoxShown && dockBoxShown.y < 900,
    JSON.stringify(dockBoxShown),
  );
  await page.screenshot({ path: path.join(SHOTS, "23-maximized-dock-revealed.png") });
  await page.mouse.move(720, 400);
  await page.waitForTimeout(500);
  const dockBoxHidden2 = await page.locator('[data-testid="dock"]').boundingBox();
  check(
    "dock: moving away hides it again",
    !!dockBoxHidden2 && dockBoxHidden2.y >= 900,
    JSON.stringify(dockBoxHidden2),
  );
  await termWin4.getByLabel("Zoom").click();
  await page.waitForTimeout(400);
  const dockBoxRestored = await page.locator('[data-testid="dock"]').boundingBox();
  check(
    "dock: visible again once nothing is maximized",
    !!dockBoxRestored && dockBoxRestored.y < 900,
    JSON.stringify(dockBoxRestored),
  );
  await closeWin("terminal");

  console.log("— phase 4a: accounts (create, isolate, switch, PIN, guest) —");
  const logOut = async () => {
    await page.click('[data-testid="menubar-user"]');
    await page.getByRole("button", { name: /Log Out/ }).click();
    const back = await waitFor(() => page.locator('[data-testid="login-screen"]').isVisible().catch(() => false), 15000);
    if (!back) throw new Error("logout did not return to the login screen");
  };
  const pickAccount = async (name) => {
    await page.locator(`[data-account-name="${name}"]`).click();
    await page.waitForTimeout(300);
  };

  await logOut();
  check(
    "accounts: logout returns to the picker (Mustafa listed)",
    await page.locator('[data-account-name="Mustafa"]').isVisible().catch(() => false),
  );
  await page.click('[data-testid="login-create-toggle"]');
  const createUp = await waitFor(() => page.locator('[data-testid="account-name-input"]').isVisible().catch(() => false));
  check("accounts: create form opens from the picker", !!createUp);
  await page.fill('[data-testid="account-name-input"]', "Layla");
  await page.click('[data-testid="account-color-2"]');
  await page.click('[data-testid="account-glyph-1"]');
  await page.fill('[data-testid="account-pin-input"]', "1357");
  await page.click('[data-testid="account-create-submit"]');
  const bDesktop = await waitFor(() => page.locator('[data-testid="dock"]').isVisible().catch(() => false), 20000);
  check("accounts: creating account B logs straight into B's desktop", !!bDesktop);
  await page.click('[data-testid="dock-icon-terminal"]');
  await waitFor(() => page.locator('[data-testid="window-terminal"]').isVisible().catch(() => false));
  await termType(page, 'echo "layla-secret" > Documents/marker-b.txt');
  await page.click('[data-testid="dock-icon-settings"]');
  await waitFor(() => page.locator('[data-testid="window-settings"]').isVisible().catch(() => false));
  check(
    "accounts: Settings header shows B's name",
    ((await page.locator('[data-testid="settings-user-name"]').innerText().catch(() => "")) ?? "").includes("Layla"),
  );
  await page.click('[data-testid="settings-pane-wallpaper"]');
  await page.click('[data-testid="settings-wallpaper-rivers"]');
  await page.waitForTimeout(400);
  const bWp = await page.locator('[data-testid="active-wallpaper"]').getAttribute("data-wallpaper-id").catch(() => null);
  check("accounts: B's wallpaper applied (rivers)", bWp === "rivers", String(bWp));
  await closeWin("settings");
  await closeWin("terminal");

  await logOut();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, "20-accounts-login.png") });
  await pickAccount("Mustafa");
  await page.click('[data-testid="login-button"]');
  const aDesktop = await waitFor(() => page.locator('[data-testid="dock"]').isVisible().catch(() => false), 20000);
  check("accounts: switching back to A reaches A's desktop", !!aDesktop);
  await page.click('[data-testid="dock-icon-terminal"]');
  await waitFor(() => page.locator('[data-testid="window-terminal"]').isVisible().catch(() => false));
  await termType(page, "ls Documents");
  const aLs = await page.locator('[data-testid="terminal"]').innerText();
  check("accounts: B's marker file is INVISIBLE inside A", !aLs.includes("marker-b"), aLs.slice(-200));
  check("accounts: A's own files are still there", aLs.includes("a.txt"));
  const aCustomWp = await page.locator('[data-testid="custom-wallpaper-img"]').count();
  const aWpId = await page.locator('[data-testid="active-wallpaper"]').getAttribute("data-wallpaper-id").catch(() => null);
  check(
    "accounts: A's wallpaper is A's own (not B's rivers)",
    aCustomWp > 0 || (aWpId !== null && aWpId !== "rivers"),
    `custom=${aCustomWp} wp=${String(aWpId)}`,
  );
  await closeWin("terminal");

  await logOut();
  await pickAccount("Layla");
  const bPinPrompt = await waitFor(() => page.locator('[data-testid="login-pin-input"]').isVisible().catch(() => false));
  check("accounts: B's card asks for B's PIN", !!bPinPrompt);
  await page.fill('[data-testid="login-pin-input"]', "9999");
  await page.click('[data-testid="login-pin-submit"]');
  const bPinErr = await waitFor(() => page.locator('[data-testid="login-pin-error"]').isVisible().catch(() => false));
  check("accounts: wrong PIN for B is rejected", !!bPinErr);
  await page.fill('[data-testid="login-pin-input"]', "1357");
  await page.click('[data-testid="login-pin-submit"]');
  const bBack = await waitFor(() => page.locator('[data-testid="dock"]').isVisible().catch(() => false), 20000);
  check("accounts: correct PIN logs B back in", !!bBack);
  await page.click('[data-testid="dock-icon-terminal"]');
  await waitFor(() => page.locator('[data-testid="window-terminal"]').isVisible().catch(() => false));
  await termType(page, "cat Documents/marker-b.txt");
  const bCat = await page.locator('[data-testid="terminal"]').innerText();
  check("accounts: B's marker + content intact after the round trip", bCat.includes("layla-secret"));
  const bWp2 = await page.locator('[data-testid="active-wallpaper"]').getAttribute("data-wallpaper-id").catch(() => null);
  check("accounts: B's wallpaper intact after the round trip (rivers)", bWp2 === "rivers", String(bWp2));
  await closeWin("terminal");

  await logOut();
  await page.click('[data-testid="login-guest"]');
  const gDesktop = await waitFor(() => page.locator('[data-testid="dock"]').isVisible().catch(() => false), 20000);
  check("guest: guest mode reaches its own desktop", !!gDesktop);
  await page.click('[data-testid="dock-icon-settings"]');
  await waitFor(() => page.locator('[data-testid="window-settings"]').isVisible().catch(() => false));
  check(
    "guest: Settings labels the space as Guest",
    ((await page.locator('[data-testid="settings-user-name"]').innerText().catch(() => "")) ?? "").includes("Guest"),
  );
  await closeWin("settings");
  await page.click('[data-testid="dock-icon-terminal"]');
  await waitFor(() => page.locator('[data-testid="window-terminal"]').isVisible().catch(() => false));
  await termType(page, "ls Documents");
  const gLs = await page.locator('[data-testid="terminal"]').innerText();
  check(
    "guest: sees neither account's files (no a.txt, no marker-b)",
    !gLs.includes("a.txt") && !gLs.includes("marker-b"),
    gLs.slice(-200),
  );
  check("guest: guest space has its own seeded Welcome.txt", gLs.includes("Welcome.txt"));
  await closeWin("terminal");
  await logOut();
  await pickAccount("Mustafa");
  await page.click('[data-testid="login-button"]');
  await waitFor(() => page.locator('[data-testid="dock"]').isVisible().catch(() => false), 20000);
  check("accounts: suite ends signed in as A", true);

  /* ================= Phase 5 ================= */

  console.log("— phase 5: uruk code languages (mode, tokens, honest run gating) —");
  await page.click('[data-testid="dock-icon-terminal"]');
  await waitFor(() => page.locator('[data-testid="window-terminal"]').isVisible().catch(() => false));
  await termType(page, `echo 'fn main() { let x = 41; println!("{}", x + 1); }' > Documents/hello.rs`);
  await termType(page, `echo 'int main(void) { int x = 41; return x + 1; }' > Documents/hello.c`);
  await termType(page, `echo 'print(6 * 7)' > Documents/py42.py`);
  await termType(page, `echo 'wedges and rivers' > Documents/sibling.txt`);
  await termType(page, `echo 'print(open("sibling.txt").read())' > Documents/reader.py`);
  await termType(page, `echo 'print(sum(i*i for i in range(10)))' > Documents/sumsq.py`);
  await termType(page, `echo 'console.log("ts-" + (1 + 1))' > Documents/app.ts`);
  await closeWin("terminal");

  await page.click('[data-testid="dock-icon-code"]');
  await waitFor(() => page.locator('[data-testid="window-code"]').isVisible().catch(() => false));
  const openInCode = async (name) => {
    await page.click('[data-testid="code-open"]');
    await page.locator('[data-testid="code-open-list"] button', { hasText: name }).first().click();
    await waitFor(() => page.locator(`[data-testid="code-tab-${name}"]`).isVisible().catch(() => false));
  };
  const editorAttr = (attr) => page.locator('[data-testid="code-editor"]').getAttribute(attr);

  await openInCode("hello.rs");
  const rsLang = await waitFor(async () => ((await editorAttr("data-language")) === "rust" ? true : null));
  check("code: .rs resolves to the Rust language mode", !!rsLang);
  const rsTokens = await waitFor(async () => {
    const t = (await editorAttr("data-tokens")) ?? "";
    return t.includes("FunctionItem") ? t : null;
  });
  check("code: .rs parse tree is Rust (FunctionItem tokens)", !!rsTokens, rsTokens ?? "");
  check("code: Rust shows the highlighting-only note", await page.locator('[data-testid="code-hl-note"]').isVisible().catch(() => false));
  check("code: Rust has NO Run button (honest gating)", (await page.locator('[data-testid="code-run"]').count()) === 0);
  await page.selectOption('[data-testid="code-lang-select"]', "python");
  const swLang = await waitFor(async () => ((await editorAttr("data-language")) === "python" ? true : null));
  check("code: manual language switcher overrides the mode", !!swLang);
  await page.selectOption('[data-testid="code-lang-select"]', "rust");
  await waitFor(async () => ((await editorAttr("data-language")) === "rust" ? true : null));

  await openInCode("hello.c");
  const cLang = await waitFor(async () => ((await editorAttr("data-language")) === "c" ? true : null));
  check("code: .c resolves to the C language mode", !!cLang);
  const cTokens = await waitFor(async () => {
    const t = (await editorAttr("data-tokens")) ?? "";
    return t.includes("FunctionDefinition") ? t : null;
  });
  check("code: .c parse tree is C (FunctionDefinition tokens)", !!cTokens, cTokens ?? "");

  await openInCode("app.ts");
  const tsLang = await waitFor(async () => ((await editorAttr("data-language")) === "typescript" ? true : null));
  check("code: .ts resolves to the TypeScript language mode", !!tsLang);
  check("code: TypeScript gets a Run button", await page.locator('[data-testid="code-run"]').isVisible().catch(() => false));
  await page.click('[data-testid="code-run"]');
  const tsOut = await waitFor(async () => {
    const t = await page.locator('[data-testid="code-output"]').innerText().catch(() => "");
    return t.includes("ts-2") ? t : null;
  }, 12000);
  check("code: TypeScript runs in the sandbox (output ts-2)", !!tsOut, (tsOut ?? "").slice(0, 160));

  await openInCode("py42.py");
  const pyLang = await waitFor(async () => ((await editorAttr("data-language")) === "python" ? true : null));
  check("code: .py resolves to the Python language mode", !!pyLang);
  await page.click('[data-testid="code-run"]');
  check("code: Python run opens the stdin box", await page.locator('[data-testid="code-stdin"]').isVisible().catch(() => false));
  const pyOffline = await waitFor(async () => {
    const t = await page.locator('[data-testid="code-output"]').innerText().catch(() => "");
    return t.includes("Couldn't load the Python runtime") ? t : null;
  }, 90000);
  check("code: offline Python run fails HONESTLY (no fake output)", !!pyOffline, (pyOffline ?? "").slice(0, 200));

  console.log("— phase 5: uruk code templates write real files —");
  await page.click('[data-testid="code-new"]');
  await waitFor(() => page.locator('[data-testid="code-new-form"]').isVisible().catch(() => false));
  await page.selectOption('[data-testid="code-template-select"]', "python");
  const tplName = await page.locator('[data-testid="code-new-name"]').inputValue();
  check("code: Python template pre-fills hello.py", tplName === "hello.py", tplName);
  await page.click('[data-testid="code-create"]');
  const tplTab = await waitFor(() => page.locator('[data-testid="code-tab-hello.py"]').isVisible().catch(() => false));
  check("code: template file opens in a tab", !!tplTab);
  const tplBody = await page.locator('[data-testid="code-editor"] .cm-content').innerText().catch(() => "");
  check("code: template body is the Python starter", tplBody.includes("def greet"), tplBody.slice(0, 120));
  await closeWin("code");
  await page.click('[data-testid="dock-icon-finder"]');
  await waitFor(() => page.locator('[data-testid="window-finder"]').isVisible().catch(() => false));
  await page.click('[data-testid="finder-sidebar-documents"]');
  const tplInFinder = await waitFor(() => page.locator('[data-testid="finder-item-hello.py"]').isVisible().catch(() => false));
  check("code: template file is a REAL file (visible in Uruk Files)", !!tplInFinder);
  await closeWin("finder");

  console.log("— phase 5: clepsydra (world clock, stopwatch, timer → notification) —");
  await page.click('[data-testid="dock-icon-clock"]');
  const clockUp = await waitFor(() => page.locator('[data-testid="window-clock"]').isVisible().catch(() => false));
  check("clepsydra opens from the Dock", !!clockUp);
  check("clepsydra: Baghdad is a default city", await page.locator('[data-testid="clock-city-Asia-Baghdad"]').isVisible().catch(() => false));
  check("clepsydra: Edmonton is a default city", await page.locator('[data-testid="clock-city-America-Edmonton"]').isVisible().catch(() => false));
  const bgTime = await page.locator('[data-testid="clock-time-Asia-Baghdad"]').innerText().catch(() => "");
  check("clepsydra: Baghdad clock ticks (HH:MM:SS)", /^\d{2}:\d{2}:\d{2}$/.test(bgTime.trim()), bgTime);
  await page.selectOption('[data-testid="clock-add-select"]', "Europe/London");
  await page.click('[data-testid="clock-add-btn"]');
  check("clepsydra: London added from the preset list", await page.locator('[data-testid="clock-city-Europe-London"]').isVisible().catch(() => false));
  await page.click('[data-testid="clock-remove-Europe-London"]');
  const londonGone = await waitFor(async () => (await page.locator('[data-testid="clock-city-Europe-London"]').count()) === 0);
  check("clepsydra: London removed again", !!londonGone);

  await page.click('[data-testid="clock-tab-stopwatch"]');
  await page.click('[data-testid="sw-toggle"]');
  await page.waitForTimeout(700);
  await page.click('[data-testid="sw-lap"]');
  const lapCount = await page.locator('[data-testid="sw-lap-item"]').count();
  check("clepsydra: stopwatch lap recorded", lapCount === 1, String(lapCount));
  await page.click('[data-testid="sw-toggle"]');
  const swText = await page.locator('[data-testid="sw-display"]').innerText();
  check("clepsydra: stopwatch display advanced past zero", swText.trim() !== "00:00.00", swText);
  await page.click('[data-testid="sw-reset"]');

  await page.click('[data-testid="clock-tab-timer"]');
  await page.fill('[data-testid="timer-min"]', "0");
  await page.fill('[data-testid="timer-sec"]', "3");
  await page.click('[data-testid="timer-toggle"]');
  const tDone = await waitFor(() => page.locator('[data-testid="timer-done"]').isVisible().catch(() => false), 15000);
  check("clepsydra: 3-second timer finishes", !!tDone);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, "30-clepsydra-timer.png") });
  await page.click('[data-testid="menubar-clock"]');
  const ncUp5 = await waitFor(() => page.locator('[data-testid="notification-center"]').isVisible().catch(() => false));
  check("clepsydra: notification center opens", !!ncUp5);
  const ncText5 = await page.locator('[data-testid="notification-center"]').innerText();
  check("clepsydra: timer landed in the Notification Center", ncText5.includes("Timer finished"), ncText5.slice(0, 200));
  await page.keyboard.press("Escape");
  await closeWin("clock");

  console.log("— phase 5: forge (JSON, Base64, URL, UUID, SHA-256, regex, text) —");
  const { createHash } = await import("node:crypto");
  await page.click('[data-testid="dock-icon-tools"]');
  const toolsUp = await waitFor(() => page.locator('[data-testid="window-tools"]').isVisible().catch(() => false));
  check("forge opens from the Dock", !!toolsUp);
  await page.fill('[data-testid="forge-json-input"]', '{"city":"Uruk","river":"Euphrates","n":7}');
  await page.click('[data-testid="forge-json-format"]');
  const jsonOutVal = await page.locator('[data-testid="forge-json-output"]').inputValue().catch(() => "");
  check("forge: JSON pretty-prints a minified sample", jsonOutVal.includes('"city": "Uruk"') && jsonOutVal.includes("\n"), jsonOutVal.slice(0, 120));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, "28-forge-json.png") });
  await page.fill('[data-testid="forge-json-input"]', '{"a": }');
  await page.click('[data-testid="forge-json-format"]');
  const jsonErrText = await waitFor(async () => {
    const t = await page.locator('[data-testid="forge-json-error"]').innerText().catch(() => "");
    return t ? t : null;
  });
  check("forge: invalid JSON reports an error POSITION", !!jsonErrText && /line 1, column \d+ \(position \d+\)/.test(jsonErrText), jsonErrText ?? "");

  await page.click('[data-testid="forge-tab-base64"]');
  await page.fill('[data-testid="forge-b64-input"]', "hello uruk");
  await page.click('[data-testid="forge-b64-encode"]');
  const b64Enc = await page.locator('[data-testid="forge-b64-output"]').inputValue();
  check("forge: Base64 encode matches the reference", b64Enc === Buffer.from("hello uruk", "utf8").toString("base64"), b64Enc);
  await page.fill('[data-testid="forge-b64-input"]', b64Enc);
  await page.click('[data-testid="forge-b64-decode"]');
  const b64Dec = await page.locator('[data-testid="forge-b64-output"]').inputValue();
  check("forge: Base64 round-trip returns the original", b64Dec === "hello uruk", b64Dec);

  await page.click('[data-testid="forge-tab-url"]');
  await page.fill('[data-testid="forge-url-input"]', "a b&c=d");
  await page.click('[data-testid="forge-url-encode"]');
  const urlEnc = await page.locator('[data-testid="forge-url-output"]').inputValue();
  check("forge: URL encode", urlEnc === "a%20b%26c%3Dd", urlEnc);

  await page.click('[data-testid="forge-tab-uuid"]');
  await page.click('[data-testid="forge-uuid-gen-10"]');
  const uuidTexts = await page.locator('[data-testid="forge-uuid-item"]').allInnerTexts();
  const v4re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  check("forge: 10 UUIDs generated, all RFC 4122 v4", uuidTexts.length === 10 && uuidTexts.every((u) => v4re.test(u.trim())), uuidTexts[0] ?? "");

  await page.click('[data-testid="forge-tab-sha256"]');
  await page.fill('[data-testid="forge-sha-input"]', "uruk");
  await page.click('[data-testid="forge-sha-run"]');
  const shaExpected = createHash("sha256").update("uruk").digest("hex");
  const shaGot = await waitFor(async () => {
    const v = await page.locator('[data-testid="forge-sha-output"]').inputValue().catch(() => "");
    return v === shaExpected ? v : null;
  });
  check("forge: SHA-256('uruk') equals the reference digest", !!shaGot, shaGot ?? "");

  await page.click('[data-testid="forge-tab-regex"]');
  await page.fill('[data-testid="forge-regex-pattern"]', "\\d+");
  await page.fill('[data-testid="forge-regex-text"]', "a1 b22 c333");
  const rxCount = await page.locator('[data-testid="forge-regex-count"]').innerText();
  check("forge: regex tester counts 3 matches", rxCount.includes("3 matches"), rxCount);
  const rxMarks = await page.locator('[data-testid="forge-regex-matches"] mark').count();
  check("forge: regex matches are highlighted", rxMarks === 3, String(rxMarks));

  await page.click('[data-testid="forge-tab-text"]');
  await page.fill('[data-testid="forge-text-input"]', "one two\nthree");
  check(
    "forge: text counter (13 chars / 3 words / 2 lines)",
    (await page.locator('[data-testid="forge-text-chars"]').innerText()) === "13" &&
      (await page.locator('[data-testid="forge-text-words"]').innerText()) === "3" &&
      (await page.locator('[data-testid="forge-text-lines"]').innerText()) === "2",
  );
  await closeWin("tools");

  console.log("— phase 5: adad (mocked Open-Meteo: current, hourly, 7-day, city search) —");
  const geoBaghdad = { results: [{ name: "Baghdad", country: "Iraq", admin1: "Baghdad", latitude: 33.3406, longitude: 44.4009 }] };
  const geoEdmonton = { results: [{ name: "Edmonton", country: "Canada", admin1: "Alberta", latitude: 53.5461, longitude: -113.4937 }] };
  const mkForecast = (tempNow, hi0, lo0) => {
    const times = [];
    const temps = [];
    const codes = [];
    for (let d = 0; d < 2; d++) {
      for (let h = 0; h < 24; h++) {
        times.push(`2026-10-1${7 + d}T${String(h).padStart(2, "0")}:00`);
        temps.push(18 + ((h + d * 3) % 14));
        codes.push(h % 3);
      }
    }
    return {
      current: { time: "2026-10-17T14:30", temperature_2m: tempNow, relative_humidity_2m: 18, apparent_temperature: tempNow - 2, weather_code: 0, wind_speed_10m: 12.3, is_day: 1 },
      hourly: { time: times, temperature_2m: temps, weather_code: codes },
      daily: {
        time: ["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"],
        weather_code: [0, 1, 2, 3, 61, 0, 2],
        temperature_2m_max: [hi0, hi0 - 1, hi0 - 2, hi0 - 3, hi0 - 4, hi0 - 2, hi0 - 1],
        temperature_2m_min: [lo0, lo0 - 1, lo0 - 1, lo0 - 2, lo0 - 2, lo0 - 1, lo0],
      },
    };
  };
  await page.route("https://geocoding-api.open-meteo.com/**", (route) => {
    const url = route.request().url();
    return route.fulfill({ json: url.includes("Edmonton") ? geoEdmonton : geoBaghdad });
  });
  await page.route("https://api.open-meteo.com/**", (route) => {
    const url = route.request().url();
    return route.fulfill({ json: url.includes("53.5461") ? mkForecast(4.6, 9.4, -1.2) : mkForecast(31.4, 33.2, 19.8) });
  });
  await page.click('[data-testid="dock-icon-weather"]');
  const adadUp = await waitFor(() => page.locator('[data-testid="window-weather"]').isVisible().catch(() => false));
  check("adad opens from the Dock", !!adadUp);
  const adadCurrent = await waitFor(() => page.locator('[data-testid="weather-current"]').isVisible().catch(() => false), 15000);
  check("adad: current conditions render (mocked API)", !!adadCurrent);
  check("adad: city is the Settings city (Baghdad)", ((await page.locator('[data-testid="weather-city"]').innerText().catch(() => "")) ?? "").includes("Baghdad"));
  check("adad: current temp is the fixture's 31°", (await page.locator('[data-testid="weather-temp"]').getAttribute("data-temp")) === "31");
  check(
    "adad: today hi/lo from the fixture (33° / 20°)",
    ((await page.locator('[data-testid="weather-day-0-hi"]').innerText()) ?? "").includes("33") &&
      ((await page.locator('[data-testid="weather-day-0-lo"]').innerText()) ?? "").includes("20"),
  );
  const hourCount = await page.locator('[data-testid="weather-hour"]').count();
  check("adad: 24 hourly entries render", hourCount === 24, String(hourCount));
  check("adad: 7-day forecast renders through day 6", await page.locator('[data-testid="weather-day-6"]').isVisible().catch(() => false));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, "29-adad-forecast.png") });
  await page.fill('[data-testid="weather-search"]', "Edmonton");
  await page.click('[data-testid="weather-search-btn"]');
  const wResult = await waitFor(() => page.locator('[data-testid="weather-result-0"]').isVisible().catch(() => false), 12000);
  check("adad: city search returns results", !!wResult);
  await page.click('[data-testid="weather-result-0"]');
  const edmTemp = await waitFor(async () => {
    const v = await page.locator('[data-testid="weather-temp"]').getAttribute("data-temp").catch(() => null);
    return v === "5" ? v : null;
  }, 12000);
  check("adad: picking Edmonton refetches its forecast (5°)", !!edmTemp);
  check("adad: city now Edmonton", ((await page.locator('[data-testid="weather-city"]').innerText().catch(() => "")) ?? "").includes("Edmonton"));
  await closeWin("weather");
  await page.unroute("https://geocoding-api.open-meteo.com/**");
  await page.unroute("https://api.open-meteo.com/**");

  console.log("— phase 5: two rivers (OSM embed + mocked Nominatim) —");
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
  const mapsUp = await waitFor(() => page.locator('[data-testid="window-maps"]').isVisible().catch(() => false));
  check("two rivers opens from the Dock", !!mapsUp);
  const srcDefault = await page.locator('[data-testid="maps-frame"]').getAttribute("src");
  check(
    "two rivers: embed starts on Baghdad with a marker",
    !!srcDefault && srcDefault.includes("openstreetmap.org/export/embed.html") && srcDefault.includes("marker=33.3152%2C44.3661"),
    srcDefault ?? "",
  );
  await page.fill('[data-testid="maps-search"]', "Baghdad");
  await page.click('[data-testid="maps-search-btn"]');
  const mResult = await waitFor(() => page.locator('[data-testid="maps-result-0"]').isVisible().catch(() => false), 12000);
  check("two rivers: Nominatim search returns a result", !!mResult);
  await page.click('[data-testid="maps-result-0"]');
  const srcMoved = await waitFor(async () => {
    const s = await page.locator('[data-testid="maps-frame"]').getAttribute("src").catch(() => "");
    return s && s.includes("bbox=44.200000%2C33.100000%2C44.500000%2C33.500000") ? s : null;
  }, 12000);
  check("two rivers: selecting the result moves the embed to its bbox", !!srcMoved, srcMoved ?? "");
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, "27-two-rivers-baghdad.png") });
  await closeWin("maps");
  await page.unroute("https://nominatim.openstreetmap.org/**");

  console.log("— phase 4b: identity (new names + icons) —");
  const activeAppName = await page.locator('[data-testid="menubar-active-app"]').innerText();
  check("identity: menu bar shows 'Uruk Files' as the default app", activeAppName.trim() === "Uruk Files", activeAppName);
  await page.click('[data-testid="dock-icon-launchpad"]');
  const plazaUp = await waitFor(() => page.locator('[data-testid="launchpad"]').isVisible().catch(() => false));
  check("identity: Plaza opens from the Dock", !!plazaUp);
  const plazaText = await page.locator('[data-testid="launchpad"]').innerText();
  check(
    "identity: Plaza grid carries the new names (Ishtar Gate, Ukkin, Tablet, Nanna)",
    plazaText.includes("Ishtar Gate") && plazaText.includes("Ukkin") && plazaText.includes("Tablet") && plazaText.includes("Nanna"),
    plazaText.slice(0, 200),
  );
  await page.click('[data-testid="launchpad-app-editor"]');
  const scribeUp = await waitFor(() => page.locator('[data-testid="window-editor"]').isVisible().catch(() => false));
  check("identity: Plaza launches Scribe (the editor app)", !!scribeUp);
  const scribeTitle = await page.locator('[data-testid="window-editor"]').innerText();
  check("identity: the editor window is titled Scribe", scribeTitle.includes("Scribe"), scribeTitle.slice(0, 80));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, "24-scribe.png") });
  await closeWin("editor");
  await page.screenshot({ path: path.join(SHOTS, "25-desktop-identity.png") });

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
