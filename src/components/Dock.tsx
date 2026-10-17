import React, { useRef, useState } from "react";
import { APP_NAMES, useOS, type AppId } from "@/store/os";
import { TRASH_ID, childrenOf, useFS } from "@/lib/fs";
import { AppIcon, TrashIcon } from "./icons";
import ContextMenu, { useContextMenu, type MenuEntry } from "./ContextMenu";

const DOCK_APPS: AppId[] = [
  "finder",
  "photos",
  "browser",
  "terminal",
  "editor",
  "code",
  "notes",
  "calculator",
  "calendar",
  "music",
  "settings",
];
const BASE = 52;
const MAG_RANGE = 115;
const MAG_MAX = 0.5;

export default function Dock() {
  const os = useOS();
  const nodes = useFS((s) => s.nodes);
  const emptyTrash = useFS((s) => s.emptyTrash);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const iconRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const { menu, open, close } = useContextMenu();

  const trashCount = childrenOf(nodes, TRASH_ID).length;
  const runningApps = new Set(os.windows.map((w) => w.app));

  /** mac-style magnification, applied imperatively for smoothness. */
  const applyMagnification = (clientX: number | null) => {
    iconRefs.current.forEach((el) => {
      if (!el) return;
      if (clientX === null) {
        el.style.transform = "scale(1)";
        return;
      }
      const r = el.getBoundingClientRect();
      // Use the unscaled layout center: width/height are layout size (transforms don't affect offsetWidth).
      const center = r.left + el.offsetWidth / 2;
      const dist = Math.abs(clientX - center);
      const scale =
        dist > MAG_RANGE
          ? 1
          : 1 + MAG_MAX * Math.cos((dist / MAG_RANGE) * (Math.PI / 2)) ** 2;
      el.style.transform = `scale(${scale.toFixed(3)})`;
    });
  };

  const launchOrFocus = (app: AppId) => {
    const wins = os.windows.filter((w) => w.app === app);
    if (wins.length === 0) {
      os.openApp(app);
      return;
    }
    const top = [...wins].sort((a, b) => b.z - a.z)[0];
    if (top.minimized) os.restoreWindow(top.id);
    else os.focusWindow(top.id);
  };

  const onIconContext = (e: React.MouseEvent, app: AppId) => {
    const isRunning = runningApps.has(app);
    const entries: MenuEntry[] = [
      { label: "Open", action: () => os.openApp(app) },
      { label: "New Window", action: () => os.openApp(app) },
      { separator: true, label: "" },
      { label: "Quit", disabled: !isRunning, action: () => os.quitApp(app) },
    ];
    open(e, entries);
  };

  const iconButton = (
    key: string,
    label: string,
    running: boolean,
    onClick: () => void,
    onContext: (e: React.MouseEvent) => void,
    icon: React.ReactNode,
  ) => (
    <div key={key} className="relative flex flex-col items-center">
      {hoverLabel === key && (
        <div className="pointer-events-none absolute -top-9 z-10 whitespace-nowrap rounded-md bg-white/85 px-2 py-0.5 text-xs text-neutral-800 ring-1 ring-black/10 backdrop-blur dark:bg-neutral-700/85 dark:text-neutral-100 dark:ring-white/10">
          {label}
        </div>
      )}
      <button
        data-testid={`dock-icon-${key}`}
        ref={(el) => {
          if (el) iconRefs.current.set(key, el);
          else iconRefs.current.delete(key);
        }}
        className="flex origin-bottom items-end justify-center transition-transform duration-75 ease-out"
        style={{ width: BASE, height: BASE }}
        onClick={onClick}
        onContextMenu={onContext}
        onMouseEnter={() => setHoverLabel(key)}
        onMouseLeave={() => setHoverLabel((h) => (h === key ? null : h))}
      >
        {icon}
      </button>
      <div
        className={`mt-[2px] h-1 w-1 rounded-full bg-neutral-800 dark:bg-neutral-100 ${
          running ? "opacity-80" : "opacity-0"
        }`}
      />
    </div>
  );

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-2 z-[9000] flex justify-center"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          data-testid="dock"
          className="pointer-events-auto flex items-end gap-1.5 rounded-[22px] px-2.5 pb-1.5 pt-2
            bg-white/30 shadow-[0_16px_44px_rgba(0,0,0,0.4)] ring-1 ring-white/30 backdrop-blur-2xl
            dark:bg-neutral-800/35 dark:ring-white/15"
          onMouseMove={(e) => applyMagnification(e.clientX)}
          onMouseLeave={() => applyMagnification(null)}
        >
          {DOCK_APPS.map((app) =>
            iconButton(
              app,
              APP_NAMES[app],
              runningApps.has(app),
              () => launchOrFocus(app),
              (e) => onIconContext(e, app),
              <AppIcon app={app} size={BASE - 4} />,
            ),
          )}

          <div className="mx-1 w-px self-stretch bg-black/15 dark:bg-white/15" />

          {iconButton(
            "trash",
            trashCount ? `Trash (${trashCount})` : "Trash",
            false,
            () => os.openApp("finder", { folderId: TRASH_ID }, "Trash"),
            (e) =>
              open(e, [
                {
                  label: "Open",
                  action: () => os.openApp("finder", { folderId: TRASH_ID }, "Trash"),
                },
                { separator: true, label: "" },
                {
                  label: "Empty Trash",
                  disabled: trashCount === 0,
                  danger: true,
                  action: () => void emptyTrash(),
                },
              ]),
            <TrashIcon size={BASE - 4} full={trashCount > 0} />,
          )}
        </div>
      </div>
      <ContextMenu menu={menu} onClose={close} />
    </>
  );
}
