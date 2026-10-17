import React, { useEffect, useRef, useState } from "react";
import { clockKeyFor, getActiveAccountId } from "@/lib/accounts";
import { notify } from "@/store/notifications";
import type { WinState } from "@/store/os";

/**
 * Clepsydra — the clock app (Phase 5).
 *
 * Named for the water clock, among the first timekeepers ever built.
 * World clock (Baghdad + Edmonton by default, more cities addable),
 * a stopwatch with laps, and a timer that reports through the OS
 * notification engine when it finishes — banners respect Do Not
 * Disturb, the Notification Center entry always lands.
 */

interface City {
  name: string;
  tz: string;
}

const PRESET_CITIES: City[] = [
  { name: "Baghdad", tz: "Asia/Baghdad" },
  { name: "Edmonton", tz: "America/Edmonton" },
  { name: "Cairo", tz: "Africa/Cairo" },
  { name: "Riyadh", tz: "Asia/Riyadh" },
  { name: "Dubai", tz: "Asia/Dubai" },
  { name: "Istanbul", tz: "Europe/Istanbul" },
  { name: "London", tz: "Europe/London" },
  { name: "Paris", tz: "Europe/Paris" },
  { name: "Toronto", tz: "America/Toronto" },
  { name: "New York", tz: "America/New_York" },
  { name: "Los Angeles", tz: "America/Los_Angeles" },
  { name: "Tokyo", tz: "Asia/Tokyo" },
  { name: "Sydney", tz: "Australia/Sydney" },
];

const DEFAULT_TZS = ["Asia/Baghdad", "America/Edmonton"];
const slug = (tz: string) => tz.replace(/[^a-z0-9]+/gi, "-");

function loadCities(): City[] {
  try {
    const raw = localStorage.getItem(clockKeyFor(getActiveAccountId()));
    if (raw) {
      const tzs = JSON.parse(raw) as string[];
      const cities = tzs
        .map((tz) => PRESET_CITIES.find((c) => c.tz === tz))
        .filter((c): c is City => !!c);
      if (cities.length) return cities;
    }
  } catch {
    /* ignore */
  }
  return PRESET_CITIES.filter((c) => DEFAULT_TZS.includes(c.tz));
}

function saveCities(cities: City[]) {
  try {
    localStorage.setItem(
      clockKeyFor(getActiveAccountId()),
      JSON.stringify(cities.map((c) => c.tz)),
    );
  } catch {
    /* ignore */
  }
}

function fmtClock(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

function fmtDay(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

function fmtStopwatch(ms: number): string {
  const t = Math.max(0, Math.floor(ms));
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const cs = Math.floor((t % 1000) / 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(m)}:${p(s)}.${p(cs)}`;
}

function fmtCountdown(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(m)}:${p(s)}`;
}

type Tab = "world" | "stopwatch" | "timer";

export default function Clock({ win }: { win: WinState }) {
  void win;
  const [tab, setTab] = useState<Tab>("world");
  const [now, setNow] = useState(() => new Date());
  const [cities, setCities] = useState<City[]>(loadCities);
  const [addTz, setAddTz] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 250);
    return () => clearInterval(t);
  }, []);

  /* ---------------------------- stopwatch ---------------------------- */
  const [swMs, setSwMs] = useState(0);
  const [swRunning, setSwRunning] = useState(false);
  const [laps, setLaps] = useState<{ n: number; lap: number; total: number }[]>([]);
  const swBaseRef = useRef(0); // ms banked before the current run segment
  const swStartRef = useRef(0); // Date.now() when the segment began

  useEffect(() => {
    if (!swRunning) return;
    const t = setInterval(() => {
      setSwMs(swBaseRef.current + (Date.now() - swStartRef.current));
    }, 31);
    return () => clearInterval(t);
  }, [swRunning]);

  const swToggle = () => {
    if (swRunning) {
      swBaseRef.current = swMs;
      setSwRunning(false);
    } else {
      swStartRef.current = Date.now();
      setSwRunning(true);
    }
  };
  const swLap = () => {
    const prevTotal = laps.length ? laps[laps.length - 1].total : 0;
    setLaps((l) => [...l, { n: l.length + 1, lap: swMs - prevTotal, total: swMs }]);
  };
  const swReset = () => {
    setSwRunning(false);
    swBaseRef.current = 0;
    setSwMs(0);
    setLaps([]);
  };

  /* ------------------------------ timer ------------------------------ */
  const [tMin, setTMin] = useState("5");
  const [tSec, setTSec] = useState("0");
  const [tLeft, setTLeft] = useState<number | null>(null); // ms remaining; null = not started
  const [tRunning, setTRunning] = useState(false);
  const [tDone, setTDone] = useState(false);
  const tEndRef = useRef(0);
  const tTotalRef = useRef(0);

  useEffect(() => {
    if (!tRunning) return;
    const t = setInterval(() => {
      const left = tEndRef.current - Date.now();
      if (left <= 0) {
        clearInterval(t);
        setTLeft(0);
        setTRunning(false);
        setTDone(true);
        notify(
          "Clepsydra",
          "Timer finished",
          `Your ${fmtCountdown(tTotalRef.current)} timer is done.`,
        );
      } else {
        setTLeft(left);
      }
    }, 120);
    return () => clearInterval(t);
  }, [tRunning]);

  const timerStart = () => {
    if (tLeft !== null && !tDone) {
      // resume
      tEndRef.current = Date.now() + tLeft;
      setTRunning(true);
      return;
    }
    const total =
      (Math.max(0, parseInt(tMin, 10) || 0) * 60 + Math.max(0, Math.min(59, parseInt(tSec, 10) || 0))) * 1000;
    if (total <= 0) return;
    tTotalRef.current = total;
    tEndRef.current = Date.now() + total;
    setTLeft(total);
    setTDone(false);
    setTRunning(true);
  };
  const timerPause = () => setTRunning(false);
  const timerReset = () => {
    setTRunning(false);
    setTLeft(null);
    setTDone(false);
  };

  const addable = PRESET_CITIES.filter((c) => !cities.some((x) => x.tz === c.tz));

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-neutral-900" data-testid="clock">
      {/* tabs */}
      <div className="flex items-center gap-1 border-b border-black/10 px-3 py-2 dark:border-white/10">
        {(
          [
            ["world", "World Clock"],
            ["stopwatch", "Stopwatch"],
            ["timer", "Timer"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            data-testid={`clock-tab-${id}`}
            onClick={() => setTab(id)}
            className={`rounded-full px-3 py-1 text-[13px] ${
              tab === id
                ? "bg-[var(--accent)] font-medium text-white"
                : "hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="uruk-scroll min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "world" && (
          <div>
            <div className="divide-y divide-black/5 dark:divide-white/5">
              {cities.map((c) => (
                <div
                  key={c.tz}
                  data-testid={`clock-city-${slug(c.tz)}`}
                  className="group flex items-baseline gap-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">{c.name}</div>
                    <div className="text-[12px] text-neutral-500 dark:text-neutral-400">
                      {fmtDay(now, c.tz)} · {c.tz.replace("_", " ")}
                    </div>
                  </div>
                  <div
                    data-testid={`clock-time-${slug(c.tz)}`}
                    className="font-mono text-[22px] tabular-nums"
                  >
                    {fmtClock(now, c.tz)}
                  </div>
                  <button
                    data-testid={`clock-remove-${slug(c.tz)}`}
                    aria-label={`Remove ${c.name}`}
                    onClick={() => {
                      const next = cities.filter((x) => x.tz !== c.tz);
                      setCities(next);
                      saveCities(next);
                    }}
                    className="rounded px-1.5 text-neutral-400 opacity-0 hover:bg-black/5 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-white/10"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            {addable.length > 0 && (
              <div className="mt-4 flex items-center gap-2">
                <select
                  data-testid="clock-add-select"
                  value={addTz}
                  onChange={(e) => setAddTz(e.target.value)}
                  className="rounded-md border border-black/10 bg-white px-2 py-1.5 text-[13px] outline-none dark:border-white/10 dark:bg-neutral-800"
                >
                  <option value="">Add a city…</option>
                  {addable.map((c) => (
                    <option key={c.tz} value={c.tz}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  data-testid="clock-add-btn"
                  disabled={!addTz}
                  onClick={() => {
                    const city = PRESET_CITIES.find((c) => c.tz === addTz);
                    if (!city) return;
                    const next = [...cities, city];
                    setCities(next);
                    saveCities(next);
                    setAddTz("");
                  }}
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "stopwatch" && (
          <div className="flex flex-col items-center pt-4">
            <div data-testid="sw-display" className="font-mono text-[44px] tabular-nums">
              {fmtStopwatch(swMs)}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                data-testid="sw-toggle"
                onClick={swToggle}
                className={`rounded-full px-5 py-1.5 text-[13.5px] font-medium text-white ${
                  swRunning ? "bg-red-500" : "bg-emerald-600"
                }`}
              >
                {swRunning ? "Stop" : swMs > 0 ? "Resume" : "Start"}
              </button>
              <button
                data-testid="sw-lap"
                disabled={swMs === 0}
                onClick={swLap}
                className="rounded-full bg-black/5 px-5 py-1.5 text-[13.5px] disabled:opacity-40 dark:bg-white/10"
              >
                Lap
              </button>
              <button
                data-testid="sw-reset"
                disabled={swMs === 0 && laps.length === 0}
                onClick={swReset}
                className="rounded-full bg-black/5 px-5 py-1.5 text-[13.5px] disabled:opacity-40 dark:bg-white/10"
              >
                Reset
              </button>
            </div>
            {laps.length > 0 && (
              <div data-testid="sw-laps" className="mt-5 w-full max-w-sm divide-y divide-black/5 dark:divide-white/5">
                {[...laps].reverse().map((l) => (
                  <div key={l.n} data-testid="sw-lap-item" className="flex justify-between py-1.5 font-mono text-[13px] tabular-nums">
                    <span className="text-neutral-500 dark:text-neutral-400">Lap {l.n}</span>
                    <span>+{fmtStopwatch(l.lap)}</span>
                    <span>{fmtStopwatch(l.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "timer" && (
          <div className="flex flex-col items-center pt-4">
            <div
              data-testid="timer-display"
              className={`font-mono text-[44px] tabular-nums ${tDone ? "text-emerald-500" : ""}`}
            >
              {tLeft !== null
                ? fmtCountdown(tLeft)
                : fmtCountdown(
                    (parseInt(tMin, 10) || 0) * 60000 + (parseInt(tSec, 10) || 0) * 1000,
                  )}
            </div>
            {tDone && (
              <div data-testid="timer-done" className="mt-1 text-[13.5px] font-medium text-emerald-500">
                Time&apos;s up — notification sent to the Notification Center.
              </div>
            )}
            <div className="mt-4 flex items-end gap-2">
              <label className="text-center">
                <span className="mb-0.5 block text-[11px] text-neutral-500">Minutes</span>
                <input
                  data-testid="timer-min"
                  type="number"
                  min={0}
                  max={999}
                  value={tMin}
                  disabled={tLeft !== null}
                  onChange={(e) => setTMin(e.target.value)}
                  className="w-20 rounded-md border border-black/10 bg-white px-2 py-1.5 text-center text-[15px] outline-none disabled:opacity-50 dark:border-white/10 dark:bg-neutral-800"
                />
              </label>
              <span className="pb-2 text-xl text-neutral-400">:</span>
              <label className="text-center">
                <span className="mb-0.5 block text-[11px] text-neutral-500">Seconds</span>
                <input
                  data-testid="timer-sec"
                  type="number"
                  min={0}
                  max={59}
                  value={tSec}
                  disabled={tLeft !== null}
                  onChange={(e) => setTSec(e.target.value)}
                  className="w-20 rounded-md border border-black/10 bg-white px-2 py-1.5 text-center text-[15px] outline-none disabled:opacity-50 dark:border-white/10 dark:bg-neutral-800"
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              {tRunning ? (
                <button
                  data-testid="timer-toggle"
                  onClick={timerPause}
                  className="rounded-full bg-red-500 px-5 py-1.5 text-[13.5px] font-medium text-white"
                >
                  Pause
                </button>
              ) : (
                <button
                  data-testid="timer-toggle"
                  onClick={timerStart}
                  className="rounded-full bg-emerald-600 px-5 py-1.5 text-[13.5px] font-medium text-white"
                >
                  {tLeft !== null && !tDone ? "Resume" : "Start"}
                </button>
              )}
              <button
                data-testid="timer-reset"
                disabled={tLeft === null}
                onClick={timerReset}
                className="rounded-full bg-black/5 px-5 py-1.5 text-[13.5px] disabled:opacity-40 dark:bg-white/10"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
