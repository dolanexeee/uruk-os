import React, { useEffect, useRef, useState } from "react";
import { APP_NAMES, useOS } from "@/store/os";
import { useSystem } from "@/store/system";
import { UrukMark } from "./icons";
import { SearchGlyph, SlidersGlyph } from "./glyphs";
import { lockSession, logoutSession } from "@/lib/session";
import Avatar from "./Avatar";

interface DropItem {
  label: string;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
  bold?: boolean;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function formatClock(d: Date): string {
  const date = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${date}  ${time}`;
}

export default function MenuBar() {
  const os = useOS();
  const focused = os.windows.find((w) => w.id === os.focusedId) ?? null;
  const activeApp = focused?.app ?? "finder";
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const now = useClock();

  useEffect(() => {
    if (!openMenu) return;
    const close = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpenMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key);
    };
  }, [openMenu]);

  const accountName = os.currentAccount?.name ?? "User";
  const menus: Record<string, DropItem[]> = {
    system: [
      {
        label: "About This Machine",
        action: () => os.openApp("settings", { pane: "about" }),
      },
      { label: "", separator: true },
      { label: "Lock Screen", action: () => lockSession() },
      { label: "Switch User…", action: () => logoutSession() },
      { label: `Log Out ${accountName}…`, action: () => logoutSession() },
    ],
    user: [
      {
        label: os.currentAccount
          ? `${os.currentAccount.name}${os.currentAccount.guest ? " (Guest)" : ""} — local account`
          : "Local account",
        disabled: true,
      },
      { label: "", separator: true },
      { label: "Account Settings…", action: () => os.openApp("settings", { pane: "account" }) },
      { label: "Lock Screen", action: () => lockSession() },
      { label: "Switch User…", action: () => logoutSession() },
      { label: `Log Out ${accountName}…`, action: () => logoutSession() },
    ],
    file: [
      {
        label: `New ${APP_NAMES[activeApp]} Window`,
        action: () => os.openApp(activeApp),
      },
      ...(os.fileMenuItems && focused
        ? [
            { label: "", separator: true } as DropItem,
            ...os.fileMenuItems.map((i) => ({
              label: i.label,
              action: i.action,
              disabled: i.disabled,
              separator: i.separator,
            })),
          ]
        : []),
      { label: "", separator: true },
      {
        label: "Close Window",
        disabled: !focused,
        action: () => focused && os.closeWindow(focused.id),
      },
    ],
    window: [
      ...os.windows.map((w) => ({
        label: `${w.app === activeApp && w.id === focused?.id ? "● " : ""}${w.title}`,
        action: () => {
          if (w.minimized) os.restoreWindow(w.id);
          else os.focusWindow(w.id);
        },
      })),
      ...(os.windows.length === 0
        ? [{ label: "No Windows Open", disabled: true }]
        : []),
    ],
  };

  const renderDrop = (key: string) =>
    openMenu === key && (
      <div
        className={`absolute ${key === "user" ? "right-0" : "left-0"} top-full mt-[2px] min-w-[230px] rounded-xl p-1 fade-in
          bg-white/70 dark:bg-neutral-800/75 backdrop-blur-2xl
          shadow-[0_12px_40px_rgba(0,0,0,0.35)] ring-1 ring-black/10 dark:ring-white/15 text-[13px] z-[9998]`}
      >
        {menus[key].map((item, i) =>
          item.separator ? (
            <div key={i} className="my-1 h-px bg-black/10 dark:bg-white/10" />
          ) : (
            <button
              key={i}
              disabled={item.disabled}
              className={`flex w-full rounded-lg px-2.5 py-[3px] text-left leading-5 ${
                item.disabled
                  ? "text-neutral-400 dark:text-neutral-500"
                  : "text-neutral-800 dark:text-neutral-100 hover:bg-[var(--accent)] hover:text-white"
              } ${item.bold ? "font-semibold" : ""}`}
              onClick={() => {
                setOpenMenu(null);
                item.action?.();
              }}
            >
              {item.label}
            </button>
          ),
        )}
      </div>
    );

  const menuBtn = (key: string, content: React.ReactNode, bold = false) => (
    <div className="relative" key={key}>
      <button
        data-testid={`menubar-${key}`}
        className={`rounded-md px-2.5 py-[2px] text-[13px] ${
          bold ? "font-bold" : ""
        } ${openMenu === key ? "bg-black/10 dark:bg-white/15" : ""}`}
        onClick={() => setOpenMenu(openMenu === key ? null : key)}
        onMouseEnter={() => openMenu && setOpenMenu(key)}
      >
        {content}
      </button>
      {renderDrop(key)}
    </div>
  );

  return (
    <div
      ref={barRef}
      className="fixed inset-x-0 top-0 z-[9000] flex h-7 items-center gap-1 px-3
        bg-white/45 dark:bg-neutral-900/45 backdrop-blur-2xl
        text-neutral-900 dark:text-neutral-50 shadow-[0_0.5px_0_rgba(0,0,0,0.15)]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {menuBtn("system", <UrukMark size={15} className="text-neutral-900 dark:text-white translate-y-[2px]" />)}
      <div className="relative">
        <span className="px-1 text-[13px] font-bold" data-testid="menubar-active-app">
          {APP_NAMES[activeApp]}
        </span>
      </div>
      {menuBtn("file", "File")}
      {menuBtn("window", "Window")}

      <div className="ml-auto flex items-center gap-1">
        <button
          data-testid="menubar-spotlight"
          data-panel-toggle="spotlight"
          title="Spotlight (Ctrl+K)"
          className="rounded-md px-1.5 py-[3px] hover:bg-black/10 dark:hover:bg-white/15"
          onClick={() => useSystem.getState().togglePanel("spotlight")}
        >
          <SearchGlyph size={13.5} />
        </button>
        <button
          data-testid="menubar-control-center"
          data-panel-toggle="controlCenter"
          title="Control Center"
          className="rounded-md px-1.5 py-[3px] hover:bg-black/10 dark:hover:bg-white/15"
          onClick={() => useSystem.getState().togglePanel("controlCenter")}
        >
          <SlidersGlyph size={14} />
        </button>
        <button
          data-testid="menubar-appearance-toggle"
          title={os.appearance === "dark" ? "Switch to Light" : "Switch to Dark"}
          className="rounded-md px-1.5 py-[2px] hover:bg-black/10 dark:hover:bg-white/15 text-[13px]"
          onClick={() => os.setAppearance(os.appearance === "dark" ? "light" : "dark")}
        >
          {os.appearance === "dark" ? "☾" : "☀"}
        </button>
        <button
          data-testid="menubar-clock"
          data-panel-toggle="notifCenter"
          title="Notification Center"
          className="rounded-md px-1.5 py-[2px] text-[13px] tabular-nums hover:bg-black/10 dark:hover:bg-white/15"
          onClick={() => useSystem.getState().togglePanel("notifCenter")}
        >
          {formatClock(now)}
        </button>
        {os.currentAccount && (
          <div className="relative ml-1">
            <button
              data-testid="menubar-user"
              title={`${os.currentAccount.name} — account`}
              className={`flex items-center rounded-full p-[1px] ${openMenu === "user" ? "bg-black/10 dark:bg-white/15" : ""}`}
              onClick={() => setOpenMenu(openMenu === "user" ? null : "user")}
            >
              <Avatar account={os.currentAccount} size={20} fontSize={10} />
            </button>
            {renderDrop("user")}
          </div>
        )}
      </div>
    </div>
  );
}
