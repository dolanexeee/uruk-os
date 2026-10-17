import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  ROOT_ID,
  childrenOf,
  isTextLike,
  pathOf,
  readNodeText,
  useFS,
  type FSNode,
} from "@/lib/fs";
import { extOf } from "@/lib/associations";
import {
  FILE_TEMPLATES,
  LANGUAGES,
  PLAIN_LANGUAGE,
  languageById,
  languageForName,
  type LanguageDef,
} from "@/lib/languages";
import { isPythonReady, runPython, type BridgeFile } from "@/lib/pyodide";
import { codeStdinKeyFor, getActiveAccountId } from "@/lib/accounts";
import { useOS, type WinState } from "@/store/os";
import { useSystem } from "@/store/system";

/**
 * Uruk Code — a real code editor over the file system.
 *
 * CodeMirror 6 with tabs and a language registry (lib/languages.ts)
 * covering JavaScript/TypeScript/JSX/TSX, Python, HTML, CSS, JSON,
 * Markdown, C, C++, Java, Rust, Go, PHP, SQL, XML, YAML and Shell —
 * chosen by file extension or the manual switcher in the tab bar.
 * Ctrl+S saves into the file system. Running is honest about what a
 * browser can do: JavaScript/TypeScript execute in a sandboxed iframe
 * with console capture, HTML previews in a sandboxed pane, Python
 * runs on real CPython-in-WASM (Pyodide, lazily loaded), and every
 * other language shows an "editing + highlighting only" note instead
 * of a Run button that could not keep its promise.
 *
 * Python stdin: input() reads from a per-file stdin box whose text is
 * remembered per file path (account-scoped). A program that asks for
 * input while the box is empty gets a guidance pause — notice, focus,
 * highlight — instead of a raw EOFError traceback; a second Run press
 * still runs it, and input() calls that outnumber the typed lines
 * keep the honest EOFError hint.
 */

interface OutputEntry {
  type: "log" | "warn" | "error" | "info";
  text: string;
}

const LS_FONT = "uruk-code-font-size";

/** Does this Python source ask the user for input()? (Attribute calls
 * like `obj.input()` and longer identifiers like `myinput(` don't count.) */
const USES_INPUT_RE = /(^|[^\w.])input\s*\(/;

/* Per-file stdin memory: the text typed into the stdin box is kept per
 * file path in account-scoped storage (like the other prefs), so
 * re-running the same script keeps its answers. */
function loadStdinMemory(): Record<string, string> {
  try {
    const raw = localStorage.getItem(codeStdinKeyFor(getActiveAccountId()));
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function rememberStdin(filePath: string, text: string): void {
  try {
    const map = loadStdinMemory();
    if (text) map[filePath] = text;
    else delete map[filePath];
    localStorage.setItem(codeStdinKeyFor(getActiveAccountId()), JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

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
  const [templateId, setTemplateId] = useState("blank");
  /** Manual per-file language choice (tab-bar switcher); wins over the extension. */
  const [langOverride, setLangOverride] = useState<Record<string, string>>({});
  /** Text fed to Python's input() on the next run (per-file, remembered). */
  const [stdinText, setStdinTextState] = useState("");
  /** FS path of the file `stdinText` currently belongs to. */
  const stdinPathRef = useRef<string | null>(null);
  /** Does the active document call input()? Drives the stdin field's prominence. */
  const [usesInput, setUsesInput] = useState(false);
  /** One-shot highlight on the stdin box right after the guidance notice. */
  const [stdinUrged, setStdinUrged] = useState(false);
  /** Guidance already shown for this exact file + code: a second Run
   * press runs anyway (the guidance is a pause, not a block). */
  const guidedRef = useRef<{ id: string; code: string } | null>(null);
  const [pyBusy, setPyBusy] = useState(false);
  /** Lezer node names of the active document — the parse, made visible. */
  const [tokensAttr, setTokensAttr] = useState("");

  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const statesRef = useRef<Map<string, EditorState>>(new Map());
  const savedRef = useRef<Map<string, string>>(new Map());
  const activeRef = useRef<string | null>(null);
  const langComp = useRef(new Compartment());
  const themeComp = useRef(new Compartment());
  const runIdRef = useRef(0);
  const runFrameRef = useRef<HTMLIFrameElement>(null);
  const stdinRef = useRef<HTMLTextAreaElement>(null);
  /** Set by buildState: recomputes `usesInput` on every doc change. */
  const usesInputCheckRef = useRef<((doc: string) => void) | null>(null);
  usesInputCheckRef.current = (doc: string) => {
    const v = USES_INPUT_RE.test(doc);
    setUsesInput((prev) => (prev === v ? prev : v));
  };

  /** Update the stdin text for the active file and remember it per file. */
  const setStdinText = useCallback((text: string) => {
    setStdinTextState(text);
    if (stdinPathRef.current) rememberStdin(stdinPathRef.current, text);
    if (text.trim()) setStdinUrged(false);
  }, []);
  const runTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeNode = activeId ? nodes[activeId] : undefined;
  const activeLang: LanguageDef = activeNode
    ? (languageById(activeId ? langOverride[activeId] : undefined) ??
      languageForName(activeNode.name))
    : PLAIN_LANGUAGE;
  const isJs = activeLang.run === "js";
  const isHtml = activeLang.run === "html";
  const isPy = activeLang.run === "python";

  /* ------------------------- editor lifecycle ------------------------- */

  const buildState = useCallback(
    (fileId: string, doc: string, name: string): EditorState => {
      return EditorState.create({
        doc,
        extensions: [
          basicSetup,
          langComp.current.of(languageForName(name).make()),
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
              usesInputCheckRef.current?.(u.state.doc.toString());
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
      // stdin memory + input() prominence follow the file being opened
      const filePath = pathOf(fs().nodes, fileId);
      stdinPathRef.current = filePath;
      setStdinTextState(loadStdinMemory()[filePath] ?? "");
      setStdinUrged(false);
      setUsesInput(USES_INPUT_RE.test(st.doc.toString()));
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

  /* language follows the active file (+ any manual override) */
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activeNode) return;
    view.dispatch({
      effects: langComp.current.reconfigure(activeLang.make()),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeLang.id]);

  /* Expose the real parse: Lezer node names of the active document. */
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activeId) {
      setTokensAttr("");
      return;
    }
    const compute = () => {
      const v = viewRef.current;
      if (!v) return;
      const tree =
        ensureSyntaxTree(v.state, v.state.doc.length, 800) ?? syntaxTree(v.state);
      const names = new Set<string>();
      tree.iterate({
        enter: (n) => {
          names.add(n.name);
          if (names.size >= 80) return false;
        },
      });
      setTokensAttr([...names].join(" "));
    };
    compute();
    const t = setTimeout(compute, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeLang.id, activeId ? dirty[activeId] : false]);

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

  const runJs = useCallback(() => {
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

  /* ------------------------- Python runner ---------------------------- */

  const pushOut = useCallback((type: OutputEntry["type"], text: string) => {
    setOutput((o) => [...o.slice(-299), { type, text }]);
  }, []);

  const runPythonFile = useCallback(async () => {
    const view = viewRef.current;
    const id = activeRef.current;
    if (!view || !id || pyBusy) return;
    const node = fs().nodes[id];
    if (!node) return;
    const code = view.state.doc.toString();
    setPanel("output");
    setOutput([]);
    setRunStamp(new Date().toLocaleTimeString());

    // Pre-run guidance: a program that calls input() with an empty
    // stdin box would only earn the user a raw EOFError traceback.
    // Pause here instead — explain, focus the box, highlight it. The
    // guidance is a pause, not a block: typed input, or a second Run
    // press, runs the program for real.
    if (USES_INPUT_RE.test(code) && stdinText.trim() === "") {
      const g = guidedRef.current;
      if (!g || g.id !== id || g.code !== code) {
        guidedRef.current = { id, code };
        setStdinUrged(true);
        pushOut(
          "info",
          "This program asks for input — type each answer on its own line in the stdin box, then press Run again.",
        );
        setTimeout(() => stdinRef.current?.focus(), 60);
        return;
      }
    }
    guidedRef.current = null;

    setPyBusy(true);
    const started = Date.now();

    if (!useSystem.getState().wifiOn) {
      pushOut(
        "error",
        "Couldn't load the Python runtime — the OS Wi-Fi switch is off. Turn Wi-Fi on in Control Center and run again.",
      );
      setPyBusy(false);
      return;
    }
    if (!isPythonReady()) {
      pushOut(
        "info",
        "Loading Python runtime… first run downloads CPython-in-WebAssembly (~10 MB) from the Pyodide CDN; your browser caches it for later runs.",
      );
    }

    // Bridge set: the text files sharing this file's folder.
    const siblings: BridgeFile[] = [];
    if (node.parentId) {
      for (const sib of childrenOf(fs().nodes, node.parentId)) {
        if (sib.type !== "file" || sib.id === id) continue;
        if (sib.blob && !sib.mime.startsWith("text/")) continue;
        try {
          const text = await readNodeText(sib);
          if (text.length <= 512 * 1024) siblings.push({ name: sib.name, text });
        } catch {
          /* skip unreadable siblings */
        }
      }
    }

    try {
      await runPython({
        fileName: node.name,
        code,
        siblings,
        stdinText,
        onLine: (type, text) => pushOut(type, text),
      });
      pushOut("info", `— finished in ${((Date.now() - started) / 1000).toFixed(1)}s —`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!isPythonReady()) {
        pushOut(
          "error",
          "Couldn't load the Python runtime — check your connection and run again. (Python runs on Pyodide, fetched from cdn.jsdelivr.net; nothing is faked when it can't load.)",
        );
        pushOut("info", msg.slice(0, 300));
      } else if (msg.includes("EOFError")) {
        for (const line of msg.split("\n").filter(Boolean).slice(-14)) pushOut("error", line);
        pushOut(
          "info",
          "input() ran out of stdin — type the lines it should read into the stdin box above the output and run again.",
        );
      } else {
        for (const line of msg.split("\n").filter(Boolean).slice(-14)) pushOut("error", line);
      }
    } finally {
      setPyBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pyBusy, stdinText, pushOut]);

  const previewRef = useRef<() => void>(() => {});

  /* Run dispatches on the active language's honest capability. */
  const runActive = useCallback(() => {
    if (isPy) void runPythonFile();
    else if (isJs) runJs();
    else if (isHtml) previewRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPy, isJs, isHtml, runPythonFile, runJs]);
  const runRef = useRef(runActive);
  runRef.current = runActive;

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
  previewRef.current = preview;

  /* --------------------------- file menu ------------------------------ */

  useEffect(() => {
    if (!focused) return;
    os.setFileMenuItems([
      { label: "Save", action: () => void save(), disabled: !activeId, shortcut: "⌘S" },
      { label: "New File…", action: () => setShowNewForm(true) },
      { label: "Open File…", action: () => setShowOpenList(true) },
      ...(isJs
        ? [{ label: "Run JavaScript", action: runActive }]
        : isPy
          ? [{ label: "Run Python", action: runActive }]
          : isHtml
            ? [{ label: "Preview HTML", action: preview }]
            : []),
    ]);
    return () => os.setFileMenuItems(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, activeId, isJs, isPy, isHtml, save, runActive, preview]);

  /* --------------------------- new file ------------------------------- */

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = FILE_TEMPLATES.find((t) => t.id === id);
    if (tpl) setNewName(tpl.fileName);
  };

  const createFile = async () => {
    const name = newName.trim() || "script.js";
    const tpl = FILE_TEMPLATES.find((t) => t.id === templateId);
    const created = await fs().createFile(newFolder, name, {
      text: tpl && tpl.id !== "blank" ? tpl.body : "",
      dedupe: true,
    });
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
          {(isJs || isPy) && (
            <button
              data-testid="code-run"
              disabled={isPy && pyBusy}
              className="rounded bg-emerald-600 px-2.5 py-0.5 text-[12.5px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              onClick={runActive}
            >
              {isPy && pyBusy ? "Running…" : "▶ Run"}
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
          {activeNode && (
            <select
              data-testid="code-lang-select"
              aria-label="Language"
              value={activeLang.id}
              onChange={(e) => {
                if (!activeId) return;
                setLangOverride((o) => ({ ...o, [activeId]: e.target.value }));
              }}
              className="max-w-[110px] rounded border border-black/10 bg-white px-1 py-0.5 text-[12px] outline-none dark:border-white/10 dark:bg-neutral-900"
            >
              {[...LANGUAGES, PLAIN_LANGUAGE].map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
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

      {/* honest capability note for edit-only languages */}
      {activeNode && activeLang.run === null && (
        <div
          data-testid="code-hl-note"
          className="border-b border-black/10 bg-amber-50 px-3 py-1 text-[12px] text-amber-800 dark:border-white/10 dark:bg-amber-950/40 dark:text-amber-200"
        >
          Editing + highlighting only — {activeLang.label} can&apos;t run inside a
          browser yet. (JavaScript, TypeScript, HTML and Python run here for real.)
        </div>
      )}

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
          <label>
            <span className="mb-0.5 block text-[11px] text-neutral-500 dark:text-neutral-400">Template</span>
            <select
              data-testid="code-template-select"
              value={templateId}
              onChange={(e) => pickTemplate(e.target.value)}
              className="rounded-md border border-black/10 bg-white px-2 py-1 text-[13px] outline-none dark:border-white/10 dark:bg-neutral-900"
            >
              {FILE_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
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
          data-language={activeLang.id}
          data-tokens={tokensAttr}
          className="absolute inset-0 overflow-hidden [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto"
          style={{ fontSize }}
        />
        {openIds.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-[13px] leading-6 text-neutral-400">
            Open a file, or create one from a template — JavaScript,
            TypeScript and Python run right here, HTML previews in place,
            and C, C++, Java, Rust, Go, PHP, SQL and more get full
            syntax highlighting.
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
          {panel === "output" && isPy && (
            <div className="flex items-center gap-2 border-b border-black/10 bg-[#26282e] px-2.5 py-1.5 dark:border-white/10">
              <label
                htmlFor="code-stdin-input"
                className={`shrink-0 text-[11px] ${
                  usesInput
                    ? "font-semibold text-[var(--accent)]"
                    : "font-mono text-neutral-400"
                }`}
                title="Lines handed to Python's input() calls, in order"
              >
                Program input (stdin)
              </label>
              <textarea
                ref={stdinRef}
                id="code-stdin-input"
                data-testid="code-stdin"
                value={stdinText}
                rows={1}
                onChange={(e) => setStdinText(e.target.value)}
                placeholder={
                  usesInput
                    ? "The program will ask for input — type each answer here, one per line"
                    : "lines for input(), one per line"
                }
                className={`uruk-scroll min-w-0 flex-1 resize-none rounded border bg-[#1d1f24] px-2 py-1 font-mono text-[12px] text-neutral-100 outline-none placeholder:text-neutral-500 ${
                  stdinUrged
                    ? "stdin-urged"
                    : usesInput
                      ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/50"
                      : "border-white/10"
                }`}
              />
            </div>
          )}
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
