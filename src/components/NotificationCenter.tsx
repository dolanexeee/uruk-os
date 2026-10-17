import React, { useEffect, useMemo, useRef, useState } from "react";
import { useOS } from "@/store/os";
import { useSystem } from "@/store/system";
import { useNotifications } from "@/store/notifications";
import { formatBytes, totalSize, useFS } from "@/lib/fs";
import { describeCode, useWeather } from "@/lib/weather";
import { PauseGlyph, PlayGlyph } from "./glyphs";

/**
 * Notification Center — Phase 3. Opened from the menu-bar clock.
 * Widgets (clock, mini calendar, weather, storage, now playing) sit
 * above the durable notification list. Everything shown is live data:
 * the weather comes from Open-Meteo or is honestly "unavailable", the
 * storage bar is the browser's own estimate, now-playing is the Music
 * app's real playback state.
 */

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function WidgetShell({
  children,
  testid,
}: {
  children: React.ReactNode;
  testid?: string;
}) {
  return (
    <div
      data-testid={testid}
      className="rounded-3xl bg-white/55 p-3.5 ring-1 ring-black/5 backdrop-blur-xl dark:bg-white/10 dark:ring-white/10"
    >
      {children}
    </div>
  );
}

export default function NotificationCenter() {
  const panel = useSystem((s) => s.panel);
  const sys = useSystem();
  const os = useOS();
  const items = useNotifications((s) => s.items);
  const clearAll = useNotifications((s) => s.clearAll);
  const nodes = useFS((s) => s.nodes);
  const weather = useWeather();
  const [now, setNow] = useState(() => new Date());
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const openState = panel === "notifCenter";

  useEffect(() => {
    if (!openState) return;
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 5000);
    if (navigator.storage?.estimate) {
      void navigator.storage.estimate().then((e) =>
        setEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 }),
      );
    }
    return () => clearInterval(t);
  }, [openState ]);

  useEffect(() => {
    if (!openState) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t)) return;
      if (t.closest("[data-panel-toggle]")) return;
      sys.closePanels();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") sys.closePanels();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openState ]);

  const cells = useMemo(() => {
    const y = now.getFullYear();
    const m = now.getMonth();
    const startDay = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < startDay; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(d);
    return out;
  }, [now]);

  if (!openState) return null;

  const storagePct =
    estimate && estimate.quota > 0
      ? Math.min(100, Math.round((estimate.usage / estimate.quota) * 100))
      : null;
  const np = sys.nowPlaying;

  return (
    <div
      ref={ref}
      data-testid="notification-center"
      className="fade-in fixed bottom-0 right-0 top-7 z-[9600] flex w-[348px] flex-col gap-2.5 overflow-y-auto p-2.5 uruk-scroll"
      style={{ background: "transparent" }}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-black/10 backdrop-blur-[2px]" />

      {/* clock + mini calendar */}
      <div className="grid grid-cols-2 gap-2.5">
        <WidgetShell testid="nc-clock-widget">
          <div className="text-[30px] font-bold leading-8 tracking-tight text-neutral-800 dark:text-neutral-50">
            {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/i, "")}
          </div>
          <div className="mt-0.5 text-[12.5px] font-medium text-[var(--accent)]">
            {now.toLocaleDateString("en-US", { weekday: "long" })}
          </div>
          <div className="text-[12.5px] text-neutral-500 dark:text-neutral-400">
            {now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </div>
        </WidgetShell>

        <WidgetShell testid="nc-calendar-widget">
          <button
            className="block w-full text-left"
            onClick={() => {
              sys.closePanels();
              os.openApp("calendar");
            }}
          >
            <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-[var(--accent)]">
              {MONTHS[now.getMonth()]} {now.getFullYear()}
            </div>
            <div className="grid grid-cols-7 gap-y-[3px] text-center text-[10.5px]">
              {WEEKDAYS.map((w, i) => (
                <div key={i} className="font-semibold text-neutral-400">{w}</div>
              ))}
              {cells.map((d, i) =>
                d === null ? (
                  <div key={i} />
                ) : (
                  <div
                    key={i}
                    className={`mx-auto flex h-[17px] w-[17px] items-center justify-center rounded-full ${
                      d === now.getDate()
                        ? "bg-[var(--accent)] font-bold text-white"
                        : "text-neutral-700 dark:text-neutral-200"
                    }`}
                  >
                    {d}
                  </div>
                ),
              )}
            </div>
          </button>
        </WidgetShell>
      </div>

      {/* weather + storage */}
      <div className="grid grid-cols-2 gap-2.5">
        <WidgetShell testid="nc-weather">
          <div className="text-[11.5px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Weather
          </div>
          {weather.status === "ok" ? (
            <>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-[22px] leading-6">{describeCode(weather.reading.code).glyph}</span>
                <span className="text-[24px] font-bold leading-6 text-neutral-800 dark:text-neutral-50">
                  {weather.reading.tempC}°
                </span>
              </div>
              <div className="truncate text-[12.5px] font-medium text-neutral-700 dark:text-neutral-200">
                {weather.reading.city}
              </div>
              <div className="text-[11.5px] text-neutral-500 dark:text-neutral-400">
                {describeCode(weather.reading.code).label} · H {weather.reading.hiC}° L {weather.reading.loC}°
                {weather.reading.cached ? " · saved reading" : ""}
              </div>
            </>
          ) : (
            <div className="mt-1 text-[12.5px] leading-5 text-neutral-500 dark:text-neutral-400">
              {weather.status === "loading" ? "Fetching…" : `Unavailable — ${weather.reason}.`}
            </div>
          )}
        </WidgetShell>

        <WidgetShell testid="nc-storage">
          <div className="text-[11.5px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Storage
          </div>
          <div className="mt-1 text-[15px] font-bold leading-5 text-neutral-800 dark:text-neutral-50">
            {formatBytes(totalSize(nodes))}
          </div>
          <div className="text-[11.5px] text-neutral-500 dark:text-neutral-400">
            in URUK files
          </div>
          {storagePct !== null && estimate && (
            <>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${Math.max(2, storagePct)}%` }}
                />
              </div>
              <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                {formatBytes(estimate.usage)} of {formatBytes(estimate.quota)} on this origin
              </div>
            </>
          )}
        </WidgetShell>
      </div>

      {/* now playing */}
      {np && (
        <WidgetShell testid="nc-now-playing">
          <div className="flex items-center gap-3">
            <button
              data-testid="nc-playpause"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white"
              onClick={() => sys.togglePlayback()}
              aria-label={np.playing ? "Pause" : "Play"}
            >
              {np.playing ? <PauseGlyph size={16} /> : <PlayGlyph size={16} />}
            </button>
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold text-neutral-800 dark:text-neutral-50">
                {np.title}
              </div>
              <div className="text-[11.5px] text-neutral-500 dark:text-neutral-400">
                {np.subtitle} · {np.playing ? "Playing" : "Paused"}
              </div>
            </div>
            <span className="ml-auto text-[18px]">🎵</span>
          </div>
        </WidgetShell>
      )}

      {/* notifications */}
      <div className="flex items-center justify-between px-1 pt-1">
        <div className="text-[15px] font-bold text-neutral-800 dark:text-neutral-50">
          Notification Center
        </div>
        {items.length > 0 && (
          <button
            data-testid="nc-clear"
            className="rounded-full bg-white/50 px-2.5 py-0.5 text-[12px] font-medium text-neutral-600 ring-1 ring-black/5 dark:bg-white/10 dark:text-neutral-300"
            onClick={clearAll}
          >
            Clear all
          </button>
        )}
      </div>
      {items.length === 0 && (
        <div className="px-1 pb-4 text-[13px] text-neutral-500 dark:text-neutral-400" data-testid="nc-empty">
          No notifications.
        </div>
      )}
      <div className="flex flex-col gap-2 pb-3">
        {items.map((n) => (
          <div
            key={n.id}
            data-testid="nc-item"
            className="rounded-3xl bg-white/55 p-3 ring-1 ring-black/5 backdrop-blur-xl dark:bg-white/10 dark:ring-white/10"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {n.source}
              </span>
              <span className="shrink-0 text-[11px] text-neutral-400">{timeAgo(n.ts)}</span>
            </div>
            <div className="mt-0.5 text-[13.5px] font-semibold text-neutral-800 dark:text-neutral-50">
              {n.title}
            </div>
            <div className="text-[12.5px] leading-5 text-neutral-600 dark:text-neutral-300">
              {n.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
