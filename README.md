# URUK OS

**URUK OS is a complete desktop operating system that runs entirely in your web browser.** Boot it, log in, and you get a working desktop — a window manager, a Dock, a menu bar, a real file system, and twelve fully working apps — where everything you create is still there when you come back.

It is the second application in the **URUK** open-source suite (after [Uruk Cut](https://github.com/dolanexeee/uruk-cut)).

- **Live:** https://uruk-os.vercel.app
- **Version:** 0.2.0 (Phase 2)

## Clean-room statement

URUK OS is a **clean-room recreation of the desktop experience**, designed and written from observed behavior of desktop operating systems and public web-platform documentation. This repository contains **no third-party proprietary code, icons, wallpapers, logos, or artwork**: every icon and every wallpaper here is original vector art drawn for this project, and the suite's own stepped-ziggurat mark is used in place of any vendor logo. URUK OS is an independent open-source project, **not affiliated with or endorsed by Apple**; "macOS" is mentioned in this document only descriptively, to name the style of desktop experience being recreated.

## The system (Phase 1)

- **Boot + login** — boot screen with progress bar, then a login screen for the local user (no password gate; lock and log-out live in the URUK menu).
- **Window manager** — open / close / minimize / maximize / restore, drag by the title bar, resize from all 8 directions, double-click title bar to zoom, traffic-light buttons with mac-style hover glyphs, focus z-ordering, animated open/close/minimize.
- **Menu bar** — URUK menu (About This Machine, Lock Screen, Log Out), the active app's name and File menu (each app registers its own real actions), a Window menu listing every open window, a light/dark quick toggle, and a live clock.
- **Dock** — original SVG icons for all twelve apps, hover magnification, running-app indicator dots, click to launch or focus, right-click for Open / New Window / Quit. The Trash icon fills up when the Trash is non-empty.
- **A real file system** — a node tree stored in **IndexedDB**, shared by every app and the desktop. Seeded with Desktop / Documents / Downloads / Pictures / Trash plus a welcome file and an original sample picture. Full create / rename / move / trash / restore / empty-trash / import. **Drag real files from your computer onto the desktop or a Finder window to import them** — they are stored as blobs and persist across reloads.
- **Finder** — sidebar favorites, back/forward history, grid & list views, name search, New Folder with inline rename, right-click menus (Open, Rename, Move to…, Move to Trash, Get Info with real metadata), Empty Trash, and a live storage readout (`navigator.storage.estimate()`).
- **Terminal (`uruksh`)** — a real interpreter over the same file system: `pwd ls (-l) cd mkdir touch cat echo (> and >>) rm (-r) mv cp (-r) clear help whoami date open <app|path>` and `urukfetch` (ASCII logo + live system data). Command history with ↑/↓, quoted paths, Unix-plausible errors.
- **Editor** — open any text file, edit, and **Ctrl+S writes back into the file system** (verified end-to-end across Terminal, Editor, and Finder). New-document flow with name + destination.
- **Settings** — Light/Dark appearance that genuinely re-themes the whole system, six accent colors that genuinely recolor selections and controls, five original wallpapers, and an About pane whose file-system statistics are computed live. **All settings persist across reloads**, as does the entire file system.
- **Desktop** — shows the real Desktop folder, with a right-click menu (New Folder, Import Files, Change Wallpaper, Toggle Dark Mode).

## Phase 2 — the app suite

- **File associations registry** — one shared table routes every file opening in the system: images → Photos, PDFs → Preview, audio → Music, code extensions (`.js .jsx .ts .tsx .py .html .css .json .md .sh …`) → Uruk Code, plain text → Editor, folders → Finder, anything else → Get Info. Double-clicking in Finder or on the desktop, and `open <path>` in Terminal, all honor it — a path beats an app-name shortcut, exactly like a real `open`.
- **Photos** — a gallery over the whole Pictures subtree (real thumbnails from the stored blobs), a viewer with prev/next + keyboard arrows, zoom (fit / % steps), **Set as Wallpaper** (your photo becomes the desktop wallpaper and persists), Open in Preview, Delete → Trash, and import by picker or drag-and-drop.
- **Preview** — images with zoom and rotate (rotation can be saved as a new file for PNG/JPEG/WebP) and PDFs rendered from their blob in a viewer pane, always with the real file name, size, and type.
- **Notes** — every note is a real `.txt` file in a `Notes` folder: the sidebar title is the note's first line, with snippet, date, and search. Autosave while you type; a note edited here is a normal file you can `cat` in Terminal or open in Finder. New, Delete (→ Trash), and import included.
- **Calculator** — standard + √, x², 1/x, %, ±, with a hand-written expression evaluator (tokenizer + precedence parser — no `eval()`), full keyboard support, and a clickable history tape.
- **Calendar** — real month math, today highlighted, month navigation + Today jump. Events (title, time, notes) are stored as **a plain JSON file at `Calendar/events.json`** in the file system — `cat` it in Terminal to see your data. Add / edit / delete, all persistent.
- **Music** — the library is the `Music` folder plus an "All Audio" scan of the whole file system. Real playback: play/pause, seek, volume, next/prev, shuffle, repeat (off/all/one), durations read from the files' own metadata, now-playing in the window title, and import.
- **URUK Browser** — tabs, an address bar that takes URLs or search terms (DuckDuckGo HTML), back/forward/reload/home, a start page with quick links, and an always-visible **Open in real tab** button. Honest by design: many sites refuse to be embedded (framing-protection headers), and when one does, the browser says so in plain language instead of faking a loaded page.
- **Uruk Code** — a real code editor (CodeMirror 6): multiple file tabs, syntax highlighting for JavaScript/TypeScript/HTML/CSS/JSON/Python/Markdown, line numbers, Ctrl+S save into the file system, font-size control, and a theme that follows the system appearance. **Run** executes JavaScript in a sandboxed iframe and streams `console.log/warn/error` into an output pane; **Preview** renders HTML files in a sandboxed pane.

## Storage: local-first and $0

There is no server and no account. The file system and your files live in your browser's **IndexedDB** (via the `idb` library); preferences live in `localStorage`. Hosting the app itself is a static file bundle, so it runs from any static host for free. Data stays on the device — clearing the browser's site data erases the machine, just like wiping a disk.

## Run it

```bash
npm ci
npm run build     # static export into out/
npm run start     # serve out/ on http://127.0.0.1:3000
npm run dev       # or the Next.js dev server
```

## Tests

```bash
npm run build
node qa/run-tests.mjs   # Playwright (Chromium) against the production export
```

**64/64 checks green** (29 Phase 1 + 35 Phase 2): everything from Phase 1, plus calculator math through the UI (including operator precedence and the history tape); a note proven to be a real file by `cat` in Terminal; a calendar event added, reloaded, and found inside `Calendar/events.json`; JavaScript run in Uruk Code printing `42` to its output pane and an HTML preview rendering; a PNG imported into Photos, set as wallpaper, and still the wallpaper after reload; a WAV imported into Music and actually playing; the browser rendering a locally served fixture page with working history; and the association registry routing an image to Photos and a `.js` file to Uruk Code from Finder double-clicks. Screenshots live in `qa/screenshots/`.

## Layout

```
src/
  lib/fs.ts            the IndexedDB file system + its reactive store
  lib/associations.ts  the file-associations registry shared by all apps
  store/os.ts          window manager, session, settings (Zustand)
  components/          Window chrome, MenuBar, Dock, boot/login/desktop, icons, wallpapers
  apps/                Finder, Terminal, Editor, Settings, Photos, Preview, Notes,
                       Calculator, Calendar, Music, Browser, Code (one file each)
public/fixtures/       local test pages the browser suite renders (no network needed)
```

## Roadmap (not in this phase)

Phase 3: Spotlight search, Launchpad, Control Center, widgets and notifications, and optional free-tier cloud sync. Phase 4: a bootable Linux ISO edition carrying the same URUK identity.

## License

Apache License 2.0 — see [LICENSE](./LICENSE).
