import React, { useEffect, useMemo, useRef, useState } from "react";
import { APP_NAMES, useOS, type AppId } from "@/store/os";
import { useSystem } from "@/store/system";
import {
  childrenOf,
  homeFolder,
  readNodeText,
  TRASH_ID,
  useFS,
  type FSNode,
} from "@/lib/fs";
import { inTrash, openFileNode } from "@/lib/associations";
import { readEvents, type CalEvent } from "@/lib/events";
import { AppIcon, CalendarIcon, FileIcon, FolderIcon } from "./icons";
import { SearchGlyph } from "./glyphs";

/**
 * Spotlight — system-wide search (Phase 3).
 *
 * The index is computed live from the stores on every keystroke:
 * apps by name, every file/folder by name, the *contents* of text
 * files (notes included), and calendar events. Nothing is pre-built
 * or cached anywhere else.
 */

interface Result {
  key: string;
  kind: "app" | "file" | "event";
  title: string;
  subtitle: string;
  score: number;
  node?: FSNode;
  app?: AppId;
  event?: CalEvent;
  snippet?: string;
}

const ALL_APPS = Object.keys(APP_NAMES) as AppId[];

function scoreName(name: string, q: string, base: number): number {
  const n = name.toLowerCase();
  if (n === q) return base + 40;
  if (n.startsWith(q)) return base + 25;
  if (n.includes(q)) return base;
  return -1;
}

export default function Spotlight() {
  const panel = useSystem((s) => s.panel);
  const closePanels = useSystem((s) => s.closePanels);
  const openApp = useOS((s) => s.openApp);
  const nodes = useFS((s) => s.nodes);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [textCache, setTextCache] = useState<Map<string, string>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const open = panel === "spotlight";

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open ]);

  /* Lazily resolve the text of every small text-like file so content
     search covers notes stored as blobs as well as inline text. */
  useEffect(() => {
    if (!open) return;
    let live = true;
    const candidates = Object.values(nodes).filter(
      (n) =>
        n.type === "file" &&
        n.size < 200_000 &&
        (typeof n.text === "string" || (n.blob && n.mime.startsWith("text/"))) &&
        !inTrash(nodes, n),
    );
    void (async () => {
      const map = new Map<string, string>();
      for (const n of candidates) {
        const t = typeof n.text === "string" ? n.text : await readNodeText(n);
        if (t) map.set(n.id, t);
      }
      if (live) setTextCache(map);
    })();
    return () => {
      live = false;
    };
  }, [open, nodes ]);

  const notesFolderId = useMemo(() => homeFolder(nodes, "Notes")?.id, [nodes]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Result[] = [];

    if (!q) {
      for (const app of ALL_APPS) {
        out.push({
          key: `app-${app}`,
          kind: "app",
          title: APP_NAMES[app],
          subtitle: "Application",
          score: 1,
          app,
        });
      }
      const recent = Object.values(nodes)
        .filter((n) => n.type === "file" && n.id !== TRASH_ID && !inTrash(nodes, n))
        .sort((a, b) => b.modifiedAt - a.modifiedAt)
        .slice(0, 6);
      for (const n of recent) {
        out.push({
          key: `recent-${n.id}`,
          kind: "file",
          title: n.name,
          subtitle: "Recent file",
          score: 0,
          node: n,
        });
      }
      return out;
    }

    for (const app of ALL_APPS) {
      const s = scoreName(APP_NAMES[app], q, 80);
      if (s > 0) out.push({ key: `app-${app}`, kind: "app", title: APP_NAMES[app], subtitle: "Application", score: s, app });
    }

    for (const n of Object.values(nodes)) {
      if (n.parentId === null || inTrash(nodes, n)) continue;
      const s = scoreName(n.name, q, 70);
      if (s > 0) {
        out.push({
          key: `file-${n.id}`,
          kind: "file",
          title: n.name,
          subtitle: n.type === "folder" ? "Folder" : "File",
          score: s,
          node: n,
        });
        continue;
      }
      // Content match (notes and other text files)
      const text = textCache.get(n.id);
      if (text) {
        const idx = text.toLowerCase().indexOf(q);
        if (idx >= 0) {
          const start = Math.max(0, idx - 24);
          const snippet = (start > 0 ? "…" : "") + text.slice(start, idx + q.length + 32).replace(/\s+/g, " ").trim();
          out.push({
            key: `content-${n.id}`,
            kind: "file",
            title: n.name,
            subtitle: n.parentId === notesFolderId ? "Note — text matches" : "Text matches",
            score: 40,
            node: n,
            snippet,
          });
        }
      }
    }

    for (const e of readEvents(nodes)) {
      const s = scoreName(e.title, q, 60);
      if (s > 0 || e.notes.toLowerCase().includes(q)) {
        out.push({
          key: `event-${e.id}`,
          kind: "event",
          title: e.title,
          subtitle: `Calendar · ${e.date}${e.time ? ` · ${e.time}` : ""}`,
          score: Math.max(s, 45),
          event: e,
        });
      }
    }

    return out.sort((a, b) => b.score - a.score).slice(0, 12);
  }, [query, nodes, textCache, notesFolderId]);

  useEffect(() => setActive(0), [query]);

  const run = (r: Result | undefined) => {
    if (!r) return;
    closePanels();
    if (r.kind === "app" && r.app) openApp(r.app);
    else if (r.kind === "event" && r.event) openApp("calendar", { date: r.event.date });
    else if (r.kind === "file" && r.node) {
      const res = openFileNode(r.node);
      if (res === "info") {
        openApp("finder", { folderId: r.node.parentId ?? undefined });
      }
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanels();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        run(results[active]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results, active]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const iconFor = (r: Result) => {
    if (r.kind === "app" && r.app) return <AppIcon app={r.app} size={30} />;
    if (r.kind === "event") return <CalendarIcon size={30} />;
    if (r.node?.type === "folder") return <FolderIcon size={30} />;
    return <FileIcon size={30} image={r.node?.mime.startsWith("image/")} />;
  };

  return (
    <div
      className="fixed inset-0 z-[9650] flex items-start justify-center pt-[16vh]"
      data-testid="spotlight"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closePanels();
      }}
    >
      <div className="fade-in w-[min(620px,92vw)] overflow-hidden rounded-2xl bg-white/75 shadow-[0_24px_80px_rgba(0,0,0,0.5)] ring-1 ring-black/15 backdrop-blur-3xl dark:bg-neutral-800/80 dark:ring-white/15">
        <div className="flex items-center gap-3 px-4 py-3">
          <SearchGlyph size={22} className="shrink-0 text-neutral-500 dark:text-neutral-300" />
          <input
            ref={inputRef}
            data-testid="spotlight-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Spotlight Search"
            className="min-w-0 flex-1 bg-transparent text-[19px] text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-50"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query && (
            <button
              className="rounded-full bg-black/10 px-1.5 text-[13px] text-neutral-600 dark:bg-white/15 dark:text-neutral-200"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        <div ref={listRef} className="uruk-scroll max-h-[46vh] overflow-y-auto border-t border-black/5 p-1.5 dark:border-white/10">
          {results.length === 0 && (
            <div className="px-3 py-6 text-center text-[13.5px] text-neutral-500 dark:text-neutral-400" data-testid="spotlight-empty">
              No results for “{query}”
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={r.key}
              data-idx={i}
              data-testid={`spotlight-result-${r.title}`}
              className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-[7px] text-left ${
                i === active ? "bg-[var(--accent)] text-white" : "text-neutral-800 dark:text-neutral-100"
              }`}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(r)}
            >
              <span className="shrink-0">{iconFor(r)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium leading-5">{r.title}</span>
                <span className={`block truncate text-[12px] leading-4 ${i === active ? "text-white/80" : "text-neutral-500 dark:text-neutral-400"}`}>
                  {r.snippet ?? r.subtitle}
                </span>
              </span>
              <span className={`shrink-0 text-[11px] uppercase tracking-wide ${i === active ? "text-white/70" : "text-neutral-400"}`}>
                {r.kind}
              </span>
            </button>
          ))}
        </div>
        {!query && (
          <div className="border-t border-black/5 px-4 py-2 text-[11.5px] text-neutral-500 dark:border-white/10 dark:text-neutral-400">
            Search apps, files, note text, and calendar events — ↑ ↓ to navigate, Enter to open.
          </div>
        )}
      </div>
    </div>
  );
}
