/**
 * Uruk OS — Phase 1 + Phase 2 end-to-end suite (Playwright, Chromium).
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
  await focusWindowViaMenu(page, /Terminal/);
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
  await focusWindowViaMenu(page, /Terminal/);
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
  await page.click('[data-testid="login-button"]');
  await waitFor(() => page.locator('[data-testid="dock"]').isVisible().catch(() => false));
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
  await focusWindowViaMenu(page, /Terminal/);
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
  await page.click('[data-testid="login-button"]');
  await waitFor(() => page.locator('[data-testid="dock"]').isVisible().catch(() => false));
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
  await focusWindowViaMenu(page, /Terminal/);
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
  await focusWindowViaMenu(page, /Terminal/);
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
  await page.click('[data-testid="login-button"]');
  await waitFor(() => page.locator('[data-testid="dock"]').isVisible().catch(() => false));
  await page.click('[data-testid="dock-icon-settings"]');
  await waitFor(() => page.locator('[data-testid="window-settings"]').isVisible().catch(() => false));
  await page.click('[data-testid="settings-pane-system"]');
  await page.selectOption('[data-testid="settings-idle-timeout"]', "0");
  await closeWin("settings");

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
