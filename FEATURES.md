# URUK OS — Feature Checklist

An honest, evidence-based inventory of the whole system, scored the same way
as Uruk Cut's PARITY.md. **Done** means it works and is covered by the
automated suite (`qa/run-tests.mjs`, 100/100 checks) or was verified by hand
against the running system. **Partial** means it exists but with a stated
gap. **Missing** means not built. Nothing is claimed without evidence.

_Last updated: v0.3.0 (Phase 3)._

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
| Multiple user accounts | ❌ Missing | Single local user by design |
| Finder drag-between-folders | ⚠️ Partial | Move exists via right-click **Move to…**; direct drag between folders is not implemented |

## Apps

| App | Status | Notes |
| --- | --- | --- |
| Finder | ✅ Done | Sidebar, history, grid/list, search, context menus, Get Info, storage readout |
| Terminal (`uruksh`) | ✅ Done | Real interpreter over the FS; `urukfetch` reports live system data |
| Editor | ✅ Done | Ctrl+S writes back into the FS |
| Settings | ✅ Done | Appearance, Wallpaper, System (weather city, idle timeout), Security (PIN), Backup (+ experimental Sync), About with live stats |
| Photos | ✅ Done | Gallery over stored blobs, viewer, zoom, Set as Wallpaper |
| Preview | ✅ Done | Image zoom/rotate (+ save rotated copy), PDF viewing |
| Notes | ✅ Done | Notes are real `.txt` files; searchable contents via Spotlight |
| Calculator | ✅ Done | Hand-written precedence parser (no `eval()`), keyboard support, history tape |
| Calendar | ✅ Done | Events are a plain JSON file in the FS; reminders feed the notification engine |
| Music | ✅ Done | Real playback, shuffle/repeat, volume shared with Control Center, now-playing published to Notification Center |
| URUK Browser | ✅ Done | Tabs + history; sites that refuse embedding get an honest explanation, never a fake page; respects the Wi-Fi switch |
| Uruk Code | ✅ Done | CodeMirror editor, multi-tab, real JavaScript execution in a sandboxed pane, HTML preview |

## Editions

| Edition | Status | Notes |
| --- | --- | --- |
| Web (this repo) | ✅ Done | Live at https://uruk-os.vercel.app |
| Bootable ISO (Debian-based, URUK-branded, installable / VirtualBox) | ❌ Missing | The next phase; not started |

## Score

- Shell & system: 24 Done · 3 Partial · 1 Missing
- Apps: 12 Done · 0 Partial · 0 Missing
- Editions: 1 Done · 1 Missing (ISO is the next phase, by plan)
