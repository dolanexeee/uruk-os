import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { Compartment, EditorState, Prec, type Extension } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  ROOT_ID,
  isTextLike,
  pathOf,
  readNodeText,
  useFS,
  type FSNode,
} from "@/lib/fs";
import { extOf } from "@/lib/associations";
import { useOS, type WinState } from "@/store/os";

/**
 * Uruk Code — a real code editor over the file system.
 * CodeMirror 6 with tabs, syntax highlighting for JS/TS/HTML/CSS/JSON/
 * Python/Markdown, Ctrl+S save, a sandboxed JavaScript runner whose
 * console output lands in the pane below, and an HTML preview pane.
 */

function languageFor(name: string): Extension {
  const ext = extOf(name);
  switch (ext) {
    case "js":
    case "jsx":
      return javascript({ jsx: true });
    case "ts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "html":
    case "htm":
      return html();
    case "css":
      return css();
    case "json":
      return json();
    case "py":
      return python();
    case "md":
      return markdown();
    default:
      return [];
  }
}

interface OutputEntry {
  type: "log" | "warn" | "error" | "info";
  text: string;
}

const LS_FONT = "uruk-code-font-size";

export default function Code({ win }: { win: WinState }) {
  const nodes = useFS((s) => s.nodes);
  const fs = useFS.getState;
  const os = useOS();
  const focused = os.focusedId === win.id;
  const appearance = os.appearance;

  const [openIds, setOpenIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [panel, setPanel] = useState<"none" | "output" | "preview">("none");
  const [output, setOutput] = useState<OutputEntry[]>([]);
  const [runStamp, setRunStamp] = useState<string>("");
  const [previewDoc, setPreviewDoc] = useState("");
  const [fontSize, setFontSize] = useState<number>(() => {
    try {
      return parseInt(localStorage.getItem(LS_FONT) ?? "13", 10) || 13;
    } catch {
      return 13;
    }
  });
  const [showOpenList, setShowOpenList] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("script.js");
  const [newFolder, setNewFolder] = useState<string>("folder-documents");

  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const statesRef = useRef<Map<string, EditorState>>(new Map());
  const savedRef = useRef<Map<string, string>>(new Map());
  const activeRef = useRef<string | null>(null);
  const langComp = useRef(new Compartment());
  const themeComp = useRef(new Compartment());
  const runIdRef = useRef(0);
  const runFrameRef = useRef<HTMLIFrameElement>(null);
  const runTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeNode = activeId ? nodes[activeId] : undefined;
  const activeExt = activeNode ? extOf(activeNode.name) : "";
  const isJs = activeExt === "js" || activeExt === "jsx";
  const isHtml = activeExt === "html" || activeExt === "htm";

  /* ------------------------- editor lifecycle ------------------------- */

  const buildState = useCallback(
    (fileId: string, doc: string, name: string): EditorState => {
      return EditorState.create({
        doc,
        extensions: [
          basicSetup,
          langComp.current.of(languageFor(name)),
          themeComp.current.of(appearance === "dark" ? oneDark : []),
          Prec.highest(
            keymap.of([
              {
                key: "Mod-s",
                run: () => {
                  void saveRef.current();
                  return true;
                },
              },
              {
                key: "Mod-Enter",
                run: () => {
                  runRef.current();
                  return true;
                },
              },
            ]),
          ),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              const saved = savedRef.current.get(fileId) ?? "";
              setDirty((d) => ({ ...d, [fileId]: u.state.doc.toString() !== saved }));
            }
          }),
        ],
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const pendingStateRef = useRef<EditorState | null>(null);

  const openFile = useCallback(
    async (fileId: string) => {
      const node = fs().nodes[fileId];
      if (!node) return;
      // stash the outgoing file's editor state
      const view = viewRef.current;
      if (view && activeRef.current) {
        statesRef.current.set(activeRef.current, view.state);
      }
      setOpenIds((ids) => (ids.includes(fileId) ? ids : [...ids, fileId]));
      let st = statesRef.current.get(fileId);
      if (!st) {
        const text = await readNodeText(node);
        savedRef.current.set(fileId, text);
        st = buildState(fileId, text, node.name);
        statesRef.current.set(fileId, st);
      }
      activeRef.current = fileId;
      setActiveId(fileId);
      if (view) view.setState(st);
      else pendingStateRef.current = st;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildState],
  );

  /* create the EditorView once */
  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;
    const view = new EditorView({
      state: pendingStateRef.current ?? EditorState.create({ doc: "" }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* open the file we were launched with */
  useEffect(() => {
    if (win.props.fileId) void openFile(win.props.fileId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.props.fileId]);

  /* theme follows system appearance */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeComp.current.reconfigure(appearance === "dark" ? oneDark : []),
    });
  }, [appearance]);

  /* language follows the active file */
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activeNode) return;
    view.dispatch({
      effects: langComp.current.reconfigure(languageFor(activeNode.name)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    os.setWindowTitle(
      win.id,
      activeNode ? `Uruk Code — ${activeNode.name}${dirty[activeNode.id] ? " ●" : ""}` : "Uruk Code",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNode?.name, activeId, dirty]);

  /* ------------------------------ saving ------------------------------ */

  const save = useCallback(async () => {
    const view = viewRef.current;
    const id = activeRef.current;
    if (!view || !id) return;
    const doc = view.state.doc.toString();
    await fs().writeText(id, doc);
    savedRef.current.set(id, doc);
    setDirty((d) => ({ ...d, [id]: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const saveRef = useRef(save);
  saveRef.current = save;

  const closeTab = async (id: string) => {
    statesRef.current.delete(id);
    savedRef.current.delete(id);
    setDirty((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
    const rest = openIds.filter((x) => x !== id);
    setOpenIds(rest);
    if (activeRef.current === id) {
      activeRef.current = null;
      setActiveId(null);
      if (rest.length) await openFile(rest[rest.length - 1]);
      else if (viewRef.current) {
        viewRef.current.setState(EditorState.create({ doc: "" }));
      }
    }
  };

  /* --------------------------- JS runner ------------------------------ */

  const run = useCallback(() => {
    const view = viewRef.current;
    if (!view || !activeRef.current || !isJs) return;
    const code = view.state.doc.toString();
    const rid = ++runIdRef.current;
    setPanel("output");
    setOutput([]);
    setRunStamp(new Date().toLocaleTimeString());
    if (runTimerRef.current) clearTimeout(runTimerRef.current);

    const fmt = `function fmt(v){ if(typeof v==="string") return v; if(v===undefined) return "undefined"; if(typeof v==="function") return "ƒ "+(v.name||"anonymous")+"()"; if(v instanceof Error) return v.name+": "+v.message; try { const s=JSON.stringify(v); return s===undefined? String(v): s; } catch(e){ try { return String(v); } catch(e2){ return "[unprintable]"; } } }`;
    const harness = `<!doctype html><html><body><script>
      var RID = ${rid};
      function send(type, text){ parent.postMessage({ __urukRun: true, rid: RID, type: type, text: text }, "*"); }
      ${fmt}
      console.log = function(){ send("log", Array.prototype.map.call(arguments, fmt).join(" ")); };
      console.warn = function(){ send("warn", Array.prototype.map.call(arguments, fmt).join(" ")); };
      console.error = function(){ send("error", Array.prototype.map.call(arguments, fmt).join(" ")); };
      window.addEventListener("error", function(e){ send("error", String(e.message || "script error")); });
      window.addEventListener("unhandledrejection", function(e){ send("error", "Unhandled rejection: " + fmt(e.reason)); });
      try {
        var __r = eval(${JSON.stringify(code).replace(/</g, "\\u003c")});
        if (__r !== undefined) send("log", "↩ " + fmt(__r));
      } catch (e) {
        send("error", (e && e.name ? e.name + ": " : "") + (e && e.message ? e.message : fmt(e)));
      }
      send("done", "");
    <\/script></body></html>`;

    const frame = runFrameRef.current;
    if (frame) frame.srcdoc = harness;
    runTimerRef.current = setTimeout(() => {
      if (runIdRef.current === rid) {
        setOutput((o) => [
          ...o,
          {
            type: "info",
            text: "(no completion signal after 4s — the script may still be running, e.g. an infinite loop; any further output will still appear here)",
          },
        ]);
      }
    }, 4000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJs]);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { __urukRun?: boolean; rid?: number; type?: string; text?: string };
      if (!d || d.__urukRun !== true || d.rid !== runIdRef.current) return;
      if (d.type === "done") {
        if (runTimerRef.current) clearTimeout(runTimerRef.current);
        return;
      }
      setOutput((o) => [...o.slice(-299), { type: (d.type as OutputEntry["type"]) ?? "log", text: d.text ?? "" }]);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const preview = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    setPreviewDoc(view.state.doc.toString());
    setPanel("preview");
  }, []);

  /* --------------------------- file menu ------------------------------ */

  useEffect(() => {
    if (!focused) return;
    os.setFileMenuItems([
      { label: "Save", action: () => void save(), disabled: !activeId, shortcut: "⌘S" },
      { label: "New File…", action: () => setShowNewForm(true) },
      { label: "Open File…", action: () => setShowOpenList(true) },
      ...(isJs
        ? [{ label: "Run JavaScript", action: run }]
        : isHtml
          ? [{ label: "Preview HTML", action: preview }]
          : []),
    ]);
    return () => os.setFileMenuItems(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, activeId, isJs, isHtml, save, run, preview]);

  /* --------------------------- new file ------------------------------- */

  const createFile = async () => {
    const name = newName.trim() || "script.js";
    const created = await fs().createFile(newFolder, name, { text: "", dedupe: true });
    setShowNewForm(false);
    await openFile(created.id);
    viewRef.current?.focus();
  };

  const openableFiles = useMemo(() => {
    return Object.values(nodes)
      .filter((n) => n.type === "file" && isTextLike(n.name, n.mime))
      .sort((a, b) => pathOf(nodes, a.id).localeCompare(pathOf(nodes, b.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  const changeFont = (delta: number) => {
    setFontSize((s) => {
      const next = Math.min(20, Math.max(10, s + delta));
      try {
        localStorage.setItem(LS_FONT, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const folders = Object.values(nodes).filter(
    (n) => n.parentId === ROOT_ID && n.type === "folder",
  );

  /* ------------------------------ render ------------------------------ */

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-[#282c34]" data-testid="code">
      {/* tab strip + toolbar */}
      <div className="flex items-stretch gap-0 overflow-x-auto bg-neutral-200/80 dark:bg-neutral-800">
        {openIds.map((id) => {
          const n = nodes[id];
          if (!n) return null;
          const active = id === activeId;
          return (
            <div
              key={id}
              data-testid={`code-tab-${n.name}`}
              className={`group flex shrink-0 items-center gap-1.5 border-r border-black/5 px-3 py-1.5 text-[12.5px] dark:border-white/5 ${
                active
                  ? "bg-white text-neutral-900 dark:bg-[#282c34] dark:text-neutral-100"
                  : "text-neutral-500 hover:bg-black/[0.04] dark:text-neutral-400 dark:hover:bg-white/[0.05]"
              }`}
            >
              <button onClick={() => void openFile(id)}>{n.name}</button>
              {dirty[id] ? (
                <span className="text-[10px] text-[var(--accent)]">●</span>
              ) : (
                <button
                  className="rounded px-0.5 leading-none opacity-0 hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/15"
                  onClick={() => void closeTab(id)}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
        <div className="ml-auto flex shrink-0 items-center gap-1 px-2 py-1">
          <button
            data-testid="code-open"
            className="rounded px-2 py-0.5 text-[12.5px] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => setShowOpenList((v) => !v)}
          >
            Open…
          </button>
          <button
            data-testid="code-new"
            className="rounded px-2 py-0.5 text-[12.5px] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => setShowNewForm((v) => !v)}
          >
            New
          </button>
          <button
            data-testid="code-save"
            disabled={!activeId || !dirty[activeId ?? ""]}
            className="rounded px-2 py-0.5 text-[12.5px] disabled:opacity-40 hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => void save()}
          >
            Save
          </button>
          {isJs && (
            <button
              data-testid="code-run"
              className="rounded bg-emerald-600 px-2.5 py-0.5 text-[12.5px] font-medium text-white hover:bg-emerald-500"
              onClick={run}
            >
              ▶ Run
            </button>
          )}
          {isHtml && (
            <button
              data-testid="code-preview-btn"
              className="rounded bg-[var(--accent)] px-2.5 py-0.5 text-[12.5px] font-medium text-white"
              onClick={preview}
            >
              Preview
            </button>
          )}
          <span className="mx-1 h-4 w-px bg-black/10 dark:bg-white/15" />
          <button
            data-testid="code-font-dec"
            className="rounded px-1.5 py-0.5 text-[12px] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => changeFont(-1)}
          >
            A−
          </button>
          <span className="w-7 text-center text-[11px] tabular-nums text-neutral-500">{fontSize}</span>
          <button
            data-testid="code-font-inc"
            className="rounded px-1.5 py-0.5 text-[13px] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => changeFont(1)}
          >
            A+
          </button>
        </div>
      </div>

      {/* open-file picker */}
      {showOpenList && (
        <div className="uruk-scroll max-h-52 overflow-y-auto border-b border-black/10 bg-neutral-50 py-1 dark:border-white/10 dark:bg-neutral-800" data-testid="code-open-list">
          {openableFiles.length === 0 && (
            <div className="px-3 py-2 text-[12.5px] text-neutral-400">No text files in the file system yet.</div>
          )}
          {openableFiles.map((f) => (
            <button
              key={f.id}
              className="flex w-full items-center gap-2 px-3 py-1 text-left text-[12.5px] hover:bg-[var(--accent)] hover:text-white"
              onClick={() => {
                setShowOpenList(false);
                void openFile(f.id);
              }}
            >
              <span className="font-medium">{f.name}</span>
              <span className="truncate opacity-60">{pathOf(nodes, f.parentId ?? ROOT_ID)}</span>
            </button>
          ))}
        </div>
      )}

      {/* new-file form */}
      {showNewForm && (
        <div className="flex items-end gap-2 border-b border-black/10 bg-neutral-50 px-3 py-2 dark:border-white/10 dark:bg-neutral-800" data-testid="code-new-form">
          <label className="flex-1">
            <span className="mb-0.5 block text-[11px] text-neutral-500 dark:text-neutral-400">File name</span>
            <input
              data-testid="code-new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-md border border-black/10 bg-white px-2 py-1 text-[13px] outline-none focus:border-[var(--accent)] dark:border-white/10 dark:bg-neutral-900"
              onKeyDown={(e) => e.key === "Enter" && void createFile()}
            />
          </label>
          <label>
            <span className="mb-0.5 block text-[11px] text-neutral-500 dark:text-neutral-400">Folder</span>
            <select
              data-testid="code-new-folder"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              className="rounded-md border border-black/10 bg-white px-2 py-1 text-[13px] outline-none dark:border-white/10 dark:bg-neutral-900"
            >
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <button
            data-testid="code-create"
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-white"
            onClick={() => void createFile()}
          >
            Create
          </button>
        </div>
      )}

      {/* editor surface */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={hostRef}
          data-testid="code-editor"
          className="absolute inset-0 overflow-hidden [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto"
          style={{ fontSize }}
        />
        {openIds.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-[13px] leading-6 text-neutral-400">
            Open a file, or create one — JavaScript files can run right
            here, HTML files preview in place.
          </div>
        )}
      </div>

      {/* output / preview drawer */}
      {panel !== "none" && (
        <div className="flex h-48 shrink-0 flex-col border-t border-black/15 dark:border-white/15" data-testid="code-panel">
          <div className="flex items-center gap-2 bg-neutral-200/80 px-3 py-1 text-[12px] dark:bg-neutral-800">
            <span className="font-semibold">{panel === "output" ? "Console output" : "HTML preview"}</span>
            {panel === "output" && runStamp && (
              <span className="text-neutral-500 dark:text-neutral-400">ran at {runStamp}</span>
            )}
            {panel === "output" && (
              <button
                data-testid="code-output-clear"
                className="rounded px-2 py-0.5 hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => setOutput([])}
              >
                Clear
              </button>
            )}
            {panel === "preview" && (
              <button
                className="rounded px-2 py-0.5 hover:bg-black/5 dark:hover:bg-white/10"
                onClick={preview}
              >
                Reload preview
              </button>
            )}
            <button
              className="ml-auto rounded px-2 py-0.5 hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setPanel("none")}
            >
              ✕
            </button>
          </div>
          {panel === "output" ? (
            <div className="uruk-scroll min-h-0 flex-1 overflow-y-auto bg-[#1d1f24] p-2.5 font-mono text-[12px] leading-[1.5]" data-testid="code-output">
              {output.length === 0 && <div className="text-neutral-500">Running…</div>}
              {output.map((o, i) => (
                <div
                  key={i}
                  className={
                    o.type === "error"
                      ? "text-red-400"
                      : o.type === "warn"
                        ? "text-amber-300"
                        : o.type === "info"
                          ? "text-sky-300"
                          : "text-neutral-200"
                  }
                >
                  {o.text}
                </div>
              ))}
            </div>
          ) : (
            <iframe
              title="HTML preview"
              data-testid="code-preview-frame"
              sandbox="allow-scripts"
              srcDoc={previewDoc}
              className="min-h-0 flex-1 border-0 bg-white"
            />
          )}
        </div>
      )}

      {/* hidden sandboxed runner frame */}
      <iframe
        ref={runFrameRef}
        title="js-runner"
        data-testid="code-runner-frame"
        sandbox="allow-scripts"
        className="hidden"
        aria-hidden
      />
    </div>
  );
}
