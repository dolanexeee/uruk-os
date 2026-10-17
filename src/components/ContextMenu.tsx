import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuEntry {
  label: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
  danger?: boolean;
}

export interface MenuState {
  x: number;
  y: number;
  entries: MenuEntry[];
}

interface Props {
  menu: MenuState | null;
  onClose: () => void;
}

/** A single global context-menu renderer (mac-style frosted popover). */
export default function ContextMenu({ menu, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const el = ref.current;
    const r = el.getBoundingClientRect();
    let x = menu.x;
    let y = menu.y;
    if (x + r.width > window.innerWidth - 6) x = window.innerWidth - r.width - 6;
    if (y + r.height > window.innerHeight - 6) y = window.innerHeight - r.height - 6;
    setPos({ x: Math.max(4, x), y: Math.max(30, y) });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return (
    <div
      ref={ref}
      className="fixed z-[9999] min-w-[210px] rounded-lg p-1 fade-in
        bg-white/70 dark:bg-neutral-800/70 backdrop-blur-2xl
        shadow-[0_12px_40px_rgba(0,0,0,0.35)] ring-1 ring-black/10 dark:ring-white/15 text-[13px]"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.entries.map((entry, i) =>
        entry.separator ? (
          <div key={i} className="my-1 h-px bg-black/10 dark:bg-white/10" />
        ) : (
          <button
            key={i}
            disabled={entry.disabled}
            className={`flex w-full items-center rounded-md px-2.5 py-[3px] text-left leading-5
              ${
                entry.disabled
                  ? "text-neutral-400 dark:text-neutral-500"
                  : entry.danger
                    ? "text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white"
                    : "text-neutral-800 dark:text-neutral-100 hover:bg-[var(--accent)] hover:text-white"
              }`}
            onClick={() => {
              onClose();
              entry.action?.();
            }}
          >
            {entry.label}
          </button>
        ),
      )}
    </div>
  );
}

/** Hook: returns [menuState, openMenu] for a component. */
export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const open = (e: React.MouseEvent, entries: MenuEntry[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, entries });
  };
  return { menu, setMenu, open, close: () => setMenu(null) };
}
