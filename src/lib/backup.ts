import { strToU8, unzipSync, zipSync } from "fflate";
import {
  ROOT_ID,
  TRASH_ID,
  useFS,
  type FSNode,
  type NodeMap,
} from "./fs";
import { useOS } from "@/store/os";
import { useSystem } from "@/store/system";

/**
 * Backup / Restore — Phase 3. The free-storage story, completed:
 * everything in Uruk OS (the whole file system + settings) exports to
 * ONE self-contained `.urukos` file the user keeps wherever they like,
 * and imports back into any Uruk OS.
 *
 * Format `urukos-backup: 1`:
 *   manifest.json          nodes (metadata + inline text) + settings
 *   blobs/<nodeId>         raw bytes for every node that holds a Blob
 * The same data also serializes to a single JSON document (blobs as
 * base64) — that is the payload the optional Supabase sync moves.
 *
 * The lock-screen PIN is deliberately NOT part of a backup: restoring
 * never changes the PIN state of the machine you restore onto.
 */

export const BACKUP_FORMAT = "urukos-backup";
export const BACKUP_VERSION = 1;

export interface BackupSettings {
  os: Record<string, unknown> | null;
  system: Record<string, unknown> | null;
}

export interface BackupData {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: number;
  nodes: FSNode[]; // blob fields stripped; binary lives in `blobs`
  blobs: Map<string, Uint8Array>;
  settings: BackupSettings;
}

const OS_SETTINGS_KEY = "uruk-os-settings-v1";
const SYSTEM_PREFS_KEY = "uruk-os-system-v1";

/* ------------------------------------------------------------------ */
/* Collect                                                             */
/* ------------------------------------------------------------------ */

function stripNode(n: FSNode): FSNode {
  const { blob: _blob, ...rest } = n;
  return rest;
}

export async function collectBackup(): Promise<BackupData> {
  const nodes = useFS.getState().nodes;
  const list = Object.values(nodes);
  const blobs = new Map<string, Uint8Array>();
  for (const n of list) {
    if (n.blob) blobs.set(n.id, new Uint8Array(await n.blob.arrayBuffer()));
  }
  const read = (k: string): Record<string, unknown> | null => {
    try {
      const raw = localStorage.getItem(k);
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    nodes: list.map(stripNode),
    blobs,
    settings: { os: read(OS_SETTINGS_KEY), system: read(SYSTEM_PREFS_KEY) },
  };
}

/* ------------------------------------------------------------------ */
/* ZIP form (.urukos file)                                             */
/* ------------------------------------------------------------------ */

export async function exportBackupZip(): Promise<Uint8Array> {
  const data = await collectBackup();
  const files: Record<string, Uint8Array> = {};
  const manifest = {
    format: data.format,
    version: data.version,
    createdAt: data.createdAt,
    nodes: data.nodes,
    settings: data.settings,
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  for (const [id, bytes] of data.blobs) files[`blobs/${id}`] = bytes;
  return zipSync(files, { level: 6 });
}

export function parseBackupZip(bytes: Uint8Array): BackupData {
  const entries = unzipSync(bytes);
  const manifestRaw = entries["manifest.json"];
  if (!manifestRaw) throw new Error("Not an Uruk OS backup (no manifest.json).");
  const manifest = JSON.parse(new TextDecoder().decode(manifestRaw)) as {
    format?: string;
    version?: number;
    createdAt?: number;
    nodes?: FSNode[];
    settings?: BackupSettings;
  };
  assertManifest(manifest);
  const blobs = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(entries)) {
    if (path.startsWith("blobs/")) blobs.set(path.slice("blobs/".length), data);
  }
  return {
    format: BACKUP_FORMAT,
    version: manifest.version!,
    createdAt: manifest.createdAt ?? 0,
    nodes: manifest.nodes!,
    blobs,
    settings: manifest.settings ?? { os: null, system: null },
  };
}

/* ------------------------------------------------------------------ */
/* JSON form (sync payload)                                            */
/* ------------------------------------------------------------------ */

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface BackupJSON {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: number;
  nodes: FSNode[];
  blobs: Record<string, string>; // nodeId -> base64
  settings: BackupSettings;
}

export async function serializeBackupJSON(): Promise<BackupJSON> {
  const data = await collectBackup();
  const blobs: Record<string, string> = {};
  for (const [id, bytes] of data.blobs) blobs[id] = bytesToB64(bytes);
  return {
    format: data.format,
    version: data.version,
    createdAt: data.createdAt,
    nodes: data.nodes,
    blobs,
    settings: data.settings,
  };
}

export function parseBackupJSON(doc: BackupJSON): BackupData {
  assertManifest(doc);
  const blobs = new Map<string, Uint8Array>();
  for (const [id, b64] of Object.entries(doc.blobs ?? {})) blobs.set(id, b64ToBytes(b64));
  return {
    format: BACKUP_FORMAT,
    version: doc.version,
    createdAt: doc.createdAt ?? 0,
    nodes: doc.nodes,
    blobs,
    settings: doc.settings ?? { os: null, system: null },
  };
}

function assertManifest(m: { format?: string; version?: number; nodes?: unknown }): void {
  if (m.format !== BACKUP_FORMAT) throw new Error("Not an Uruk OS backup file.");
  if (typeof m.version !== "number" || m.version > BACKUP_VERSION)
    throw new Error(`Unsupported backup version: ${String(m.version)}`);
  if (!Array.isArray(m.nodes)) throw new Error("Backup manifest has no file nodes.");
}

/* ------------------------------------------------------------------ */
/* Restore                                                             */
/* ------------------------------------------------------------------ */

function materialize(data: BackupData): FSNode[] {
  return data.nodes.map((n) => {
    const bytes = data.blobs.get(n.id);
    if (!bytes) return { ...n };
    // Copy into a fresh ArrayBuffer: fflate hands back views that Blob
    // accepts, but an exact-size buffer keeps every engine happy.
    const buf = new Uint8Array(bytes.byteLength);
    buf.set(bytes);
    return { ...n, blob: new Blob([buf], { type: n.mime || "application/octet-stream" }) };
  });
}

function applySettings(settings: BackupSettings) {
  if (settings.os) {
    try {
      localStorage.setItem(OS_SETTINGS_KEY, JSON.stringify(settings.os));
    } catch {
      /* ignore */
    }
    useOS.getState().hydrateSettings();
  }
  if (settings.system) {
    useSystem.getState().replacePrefs(settings.system as Record<string, unknown>);
  }
}

/**
 * Replace: the machine becomes exactly the backup (file system wiped
 * first). Merge: the backup's tree is added alongside the current one
 * with fresh internal ids, so nothing can collide or be overwritten.
 */
export async function restoreBackup(
  data: BackupData,
  mode: "replace" | "merge",
): Promise<{ files: number }> {
  const fs = useFS.getState();
  const full = materialize(data);

  if (mode === "replace") {
    await fs.replaceAllNodes(full);
    applySettings(data.settings);
    return { files: full.filter((n) => n.type === "file").length };
  }

  // Merge: remap every imported id (except the two fixed roots, which
  // map onto the machine's own root/trash).
  const remap = new Map<string, string>();
  remap.set(ROOT_ID, ROOT_ID);
  remap.set(TRASH_ID, TRASH_ID);
  const freshId = () =>
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  for (const n of full) if (!remap.has(n.id)) remap.set(n.id, freshId());
  const remapped = full
    .filter((n) => n.id !== ROOT_ID && n.id !== TRASH_ID)
    .map((n) => ({
      ...n,
      id: remap.get(n.id)!,
      parentId: n.parentId ? (remap.get(n.parentId) ?? ROOT_ID) : n.parentId,
      originalParentId: n.originalParentId
        ? (remap.get(n.originalParentId) ?? n.originalParentId)
        : n.originalParentId,
    }));
  await fs.addNodes(remapped);
  return { files: remapped.filter((n) => n.type === "file").length };
}

/** Trigger the browser download of the .urukos file. */
export function downloadBackup(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function backupFilename(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `uruk-os-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.urukos`;
}

export type { NodeMap };
