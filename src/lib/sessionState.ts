/**
 * Per-account app-session persistence (v0.7.1) — defense in depth.
 *
 * The lock screen is an overlay: locking never unmounts the desktop,
 * so a live session survives lock → unlock exactly. This module is
 * the second layer: the user-authored state apps used to keep only in
 * component memory — Shell scrollback + history + cwd, Uruk Code's
 * open tabs and unsaved buffers, Scribe's unsaved drafts, Tablet's
 * note drafts — is mirrored into account-scoped local storage, so it
 * also survives a full page reload. Everything is bounded: scrollback
 * keeps the last 400 lines, buffers/drafts over 512 KB are not
 * mirrored, and at most 8 terminal sessions are remembered.
 */

import { getActiveAccountId, sessionKeyFor } from "./accounts";

export interface TerminalSessionState {
  lines: { text: string; kind: "in" | "out" | "err" }[];
  history: string[];
  cwdId: string;
}

export interface CodeSessionState {
  openIds: string[];
  activeId: string | null;
  /** Unsaved buffer text per file id — only files whose editor buffer
   * differs from what is saved in the file system. */
  buffers: Record<string, string>;
  langOverride: Record<string, string>;
}

export interface NotesSessionState {
  selectedId: string | null;
  drafts: Record<string, string>;
}

interface SessionBlob {
  terminalSlots?: { key: string; state: TerminalSessionState }[];
  code?: CodeSessionState;
  /** Scribe: unsaved text per file id. */
  editorDrafts?: Record<string, string>;
  notes?: NotesSessionState;
}

export const MAX_BUFFER_CHARS = 512 * 1024;
const MAX_TERMINAL_LINES = 400;
const MAX_LINE_CHARS = 4000;
const MAX_TERMINAL_SLOTS = 8;

function loadBlob(): SessionBlob {
  try {
    const raw = localStorage.getItem(sessionKeyFor(getActiveAccountId()));
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") return parsed as SessionBlob;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function saveBlob(blob: SessionBlob): void {
  try {
    localStorage.setItem(
      sessionKeyFor(getActiveAccountId()),
      JSON.stringify(blob),
    );
  } catch {
    /* storage full/blocked — the live session is unaffected */
  }
}

export function loadSessionSection<K extends keyof SessionBlob>(
  key: K,
): SessionBlob[K] | undefined {
  return loadBlob()[key];
}

export function saveSessionSection<K extends keyof SessionBlob>(
  key: K,
  value: SessionBlob[K] | undefined,
): void {
  const blob = loadBlob();
  if (value === undefined) delete blob[key];
  else blob[key] = value;
  saveBlob(blob);
}

/* ------------------------------------------------------------------ */
/* Terminal slots                                                      */
/*                                                                     */
/* Each live Shell window claims one slot. The slot's saved state is   */
/* written continuously; when a window unmounts, its slot is removed   */
/* only if the window itself is gone (closed, logged out) — a mere    */
/* remount (minimize/restore) keeps it, and the next Shell window to  */
/* open claims the first unclaimed slot. That is how scrollback,       */
/* history, and cwd come back after a full page reload even though     */
/* window ids are not stable across reloads.                           */
/* ------------------------------------------------------------------ */

const claimedTerminalKeys = new Set<string>();

export function claimTerminalSlot(): {
  key: string;
  state: TerminalSessionState | null;
} {
  const slots = loadBlob().terminalSlots ?? [];
  for (const s of slots) {
    if (!claimedTerminalKeys.has(s.key)) {
      claimedTerminalKeys.add(s.key);
      return { key: s.key, state: s.state };
    }
  }
  const key =
    "term-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  claimedTerminalKeys.add(key);
  return { key, state: null };
}

export function saveTerminalSlot(
  key: string,
  state: TerminalSessionState,
): void {
  const blob = loadBlob();
  const slots = blob.terminalSlots ?? [];
  const capped: TerminalSessionState = {
    lines: state.lines
      .slice(-MAX_TERMINAL_LINES)
      .map((l) => ({
        kind: l.kind,
        text:
          l.text.length > MAX_LINE_CHARS
            ? l.text.slice(0, MAX_LINE_CHARS)
            : l.text,
      })),
    history: state.history.slice(0, 100),
    cwdId: state.cwdId,
  };
  const idx = slots.findIndex((s) => s.key === key);
  if (idx >= 0) slots[idx] = { key, state: capped };
  else slots.push({ key, state: capped });
  blob.terminalSlots = slots.slice(-MAX_TERMINAL_SLOTS);
  saveBlob(blob);
}

export function releaseTerminalSlot(key: string, remove: boolean): void {
  claimedTerminalKeys.delete(key);
  if (!remove) return;
  const blob = loadBlob();
  blob.terminalSlots = (blob.terminalSlots ?? []).filter((s) => s.key !== key);
  saveBlob(blob);
}
