# URUK OS

**A complete desktop operating system that runs entirely in your web browser.** Boot it, pick your account (or create one — it lives on your device, no server, no sign-up), and you get a working desktop — a window manager, a Dock, a menu bar, a real file system, twelve fully working apps with their own URUK identity, Spotlight search, a Control Center where every switch does something real, notifications, a PIN lock, full backup/restore, and a browser that loads the real web — and everything you create is still there when you come back.

[![Live demo](https://img.shields.io/badge/Live-uruk--os.vercel.app-0a84ff?style=flat-square)](https://uruk-os.vercel.app)
[![Version](https://img.shields.io/badge/version-0.5.0-blue?style=flat-square)](https://github.com/dolanexeee/uruk-os)
[![Tests](https://img.shields.io/badge/tests-138%2F138-brightgreen?style=flat-square)](#tests)
[![License](https://img.shields.io/badge/license-Apache--2.0-lightgrey?style=flat-square)](LICENSE)

- **Live:** https://uruk-os.vercel.app
- **Version:** 0.5.0 (Phase 4: local accounts, a browser that loads real sites, Dock auto-hide, and the URUK identity)
- **Feature checklist:** [FEATURES.md](FEATURES.md) — every feature scored Done / Partial / Missing, nothing claimed without evidence
- URUK OS is the second application in the **URUK** open-source suite (after [Uruk Cut](https://github.com/dolanexeee/uruk-cut)).

## Clean-room statement

URUK OS is a **clean-room recreation of the desktop experience**, designed and written from observed behavior of desktop operating systems and public web-platform documentation. This repository contains **no third-party proprietary code, icons, wallpapers, logos, or artwork**: every icon and every wallpaper here is original vector art drawn for this project, and the suite's own stepped-ziggurat mark is used in place of any vendor logo. URUK OS is an independent open-source project, **not affiliated with or endorsed by Apple**; "macOS" is mentioned in this document only descriptively, to name the style of desktop experience being recreated.

## See it

| | |
| --- | --- |
| ![Desktop](qa/screenshots/01-desktop.png) | ![Spotlight](qa/screenshots/15-spotlight.png) |
| Desktop, Dock & menu bar | **Spotlight** — files, note contents, events, apps |
| ![Plaza](qa/screenshots/16-launchpad.png) | ![Control Center](qa/screenshots/17-control-center.png) |
| **Plaza** — every app, searchable | **Control Center** — every control is real |
| ![Notification Center](qa/screenshots/18-notification-center.png) | ![Lock screen](qa/screenshots/19-lock-pin.png) |
| **Notification Center** — widgets + a real notification engine | **Lock screen** — live clock, optional PIN |
| ![Uruk Code](qa/screenshots/14-code.png) | ![Music](qa/screenshots/12-music.png) |
| Uruk Code — edit & run JavaScript in the OS | Music — real playback from your files |
| ![Accounts](qa/screenshots/20-accounts-login.png) | ![Wikipedia in Ishtar Gate](qa/screenshots/21-browser-wikipedia.png) |
| **Accounts** — a local account per person, each with its own files | **Ishtar Gate** — the real Wikipedia, loaded through the built-in proxy |
| ![Desktop with the identity Dock](qa/screenshots/25-desktop-identity.png) | ![Scribe](qa/screenshots/24-scribe.png) |
| **Desktop** — the identity Dock under Ziggurat at Dusk | **Scribe** — the text editor, named for the first writers |

## The system

- **Boot + login** — boot screen with progress bar, then an account picker with a live clock: pick your account, create a new one (name + avatar color/symbol + optional PIN), or continue as Guest. Lock, log-out, and switch-user live in the URUK menu, the menu-bar user menu, and Control Center.
- **Window manager** — open / close / minimize / maximize / restore, drag by the title bar, resize from all 8 directions, double-click title bar to zoom, traffic-light buttons with hover glyphs, focus z-ordering, animated open/close/minimize.
- **Menu bar** — URUK menu (About This Machine, Lock Screen, Log Out), the active app's name and File menu (each app registers its own real actions), a Window menu listing every open window, Spotlight and Control Center buttons, a light/dark quick toggle, and a live clock that opens Notification Center.
- **Dock** — the URUK identity icons for all twelve apps plus Plaza, hover magnification, running-app indicator dots, click to launch or focus, right-click for Open / New Window / Quit. **Auto-hide (on by default, toggle in Ukkin):** when a window is maximized the Dock slides away so the window owns the whole screen, and floats back when the pointer touches the bottom edge — just like macOS. The Shard icon's tooltip shows its item count.
- **A real file system** — a node tree stored in **IndexedDB**, shared by every app and the desktop. Seeded with Desktop / Documents / Downloads / Pictures / Trash plus a welcome file and an original sample picture. Full create / rename / move / trash / restore / empty-trash / import. **Drag real files from your computer onto the desktop or a Finder window to import them** — they are stored as blobs and persist across reloads.
- **Uruk Files** — sidebar favorites, back/forward history, grid & list views, name search, New Folder with inline rename, right-click menus (Open, Rename, Move to…, Move to Trash, Get Info with real metadata), Empty Trash, and a live storage readout (`navigator.storage.estimate()`).
- **Uruk Shell (`uruksh`)** — a real interpreter over the same file system: `pwd ls (-l) cd mkdir touch cat echo (> and >>) rm (-r) mv cp (-r) clear help whoami date open <app|path>` and `urukfetch` (ASCII logo + live system data). Command history with ↑/↓, quoted paths, Unix-plausible errors.
- **Scribe** — open any text file, edit, and **Ctrl+S writes back into the file system** (verified end-to-end across Terminal, Editor, and Finder). New-document flow with name + destination.
- **Ukkin (Settings)** — Light/Dark appearance that genuinely re-themes the whole system, six accent colors that genuinely recolor selections and controls, five original wallpapers, System (weather city, screensaver idle time), Security (PIN), Backup & Sync panes, and an About pane whose file-system statistics are computed live. **All settings persist across reloads**, as does the entire file system.
- **Desktop** — shows the real Desktop folder, with a right-click menu (New Folder, Import Files, Change Wallpaper, Toggle Dark Mode).

## Phase 2 — the app suite

- **File associations registry** — one shared table routes every file opening in the system: images → Photos, PDFs → Preview, audio → Music, code extensions (`.js .jsx .ts .tsx .py .html .css .json .md .sh …`) → Uruk Code, plain text → Editor, folders → Finder, anything else → Get Info. Double-clicking in Finder or on the desktop, and `open <path>` in Uruk Shell, all honor it — a path beats an app-name shortcut, exactly like a real `open`.
- **Shamash Gallery** — a gallery over the whole Pictures subtree (real thumbnails from the stored blobs), a viewer with prev/next + keyboard arrows, zoom (fit / % steps), **Set as Wallpaper** (your photo becomes the desktop wallpaper and persists), Open in Preview, Delete → Trash, and import by picker or drag-and-drop.
- **Shamash Eye** — images with zoom and rotate (rotation can be saved as a new file for PNG/JPEG/WebP) and PDFs rendered from their blob in a viewer pane, always with the real file name, size, and type.
- **Tablet** — every note is a real `.txt` file in a `Notes` folder: the sidebar title is the note's first line, with snippet, date, and search. Autosave while you type; a note edited here is a normal file you can `cat` in Terminal or open in Finder. New, Delete (→ Trash), and import included.
- **Abacus** — standard + √, x², 1/x, %, ±, with a hand-written expression evaluator (tokenizer + precedence parser — no `eval()`), full keyboard support, and a clickable history tape.
- **Nanna** — real month math, today highlighted, month navigation + Today jump. Events (title, time, notes) are stored as **a plain JSON file at `Calendar/events.json`** in the file system — `cat` it in Terminal to see your data. Add / edit / delete, all persistent.
- **Lyre** — the library is the `Music` folder plus an "All Audio" scan of the whole file system. Real playback: play/pause, seek, volume, next/prev, shuffle, repeat (off/all/one), durations read from the files' own metadata, now-playing in the window title, and import.
- **Ishtar Gate** — the browser: tabs, an address bar that takes URLs or search terms (DuckDuckGo HTML), back/forward/reload/home, a start page with quick links, and an always-visible **Open in real tab** button. Pages load through the OS's own **same-origin proxy** (below), so sites that refuse framing still render here; YouTube watch pages become the official embed player.
- **Uruk Code** — a real code editor (CodeMirror 6): multiple file tabs, syntax highlighting for JavaScript/TypeScript/HTML/CSS/JSON/Python/Markdown, line numbers, Ctrl+S save into the file system, font-size control, and a theme that follows the system appearance. **Run** executes JavaScript in a sandboxed iframe and streams `console.log/warn/error` into an output pane; **Preview** renders HTML files in a sandboxed pane.

## Phase 3 — the system layer

- **Spotlight** (menu-bar magnifier or Ctrl/⌘+K) — one live index over everything: apps, files and folders by name, the **contents** of notes and text files (with a matching snippet), and calendar events. Ranked results, full keyboard navigation (↑/↓/Enter/Esc); a file opens in its associated app, an event opens Calendar on that date. An empty query shows apps + recent files.
- **Launchpad** — a Dock icon opens the full-screen blurred app grid with a search filter; click launches and closes, Esc closes.
- **Control Center** — every control is real inside the OS:
  - **Brightness** genuinely dims the whole desktop through a composited overlay, and persists.
  - **Wi-Fi** is an in-OS network switch: OFF means the Browser shows an honest "Wi-Fi is off" state (no fake pages) and the weather widget degrades to its last reading or "unavailable"; ON restores everything.
  - **Do Not Disturb** suppresses banners — notifications still land in Notification Center.
  - **Volume** is the Music app's playback volume (one shared store).
  - **Airplane mode** is the real composite: Wi-Fi off + Do Not Disturb on.
  - Dark/Light mode and a Lock Screen button round out the panel.
- **Notification Center + widgets** — click the menu-bar clock: big clock/date, a mini month calendar (click → Calendar app), **Weather** from the free Open-Meteo API (no key; city set in Settings, default Baghdad — when a fetch fails it shows the last cached reading marked as such, or an honest "unavailable"; it never invents weather), a storage gauge from the browser's real estimate, and now-playing with a working play/pause when Music has a track loaded.
- **A real notification engine** — banners slide in top-right and auto-dismiss (suppressed under Do Not Disturb), and everything persists in the Center until you Clear all. Producers: **calendar events due within 15 minutes** (checked on login and continuously, fired once per event), file-import completion, backup/restore completion, and a storage-above-85% warning.
- **PIN lock** — Settings → Security sets an optional PIN, stored only as a salted SHA-256 hash (never plaintext). The lock screen shows the live clock and date; with a PIN set it demands it — a wrong PIN shakes with an error, the right one unlocks. An **idle screensaver** (1 / 5 / 15 minutes / never, plus an honestly labeled 10-second test option) fades to the wallpaper + clock and wakes to the lock screen on any key or click.
- **Backup / Restore** — Settings → Backup exports one `.urukos` file: a ZIP (format `urukos-backup: 1`) holding the full file system (nodes + raw blob entries) and your settings. Import offers **Replace** or **Merge** behind a clear confirm dialog and reports the result as a notification. The PIN is deliberately never part of a backup.
- **Supabase sync (experimental)** — Settings → Backup → Sync lets you point URUK OS at **your own** Supabase project (URL + anon key — we ship no server and see nothing) and push/pull a whole-machine snapshot stored as the same serialized backup. It is implemented against the Supabase REST API with real error surfacing and a table-creation SQL snippet in the UI. It is labeled experimental because it has **not** been verified end-to-end against a live project; the `.urukos` file above is the guaranteed path.

## Phase 4 — accounts, a real browser, and the URUK identity

- **Local accounts** — the login screen is now an account picker. Create an account with a display name, an avatar (color + symbol), and an optional PIN (stored only as a salted SHA-256 hash, per account). **Every account is a separate machine-within-the-machine:** its own IndexedDB file-system database, its own settings (wallpaper, accent, appearance, weather city, volume…), its own notifications. Switch users from the menu bar; delete an account in Ukkin → Account and only that account's data is erased. **Guest mode** gets its own clearly-labeled space that sees none of the accounts' files. Accounts from before this feature are migrated, not wiped: the existing file system and settings become the first account (default name "Mustafa", renameable). Honest framing: these accounts live **on this device, in this browser** — local-first and $0, with no server and no sign-up; moving between devices is the .urukos backup or the experimental bring-your-own-Supabase sync.
- **A browser that loads real sites** — Ishtar Gate no longer iframes the web directly. The OS ships a same-origin proxy (`/api/proxy`) that fetches pages server-side with a desktop user-agent, follows redirects, and rewrites their URLs (links, images, stylesheets, scripts, forms) back through itself, so pages render inside the OS — Wikipedia, news, documentation, and reference sites included. The proxy is SSRF-guarded (http/https only; loopback, private, and link-local targets are refused), forwards **no cookies**, and when a fetch fails the browser shows an honest error state with an "Open in real tab" action. YouTube watch URLs open as the youtube-nocookie embed. The honest limit of any rewriting proxy stands: logins don't persist, and JavaScript-heavy web apps (Gmail, banking, X) may not fully work through it — content sites are the target.
- **Dock auto-hide** — macOS behavior: maximize a window and the Dock slides off the bottom of the screen; move the pointer to the bottom edge and it floats back; move away and it hides again. On by default; Ukkin → Appearance turns it off.
- **The URUK identity** — every app now carries a Mesopotamian name and an original icon from the approved set in `design/` (sources in `design/icons/`, rationale in `design/NAMES.md`): **Uruk Files, Uruk Shell, Scribe, Ukkin, Shamash Gallery, Shamash Eye, Tablet, Abacus, Nanna, Lyre, Ishtar Gate, Plaza, Shard** — and **Uruk Code**, which kept its name and got wedge-cut brackets. Even the generic folder is gold and the generic file is written in cuneiform wedges. Internal app ids never changed, so file associations and saved data are untouched. Icons for four future apps — Clepsydra (clock), Adad (weather), Two Rivers (maps), Forge (tools) — are already in the set, waiting for their phase.

## Storage: local-first, $0, yours

There is no account server. Each local account's file system lives in its own **IndexedDB** database in your browser (via the `idb` library); preferences live in `localStorage`, scoped per account. The app itself is a small Next.js server build (one static page + the browser's proxy route), hostable for free. Data stays on the device — clearing the browser's site data erases the machine, just like wiping a disk. To move machines or keep a copy, export a `.urukos` backup (above); to sync through your own backend, the experimental Supabase option uses the identical snapshot format.

## Editions

- **Web edition** — this repo, live now. Open-source (Apache-2.0).
- **ISO edition** — next: a bootable, URUK-branded Debian-based system (installable dual-boot or in VirtualBox) with the web OS bundled as a local app. Not started yet; see [FEATURES.md](FEATURES.md).

## Honest limitations

- Ishtar Gate loads pages through a rewriting proxy: logins do not persist (no cookies are forwarded), and JavaScript-heavy web apps that mint their own absolute URLs or require websockets/service workers may not fully work. When the proxy cannot fetch a page it says so and offers "Open in real tab" instead of faking success.
- Weather needs internet; offline it shows the last fetched reading (marked cached) or "unavailable" — never a made-up forecast.
- Supabase sync is experimental and unverified against a live project (see above).
- The storage >85% warning producer is implemented but impractical to trigger within a test browser's quota, so it is marked Partial in FEATURES.md.
- Finder moves files via right-click **Move to…**; drag-between-folders is not implemented.
- Accounts are local to one browser on one device by design; there is no sign-in server. Cross-device roaming is the backup file or the experimental sync.

## Run it

```bash
npm ci
npm run build     # production server build (page prerenders; /api/proxy is a route)
npm run start     # next start on http://127.0.0.1:3000
npm run dev       # or the Next.js dev server
```

## Tests

```bash
npm run build
node qa/run-tests.mjs   # Playwright (Chromium) against the production server build
```

**138/138 checks green** (29 Phase 1 + 35 Phase 2 + 36 Phase 3 + 33 Phase 4A + 5 Phase 4B). Phase 4A proves, end-to-end: the full account lifecycle (create B with a PIN → marker file + wallpaper → switch to A → marker invisible and wallpaper different → wrong PIN rejected → correct PIN → everything intact; guest sees neither account's files); the proxy serving example.org and the Wikipedia “Uruk” article (HTTP 200, real content, rewritten URLs) and refusing loopback/private targets; Ishtar Gate rendering both sites in-app with the address bar tracking the real URL; and Dock auto-hide (maximize → hidden → bottom-edge hover → revealed → unmaximize → back). Phase 4B proves the identity: Plaza lists Ishtar Gate / Ukkin / Tablet / Nanna, and Plaza launches Scribe under its own name. Phase 3 proved: Spotlight finding a file by name, a note by its *contents*, and a calendar event — and opening each correctly; Launchpad launching Calculator; Control Center brightness changing the applied dim value and surviving a reload, and its volume being the Music app's volume; Wi-Fi OFF forcing the Browser's offline state and ON restoring the page; a calendar event due in minutes raising a banner that lands in Notification Center; the full PIN cycle (set 2468 → lock → wrong PIN rejected → correct PIN unlocks → PIN removed); a backup round-trip (export a ZIP with a valid manifest → delete the marker file → import with Replace → the file is back with its content); and the screensaver fading in on the 10-second test idle and waking to the lock screen. Earlier phases cover everything from calculator precedence and `cat`-verified notes to real audio playback and file-association routing. Screenshots live in `qa/screenshots/`.

## Layout

```
src/
  lib/accounts.ts      the local account registry + per-account storage keys
  lib/session.ts       account session orchestration (bind/switch/delete)
  lib/fs.ts            the IndexedDB file system + its reactive store (one DB per account)
  lib/associations.ts  the file-associations registry shared by all apps
  lib/backup.ts        .urukos backup/restore (ZIP + JSON snapshot forms)
  lib/sync.ts          experimental bring-your-own Supabase sync
  lib/weather.ts       Open-Meteo client (no key) with an honest cache
  lib/security.ts      PIN hashing (salted SHA-256) + verification
  store/os.ts          window manager, session, settings (Zustand)
  store/system.ts      Control Center state: brightness, Wi-Fi, DND, volume, panels
  store/notifications.ts  the notification engine store
  components/          Window chrome, MenuBar, Dock, Spotlight, Launchpad,
                       Control Center, Notification Center, screensaver, icons
  apps/                Uruk Files, Uruk Shell, Scribe, Ukkin, Shamash Gallery,
                       Shamash Eye, Tablet, Abacus, Nanna, Lyre, Ishtar Gate,
                       Uruk Code (one file each; internal ids unchanged)
  app/api/proxy/       the same-origin page proxy Ishtar Gate browses through
public/icons/          the approved URUK identity icon set (sources in design/icons/)
design/                NAMES.md (naming rationale) + icons/ (identity sources)
public/fixtures/       local test pages the browser suite renders (no network needed)
```

## Roadmap

Next: a bootable Linux ISO edition carrying the same URUK identity, and the four apps whose icons already exist — Clepsydra, Adad, Two Rivers, Forge. Phases 1–4 (shell, app suite, system layer, accounts + real browsing + identity) are complete — see [FEATURES.md](FEATURES.md) for the scored checklist.

## License

Apache License 2.0 — see [LICENSE](./LICENSE).
