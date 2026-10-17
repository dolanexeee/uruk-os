import React, { useCallback, useEffect, useRef } from "react";
import { useOS, type WinState } from "@/store/os";

const MIN_W = 320;
const MIN_H = 200;
const TITLEBAR_H = 38;

type Dir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const CURSORS: Record<Dir, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

function TrafficLights({ win, focused }: { win: WinState; focused: boolean }) {
  const { closeWindow, minimizeWindow, toggleMaximize } = useOS.getState();
  const btn =
    "w-3 h-3 rounded-full flex items-center justify-center text-[9px] leading-none font-bold ring-1 ring-black/10";
  const dim = focused ? "" : "opacity-40 saturate-0";
  return (
    <div className={`group flex items-center gap-2 pl-3 ${dim}`} data-testid="traffic-lights">
      <button
        aria-label="Close"
        className={`${btn} bg-[#ff5f57] text-[#7a1d18]`}
        onClick={(e) => {
          e.stopPropagation();
          closeWindow(win.id);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="opacity-0 group-hover:opacity-100">✕</span>
      </button>
      <button
        aria-label="Minimize"
        className={`${btn} bg-[#febc2e] text-[#7a5410]`}
        onClick={(e) => {
          e.stopPropagation();
          minimizeWindow(win.id);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="opacity-0 group-hover:opacity-100">−</span>
      </button>
      <button
        aria-label="Zoom"
        className={`${btn} bg-[#28c840] text-[#14571f]`}
        onClick={(e) => {
          e.stopPropagation();
          toggleMaximize(win.id);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="opacity-0 group-hover:opacity-100">+</span>
      </button>
    </div>
  );
}

export default function Window({
  win,
  children,
  titlebarExtra,
}: {
  win: WinState;
  children: React.ReactNode;
  titlebarExtra?: React.ReactNode;
}) {
  const focusedId = useOS((s) => s.focusedId);
  const focused = focusedId === win.id;
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: "move" | Dir;
    startX: number;
    startY: number;
    orig: { x: number; y: number; w: number; h: number };
  } | null>(null);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const os = useOS.getState();
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (d.mode === "move") {
        const y = Math.min(Math.max(d.orig.y + dy, 28), window.innerHeight - 40);
        os.moveWindow(win.id, d.orig.x + dx, y);
        return;
      }
      let { x, y, w, h } = d.orig;
      if (d.mode.includes("e")) w = Math.max(MIN_W, d.orig.w + dx);
      if (d.mode.includes("s")) h = Math.max(MIN_H, d.orig.h + dy);
      if (d.mode.includes("w")) {
        const newW = Math.max(MIN_W, d.orig.w - dx);
        x = d.orig.x + (d.orig.w - newW);
        w = newW;
      }
      if (d.mode.includes("n")) {
        const newH = Math.max(MIN_H, d.orig.h - dy);
        y = Math.max(28, d.orig.y + (d.orig.h - newH));
        if (y > 28 || newH === MIN_H || d.orig.h - dy >= MIN_H) h = newH;
      }
      os.resizeWindow(win.id, { x, y, w, h });
    },
    [win.id],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
  }, [onPointerMove]);

  useEffect(() => endDrag, [endDrag]);

  const beginDrag = (mode: "move" | Dir) => (e: React.MouseEvent) => {
    if (win.maximized) return;
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: win.x, y: win.y, w: win.w, h: win.h },
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
  };

  if (win.minimized && !win.minimizing) return null;

  const cls = [
    "fixed flex flex-col overflow-hidden rounded-[10px]",
    focused ? "window-shadow" : "window-shadow-unfocused",
    win.closing ? "window-closing" : win.minimizing ? "window-minimizing" : "window-opening",
    "bg-neutral-100 dark:bg-neutral-800",
  ].join(" ");

  const dirs: Dir[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  const handlePos: Record<Dir, React.CSSProperties> = {
    n: { top: -3, left: 8, right: 8, height: 6, cursor: CURSORS.n },
    s: { bottom: -3, left: 8, right: 8, height: 6, cursor: CURSORS.s },
    e: { right: -3, top: 8, bottom: 8, width: 6, cursor: CURSORS.e },
    w: { left: -3, top: 8, bottom: 8, width: 6, cursor: CURSORS.w },
    ne: { top: -4, right: -4, width: 10, height: 10, cursor: CURSORS.ne },
    nw: { top: -4, left: -4, width: 10, height: 10, cursor: CURSORS.nw },
    se: { bottom: -4, right: -4, width: 10, height: 10, cursor: CURSORS.se },
    sw: { bottom: -4, left: -4, width: 10, height: 10, cursor: CURSORS.sw },
  };

  return (
    <div
      ref={ref}
      className={cls}
      data-testid={`window-${win.app}`}
      data-window-id={win.id}
      style={{
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
        zIndex: win.z,
      }}
      onMouseDown={() => useOS.getState().focusWindow(win.id)}
    >
      {/* title bar */}
      <div
        className="relative flex shrink-0 items-center select-none
          bg-neutral-200/80 dark:bg-neutral-700/60"
        style={{ height: TITLEBAR_H }}
        onMouseDown={beginDrag("move")}
        onDoubleClick={() => useOS.getState().toggleMaximize(win.id)}
        data-testid="window-titlebar"
      >
        <TrafficLights win={win} focused={focused} />
        <div className="pointer-events-none absolute inset-x-0 text-center text-[13px] font-semibold text-neutral-700 dark:text-neutral-200 truncate px-24">
          {win.title}
        </div>
        <div className="ml-auto flex items-center pr-2">{titlebarExtra}</div>
      </div>

      {/* content */}
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>

      {/* resize handles */}
      {!win.maximized &&
        dirs.map((d) => (
          <div
            key={d}
            className="absolute z-20"
            style={handlePos[d]}
            onMouseDown={beginDrag(d)}
          />
        ))}
    </div>
  );
}
