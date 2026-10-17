import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  childrenOf,
  ensureHomeFolder,
  readNodeText,
  useFS,
  type FSNode,
} from "@/lib/fs";
import { useOS, type WinState } from "@/store/os";

/**
 * Notes — every note is a real .txt file inside the `Notes` home folder,
 * so it shows up in Finder and Terminal like any other file. The sidebar
 * title is the note's first line, as in classic note apps.
 */

const NOTE_EXT = /\.(txt|md)$/i;

function titleOf(text: string, fallback: string): string {
  const first = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  return first ? first.slice(0, 60) : fallback;
}

function snippetOf(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.slice(1).join(" ").slice(0, 80) || "No additional text";
}

export default function Notes({ win }: { win: WinState }) {
  const nodes = useFS((s) => s.nodes);
  const fs = useFS.getState;
  const os = useOS();
  const focused = os.focusedId === win.id;

  const [folderId, setFolderId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ensure the Notes folder exists (first use) */
  useEffect(() => {
    let live = true;
    void ensureHomeFolder("Notes").then((f) => {
      if (live) setFolderId(f.id);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    os.setWindowTitle(win.id, "Notes");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.id]);

  const noteNodes = useMemo(() => {
    if (!folderId) return [];
    return childrenOf(nodes, folderId)
      .filter((n) => n.type === "file" && NOTE_EXT.test(n.name))
      .sort((a, b) => b.modifiedAt - a.modifiedAt);
  }, [nodes, folderId]);

  /* load text of notes we haven't drafted yet */
  useEffect(() => {
    let live = true;
    for (const n of noteNodes) {
      if (drafts[n.id] === undefined) {
        void readNodeText(n).then((t) => {
          if (!live) return;
          setDrafts((d) => (d[n.id] === undefined ? { ...d, [n.id]: t } : d));
        });
      }
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteNodes]);

  /* auto-select the most recent note */
  useEffect(() => {
    if (!selectedId && noteNodes.length) setSelectedId(noteNodes[0].id);
    if (selectedId && !noteNodes.some((n) => n.id === selectedId)) {
      setSelectedId(noteNodes[0]?.id ?? null);
    }
  }, [noteNodes, selectedId]);

  const selected: FSNode | undefined = selectedId ? nodes[selectedId] : undefined;
  const selectedText = selected ? (drafts[selected.id] ?? "") : "";

  const persist = (id: string, text: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fs().writeText(id, text);
    }, 450);
  };

  const onEdit = (text: string) => {
    if (!selected) return;
    setDrafts((d) => ({ ...d, [selected.id]: text }));
    persist(selected.id, text);
  };

  const newNote = async () => {
    if (!folderId) return;
    const created = await fs().createFile(folderId, "New Note.txt", {
      text: "",
      dedupe: true,
    });
    setDrafts((d) => ({ ...d, [created.id]: "" }));
    setSelectedId(created.id);
  };

  const deleteNote = async () => {
    if (!selected) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const id = selected.id;
    setSelectedId(null);
    await fs().trash(id);
  };

  const importNotes = async (files: File[]) => {
    if (!folderId || !files.length) return;
    await fs().importFiles(folderId, files);
  };

  useEffect(() => {
    if (!focused) return;
    os.setFileMenuItems([
      { label: "New Note", action: () => void newNote() },
      { label: "Import Notes…", action: () => fileInputRef.current?.click() },
      {
        label: "Delete Note",
        disabled: !selected,
        action: () => void deleteNote(),
      },
    ]);
    return () => os.setFileMenuItems(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, folderId, selected?.id]);

  const visible = noteNodes.filter((n) => {
    if (!query.trim()) return true;
    const t = (drafts[n.id] ?? "").toLowerCase();
    return t.includes(query.toLowerCase()) || n.name.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className="flex min-h-0 flex-1 text-neutral-800 dark:text-neutral-100" data-testid="notes">
      {/* sidebar */}
      <div className="flex w-60 shrink-0 flex-col border-r border-black/10 bg-neutral-200/60 dark:border-white/10 dark:bg-neutral-800/60">
        <div className="flex items-center gap-2 p-2">
          <input
            data-testid="notes-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes"
            className="min-w-0 flex-1 rounded-md border border-black/10 bg-white px-2 py-1 text-[13px] outline-none focus:border-[var(--accent)] dark:border-white/10 dark:bg-neutral-900"
          />
          <button
            data-testid="notes-new"
            className="shrink-0 rounded-md bg-[var(--accent)] px-2 py-1 text-[13px] font-medium text-white"
            onClick={() => void newNote()}
          >
            New
          </button>
        </div>
        <div className="uruk-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {visible.length === 0 && (
            <div className="px-2 pt-6 text-center text-[12.5px] leading-5 text-neutral-500 dark:text-neutral-400">
              {noteNodes.length === 0
                ? "No notes yet.\nNotes are plain-text files in your Notes folder — click New to start."
                : "No notes match your search."}
            </div>
          )}
          {visible.map((n) => {
            const text = drafts[n.id] ?? "";
            const active = n.id === selectedId;
            return (
              <button
                key={n.id}
                data-testid={`notes-item-${n.id}`}
                className={`mb-1 block w-full rounded-lg px-2.5 py-2 text-left ${
                  active
                    ? "bg-[var(--accent)] text-white"
                    : "hover:bg-black/5 dark:hover:bg-white/10"
                }`}
                onClick={() => setSelectedId(n.id)}
              >
                <div className="truncate text-[13.5px] font-semibold">
                  {titleOf(text, n.name.replace(NOTE_EXT, ""))}
                </div>
                <div
                  className={`truncate text-[12px] ${active ? "text-white/75" : "text-neutral-500 dark:text-neutral-400"}`}
                >
                  {new Date(n.modifiedAt).toLocaleDateString()} · {snippetOf(text)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* editor pane */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#fffdf5] dark:bg-neutral-900">
        {selected ? (
          <>
            <div className="flex items-center gap-2 border-b border-black/10 px-3 py-1.5 text-[12px] text-neutral-500 dark:border-white/10 dark:text-neutral-400">
              <span className="font-medium text-neutral-700 dark:text-neutral-200">{selected.name}</span>
              <span>in Notes folder · saved automatically</span>
              <button
                data-testid="notes-delete"
                className="ml-auto rounded border border-red-300 px-2 py-0.5 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
                onClick={() => void deleteNote()}
              >
                Delete
              </button>
            </div>
            <textarea
              data-testid="notes-editor"
              value={selectedText}
              onChange={(e) => onEdit(e.target.value)}
              className="text-editable uruk-scroll min-h-0 flex-1 resize-none bg-transparent p-4 text-[14px] leading-relaxed text-neutral-900 outline-none dark:text-neutral-100"
              placeholder="Start typing…"
              autoFocus
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-8 text-center text-[13px] leading-6 text-neutral-400">
            Select a note, or click New to write one.
            <br />
            Every note is a real file in the Notes folder of your file system.
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,text/plain"
        multiple
        className="hidden"
        data-testid="notes-file-input"
        onChange={(e) => {
          void importNotes(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
