/**
 * Python runner — Phase 5.
 *
 * Real CPython compiled to WebAssembly (Pyodide), loaded lazily from
 * the official jsDelivr CDN the first time a Python file runs — the
 * download is roughly 10 MB and the browser caches it afterwards.
 * The OS ships no Python runtime of its own.
 *
 * Bridge rules (kept honest):
 *  - The file being run is written into Pyodide's in-memory file
 *    system together with the text files in its folder, and executed
 *    with runpy as __main__, so `open("sibling.txt")` and sibling
 *    imports behave like they would on a real disk.
 *  - stdout/stderr stream into the caller's output pane.
 *  - input() reads lines from the stdin text the user typed into the
 *    output pane before running; an exhausted stdin raises EOFError,
 *    whose traceback says exactly that.
 *  - If the runtime cannot be fetched (offline, Wi-Fi off), the load
 *    fails and the caller shows that — no fake output, ever.
 */

const PYODIDE_VERSION = "0.27.5";
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const WORK_DIR = "/uruk-work";

interface PyodideLike {
  runPythonAsync: (code: string) => Promise<unknown>;
  setStdout: (opts: { batched: (s: string) => void }) => void;
  setStderr: (opts: { batched: (s: string) => void }) => void;
  setStdin: (opts: { stdin: () => number | null }) => void;
  globals: { set: (name: string, value: unknown) => void };
  FS: {
    mkdir: (path: string) => void;
    writeFile: (path: string, data: string) => void;
    readdir: (path: string) => string[];
    unlink: (path: string) => void;
    stat: (path: string) => { mode: number };
    isDir: (mode: number) => boolean;
  };
}

let pyPromise: Promise<PyodideLike> | null = null;
let pyReady = false;

export function isPythonReady(): boolean {
  return pyReady;
}

export function loadPython(): Promise<PyodideLike> {
  if (!pyPromise) {
    pyPromise = (async () => {
      const url = `${INDEX_URL}pyodide.mjs`;
      const mod = (await import(/* webpackIgnore: true */ url)) as {
        loadPyodide: (opts: { indexURL: string }) => Promise<PyodideLike>;
      };
      const py = await mod.loadPyodide({ indexURL: INDEX_URL });
      pyReady = true;
      return py;
    })().catch((e) => {
      // A failed load must not poison later attempts (e.g. the user
      // turns Wi-Fi back on and retries).
      pyPromise = null;
      throw e;
    });
  }
  return pyPromise;
}

export interface BridgeFile {
  name: string;
  text: string;
}

export interface PythonRunRequest {
  /** The main file (its current editor contents, saved or not). */
  fileName: string;
  code: string;
  /** Text files sharing the main file's folder — the bridge set. */
  siblings: BridgeFile[];
  /** Lines fed to input(), in order. */
  stdinText: string;
  onLine: (type: "log" | "error", text: string) => void;
}

export async function runPython(req: PythonRunRequest): Promise<void> {
  const py = await loadPython();

  py.setStdout({ batched: (s) => req.onLine("log", s) });
  py.setStderr({ batched: (s) => req.onLine("error", s) });

  // stdin: a byte queue over the pre-typed text. input() consumes one
  // line at a time; an empty queue signals EOF (Python raises
  // EOFError, and its traceback is shown verbatim).
  const bytes = Array.from(new TextEncoder().encode(req.stdinText));
  let pos = 0;
  py.setStdin({
    stdin: () => (pos < bytes.length ? bytes[pos++] : null),
  });

  // Bridge the folder into the in-memory FS (fresh each run).
  try {
    py.FS.mkdir(WORK_DIR);
  } catch {
    /* already exists */
  }
  for (const entry of py.FS.readdir(WORK_DIR)) {
    if (entry === "." || entry === "..") continue;
    const p = `${WORK_DIR}/${entry}`;
    try {
      if (!py.FS.isDir(py.FS.stat(p).mode)) py.FS.unlink(p);
    } catch {
      /* ignore */
    }
  }
  for (const f of req.siblings) {
    // Bridge only flat, plainly-named files.
    if (!/^[A-Za-z0-9._ -]+$/.test(f.name) || f.name === req.fileName) continue;
    try {
      py.FS.writeFile(`${WORK_DIR}/${f.name}`, f.text);
    } catch {
      /* a sibling that won't bridge is skipped, never fatal */
    }
  }
  py.FS.writeFile(`${WORK_DIR}/${req.fileName}`, req.code);

  py.globals.set("URUK_MAIN_PATH", `${WORK_DIR}/${req.fileName}`);
  await py.runPythonAsync(
    "import os, runpy, sys\n" +
      `os.chdir(${JSON.stringify(WORK_DIR)})\n` +
      "if os.getcwd() not in sys.path: sys.path.insert(0, os.getcwd())\n" +
      "runpy.run_path(URUK_MAIN_PATH, run_name='__main__')",
  );
}
