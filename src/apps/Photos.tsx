import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  childrenOf,
  collectSubtree,
  homeFolder,
  useFS,
  type FSNode,
} from "@/lib/fs";
import { isImageNode } from "@/lib/associations";
import { useOS, type WinState } from "@/store/os";

/**
 * Photos — a gallery over the real Pictures folder of the file system.
 * Thumbnails and the viewer render the actual stored blobs.
 */

export function useObjectUrls(nodes: FSNode[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = nodes.map((n) => n.id).join(",");
  useEffect(() => {
    const made: Record<string, string> = {};
    for (const n of nodes) {
      if (n.blob) made[n.id] = URL.createObjectURL(n.blob);
    }
    setUrls(made);
    return () => {
      for (const u of Object.values(made)) URL.revokeObjectURL(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

export default function Photos({ win }: { win: WinState }) {
  const nodes = useFS((s) => s.nodes);
  const fs = useFS.getState;
  const os = useOS();
  const focused = os.focusedId === win.id;

  const [viewingId, setViewingId] = useState<string | null>(win.props.fileId ?? null);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pictures = homeFolder(nodes, "Pictures");
  const photos = useMemo(() => {
    if (!pictures) return [];
    const ids = new Set(collectSubtree(nodes, pictures.id));
    return Object.values(nodes)
      .filter((n) => ids.has(n.id) && isImageNode(n) && n.id !== pictures.id)
      .sort((a, b) => b.createdAt - a.createdAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, pictures?.id]);

  const urls = useObjectUrls(photos);
  const viewing = viewingId ? nodes[viewingId] : undefined;
  const viewingIdx = viewing ? photos.findIndex((p) => p.id === viewing.id) : -1;

  /* respond to being opened with a specific file (association / re-open) */
  useEffect(() => {
    if (win.props.fileId) {
      setViewingId(win.props.fileId);
      setZoom(1);
      setFit(true);
    }
  }, [win.props.fileId]);

  useEffect(() => {
    os.setWindowTitle(win.id, viewing ? viewing.name : "Photos");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing?.name, win.id]);

  const step = (delta: number) => {
    if (viewingIdx < 0) return;
    const next = photos[(viewingIdx + delta + photos.length) % photos.length];
    if (next) {
      setViewingId(next.id);
      setZoom(1);
      setFit(true);
    }
  };

  const deleteViewing = async () => {
    if (!viewing) return;
    const idx = viewingIdx;
    const id = viewing.id;
    const remaining = photos.filter((p) => p.id !== id);
    setViewingId(remaining.length ? remaining[Math.min(idx, remaining.length - 1)].id : null);
    await fs().trash(id);
  };

  /* keyboard navigation while focused */
  useEffect(() => {
    if (!focused || !viewingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Escape") setViewingId(null);
      else if (e.key === "+" || e.key === "=") {
        setFit(false);
        setZoom((z) => Math.min(4, z * 1.25));
      } else if (e.key === "-") {
        setFit(false);
        setZoom((z) => Math.max(0.25, z / 1.25));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, viewingId, viewingIdx, photos]);

  useEffect(() => {
    if (!focused) return;
    os.setFileMenuItems([
      { label: "Import Photos…", action: () => fileInputRef.current?.click() },
      ...(viewing
        ? [
            {
              label: "Set as Wallpaper",
              action: () => os.setCustomWallpaper(viewing.id),
            },
            {
              label: "Open in Preview",
              action: () => os.openApp("preview", { fileId: viewing.id }, viewing.name),
            },
          ]
        : []),
    ]);
    return () => os.setFileMenuItems(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, viewing?.id]);

  const doImport = async (files: File[]) => {
    const pics = homeFolder(fs().nodes, "Pictures");
    if (pics && files.length) await fs().importFiles(pics.id, files);
  };

  /* ------------------------------ viewer ------------------------------ */
  if (viewing) {
    const url = urls[viewing.id];
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-neutral-900 text-neutral-100" data-testid="photos-viewer">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-[12.5px]">
          <button
            data-testid="photos-back"
            className="rounded px-2 py-0.5 hover:bg-white/10"
            onClick={() => setViewingId(null)}
          >
            ‹ All Photos
          </button>
          <span className="font-medium" data-testid="photos-viewer-name">{viewing.name}</span>
          <span className="text-neutral-400">
            {viewingIdx + 1} of {photos.length}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              data-testid="photos-zoom-out"
              className="rounded px-2 py-0.5 hover:bg-white/10"
              onClick={() => {
                setFit(false);
                setZoom((z) => Math.max(0.25, z / 1.25));
              }}
            >
              −
            </button>
            <span className="w-12 text-center tabular-nums" data-testid="photos-zoom-label">
              {fit ? "Fit" : `${Math.round(zoom * 100)}%`}
            </span>
            <button
              data-testid="photos-zoom-in"
              className="rounded px-2 py-0.5 hover:bg-white/10"
              onClick={() => {
                setFit(false);
                setZoom((z) => Math.min(4, z * 1.25));
              }}
            >
              +
            </button>
            <button
              data-testid="photos-zoom-fit"
              className="rounded px-2 py-0.5 hover:bg-white/10"
              onClick={() => setFit(true)}
            >
              Fit
            </button>
            <button
              data-testid="photos-zoom-actual"
              className="rounded px-2 py-0.5 hover:bg-white/10"
              onClick={() => {
                setFit(false);
                setZoom(1);
              }}
            >
              100%
            </button>
            <span className="mx-1 h-4 w-px bg-white/15" />
            <button
              data-testid="photos-set-wallpaper"
              className="rounded bg-[var(--accent)] px-2 py-0.5 font-medium text-white"
              onClick={() => os.setCustomWallpaper(viewing.id)}
            >
              Set as Wallpaper
            </button>
            <button
              data-testid="photos-open-preview"
              className="rounded px-2 py-0.5 hover:bg-white/10"
              onClick={() => os.openApp("preview", { fileId: viewing.id }, viewing.name)}
            >
              Preview
            </button>
            <button
              data-testid="photos-delete"
              className="rounded px-2 py-0.5 text-red-400 hover:bg-red-500/15"
              onClick={() => void deleteViewing()}
            >
              Delete
            </button>
          </div>
        </div>

        <div className="uruk-scroll relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={viewing.name}
              data-testid="photos-viewer-img"
              draggable={false}
              className={fit ? "max-h-full max-w-full object-contain" : ""}
              style={fit ? undefined : { width: `${zoom * 100}%`, maxWidth: "none" }}
            />
          ) : (
            <div className="text-neutral-400">This image has no stored data.</div>
          )}
          {photos.length > 1 && (
            <>
              <button
                data-testid="photos-prev"
                className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-xl text-white hover:bg-black/65"
                onClick={() => step(-1)}
              >
                ‹
              </button>
              <button
                data-testid="photos-next"
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-xl text-white hover:bg-black/65"
                onClick={() => step(1)}
              >
                ›
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ------------------------------ gallery ------------------------------ */
  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-white dark:bg-neutral-900"
      data-testid="photos"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void doImport(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2 dark:border-white/10">
        <span className="text-[15px] font-bold text-neutral-800 dark:text-neutral-100">Library</span>
        <span className="text-[12px] text-neutral-500 dark:text-neutral-400">
          {photos.length} photo{photos.length === 1 ? "" : "s"} · Pictures folder
        </span>
        <button
          data-testid="photos-import"
          className="ml-auto rounded-md bg-[var(--accent)] px-2.5 py-1 text-[13px] font-medium text-white"
          onClick={() => fileInputRef.current?.click()}
        >
          Import
        </button>
      </div>

      {photos.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <div className="text-[15px] font-semibold text-neutral-600 dark:text-neutral-300">
            No photos yet
          </div>
          <p className="max-w-sm text-[13px] leading-5 text-neutral-400">
            Import pictures with the Import button or by dragging image files
            into this window. They are stored in your Pictures folder and
            stay here between visits.
          </p>
        </div>
      ) : (
        <div className="uruk-scroll grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(118px,1fr))] content-start gap-2 overflow-y-auto p-3">
          {photos.map((p) => (
            <button
              key={p.id}
              data-testid={`photos-thumb-${p.name}`}
              className="group overflow-hidden rounded-lg ring-1 ring-black/10 dark:ring-white/10"
              onClick={() => {
                setViewingId(p.id);
                setZoom(1);
                setFit(true);
              }}
            >
              {urls[p.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urls[p.id]}
                  alt={p.name}
                  className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.03]"
                  draggable={false}
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-neutral-200 text-[11px] text-neutral-500 dark:bg-neutral-800">
                  {p.name}
                </div>
              )}
              <div className="truncate bg-neutral-50 px-1.5 py-1 text-left text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {p.name}
              </div>
            </button>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid="photos-file-input"
        onChange={(e) => {
          void doImport(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
