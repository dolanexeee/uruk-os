import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  childrenOf,
  ensureHomeFolder,
  readNodeText,
  useFS,
} from "@/lib/fs";
import { useOS, type WinState } from "@/store/os";

/**
 * Calendar — events live in a real file, `Calendar/events.json`, inside
 * the file system. You can `cat Calendar/events.json` in Terminal and
 * see exactly what the app stores; there is no hidden database.
 */

export interface CalEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM ("" = all day)
  notes: string;
}

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function Calendar({ win }: { win: WinState }) {
  const nodes = useFS((s) => s.nodes);
  const fs = useFS.getState;
  const os = useOS();
  const focused = os.focusedId === win.id;

  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(ymd(today));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const fileIdRef = useRef<string | null>(null);

  // form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fTitle, setFTitle] = useState("");
  const [fTime, setFTime] = useState("09:00");
  const [fNotes, setFNotes] = useState("");

  useEffect(() => {
    os.setWindowTitle(win.id, "Nanna");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.id]);

  /* deep-link: Spotlight / widgets can ask Calendar to show a date */
  useEffect(() => {
    const d = win.props.date;
    if (!d) return;
    const dt = new Date(`${d}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return;
    setViewYear(dt.getFullYear());
    setViewMonth(dt.getMonth());
    setSelectedDate(d);
  }, [win.props.date]);

  /* load events.json (creating the folder/file on first use) */
  useEffect(() => {
    let live = true;
    void (async () => {
      const folder = await ensureHomeFolder("Calendar");
      const file = childrenOf(fs().nodes, folder.id).find((n) => n.name === "events.json");
      if (file) {
        fileIdRef.current = file.id;
        const text = await readNodeText(file);
        try {
          const parsed = JSON.parse(text) as CalEvent[];
          if (Array.isArray(parsed) && live) setEvents(parsed);
        } catch {
          if (live) setEvents([]);
        }
      } else {
        const created = await fs().createFile(folder.id, "events.json", {
          text: "[]",
          mime: "application/json",
        });
        fileIdRef.current = created.id;
      }
      if (live) setLoaded(true);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = async (next: CalEvent[]) => {
    setEvents(next);
    if (fileIdRef.current) {
      await fs().writeText(fileIdRef.current, JSON.stringify(next, null, 2));
    }
  };

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [events]);

  /* month grid cells */
  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();
    const out: { date: string; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      if (i < startDay) {
        const d = new Date(viewYear, viewMonth - 1, daysInPrev - startDay + 1 + i);
        out.push({ date: ymd(d), day: d.getDate(), inMonth: false });
      } else if (i - startDay < daysInMonth) {
        const d = new Date(viewYear, viewMonth, i - startDay + 1);
        out.push({ date: ymd(d), day: d.getDate(), inMonth: true });
      } else {
        const d = new Date(viewYear, viewMonth + 1, i - startDay - daysInMonth + 1);
        out.push({ date: ymd(d), day: d.getDate(), inMonth: false });
      }
    }
    return out;
  }, [viewYear, viewMonth]);

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const jumpToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(ymd(today));
  };

  const resetForm = () => {
    setEditingId(null);
    setFTitle("");
    setFTime("09:00");
    setFNotes("");
  };

  const saveEvent = async () => {
    const title = fTitle.trim();
    if (!title) return;
    if (editingId) {
      await persist(
        events.map((e) =>
          e.id === editingId ? { ...e, title, time: fTime, notes: fNotes } : e,
        ),
      );
    } else {
      await persist([
        ...events,
        { id: uid(), title, date: selectedDate, time: fTime, notes: fNotes },
      ]);
    }
    resetForm();
  };

  const deleteEvent = async (id: string) => {
    await persist(events.filter((e) => e.id !== id));
    if (editingId === id) resetForm();
  };

  const startEdit = (e: CalEvent) => {
    setEditingId(e.id);
    setFTitle(e.title);
    setFTime(e.time || "09:00");
    setFNotes(e.notes);
  };

  useEffect(() => {
    if (!focused) return;
    os.setFileMenuItems([
      { label: "Today", action: jumpToday },
      { label: "Previous Month", action: () => shiftMonth(-1) },
      { label: "Next Month", action: () => shiftMonth(1) },
    ]);
    return () => os.setFileMenuItems(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, viewYear, viewMonth]);

  const dayEvents = eventsByDate.get(selectedDate) ?? [];
  const todayStr = ymd(today);
  const selectedLabel = new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex min-h-0 flex-1 text-neutral-800 dark:text-neutral-100" data-testid="calendar">
      {/* month grid */}
      <div className="flex min-w-0 flex-1 flex-col bg-white dark:bg-neutral-900">
        <div className="flex items-center gap-2 border-b border-black/10 px-4 py-2.5 dark:border-white/10">
          <div className="text-[19px] font-bold" data-testid="calendar-month-label">
            {MONTHS[viewMonth]} <span className="font-light text-neutral-500">{viewYear}</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              data-testid="calendar-today"
              className="rounded-md border border-black/10 px-2.5 py-1 text-[13px] dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
              onClick={jumpToday}
            >
              Today
            </button>
            <button
              data-testid="calendar-prev"
              className="rounded-md px-2 py-1 text-lg leading-none hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => shiftMonth(-1)}
            >
              ‹
            </button>
            <button
              data-testid="calendar-next"
              className="rounded-md px-2 py-1 text-lg leading-none hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => shiftMonth(1)}
            >
              ›
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 px-2 pt-2 text-center text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="uruk-scroll grid min-h-0 flex-1 grid-cols-7 gap-[3px] overflow-y-auto p-2">
          {cells.map((c) => {
            const evs = eventsByDate.get(c.date) ?? [];
            const isToday = c.date === todayStr;
            const isSel = c.date === selectedDate;
            return (
              <button
                key={c.date}
                data-testid={`calendar-day-${c.date}`}
                onClick={() => {
                  setSelectedDate(c.date);
                  resetForm();
                  const d = new Date(c.date + "T12:00:00");
                  if (d.getMonth() !== viewMonth || d.getFullYear() !== viewYear) {
                    setViewYear(d.getFullYear());
                    setViewMonth(d.getMonth());
                  }
                }}
                className={`flex min-h-[64px] flex-col items-start rounded-lg p-1.5 text-left align-top ${
                  isSel
                    ? "bg-[var(--accent)]/12 ring-1 ring-[var(--accent)]"
                    : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                } ${c.inMonth ? "" : "opacity-40"}`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] ${
                    isToday ? "bg-[#e0342b] font-bold text-white" : "font-medium"
                  }`}
                >
                  {c.day}
                </span>
                <span className="mt-0.5 w-full space-y-[2px]">
                  {evs.slice(0, 2).map((e) => (
                    <span
                      key={e.id}
                      className="block truncate rounded bg-[var(--accent)]/85 px-1 text-[10.5px] leading-[15px] text-white"
                    >
                      {e.time ? `${e.time} ` : ""}
                      {e.title}
                    </span>
                  ))}
                  {evs.length > 2 && (
                    <span className="block px-1 text-[10px] text-neutral-400">+{evs.length - 2} more</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {!loaded && (
          <div className="border-t border-black/10 px-4 py-1 text-[12px] text-neutral-400 dark:border-white/10">
            Loading events from Calendar/events.json…
          </div>
        )}
      </div>

      {/* day panel */}
      <div className="flex w-64 shrink-0 flex-col border-l border-black/10 bg-neutral-100 dark:border-white/10 dark:bg-neutral-800/70">
        <div className="border-b border-black/10 px-3 py-2.5 dark:border-white/10">
          <div className="text-[14px] font-semibold" data-testid="calendar-selected-label">
            {selectedLabel}
          </div>
          <div className="text-[12px] text-neutral-500 dark:text-neutral-400">
            {dayEvents.length} event{dayEvents.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="uruk-scroll min-h-0 flex-1 overflow-y-auto p-2.5">
          {dayEvents.length === 0 && (
            <div className="px-1 py-3 text-[12.5px] text-neutral-400">No events this day.</div>
          )}
          {dayEvents.map((e) => (
            <div
              key={e.id}
              data-testid="calendar-event"
              className="mb-2 rounded-lg bg-white p-2.5 shadow-sm ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold">{e.title}</div>
                  <div className="text-[12px] text-neutral-500 dark:text-neutral-400">
                    {e.time || "All day"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    className="rounded px-1.5 py-0.5 text-[12px] hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={() => startEdit(e)}
                  >
                    Edit
                  </button>
                  <button
                    data-testid="calendar-event-delete"
                    className="rounded px-1.5 py-0.5 text-[12px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                    onClick={() => void deleteEvent(e.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {e.notes && (
                <div className="mt-1 whitespace-pre-wrap text-[12.5px] text-neutral-600 dark:text-neutral-300">
                  {e.notes}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* add / edit form */}
        <div className="border-t border-black/10 p-3 dark:border-white/10">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {editingId ? "Edit event" : "New event"}
          </div>
          <input
            data-testid="calendar-event-title"
            value={fTitle}
            onChange={(e) => setFTitle(e.target.value)}
            placeholder="Title"
            className="mb-2 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-[var(--accent)] dark:border-white/10 dark:bg-neutral-900"
            onKeyDown={(e) => e.key === "Enter" && void saveEvent()}
          />
          <input
            data-testid="calendar-event-time"
            type="time"
            value={fTime}
            onChange={(e) => setFTime(e.target.value)}
            className="mb-2 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-[var(--accent)] dark:border-white/10 dark:bg-neutral-900"
          />
          <textarea
            data-testid="calendar-event-notes"
            value={fNotes}
            onChange={(e) => setFNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="mb-2 w-full resize-none rounded-md border border-black/10 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-[var(--accent)] dark:border-white/10 dark:bg-neutral-900"
          />
          <div className="flex gap-2">
            <button
              data-testid="calendar-event-save"
              disabled={!fTitle.trim()}
              className="flex-1 rounded-md bg-[var(--accent)] py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
              onClick={() => void saveEvent()}
            >
              {editingId ? "Save changes" : "Add event"}
            </button>
            {editingId && (
              <button
                className="rounded-md border border-black/10 px-2.5 py-1.5 text-[13px] dark:border-white/15"
                onClick={resetForm}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
