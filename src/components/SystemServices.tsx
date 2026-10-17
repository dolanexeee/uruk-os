import { useEffect, useRef } from "react";
import { useFS } from "@/lib/fs";
import { useSystem } from "@/store/system";
import { notify } from "@/store/notifications";
import { eventDateTime, readEvents, ymd } from "@/lib/events";

/**
 * Background system services (Phase 3) — mounted for the desktop
 * session:
 *  · the Spotlight hotkey (⌘K / Ctrl+K),
 *  · the calendar reminder engine (events starting within 15 minutes,
 *    checked on login, whenever events.json changes, and on a timer;
 *    each event fires exactly once),
 *  · the low-storage warning (browser estimate above 85%, once per
 *    browser session).
 */

const FIRED_KEY = "uruk-os-reminded-v1";

function loadFired(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveFired(s: Set<string>) {
  try {
    // Keep only today's keys so this cannot grow forever.
    const today = ymd(new Date());
    localStorage.setItem(
      FIRED_KEY,
      JSON.stringify([...s].filter((k) => k.includes(today))),
    );
  } catch {
    /* ignore */
  }
}

export default function SystemServices() {
  const nodes = useFS((s) => s.nodes);
  const fsLoaded = useFS((s) => s.loaded);
  const togglePanel = useSystem((s) => s.togglePanel);
  const storageWarned = useRef(false);

  /* Spotlight hotkey */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePanel("spotlight");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePanel]);

  /* Calendar reminders */
  useEffect(() => {
    if (!fsLoaded) return;
    const check = () => {
      const fired = loadFired();
      const now = Date.now();
      let changed = false;
      for (const e of readEvents(useFS.getState().nodes)) {
        if (!e.time) continue; // all-day events have no start minute to catch
        const dt = eventDateTime(e);
        if (!dt) continue;
        const diff = dt.getTime() - now;
        if (diff < -60_000 || diff > 15 * 60_000) continue;
        const key = `${e.id}@${e.date}`;
        if (fired.has(key)) continue;
        fired.add(key);
        changed = true;
        notify(
          "Calendar",
          `Upcoming: ${e.title}`,
          diff <= 60_000
            ? "Starting now."
            : `Starts at ${e.time} — in ${Math.max(1, Math.round(diff / 60_000))} minutes.`,
        );
      }
      if (changed) saveFired(fired);
    };
    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, [nodes, fsLoaded]);

  /* Low-storage warning — once per browser session */
  useEffect(() => {
    if (storageWarned.current) return;
    storageWarned.current = true;
    try {
      if (sessionStorage.getItem("uruk-os-storage-warned")) return;
    } catch {
      /* ignore */
    }
    if (!navigator.storage?.estimate) return;
    void navigator.storage.estimate().then((e) => {
      const usage = e.usage ?? 0;
      const quota = e.quota ?? 0;
      if (quota > 0 && usage / quota > 0.85) {
        try {
          sessionStorage.setItem("uruk-os-storage-warned", "1");
        } catch {
          /* ignore */
        }
        notify(
          "System",
          "Storage almost full",
          `This origin is using ${Math.round((usage / quota) * 100)}% of its available storage. Export a backup from Settings → Backup.`,
        );
      }
    });
  }, []);

  return null;
}
