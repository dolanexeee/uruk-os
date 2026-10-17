import { openDB, type IDBPDatabase } from "idb";
import { create } from "zustand";
import { notify } from "@/store/notifications";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface FSNode {
  id: string;
  name: string;
  type: "folder" | "file";
  parentId: string | null;
  mime: string;
  /** Text payload for text files (txt/md and any imported text). */
  text?: string;
  /** Binary payload for imported binary files (images, pdf, …). */
  blob?: Blob;
  size: number;
  createdAt: number;
  modifiedAt: number;
  /** When a node sits in Trash, remember where it came from. */
  originalParentId?: string | null;
}

export const ROOT_ID = "root";
export const TRASH_ID = "trash";

const DB_NAME = "uruk-os-db";
const DB_VERSION = 1;

/* ------------------------------------------------------------------ */
/* IndexedDB plumbing                                                  */
/* ------------------------------------------------------------------ */

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        const store = d.createObjectStore("nodes", { keyPath: "id" });
        store.createIndex("by-parent", "parentId");
      },
    });
  }
  return dbPromise;
}

async function dbAll(): Promise<FSNode[]> {
  return (await db()).getAll("nodes");
}
async function dbPut(node: FSNode): Promise<void> {
  await (await db()).put("nodes", node);
}
async function dbPutMany(nodes: FSNode[]): Promise<void> {
  const tx = (await db()).transaction("nodes", "readwrite");
  await Promise.all(nodes.map((n) => tx.store.put(n)));
  await tx.done;
}
async function dbDeleteMany(ids: string[]): Promise<void> {
  const tx = (await db()).transaction("nodes", "readwrite");
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

/* ------------------------------------------------------------------ */
/* Seed data (all text/artwork original to Uruk OS)                    */
/* ------------------------------------------------------------------ */

const WELCOME_TEXT = `Welcome to Uruk OS
====================

You are running a complete desktop environment inside your web browser.
Everything you see — the windows, the Dock, the files — is real and
stored locally on this device in IndexedDB. Nothing leaves your machine.

Things to try:
  * Open Terminal and run:  urukfetch
  * Create a file:          echo hello > Documents/hello.txt
  * Open that file in the Editor, change it, press Ctrl+S,
    then read it back in Terminal with:  cat Documents/hello.txt
  * Drag real files from your computer onto the desktop to import them.
  * Change the wallpaper and accent color in Settings — they persist.

Uruk OS is a clean-room recreation of the desktop experience, built
from observed behavior. All icons and wallpapers are original artwork.

— The URUK suite
`;

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b1055"/>
      <stop offset="0.55" stop-color="#7597de"/>
      <stop offset="1" stop-color="#f7b267"/>
    </linearGradient>
  </defs>
  <rect width="800" height="560" fill="url(#sky)"/>
  <circle cx="620" cy="130" r="58" fill="#ffd97a"/>
  <circle cx="620" cy="130" r="86" fill="#ffd97a" opacity="0.25"/>
  <polygon points="0,560 240,360 480,560" fill="#3a2b4f"/>
  <polygon points="240,560 520,320 800,560" fill="#2a1e3f"/>
  <g fill="#17102a">
    <rect x="330" y="400" width="140" height="26"/>
    <rect x="345" y="374" width="110" height="26"/>
    <rect x="360" y="348" width="80" height="26"/>
    <rect x="375" y="322" width="50" height="26"/>
  </g>
  <rect x="0" y="520" width="800" height="40" fill="#120b24"/>
</svg>`;

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function seedNodes(): FSNode[] {
  const now = Date.now();
  const mk = (
    partial: Partial<FSNode> & Pick<FSNode, "id" | "name" | "type">,
  ): FSNode => ({
    parentId: null,
    mime: partial.type === "folder" ? "inode/directory" : "text/plain",
    size: 0,
    createdAt: now,
    modifiedAt: now,
    ...partial,
  });

  const desktop = mk({ id: "folder-desktop", name: "Desktop", type: "folder", parentId: ROOT_ID });
  const documents = mk({ id: "folder-documents", name: "Documents", type: "folder", parentId: ROOT_ID });
  const downloads = mk({ id: "folder-downloads", name: "Downloads", type: "folder", parentId: ROOT_ID });
  const pictures = mk({ id: "folder-pictures", name: "Pictures", type: "folder", parentId: ROOT_ID });

  const svgBlob = new Blob([SAMPLE_SVG], { type: "image/svg+xml" });

  return [
    mk({ id: ROOT_ID, name: "mustafa", type: "folder", parentId: null }),
    mk({ id: TRASH_ID, name: "Trash", type: "folder", parentId: null }),
    desktop,
    documents,
    downloads,
    pictures,
    mk({
      id: uid(),
      name: "Welcome.txt",
      type: "file",
      parentId: desktop.id,
      text: WELCOME_TEXT,
      size: WELCOME_TEXT.length,
    }),
    mk({
      id: uid(),
      name: "Welcome.txt",
      type: "file",
      parentId: documents.id,
      text: WELCOME_TEXT,
      size: WELCOME_TEXT.length,
    }),
    mk({
      id: uid(),
      name: "Ziggurat at Dusk.svg",
      type: "file",
      parentId: pictures.id,
      mime: "image/svg+xml",
      blob: svgBlob,
      size: svgBlob.size,
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* Pure helpers over a node map                                        */
/* ------------------------------------------------------------------ */

export type NodeMap = Record<string, FSNode>;

export function childrenOf(nodes: NodeMap, parentId: string): FSNode[] {
  return Object.values(nodes)
    .filter((n) => n.parentId === parentId)
    .sort((a, b) =>
      a.type !== b.type
        ? a.type === "folder"
          ? -1
          : 1
        : a.name.localeCompare(b.name),
    );
}

export function isDescendant(nodes: NodeMap, ancestorId: string, id: string): boolean {
  let cur: FSNode | undefined = nodes[id];
  while (cur) {
    if (cur.id === ancestorId) return true;
    cur = cur.parentId ? nodes[cur.parentId] : undefined;
  }
  return false;
}

export function collectSubtree(nodes: NodeMap, id: string): string[] {
  const out = [id];
  for (const child of childrenOf(nodes, id)) out.push(...collectSubtree(nodes, child.id));
  return out;
}

export function totalSize(nodes: NodeMap): number {
  return Object.values(nodes).reduce((s, n) => s + (n.type === "file" ? n.size : 0), 0);
}

/** Display path: root renders as ~, e.g. ~/Documents/a.txt */
export function pathOf(nodes: NodeMap, id: string): string {
  if (id === TRASH_ID) return "/Trash";
  const parts: string[] = [];
  let cur: FSNode | undefined = nodes[id];
  while (cur && cur.id !== ROOT_ID) {
    parts.unshift(cur.name);
    cur = cur.parentId ? nodes[cur.parentId] : undefined;
  }
  return "~" + (parts.length ? "/" + parts.join("/") : "");
}

/** Resolve a user path (absolute ~/, /, or relative) to a node id, or null. */
export function resolvePath(nodes: NodeMap, cwdId: string, raw: string): string | null {
  let path = raw.trim();
  if (!path) return cwdId;
  let curId: string;
  if (path === "~" || path === "/") return ROOT_ID;
  if (path.startsWith("~/")) {
    curId = ROOT_ID;
    path = path.slice(2);
  } else if (path.startsWith("/")) {
    curId = ROOT_ID;
    path = path.slice(1);
  } else {
    curId = cwdId;
  }
  for (const seg of path.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      const cur = nodes[curId];
      if (cur && cur.parentId) curId = cur.parentId;
      continue;
    }
    const next = childrenOf(nodes, curId).find((n) => n.name === seg);
    if (!next) return null;
    curId = next.id;
  }
  return curId;
}

const TEXT_EXT = /\.(txt|md|markdown|json|js|ts|tsx|css|html|csv|svg|log|sh|py|yml|yaml|xml)$/i;
export function isTextLike(name: string, mime: string): boolean {
  return mime.startsWith("text/") || TEXT_EXT.test(name) || mime === "image/svg+xml";
}

export async function readNodeText(node: FSNode): Promise<string> {
  if (typeof node.text === "string") return node.text;
  if (node.blob) return await node.blob.text();
  return "";
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

interface FSStore {
  nodes: NodeMap;
  loaded: boolean;
  load: () => Promise<void>;
  createFolder: (parentId: string, name: string, dedupe?: boolean) => Promise<FSNode>;
  createFile: (
    parentId: string,
    name: string,
    opts?: { text?: string; blob?: Blob; mime?: string; dedupe?: boolean },
  ) => Promise<FSNode>;
  writeText: (id: string, text: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<boolean>;
  move: (id: string, newParentId: string) => Promise<boolean>;
  trash: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  removeForever: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  importFiles: (parentId: string, files: File[]) => Promise<FSNode[]>;
  /** Replace the ENTIRE file system with the given nodes (backup restore). */
  replaceAllNodes: (nodes: FSNode[]) => Promise<void>;
  /** Insert nodes alongside the current ones (backup merge restore). */
  addNodes: (nodes: FSNode[]) => Promise<void>;
}

let loadPromise: Promise<void> | null = null;

export const useFS = create<FSStore>((set, get) => ({
  nodes: {},
  loaded: false,

  load: async () => {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      let all = await dbAll();
      if (all.length === 0) {
        const seed = seedNodes();
        await dbPutMany(seed);
        all = seed;
      }
      const map: NodeMap = {};
      for (const n of all) map[n.id] = n;
      set({ nodes: map, loaded: true });
    })();
    return loadPromise;
  },

  createFolder: async (parentId, name, dedupe = false) => {
    const nodes = get().nodes;
    let finalName = name;
    if (dedupe) {
      let i = 2;
      const taken = (n: string) => childrenOf(nodes, parentId).some((c) => c.name === n);
      while (taken(finalName)) finalName = `${name} ${i++}`;
    }
    const node: FSNode = {
      id: uid(),
      name: finalName,
      type: "folder",
      parentId,
      mime: "inode/directory",
      size: 0,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    await dbPut(node);
    set((s) => ({ nodes: { ...s.nodes, [node.id]: node } }));
    return node;
  },

  createFile: async (parentId, name, opts = {}) => {
    const nodes = get().nodes;
    let finalName = name;
    if (opts.dedupe) {
      let i = 2;
      const taken = (n: string) => childrenOf(nodes, parentId).some((c) => c.name === n);
      while (taken(finalName)) {
        const dot = name.lastIndexOf(".");
        finalName =
          dot > 0 ? `${name.slice(0, dot)} ${i++}${name.slice(dot)}` : `${name} ${i++}`;
      }
    }
    const text = opts.text;
    const blob = opts.blob;
    const node: FSNode = {
      id: uid(),
      name: finalName,
      type: "file",
      parentId,
      mime: opts.mime ?? (blob ? blob.type || "application/octet-stream" : "text/plain"),
      text,
      blob,
      size: text !== undefined ? text.length : blob ? blob.size : 0,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    await dbPut(node);
    set((s) => ({ nodes: { ...s.nodes, [node.id]: node } }));
    return node;
  },

  writeText: async (id, text) => {
    const node = get().nodes[id];
    if (!node) return;
    const updated: FSNode = {
      ...node,
      text,
      blob: undefined,
      size: text.length,
      modifiedAt: Date.now(),
    };
    await dbPut(updated);
    set((s) => ({ nodes: { ...s.nodes, [id]: updated } }));
  },

  rename: async (id, name) => {
    const nodes = get().nodes;
    const node = nodes[id];
    const clean = name.trim();
    if (!node || !clean || clean.includes("/")) return false;
    if (
      node.parentId &&
      childrenOf(nodes, node.parentId).some((c) => c.id !== id && c.name === clean)
    )
      return false;
    const updated = { ...node, name: clean, modifiedAt: Date.now() };
    await dbPut(updated);
    set((s) => ({ nodes: { ...s.nodes, [id]: updated } }));
    return true;
  },

  move: async (id, newParentId) => {
    const nodes = get().nodes;
    const node = nodes[id];
    const dest = nodes[newParentId];
    if (!node || !dest || dest.type !== "folder") return false;
    if (node.parentId === newParentId) return true;
    if (node.type === "folder" && isDescendant(nodes, node.id, newParentId)) return false;
    if (childrenOf(nodes, newParentId).some((c) => c.id !== id && c.name === node.name))
      return false;
    const updated: FSNode = {
      ...node,
      parentId: newParentId,
      originalParentId:
        newParentId === TRASH_ID ? (node.originalParentId ?? node.parentId) : undefined,
      modifiedAt: Date.now(),
    };
    await dbPut(updated);
    set((s) => ({ nodes: { ...s.nodes, [id]: updated } }));
    return true;
  },

  trash: async (id) => {
    await get().move(id, TRASH_ID);
  },

  restore: async (id) => {
    const nodes = get().nodes;
    const node = nodes[id];
    if (!node) return;
    const dest =
      node.originalParentId && nodes[node.originalParentId]
        ? node.originalParentId
        : ROOT_ID;
    await get().move(id, dest);
  },

  removeForever: async (id) => {
    const ids = collectSubtree(get().nodes, id);
    await dbDeleteMany(ids);
    set((s) => {
      const next = { ...s.nodes };
      for (const x of ids) delete next[x];
      return { nodes: next };
    });
  },

  emptyTrash: async () => {
    const nodes = get().nodes;
    const ids: string[] = [];
    for (const child of childrenOf(nodes, TRASH_ID)) ids.push(...collectSubtree(nodes, child.id));
    if (!ids.length) return;
    await dbDeleteMany(ids);
    set((s) => {
      const next = { ...s.nodes };
      for (const x of ids) delete next[x];
      return { nodes: next };
    });
  },

  importFiles: async (parentId, files) => {
    const out: FSNode[] = [];
    for (const f of files) {
      const textLike = isTextLike(f.name, f.type);
      if (textLike && f.size < 2_000_000) {
        const text = await f.text();
        out.push(
          await get().createFile(parentId, f.name, { text, mime: f.type || "text/plain", dedupe: true }),
        );
      } else {
        out.push(
          await get().createFile(parentId, f.name, {
            blob: f,
            mime: f.type || "application/octet-stream",
            dedupe: true,
          }),
        );
      }
    }
    if (out.length) {
      const dest = get().nodes[parentId]?.name ?? "folder";
      notify(
        "Finder",
        "Import complete",
        `${out.length} file${out.length === 1 ? "" : "s"} imported into ${dest}.`,
      );
    }
    return out;
  },

  replaceAllNodes: async (nodes) => {
    const existing = await dbAll();
    if (existing.length) await dbDeleteMany(existing.map((n) => n.id));
    if (nodes.length) await dbPutMany(nodes);
    const map: NodeMap = {};
    for (const n of nodes) map[n.id] = n;
    set({ nodes: map, loaded: true });
  },

  addNodes: async (nodes) => {
    if (nodes.length) await dbPutMany(nodes);
    set((s) => {
      const next = { ...s.nodes };
      for (const n of nodes) next[n.id] = n;
      return { nodes: next };
    });
  },
}));

/** Find a top-level home folder by name. */
export function homeFolder(nodes: NodeMap, name: string): FSNode | undefined {
  return Object.values(nodes).find((n) => n.parentId === ROOT_ID && n.name === name && n.type === "folder");
}

/**
 * Return the top-level home folder called `name`, creating it on first use.
 * Used by apps that own a folder (Notes, Calendar, Music, …).
 */
export async function ensureHomeFolder(name: string): Promise<FSNode> {
  const existing = homeFolder(useFS.getState().nodes, name);
  if (existing) return existing;
  return useFS.getState().createFolder(ROOT_ID, name);
}

/** Format bytes for Finder "Get Info" / storage readouts. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
