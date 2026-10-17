# URUK OS — Feature Checklist

An honest, evidence-based inventory of the whole system, scored the same way
as Uruk Cut's PARITY.md. **Done** means it works and is covered by the
automated suite (`qa/run-tests.mjs`, 199/199 checks; the live-Python
checks live in `qa/python-smoke.mjs`, 10/10, because they need a browser
with real internet) or was verified by hand against the running system.
**Partial** means it exists but with a stated gap. **Missing** means not
built. Nothing is claimed without evidence.

_Last updated: v0.7.0 (Phase 5 feature set + real-world refinements: Python stdin guidance in Uruk Code and a full interface polish pass — see the Shell table)._

## Shell & system

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| Boot screen + login | ✅ Done | Suite: boot → login → desktop |
| Window manager (drag, resize 8-way, minimize, maximize, zoom, focus z-order) | ✅ Done | Phase 1 suite |
| Menu bar (URUK menu, app menus, Window menu, appearance toggle, live clock) | ✅ Done | Phase 1 suite |
| Dock (magnification, running indicators, right-click Open / New Window / Quit, Trash state) | ✅ Done | Phase 1 suite |
| Virtual file system in IndexedDB, shared by every app + desktop + Terminal | ✅ Done | Cross-app proofs throughout the suite |
| Desktop icons + right-click menu, drag-import from the host OS | ✅ Done | Phase 1 suite |
| Spotlight (apps, files/folders by name, note + text-file **contents**, calendar events; keyboard navigation) | ✅ Done | Phase 3 suite: finds `a.txt` by name, a note by the content word "quixotic", an event by title; Enter opens the right app |
| Launchpad (full-screen grid, search filter, Esc) | ✅ Done | Phase 3 suite: opens Calculator from the grid |
| Control Center — Dark/Light mode | ✅ Done | Same appearance store as Settings; visible in `qa/screenshots/17-control-center.png` |
| Control Center — Brightness (composited dim overlay, persisted) | ✅ Done | Phase 3 suite: slider → overlay value → still applied after reload |
| Control Center — Wi-Fi toggle (gates the Browser app; weather widget degrades honestly) | ✅ Done | Phase 3 suite: OFF → Browser shows its offline state; ON → page loads again |
| Control Center — Do Not Disturb (banners suppressed, notifications still recorded) | ✅ Done | Notification store checks DND before showing a banner |
| Control Center — Volume (shared with the Music app) | ✅ Done | Phase 3 suite: CC slider value == Music slider value |
| Control Center — Airplane mode (composite: Wi-Fi off + DND on) | ✅ Done | Real composite toggle in the system store |
| Notification Center (clock/date, mini calendar, weather, storage gauge, now-playing with working play/pause) | ✅ Done | Phase 3 suite + `qa/screenshots/18-notification-center.png` |
| Notification engine (banners, auto-dismiss, persistence, Clear all) | ✅ Done | Phase 3 suite: calendar reminder banner fires and lands in the Center |
| Reminder producer — calendar events due within 15 minutes, fire-once | ✅ Done | Phase 3 suite |
| Producer — file import complete | ✅ Done | Visible in the Notification Center screenshot |
| Producer — backup finished / restore complete | ✅ Done | Phase 3 backup flow raises it |
| Producer — storage above 85% warning | ⚠️ Partial | Implemented (checked at login, once per session); not end-to-end triggered in tests because reaching 85% of a test browser's quota is impractical |
| Weather (Open-Meteo, no key; city set in Settings; cached reading when a fetch fails; never fabricated) | ✅ Done | Endpoint + response shape verified live; the offline path shown in the Notification Center screenshot ("Unavailable — Could not reach the weather service") |
| PIN lock (salted SHA-256, never plaintext; wrong PIN shakes + errors) | ✅ Done | Phase 3 suite: set 2468 → wrong PIN rejected → correct PIN unlocks → PIN removed |
| Lock / login screen with live clock + date | ✅ Done | `qa/screenshots/19-lock-pin.png` |
| Idle screensaver (1 / 5 / 15 min / never, plus an honestly labeled "10 sec (test)") | ✅ Done | Phase 3 suite with the 10-second test interval |
| Backup / Restore (`.urukos` ZIP: manifest + raw blob entries, format `urukos-backup: 1`, Replace or Merge) | ✅ Done | Phase 3 suite: export → verify ZIP magic + manifest → delete marker → import (Replace) → marker restored with content |
| Supabase sync (bring-your-own project, push/pull snapshot, connection test) | ⚠️ Partial | **Experimental.** Implemented against the Supabase PostgREST spec with real error surfacing; the payload is the same serialized backup the suite round-trips. **Not verified against a live Supabase project** — no project of the user's was available to test with. The `.urukos` file is the guaranteed path. |
| Multiple local accounts (per-account FS database, settings, PIN; account picker + create flow; guest space) | ✅ Done | Phase 4A suite: create account B → marker file + wallpaper → switch to A → marker invisible, A's wallpaper differs → back into B (PIN-gated) → all intact; guest sees neither account's files. Honest scope: accounts live on this device/browser (local-first, $0); cross-device stays the experimental BYO-Supabase path |
| Migration of pre-account data | ✅ Done | The pre-4A file system + settings become the first account ("Mustafa", renameable in Settings → Account); storage keys and the original IndexedDB database are adopted in place — nothing wiped |
| Dock auto-hide (maximized window owns the screen; bottom-edge hover reveals; Settings toggle, on by default) | ✅ Done | Phase 4A suite: maximize → Dock off-screen → mouse to bottom edge → Dock floats back → mouse away → hides → unmaximize → Dock returns |
| URUK identity (original Mesopotamian icon set + app names from design/NAMES.md) | ✅ Done | Icons: `design/icons/*.svg` served from `public/icons`, used in Dock, Plaza, desktop, Finder, Spotlight. Names: Uruk Files, Uruk Shell, Scribe, Ukkin, Shamash Gallery, Shamash Eye, Tablet, Abacus, Nanna, Lyre, Ishtar Gate, Plaza, Shard (Uruk Code kept). Internal app ids unchanged |
| Interface polish pass (v0.7.0) | ✅ Done | From a surface-by-surface design review at 1440×900 in both appearances (before/after screenshots in `qa/polish-before/` + `qa/polish-after/`): Control Center tiles no longer truncate "Airplane Mode" / "Do Not Disturb" (panel 324→336 px, tighter tile internals); unfocused windows now dim their title text and mute their title bar like a real desktop; one corner-radius scale (windows + menus 12 px, Spotlight 20 px, glass panels 22–26 px, concentric menu-item radii); panel/menu fade-in tightened 0.35 s → 0.2 s; the tracked URUK OS wordmarks on the boot + login screens are optically centered |
| Finder drag-between-folders | ⚠️ Partial | Move exists via right-click **Move to…**; direct drag between folders is not implemented |

## Apps

| App | Status | Notes |
| --- | --- | --- |
| Uruk Files | ✅ Done | Sidebar, history, grid/list, search, context menus, Get Info, storage readout |
| Uruk Shell (`uruksh`) | ✅ Done | Real interpreter over the FS; `urukfetch` reports live system data |
| Scribe | ✅ Done | Ctrl+S writes back into the FS |
| Ukkin (Settings) | ✅ Done | Appearance, Wallpaper, System (weather city, idle timeout), Security (PIN), Backup (+ experimental Sync), About with live stats |
| Shamash Gallery | ✅ Done | Gallery over stored blobs, viewer, zoom, Set as Wallpaper |
| Shamash Eye | ✅ Done | Image zoom/rotate (+ save rotated copy), PDF viewing |
| Tablet (Notes) | ✅ Done | Notes are real `.txt` files; searchable contents via Spotlight |
| Abacus | ✅ Done | Hand-written precedence parser (no `eval()`), keyboard support, history tape |
| Nanna (Calendar) | ✅ Done | Events are a plain JSON file in the FS; reminders feed the notification engine |
| Lyre (Music) | ✅ Done | Real playback, shuffle/repeat, volume shared with Control Center, now-playing published to Notification Center |
| Ishtar Gate (browser) | ✅ Done | Tabs + history; pages load through the OS's same-origin proxy (`/api/proxy`) with URL rewriting, so framing-protected sites render in-app (suite: example.org + the Wikipedia "Uruk" article render inside it; the address bar tracks in-frame navigation). YouTube watch URLs become the nocookie embed. Proxy failures show an honest in-app state with "Open in real tab"; respects the Wi-Fi switch. Limits: no cookie forwarding (logins don't persist); JS-heavy web apps may not fully work through a rewriting proxy |
| Uruk Code | ✅ Done | CodeMirror editor, multi-tab, Ctrl+S. **Languages** (registry-driven, by extension or the tab-bar switcher): JavaScript, TypeScript, JSX/TSX, Python, HTML, CSS, JSON, Markdown, C, C++, Java, Rust, Go, PHP, SQL, XML, YAML, Shell; unknown = plain text. The suite asserts the real Lezer parse (Rust `FunctionItem`, C `FunctionDefinition` tokens). **Run, honestly tiered:** JS/TS in the sandboxed iframe with console capture; HTML preview; **Python on Pyodide** (real CPython/WASM, lazily loaded from the jsDelivr CDN, ~10 MB first run then browser-cached) with the file's folder bridged into its FS and `input()` fed from a stdin box — proven live in `qa/python-smoke.mjs`: `print(6*7)` → 42, `open("sibling.txt")` bridge read, sum-of-squares → 285, `input()` round-trip. **Stdin UX (v0.7.0):** the box is labeled "Program input (stdin)", carries the accent treatment + a teaching placeholder whenever the open file calls `input(`, and its text is remembered per file path in account-scoped storage; a program that asks for input with an empty box gets a guidance pause (notice in the output pane + focus + highlight pulse) instead of a raw EOFError traceback — a second Run press runs anyway, and `input()` calls that outnumber the typed lines keep the honest EOFError hint All other languages show an explicit "editing + highlighting only" note and NO Run button. New-file templates (Python/JS/HTML/C/Java/Rust/Go/SQL starters) write real files. Offline Python runs fail with an honest message, never fake output |
| Clepsydra | ✅ Done | World clock (Baghdad + Edmonton default; add/remove from a 13-city preset list, persisted per account), stopwatch with laps, timer that fires a real notification (banner + Notification Center entry, DND respected). Suite: lap recorded, 3-second timer lands in the Center |
| Adad | ✅ Done | Full weather on the shared Phase 3 data layer: current conditions, next 24 hours, 7-day forecast (Open-Meteo, no key); city search via Open-Meteo geocoding; default city from Ukkin, and picking a city updates the system city so the widget never disagrees. Suite: deterministic route-mocked fixtures assert rendered values (Baghdad 31°, hi/lo, 24 hours, 7 days; Edmonton search → 5°). Offline = cached reading marked as such, or an honest unavailable state |
| Two Rivers | ✅ Done | OpenStreetMap embed (export/embed.html) centered on Baghdad with a marker; Nominatim search (direct, CORS-enabled) → selecting a result re-centers the embed on the result's bounding box; "Open in real tab" fallback; honest offline state when the OS Wi-Fi switch is off. Suite: mocked Nominatim → embed `src` moves to the fixture bbox; live Nominatim verified in `qa/python-smoke.mjs` |
| Forge | ✅ Done | Tabbed utility suite, all local: JSON format/minify/validate (error line/column/position from a hand-written scanner), Base64 + URL codecs (UTF-8 safe), UUID generator (1/10, per-item + copy-all), SHA-256 via WebCrypto, color picker with HEX/RGB/HSL, regex tester (match count + highlighted matches), text counter (chars/words/lines). Suite: pretty-print, error position, Base64 round-trip, 10× UUID v4 shape, SHA-256("uruk") vs the reference digest, regex counts 3 highlighted matches |

## Editions

| Edition | Status | Notes |
| --- | --- | --- |
| Web (this repo) | ✅ Done | Live at https://uruk-os.vercel.app |
| Bootable ISO (Debian-based, URUK-branded, installable / VirtualBox) | ❌ Missing | The next phase; not started |

## Score

- Shell & system: 28 Done · 3 Partial · 0 Missing
- Apps: 16 Done · 0 Partial · 0 Missing
- Editions: 1 Done · 1 Missing (ISO is the next phase, by plan)
