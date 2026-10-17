# URUK OS

**URUK OS is a complete desktop operating system that runs entirely in your web browser.** Boot it, log in, and you get a working desktop — a window manager, a Dock, a menu bar, a real file system, a terminal, a text editor, and settings — where every app actually works and everything you create is still there when you come back.

It is the second application in the **URUK** open-source suite (after [Uruk Cut](https://github.com/dolanexeee/uruk-cut)).

- **Live:** https://uruk-os.vercel.app
- **Version:** 0.1.0 (Phase 1)

## Clean-room statement

URUK OS is a **clean-room recreation of the desktop experience**, designed and written from observed behavior of desktop operating systems and public web-platform documentation. This repository contains **no third-party proprietary code, icons, wallpapers, logos, or artwork**: every icon and every wallpaper here is original vector art drawn for this project, and the suite's own stepped-ziggurat mark is used in place of any vendor logo. URUK OS is an independent open-source project, **not affiliated with or endorsed by Apple**; "macOS" is mentioned in this document only descriptively, to name the style of desktop experience being recreated.

## What actually works in Phase 1

- **Boot + login** — boot screen with progress bar, then a login screen for the local user (no password gate in this phase; lock and log-out live in the URUK menu).
- **Window manager** — open / close / minimize / maximize / restore, drag by the title bar, resize from all 8 directions, double-click title bar to zoom, traffic-light buttons with mac-style hover glyphs, focus z-ordering, animated open/close/minimize.
- **Menu bar** — URUK menu (About This Machine, Lock Screen, Log Out), the active app's name and File menu (including per-app actions like Save and New Folder), a Window menu listing every open window, a light/dark quick toggle, and a live clock that ticks every second.
- **Dock** — original SVG icons, hover magnification, running-app indicator dots, click to launch or focus, right-click for Open / New Window / Quit. The Trash icon fills up when the Trash is non-empty.
- **A real file system** — a node tree stored in **IndexedDB**, shared by Finder, Terminal, Editor, and the desktop. Seeded with Desktop / Documents / Downloads / Pictures / Trash plus a welcome file and an original sample picture. Full create / rename / move / trash / restore / empty-trash / import. **Drag real files from your computer onto the desktop or a Finder window to import them** — they are stored as blobs and persist across reloads.
- **Finder** — sidebar favorites, back/forward history, grid & list views, name search, New Folder with inline rename, right-click menus (Open, Rename, Move to…, Move to Trash, Get Info with real metadata), Empty Trash, and a live storage readout (`navigator.storage.estimate()`).
- **Terminal (`uruksh`)** — a real interpreter over the same file system: `pwd ls (-l) cd mkdir touch cat echo (> and >>) rm (-r) mv cp (-r) clear help whoami date open <app|path>` and `urukfetch` (ASCII logo + live system data). Command history with ↑/↓, quoted paths, Unix-plausible errors.
- **Editor** — open any text file from Finder or Terminal, edit, and **Ctrl+S writes back into the file system** (verified end-to-end: a file created in Terminal, edited in the Editor, reads back changed in Terminal). New-document flow with name + destination.
- **Settings** — Light/Dark appearance that genuinely re-themes the whole system, six accent colors that genuinely recolor selections and controls, and five original wallpapers. **All settings persist across reloads**, as does the entire file system.
- **Desktop** — shows the real Desktop folder, with a right-click menu (New Folder, Import Files, Change Wallpaper, Toggle Dark Mode).

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

Phase 1 suite: **29/29 checks green** — boot → login; Finder folder creation through the UI; a file created in Terminal appearing in Finder; Editor modify + save read back in Terminal; minimize / restore / maximize / close window flows; wallpaper + appearance changes surviving a full reload together with the file system. Screenshots live in `qa/screenshots/`.

## Layout

```
src/
  lib/fs.ts          the IndexedDB file system + its reactive store
  store/os.ts        window manager, session, settings (Zustand)
  components/        Window chrome, MenuBar, Dock, boot/login/desktop, icons, wallpapers
  apps/              Finder, Terminal, Editor, Settings (modular, one file each)
```

## Roadmap (not in this phase)

Phase 2 adds the wider app suite (Notes, Calculator, Calendar, Photos, Music, a browser, Preview). A bootable Linux ISO edition carrying the same URUK identity is also planned.

## License

Apache License 2.0 — see [LICENSE](./LICENSE).
