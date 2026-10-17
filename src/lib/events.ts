import { childrenOf, homeFolder, type NodeMap } from "./fs";

/**
 * Shared reader for calendar events. The Calendar app owns the data —
 * a plain JSON file at `Calendar/events.json` in the file system — and
 * Spotlight, the reminder engine, and widgets all read it through here
 * so there is exactly one interpretation of the format.
 */

export interface CalEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM ("" = all day)
  notes: string;
}

export function readEvents(nodes: NodeMap): CalEvent[] {
  const folder = homeFolder(nodes, "Calendar");
  if (!folder) return [];
  const file = childrenOf(nodes, folder.id).find((n) => n.name === "events.json");
  if (!file || typeof file.text !== "string") return [];
  try {
    const parsed = JSON.parse(file.text) as CalEvent[];
    return Array.isArray(parsed) ? parsed.filter((e) => e && e.title && e.date) : [];
  } catch {
    return [];
  }
}

/** Local Date for an event, or null when the date/time is unparseable. */
export function eventDateTime(e: CalEvent): Date | null {
  const d = new Date(`${e.date}T${e.time || "00:00"}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
