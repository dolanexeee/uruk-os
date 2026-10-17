import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ROOT_ID,
  TRASH_ID,
  childrenOf,
  formatBytes,
  isTextLike,
  pathOf,
  totalSize,
  useFS,
  type FSNode,
} from "@/lib/fs";
import { useOS, type WinState } from "@/store/os";
import ContextMenu, { useContextMenu, type MenuEntry } from "@/components/ContextMenu";
import { FileIcon, FolderIcon } from "@/components/icons";

const FAVORITES = ["Desktop", "Documents", "Downloads", "Pictures"];

function folderByName(nodes: Record<string, FSNode>, name: string): FSNode | undefined {
  return Object.values(nodes).find((n) => n.parentId === ROOT_ID && n.name === name);
}

interface InfoState {
  node: FSNode;
}

export default function Finder({ win }: { win: WinState }) {
  const nodes = useFS((s) => s.nodes);
  const fs = useFS.getState;
  const os = useOS();
  const focused = os.focusedId === win.id;

  const [currentId, setCurrentId] = useState<string>(
    win.props.folderId ?? "folder-desktop",
  );
  const [backStack, setBackStack] = useState<string[]>([]);
  const [fwdStack, setFwdStack] = useState<string[]>([]);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [info, setInfo] = useState<InfoState | null>(null);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { menu, open, close } = useContextMenu();

  const current = nodes[currentId];
  const inTrash = currentId === TRASH_ID;

  /* sync title */
  useEffect(() => {
    if (current) os.setWindowTitle(win.id, current.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.name, win.id]);

  /* respond to new props (e.g. Dock Trash opens with folder) */
  useEffect(() => {
    if (win.props.folderId && win.props.folderId !== currentId) {
      navigate(win.props.folderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.props.folderId]);

  useEffect(() => {
    let live = true;
    const read = async () => {
      if (navigator.storage?.estimate) {
        const e = await navigator.storage.estimate();
        if (live) setEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 });
      }
    };
    void read();
    const t = setInterval(read, 4000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const navigate = useCallback(
    (id: string) => {
      if (id === currentId) return;
      setBackStack((s) => [...s, currentId]);
      setFwdStack([]);
      setCurrentId(id);
      setSelectedId(null);
      setQuery("");
    },
    [currentId],
  );

  const goBack = () => {
    const prev = backStack[backStack.length - 1];
    if (!prev) return;
    setBackStack((s) => s.slice(0, -1));
    setFwdStack((s) => [currentId, ...s]);
    setCurrentId(prev);
    setSelectedId(null);
  };
  const goForward = () => {
    const next = fwdStack[0];
    if (!next) return;
    setFwdStack((s) => s.slice(1));
    setBackStack((s) => [...s, currentId]);
    setCurrentId(next);
    setSelectedId(null);
  };

  const items = useMemo(() => {
    const kids = childrenOf(nodes, currentId);
    if (!query.trim()) return kids;
    const q = query.toLowerCase();
    return kids.filter((k) => k.name.toLowerCase().includes(q));
  }, [nodes, currentId, query]);

  const openNode = useCallback(
    (node: FSNode) => {
      if (node.type === "folder") {
        navigate(node.id);
        return;
      }
      if (isTextLike(node.name, node.mime)) {
        os.openApp("editor", { fileId: node.id }, node.name);
        return;
      }
      if (node.mime.startsWith("image/") && node.blob) {
        setInfo({ node });
        return;
      }
      setInfo({ node });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate],
  );

  const newFolder = useCallback(async () => {
    const node = await fs().createFolder(currentId, "Untitled folder", true);
    setSelectedId(node.id);
    setRenamingId(node.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const doImport = useCallback(
    async (files: File[]) => {
      if (files.length) await fs().importFiles(currentId, files);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentId],
  );

  /* File-menu registration while focused */
  useEffect(() => {
    if (!focused) return;
    os.setFileMenuItems([
      { label: "New Folder", action: () => void newFolder() },
      { label: "Import Files…", action: () => fileInputRef.current?.click() },
    ]);
    return () => os.setFileMenuItems(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, newFolder]);

  const itemMenu = (e: React.MouseEvent, node: FSNode) => {
    setSelectedId(node.id);
    const moveTargets = ["Desktop", "Documents", "Downloads", "Pictures"]
      .map((name) => folderByName(nodes, name))
      .filter((f): f is FSNode => !!f && f.id !== node.parentId && f.id !== node.id);
    const entries: MenuEntry[] = inTrash
      ? [
          { label: "Put Back", action: () => void fs().restore(node.id) },
          {
            label: "Delete Immediately",
            danger: true,
            action: () => void fs().removeForever(node.id),
          },
          { separator: true, label: "" },
          { label: "Get Info", action: () => setInfo({ node }) },
        ]
      : [
          { label: "Open", action: () => openNode(node) },
          { label: "Rename", action: () => setRenamingId(node.id) },
          { separator: true, label: "" },
          ...moveTargets.map((f) => ({
            label: `Move to ${f.name}`,
            action: () => void fs().move(node.id, f.id),
          })),
          { separator: true, label: "" },
          { label: "Get Info", action: () => setInfo({ node }) },
          {
            label: "Move to Trash",
            danger: true,
            action: () => void fs().trash(node.id),
          },
        ];
    open(e, entries);
  };

  const bgMenu = (e: React.MouseEvent) => {
    open(e, [
      { label: "New Folder", action: () => void newFolder() },
      { label: "Import Files…", action: () => fileInputRef.current?.click() },
      { separator: true, label: "" },
      {
        label: view === "grid" ? "View as List" : "View as Icons",
        action: () => setView(view === "grid" ? "list" : "grid"),
      },
    ]);
  };

  const storageText = estimate
    ? `${formatBytes(estimate.usage)} of ${formatBytes(estimate.quota)} used`
    : `${formatBytes(totalSize(nodes))} in file system`;

  const sidebarItem = (node: FSNode | undefined, label: string) => {
    if (!node) return null;
    const active = currentId === node.id;
    return (
      <button
        key={node.id}
        data-testid={`finder-sidebar-${label.toLowerCase()}`}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[13px] ${
          active
            ? "bg-[var(--accent)] text-white"
            : "text-neutral-700 hover:bg-black/5 dark:text-neutral-200 dark:hover:bg-white/10"
        }`}
        onClick={() => navigate(node.id)}
      >
        <span className="text-[13px]">{node.id === TRASH_ID ? "🗑" : "📁"}</span>
        {label}
      </button>
    );
  };

  const commitRename = async (node: FSNode, value: string) => {
    setRenamingId(null);
    if (value.trim() && value !== node.name) {
      const ok = await fs().rename(node.id, value);
      if (!ok) setRenamingId(node.id);
    }
  };

  const renderName = (node: FSNode, listMode: boolean) => {
    if (renamingId === node.id) {
      return (
        <input
          data-testid="finder-rename-input"
          autoFocus
          defaultValue={node.name}
          className={`rounded border border-[var(--accent)] bg-white px-1 text-[13px] text-neutral-900 outline-none dark:bg-neutral-900 dark:text-neutral-100 ${
            listMode ? "w-56" : "w-full text-center"
          }`}
          onFocus={(e) => {
            const dot = node.name.lastIndexOf(".");
            e.target.setSelectionRange(0, node.type === "file" && dot > 0 ? dot : node.name.length);
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitRename(node, (e.target as HTMLInputElement).value);
            if (e.key === "Escape") setRenamingId(null);
          }}
          onBlur={(e) => void commitRename(node, e.target.value)}
        />
      );
    }
    return (
      <span
        className={`${listMode ? "" : "line-clamp-2 text-center"} break-words`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          openNode(node);
        }}
      >
        {node.name}
      </span>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 text-neutral-800 dark:text-neutral-100">
      {/* sidebar */}
      <div className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-black/10 bg-neutral-200/60 p-2 dark:border-white/10 dark:bg-neutral-800/60">
        <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Favorites
        </div>
        {FAVORITES.map((name) => sidebarItem(folderByName(nodes, name), name))}
        <div className="mt-auto">
          {sidebarItem(nodes[TRASH_ID], "Trash")}
          <div className="px-2 pb-1 pt-2 text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">
            <div className="font-semibold text-neutral-600 dark:text-neutral-300">Storage</div>
            <div data-testid="finder-storage">{storageText}</div>
          </div>
        </div>
      </div>

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col bg-white dark:bg-neutral-900">
        {/* toolbar */}
        <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2 dark:border-white/10">
          <button
            data-testid="finder-back"
            disabled={!backStack.length}
            className="rounded px-1.5 text-lg leading-none disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/10"
            onClick={goBack}
          >
            ‹
          </button>
          <button
            data-testid="finder-forward"
            disabled={!fwdStack.length}
            className="rounded px-1.5 text-lg leading-none disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/10"
            onClick={goForward}
          >
            ›
          </button>
          <span className="ml-1 text-[15px] font-bold" data-testid="finder-current-name">
            {current?.name ?? ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <input
              data-testid="finder-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-36 rounded-md border border-black/10 bg-neutral-100 px-2 py-1 text-[13px] outline-none focus:border-[var(--accent)] dark:border-white/10 dark:bg-neutral-800"
            />
            <div className="flex overflow-hidden rounded-md border border-black/10 dark:border-white/10">
              <button
                data-testid="finder-view-grid"
                className={`px-2 py-1 text-[13px] ${view === "grid" ? "bg-[var(--accent)] text-white" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
                onClick={() => setView("grid")}
              >
                ▦
              </button>
              <button
                data-testid="finder-view-list"
                className={`px-2 py-1 text-[13px] ${view === "list" ? "bg-[var(--accent)] text-white" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
                onClick={() => setView("list")}
              >
                ☰
              </button>
            </div>
            <button
              data-testid="finder-new-folder"
              className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-[13px] font-medium text-white"
              onClick={() => void newFolder()}
            >
              New Folder
            </button>
            <button
              data-testid="finder-import"
              className="rounded-md border border-black/10 px-2.5 py-1 text-[13px] dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => fileInputRef.current?.click()}
            >
              Import
            </button>
            {inTrash && (
              <button
                data-testid="finder-empty-trash"
                className="rounded-md border border-red-300 px-2.5 py-1 text-[13px] text-red-600 dark:border-red-500/40 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                onClick={() => void fs().emptyTrash()}
              >
                Empty Trash
              </button>
            )}
          </div>
        </div>

        {/* items */}
        <div
          className="uruk-scroll min-h-0 flex-1 overflow-y-auto p-3"
          data-testid="finder-items"
          onClick={() => setSelectedId(null)}
          onContextMenu={bgMenu}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void doImport(Array.from(e.dataTransfer.files));
          }}
        >
          {items.length === 0 && (
            <div className="flex h-full items-center justify-center text-[13px] text-neutral-400">
              {query ? "No items match your search." : "This folder is empty."}
            </div>
          )}
          {view === "grid" ? (
            <div className="grid grid-cols-[repeat(auto-fill,92px)] gap-2">
              {items.map((node) => (
                <div
                  key={node.id}
                  data-testid={`finder-item-${node.name}`}
                  className={`flex cursor-default flex-col items-center gap-1 rounded-lg p-2 ${
                    selectedId === node.id ? "bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/50" : ""
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(node.id);
                  }}
                  onDoubleClick={() => openNode(node)}
                  onContextMenu={(e) => itemMenu(e, node)}
                >
                  {node.type === "folder" ? (
                    <FolderIcon size={52} />
                  ) : node.mime.startsWith("image/") ? (
                    <FileIcon size={52} image />
                  ) : (
                    <FileIcon size={52} />
                  )}
                  <div className="w-full text-[12px] leading-4">{renderName(node, false)}</div>
                </div>
              ))}
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-black/10 text-left text-neutral-500 dark:border-white/10 dark:text-neutral-400">
                  <th className="py-1 pr-2 font-medium">Name</th>
                  <th className="w-24 py-1 pr-2 font-medium">Size</th>
                  <th className="w-44 py-1 font-medium">Date Modified</th>
                </tr>
              </thead>
              <tbody>
                {items.map((node) => (
                  <tr
                    key={node.id}
                    data-testid={`finder-item-${node.name}`}
                    className={`cursor-default ${selectedId === node.id ? "bg-[var(--accent)]/15" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(node.id);
                    }}
                    onDoubleClick={() => openNode(node)}
                    onContextMenu={(e) => itemMenu(e, node)}
                  >
                    <td className="py-1 pr-2">
                      <span className="mr-2 inline-block align-[-3px]">
                        {node.type === "folder" ? (
                          <FolderIcon size={18} />
                        ) : (
                          <FileIcon size={18} image={node.mime.startsWith("image/")} />
                        )}
                      </span>
                      {renderName(node, true)}
                    </td>
                    <td className="py-1 pr-2 text-neutral-500 dark:text-neutral-400">
                      {node.type === "folder" ? "—" : formatBytes(node.size)}
                    </td>
                    <td className="py-1 text-neutral-500 dark:text-neutral-400">
                      {new Date(node.modifiedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* status bar */}
        <div className="border-t border-black/10 px-3 py-1 text-center text-[12px] text-neutral-500 dark:border-white/10 dark:text-neutral-400">
          {items.length} item{items.length === 1 ? "" : "s"}
          {selectedId && nodes[selectedId] ? ` — ${nodes[selectedId].name} selected` : ""}
        </div>
      </div>

      {/* Get Info panel */}
      {info && (
        <InfoPanel
          node={info.node}
          nodes={nodes}
          onClose={() => setInfo(null)}
          onOpenInEditor={() => {
            os.openApp("editor", { fileId: info.node.id }, info.node.name);
            setInfo(null);
          }}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        data-testid="finder-file-input"
        onChange={(e) => {
          void doImport(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <ContextMenu menu={menu} onClose={close} />
    </div>
  );
}

function InfoPanel({
  node,
  nodes,
  onClose,
  onOpenInEditor,
}: {
  node: FSNode;
  nodes: Record<string, FSNode>;
  onClose: () => void;
  onOpenInEditor: () => void;
}) {
  const fresh = nodes[node.id] ?? node;
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  useEffect(() => {
    if (fresh.blob && fresh.mime.startsWith("image/")) {
      const u = URL.createObjectURL(fresh.blob);
      setImgUrl(u);
      return () => URL.revokeObjectURL(u);
    }
  }, [fresh]);

  const size =
    fresh.type === "folder"
      ? childrenOf(nodes, fresh.id).reduce((s, c) => s + c.size, 0)
      : fresh.size;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/25" onClick={onClose}>
      <div
        className="w-[340px] rounded-xl bg-white p-4 shadow-2xl dark:bg-neutral-800"
        onClick={(e) => e.stopPropagation()}
        data-testid="finder-info-panel"
      >
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-3">
            {fresh.type === "folder" ? <FolderIcon size={44} /> : <FileIcon size={44} image={fresh.mime.startsWith("image/")} />}
            <div>
              <div className="text-[15px] font-semibold leading-5">{fresh.name}</div>
              <div className="text-[12px] text-neutral-500 dark:text-neutral-400">
                {fresh.type === "folder" ? "Folder" : fresh.mime}
              </div>
            </div>
          </div>
          <button className="rounded-full bg-black/5 px-2 py-0.5 text-sm dark:bg-white/10" onClick={onClose}>
            ✕
          </button>
        </div>
        {imgUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgUrl} alt={fresh.name} className="mb-3 max-h-44 w-full rounded-md object-contain bg-black/5" />
        )}
        <dl className="space-y-1.5 text-[13px]">
          <div className="flex justify-between"><dt className="text-neutral-500 dark:text-neutral-400">Size</dt><dd>{formatBytes(size)}</dd></div>
          <div className="flex justify-between"><dt className="text-neutral-500 dark:text-neutral-400">Where</dt><dd className="max-w-[190px] truncate">{pathOf(nodes, fresh.parentId ?? ROOT_ID)}</dd></div>
          <div className="flex justify-between"><dt className="text-neutral-500 dark:text-neutral-400">Created</dt><dd>{new Date(fresh.createdAt).toLocaleString()}</dd></div>
          <div className="flex justify-between"><dt className="text-neutral-500 dark:text-neutral-400">Modified</dt><dd>{new Date(fresh.modifiedAt).toLocaleString()}</dd></div>
        </dl>
        {fresh.type === "file" && isTextLike(fresh.name, fresh.mime) && (
          <button
            className="mt-4 w-full rounded-md bg-[var(--accent)] py-1.5 text-[13px] font-medium text-white"
            onClick={onOpenInEditor}
          >
            Open in Editor
          </button>
        )}
      </div>
    </div>
  );
}
