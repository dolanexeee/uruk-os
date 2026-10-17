import React, { useEffect, useRef, useState } from "react";
import { formatBytes, useFS } from "@/lib/fs";
import { isPdfNode } from "@/lib/associations";
import { useOS, type WinState } from "@/store/os";

/**
 * Preview — opens one document: images get zoom + rotate, PDFs render
 * through an object-URL embed. Rotation is a view transform, except for
 * raster images (PNG/JPEG/WebP), which can also save a rotated copy.
 */

const RASTER_ROTATABLE = new Set(["image/png", "image/jpeg", "image/webp"]);

export default function Preview({ win }: { win: WinState }) {
  const nodes = useFS((s) => s.nodes);
  const fs = useFS.getState;
  const os = useOS();
  const fileId = win.props.fileId ?? null;
  const node = fileId ? nodes[fileId] : undefined;

  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setNotice(null);
  }, [fileId]);

  useEffect(() => {
    if (!node?.blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(node.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [node]);

  useEffect(() => {
    os.setWindowTitle(win.id, node ? node.name : "Shamash Eye");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.name, win.id]);

  if (!node) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-neutral-100 px-8 text-center dark:bg-neutral-900" data-testid="preview">
        <div className="text-[15px] font-semibold text-neutral-600 dark:text-neutral-300">
          Nothing to preview
        </div>
        <p className="max-w-xs text-[13px] leading-5 text-neutral-400">
          Shamash Eye opens images and PDFs. Double-click one in Uruk
          Files, or use “Open in Shamash Eye” from Shamash Gallery.
        </p>
      </div>
    );
  }

  const isPdf = isPdfNode(node);
  const isImage = node.mime.startsWith("image/");
  const canSaveRotated = isImage && RASTER_ROTATABLE.has(node.mime) && !!node.blob;

  const saveRotatedCopy = async () => {
    if (!node.blob || !imgRef.current) return;
    const img = imgRef.current;
    try {
      const bitmap = await createImageBitmap(node.blob);
      const quarter = ((rotation % 360) + 360) % 360;
      const swap = quarter === 90 || quarter === 270;
      const canvas = document.createElement("canvas");
      canvas.width = swap ? bitmap.height : bitmap.width;
      canvas.height = swap ? bitmap.width : bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((quarter * Math.PI) / 180);
      ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, node.mime));
      if (!blob || !node.parentId) return;
      const dot = node.name.lastIndexOf(".");
      const copyName =
        dot > 0 ? `${node.name.slice(0, dot)} rotated${node.name.slice(dot)}` : `${node.name} rotated`;
      const created = await fs().createFile(node.parentId, copyName, {
        blob,
        mime: node.mime,
        dedupe: true,
      });
      setNotice(`Saved “${created.name}” next to the original.`);
      void img;
    } catch {
      setNotice("Could not save a rotated copy of this image.");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-neutral-200/70 dark:bg-neutral-900" data-testid="preview">
      {/* header: real file metadata */}
      <div className="flex items-center gap-2 border-b border-black/10 bg-white px-3 py-1.5 text-[12.5px] dark:border-white/10 dark:bg-neutral-800">
        <span className="font-semibold text-neutral-800 dark:text-neutral-100" data-testid="preview-name">
          {node.name}
        </span>
        <span className="text-neutral-500 dark:text-neutral-400" data-testid="preview-size">
          {formatBytes(node.size)}
        </span>
        <span className="text-neutral-400 dark:text-neutral-500">{node.mime}</span>
        {isImage && (
          <div className="ml-auto flex items-center gap-1.5">
            <button
              data-testid="preview-zoom-out"
              className="rounded px-2 py-0.5 hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setZoom((z) => Math.max(0.1, z / 1.25))}
            >
              −
            </button>
            <span className="w-12 text-center tabular-nums" data-testid="preview-zoom-label">
              {Math.round(zoom * 100)}%
            </span>
            <button
              data-testid="preview-zoom-in"
              className="rounded px-2 py-0.5 hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setZoom((z) => Math.min(6, z * 1.25))}
            >
              +
            </button>
            <button
              data-testid="preview-zoom-fit"
              className="rounded px-2 py-0.5 hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setZoom(1)}
            >
              Fit
            </button>
            <span className="mx-1 h-4 w-px bg-black/10 dark:bg-white/15" />
            <button
              data-testid="preview-rotate"
              className="rounded px-2 py-0.5 hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setRotation((r) => (r + 90) % 360)}
            >
              ⟳ Rotate
            </button>
            {canSaveRotated && rotation !== 0 && (
              <button
                data-testid="preview-save-rotated"
                className="rounded bg-[var(--accent)] px-2 py-0.5 font-medium text-white"
                onClick={() => void saveRotatedCopy()}
              >
                Save rotated copy
              </button>
            )}
          </div>
        )}
      </div>

      {notice && (
        <div className="border-b border-black/10 bg-amber-50 px-3 py-1 text-[12px] text-amber-800 dark:border-white/10 dark:bg-amber-500/10 dark:text-amber-300">
          {notice}
        </div>
      )}

      <div className="uruk-scroll flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        {isPdf ? (
          url ? (
            <iframe
              src={url}
              title={node.name}
              data-testid="preview-pdf"
              className="h-full w-full rounded bg-white shadow"
            />
          ) : (
            <div className="text-neutral-400">This PDF has no stored data.</div>
          )
        ) : isImage ? (
          url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={url}
              alt={node.name}
              data-testid="preview-img"
              draggable={false}
              className="shadow-lg"
              style={{
                transform: `rotate(${rotation}deg)`,
                width: zoom === 1 ? undefined : `${zoom * 100}%`,
                maxWidth: zoom === 1 ? "100%" : "none",
                maxHeight: zoom === 1 ? "100%" : "none",
                objectFit: "contain",
              }}
            />
          ) : (
            <div className="text-neutral-400">This image has no stored data.</div>
          )
        ) : (
          <div className="max-w-sm text-center text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
            Preview does not render “{node.mime}”. The file itself is safe in
            your file system — Get Info in Uruk Files shows its details.
          </div>
        )}
      </div>

      {isImage && !canSaveRotated && (
        <div className="border-t border-black/10 px-3 py-1 text-center text-[11.5px] text-neutral-400 dark:border-white/10">
          Rotation here is a view transform for this format; it does not modify the file.
        </div>
      )}
    </div>
  );
}
