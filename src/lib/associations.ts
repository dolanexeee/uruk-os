import { TRASH_ID, type FSNode } from "./fs";
import { useOS, type AppId } from "@/store/os";

/**
 * File-associations registry — the one place that decides which app opens
 * a file. Finder, the desktop icons, and Terminal's `open` all route
 * through here so double-click behavior is consistent everywhere.
 */

export const CODE_EXTS = new Set([
  "js", "jsx", "ts", "tsx", "py", "html", "htm", "css", "json", "md", "sh",
]);

export const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico",
]);

export const AUDIO_EXTS = new Set([
  "mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus", "webm",
]);

export function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function isImageNode(node: FSNode): boolean {
  return node.type === "file" && (node.mime.startsWith("image/") || IMAGE_EXTS.has(extOf(node.name)));
}

export function isAudioNode(node: FSNode): boolean {
  return node.type === "file" && (node.mime.startsWith("audio/") || AUDIO_EXTS.has(extOf(node.name)));
}

export function isPdfNode(node: FSNode): boolean {
  return node.type === "file" && (node.mime === "application/pdf" || extOf(node.name) === "pdf");
}

export function isCodeNode(node: FSNode): boolean {
  return node.type === "file" && CODE_EXTS.has(extOf(node.name));
}

export type OpenRoute =
  | { kind: "app"; app: AppId }
  | { kind: "folder" }
  | { kind: "info" };

/** Decide where a node opens. Pure — safe to call anywhere. */
export function routeForNode(node: FSNode): OpenRoute {
  if (node.type === "folder") return { kind: "folder" };
  if (isPdfNode(node)) return { kind: "app", app: "preview" };
  if (isImageNode(node)) return { kind: "app", app: "photos" };
  if (isAudioNode(node)) return { kind: "app", app: "music" };
  if (isCodeNode(node)) return { kind: "app", app: "code" };
  if (
    node.mime.startsWith("text/") ||
    extOf(node.name) === "txt" ||
    extOf(node.name) === "log" ||
    extOf(node.name) === "csv"
  ) {
    return { kind: "app", app: "editor" };
  }
  return { kind: "info" };
}

/**
 * Open a file node in its associated app.
 * Returns "info" when no app claims the file (callers show Get Info),
 * or "folder" for folders (callers navigate / open a Finder window).
 */
export function openFileNode(node: FSNode): "app" | "info" | "folder" {
  const route = routeForNode(node);
  const os = useOS.getState();
  if (route.kind === "folder") {
    os.openApp("finder", { folderId: node.id }, node.name);
    return "folder";
  }
  if (route.kind === "info") return "info";
  os.openApp(route.app, { fileId: node.id }, node.name);
  return "app";
}

/** Is this node inside the Trash (itself or any descendant of it)? */
export function inTrash(nodes: Record<string, FSNode>, node: FSNode): boolean {
  let cur: FSNode | undefined = node;
  while (cur) {
    if (cur.id === TRASH_ID) return true;
    cur = cur.parentId ? nodes[cur.parentId] : undefined;
  }
  return false;
}
