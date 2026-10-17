import React, { useCallback, useEffect, useRef, useState } from "react";
import { ROOT_ID, readNodeText, useFS } from "@/lib/fs";
import { useOS, type WinState } from "@/store/os";
import {
  MAX_BUFFER_CHARS,
  loadSessionSection,
  saveSessionSection,
} from "@/lib/sessionState";

export default function Editor({ win }: { win: WinState }) {
  const nodes = useFS((s) => s.nodes);
  const fs = useFS.getState;
  const os = useOS();
  const focused = os.focusedId === win.id;

  const [fileId, setFileId] = useState<string | null>(win.props.fileId ?? null);
  const [text, setText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState("Untitled.txt");
  const [newFolder, setNewFolder] = useState<string>("folder-documents");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const node = fileId ? nodes[fileId] : undefined;
  const dirty = loaded && text !== savedText;

  /* load file content */
  useEffect(() => {
    let live = true;
    if (!fileId) {
      setLoaded(true);
      return;
    }
    const n = fs().nodes[fileId];
    if (!n) {
      setLoaded(true);
      return;
    }
    void readNodeText(n).then((t) => {
      if (!live) return;
      // A mirrored unsaved draft (lib/sessionState) wins over the
      // disk copy — that is the whole point of mirroring it.
      const draft = loadSessionSection("editorDrafts")?.[fileId];
      if (draft !== undefined && draft !== t) {
        setText(draft);
        setSavedText(t);
      } else {
        setText(t);
        setSavedText(t);
      }
      setLoaded(true);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  /* mirror unsaved text per file so it survives a reload */
  useEffect(() => {
    if (!fileId || !loaded) return;
    const t = setTimeout(() => {
      const drafts = { ...(loadSessionSection("editorDrafts") ?? {}) };
      if (text !== savedText && text.length <= MAX_BUFFER_CHARS) {
        drafts[fileId] = text;
      } else {
        delete drafts[fileId];
      }
      saveSessionSection(
        "editorDrafts",
        Object.keys(drafts).length ? drafts : undefined,
      );
    }, 250);
    return () => clearTimeout(t);
  }, [fileId, text, savedText, loaded]);

  /* window title with dirty dot */
  useEffect(() => {
    if (node) os.setWindowTitle(win.id, `${dirty ? "● " : ""}${node.name}`);
    else os.setWindowTitle(win.id, "Scribe");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.name, dirty, win.id]);

  const save = useCallback(async () => {
    if (!fileId) return;
    await fs().writeText(fileId, text);
    setSavedText(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, text]);

  /* File-menu Save while focused */
  useEffect(() => {
    if (!focused) return;
    os.setFileMenuItems([
      { label: "Save", action: () => void save(), disabled: !fileId },
      {
        label: "New Document",
        action: () => os.openApp("editor"),
      },
    ]);
    return () => os.setFileMenuItems(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, save, fileId]);

  const createDocument = async () => {
    const name = newName.trim() || "Untitled.txt";
    const created = await fs().createFile(newFolder, name, { text: "", dedupe: true });
    setFileId(created.id);
    os.setWindowProps(win.id, { fileId: created.id });
    setText("");
    setSavedText("");
    setLoaded(true);
    setTimeout(() => areaRef.current?.focus(), 50);
  };

  if (!fileId) {
    const folders = Object.values(nodes).filter(
      (n) => n.parentId === ROOT_ID && n.type === "folder",
    );
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-white p-6 dark:bg-neutral-900">
        <div className="w-72 rounded-xl border border-black/10 p-4 dark:border-white/10" data-testid="editor-new-doc">
          <div className="mb-3 text-[15px] font-semibold text-neutral-800 dark:text-neutral-100">
            New Document
          </div>
          <label className="mb-1 block text-[12px] text-neutral-500 dark:text-neutral-400">Name</label>
          <input
            data-testid="editor-new-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="mb-3 w-full rounded-md border border-black/10 bg-neutral-50 px-2 py-1.5 text-[13px] text-neutral-900 outline-none focus:border-[var(--accent)] dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-100"
            onKeyDown={(e) => e.key === "Enter" && void createDocument()}
          />
          <label className="mb-1 block text-[12px] text-neutral-500 dark:text-neutral-400">Where</label>
          <select
            data-testid="editor-new-folder"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            className="mb-4 w-full rounded-md border border-black/10 bg-neutral-50 px-2 py-1.5 text-[13px] text-neutral-900 outline-none dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-100"
          >
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            data-testid="editor-create"
            className="w-full rounded-md bg-[var(--accent)] py-1.5 text-[13px] font-medium text-white"
            onClick={() => void createDocument()}
          >
            Create
          </button>
        </div>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-white text-[13px] text-neutral-500 dark:bg-neutral-900">
        This file no longer exists.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-neutral-900">
      <div className="flex items-center gap-2 border-b border-black/10 px-3 py-1.5 text-[12px] text-neutral-500 dark:border-white/10 dark:text-neutral-400">
        <span data-testid="editor-filename" className="font-medium text-neutral-700 dark:text-neutral-200">
          {node.name}
        </span>
        <span>{dirty ? "Edited" : "Saved"}</span>
        <button
          data-testid="editor-save"
          disabled={!dirty}
          className="ml-auto rounded bg-[var(--accent)] px-2 py-0.5 font-medium text-white disabled:opacity-40"
          onClick={() => void save()}
        >
          Save
        </button>
      </div>
      <textarea
        ref={areaRef}
        data-testid="editor-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            void save();
          }
        }}
        className="text-editable uruk-scroll min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-[13px] leading-relaxed text-neutral-900 outline-none dark:text-neutral-100"
        placeholder="Start typing…"
        spellCheck={false}
        autoFocus
      />
    </div>
  );
}
