import React, { useEffect, useRef, useState } from "react";
import {
  ROOT_ID,
  TRASH_ID,
  childrenOf,
  pathOf,
  readNodeText,
  resolvePath,
  totalSize,
  useFS,
  type FSNode,
} from "@/lib/fs";
import { APP_NAMES, useOS, type AppId, type WinState } from "@/store/os";
import { openFileNode } from "@/lib/associations";

interface Line {
  text: string;
  kind: "in" | "out" | "err";
}

const BOOT_TIME = Date.now();
const LOGO = [
  "██╗   ██╗██████╗ ██╗   ██╗██╗  ██╗",
  "██║   ██║██╔══██╗██║   ██║██║ ██╔╝",
  "██║   ██║██████╔╝██║   ██║█████╔╝ ",
  "██║   ██║██╔══██╗██║   ██║██╔═██╗ ",
  "╚██████╔╝██║  ██║╚██████╔╝██║  ██╗",
  " ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝",
];

/** Tiny shell tokenizer: handles 'single' and "double" quotes. */
function tokenize(input: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let has = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      has = true;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (ch === " " || ch === "\t") {
      if (cur || has) {
        out.push(cur);
        cur = "";
        has = false;
      }
    } else {
      cur += ch;
    }
  }
  if (cur || has) out.push(cur);
  return out;
}

export default function Terminal({ win }: { win: WinState }) {
  const fs = useFS.getState;
  const os = useOS.getState;
  const [cwdId, setCwdId] = useState(ROOT_ID);
  const [lines, setLines] = useState<Line[]>([
    { text: "URUK OS — uruksh 1.0. Type `help` for commands.", kind: "out" },
  ]);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const nodes = () => fs().nodes;
  const prompt = () => `mustafa@uruk:${pathOf(nodes(), cwdId)}$`;

  const print = (newLines: Line[]) => setLines((l) => [...l, ...newLines]);
  const out = (text: string) => ({ text, kind: "out" as const });
  const err = (text: string) => ({ text, kind: "err" as const });

  async function urukfetch(): Promise<Line[]> {
    const n = nodes();
    let storageLine = "IndexedDB (local)";
    try {
      if (navigator.storage?.estimate) {
        const e = await navigator.storage.estimate();
        storageLine = `${(((e.usage ?? 0) / (e.quota || 1)) * 100).toFixed(1)}% of ${(((e.quota ?? 0) / 1073741824)).toFixed(1)} GB (IndexedDB)`;
      }
    } catch {
      /* ignore */
    }
    const uptimeMin = Math.max(0, Math.floor((Date.now() - BOOT_TIME) / 60000));
    const info = [
      "mustafa@uruk-os",
      "────────────────",
      "OS:        URUK OS 0.1.0 (browser build)",
      `Shell:     uruksh 1.0`,
      `Files:     ${Object.keys(n).length} nodes, ${(totalSize(n) / 1024).toFixed(1)} KB stored`,
      `Storage:   ${storageLine}`,
      `Windows:   ${os().windows.length} open`,
      `Uptime:    ${uptimeMin} min (this session)`,
      `Browser:   ${navigator.userAgent.split(")")[0].split("(")[1] ?? navigator.userAgent}`,
    ];
    const rows: Line[] = [];
    const h = Math.max(LOGO.length, info.length);
    for (let i = 0; i < h; i++) {
      rows.push(out(`${(LOGO[i] ?? "").padEnd(38)}${info[i] ?? ""}`));
    }
    return rows;
  }

  async function run(raw: string): Promise<Line[]> {
    const tokens = tokenize(raw);
    if (!tokens.length) return [];
    const [cmd, ...args] = tokens;
    const n = nodes();

    switch (cmd) {
      case "help":
        return [
          out("Commands: pwd ls cd mkdir touch cat echo rm mv cp clear help whoami date open urukfetch"),
          out("Redirect: echo text > file.txt   echo more >> file.txt"),
          out("Paths: ~ is home, .. goes up, names may be quoted: cd \"My Folder\""),
        ];
      case "pwd":
        return [out(pathOf(n, cwdId))];
      case "whoami":
        return [out("mustafa")];
      case "date":
        return [out(new Date().toString())];
      case "clear":
        setLines([]);
        return [];
      case "ls": {
        const long = args.includes("-l") || args.includes("-la") || args.includes("-al");
        const pathArg = args.find((a) => !a.startsWith("-"));
        const targetId = pathArg ? resolvePath(n, cwdId, pathArg) : cwdId;
        if (!targetId) return [err(`ls: ${pathArg}: No such file or directory`)];
        const target = n[targetId];
        if (target.type === "file") return [out(target.name)];
        const kids = childrenOf(n, targetId);
        if (!kids.length) return [];
        if (long) {
          return kids.map((k) => {
            const perm = k.type === "folder" ? "drwxr-xr-x" : "-rw-r--r--";
            const d = new Date(k.modifiedAt);
            const when = `${d.toLocaleString("en-US", { month: "short" })} ${String(d.getDate()).padStart(2, " ")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
            return out(`${perm}  ${String(k.size).padStart(7)}  ${when}  ${k.name}${k.type === "folder" ? "/" : ""}`);
          });
        }
        return [out(kids.map((k) => (k.type === "folder" ? `${k.name}/` : k.name)).join("   "))];
      }
      case "cd": {
        const dest = args[0];
        if (!dest) {
          setCwdId(ROOT_ID);
          return [];
        }
        const id = resolvePath(n, cwdId, dest);
        if (!id) return [err(`cd: no such file or directory: ${dest}`)];
        if (n[id].type !== "folder") return [err(`cd: not a directory: ${dest}`)];
        setCwdId(id);
        return [];
      }
      case "mkdir": {
        if (!args[0]) return [err("mkdir: missing operand")];
        const name = args[0].replace(/\/$/, "");
        if (childrenOf(n, cwdId).some((c) => c.name === name))
          return [err(`mkdir: ${name}: File exists`)];
        await fs().createFolder(cwdId, name);
        return [];
      }
      case "touch": {
        if (!args[0]) return [err("touch: missing operand")];
        const existing = childrenOf(n, cwdId).find((c) => c.name === args[0]);
        if (existing) {
          if (existing.type === "file") await fs().writeText(existing.id, (await readNodeText(existing)) ?? "");
          return [];
        }
        await fs().createFile(cwdId, args[0], { text: "" });
        return [];
      }
      case "cat": {
        if (!args[0]) return [err("cat: missing operand")];
        const id = resolvePath(n, cwdId, args[0]);
        if (!id) return [err(`cat: ${args[0]}: No such file or directory`)];
        const node = n[id];
        if (node.type === "folder") return [err(`cat: ${args[0]}: Is a directory`)];
        const textLike = node.mime.startsWith("text/") || /\.(txt|md|svg|json|csv)$/i.test(node.name);
        if (!textLike) return [err(`cat: ${args[0]}: not a text file (${node.mime}, ${node.size} bytes)`)];
        const text = await readNodeText(node);
        return text.split("\n").map(out);
      }
      case "echo": {
        const gt = tokens.indexOf(">");
        const gtgt = tokens.indexOf(">>");
        const ri = gt >= 0 ? gt : gtgt;
        if (ri === -1) return [out(args.join(" "))];
        const text = tokens.slice(1, ri).join(" ");
        const fileName = tokens[ri + 1];
        if (!fileName) return [err("uruksh: syntax error near unexpected token `newline'")];
        const slash = fileName.lastIndexOf("/");
        const dirPart = slash >= 0 ? fileName.slice(0, slash) || "/" : null;
        const base = slash >= 0 ? fileName.slice(slash + 1) : fileName;
        const dirId = dirPart ? resolvePath(n, cwdId, dirPart) : cwdId;
        if (!dirId || n[dirId].type !== "folder")
          return [err(`uruksh: ${fileName}: No such file or directory`)];
        const existing = childrenOf(n, dirId).find((c) => c.name === base);
        if (existing && existing.type === "file") {
          const prev = tokens[ri] === ">>" ? await readNodeText(existing) : "";
          await fs().writeText(existing.id, prev + text + "\n");
        } else if (!existing) {
          await fs().createFile(dirId, base, { text: text + "\n" });
        } else {
          return [err(`uruksh: ${fileName}: Is a directory`)];
        }
        return [];
      }
      case "rm": {
        const recursive = args.includes("-r") || args.includes("-rf") || args.includes("-fr");
        const target = args.find((a) => !a.startsWith("-"));
        if (!target) return [err("rm: missing operand")];
        const id = resolvePath(n, cwdId, target);
        if (!id) return [err(`rm: ${target}: No such file or directory`)];
        const node = n[id];
        if (id === ROOT_ID || id === TRASH_ID) return [err(`rm: ${target}: Operation not permitted`)];
        if (node.type === "folder" && !recursive)
          return [err(`rm: ${target}: is a directory (use rm -r)`)];
        await fs().removeForever(id);
        if (cwdId === id) setCwdId(ROOT_ID);
        return [];
      }
      case "mv":
      case "cp": {
        const recursive = args.includes("-r");
        const paths = args.filter((a) => !a.startsWith("-"));
        if (paths.length < 2) return [err(`${cmd}: missing operand`)];
        const srcId = resolvePath(n, cwdId, paths[0]);
        if (!srcId) return [err(`${cmd}: ${paths[0]}: No such file or directory`)];
        const src = n[srcId];
        let dstId = resolvePath(n, cwdId, paths[1]);
        let dstParent = cwdId;
        let dstName = src.name;
        if (dstId && n[dstId].type === "folder") {
          dstParent = dstId;
        } else {
          const slash = paths[1].lastIndexOf("/");
          if (slash >= 0) {
            const p = resolvePath(n, cwdId, paths[1].slice(0, slash) || "/");
            if (!p || n[p].type !== "folder")
              return [err(`${cmd}: ${paths[1]}: No such file or directory`)];
            dstParent = p;
            dstName = paths[1].slice(slash + 1);
          } else {
            dstName = paths[1];
          }
          dstId = childrenOf(n, dstParent).find((c) => c.name === dstName)?.id ?? null;
        }
        if (cmd === "mv") {
          if (dstParent === src.parentId && dstName === src.name) return [];
          const clash = childrenOf(n, dstParent).some((c) => c.id !== srcId && c.name === dstName);
          if (clash) return [err(`mv: ${dstName}: File exists`)];
          await fs().move(srcId, dstParent);
          if (dstName !== src.name) await fs().rename(srcId, dstName);
          return [];
        }
        // cp
        if (src.type === "folder" && !recursive)
          return [err(`cp: ${paths[0]} is a directory (not copied; use cp -r)`)];
        const copyNode = async (node: FSNode, parentId: string, name: string) => {
          if (node.type === "folder") {
            const folder = await fs().createFolder(parentId, name);
            for (const child of childrenOf(nodes(), node.id)) {
              await copyNode(child, folder.id, child.name);
            }
          } else {
            await fs().createFile(parentId, name, {
              text: node.text,
              blob: node.blob,
              mime: node.mime,
            });
          }
        };
        const clash = childrenOf(n, dstParent).some((c) => c.name === dstName);
        await copyNode(src, dstParent, clash ? `${dstName} copy` : dstName);
        return [];
      }
      case "open": {
        const target = args.join(" ");
        if (!target) {
          return [err("usage: open <finder|terminal|editor|settings|path>")];
        }
        // A real path wins over app shortcuts — `open Notes` in the home
        // folder opens the Notes folder in Finder, like a real shell.
        const id = resolvePath(n, cwdId, target);
        if (id) {
          const node = n[id];
          // Folders → Finder; files → the shared associations registry.
          if (openFileNode(node) === "info") {
            return [out(`${node.name}: ${node.mime ?? "unknown type"}, ${node.size} bytes (no app associated)`)];
          }
          return [];
        }
        const what = target.toLowerCase().replace(/\s+/g, "");
        if (what === "finder") {
          os().openApp("finder", { folderId: cwdId });
          return [out("Opening Finder…")];
        }
        const appShortcuts: Record<string, AppId> = {
          terminal: "terminal",
          settings: "settings",
          editor: "editor",
          photos: "photos",
          preview: "preview",
          notes: "notes",
          calculator: "calculator",
          calendar: "calendar",
          music: "music",
          browser: "browser",
          code: "code",
        };
        if (appShortcuts[what]) {
          const app = appShortcuts[what];
          os().openApp(app);
          return [out(`Opening ${APP_NAMES[app]}…`)];
        }
        return [err(`open: ${target}: No such file or directory`)];
      }
      case "urukfetch":
        return await urukfetch();
      case "exit":
        os().closeWindow(win.id);
        return [];
      default:
        return [err(`uruksh: command not found: ${cmd}`)];
    }
  }

  const submit = async () => {
    const raw = value;
    print([{ text: `${prompt()} ${raw}`, kind: "in" }]);
    setValue("");
    if (raw.trim()) {
      setHistory((h) => [raw, ...h].slice(0, 100));
    }
    setHistIdx(-1);
    const result = await run(raw);
    if (result.length) print(result);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      void submit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length) {
        const idx = Math.min(histIdx + 1, history.length - 1);
        setHistIdx(idx);
        setValue(history[idx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = histIdx - 1;
      setHistIdx(Math.max(idx, -1));
      setValue(idx >= 0 ? history[idx] : "");
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-[#17181c] font-mono text-[12.5px] leading-[1.45] text-neutral-200"
      onClick={() => inputRef.current?.focus()}
      data-testid="terminal"
    >
      <div ref={scrollRef} className="uruk-scroll min-h-0 flex-1 overflow-y-auto p-2.5">
        {lines.map((l, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap break-all ${
              l.kind === "err" ? "text-red-400" : l.kind === "in" ? "text-neutral-100" : "text-neutral-300"
            }`}
          >
            {l.text}
          </div>
        ))}
        <div className="flex items-center whitespace-pre">
          <span className="text-emerald-400">{prompt()} </span>
          <input
            ref={inputRef}
            data-testid="terminal-input"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKey}
            className="min-w-0 flex-1 bg-transparent font-mono text-neutral-100 caret-emerald-400 outline-none"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
