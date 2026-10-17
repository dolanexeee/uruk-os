"use client";

import React, { useEffect, useRef, useState } from "react";
import { useOS, type AppId } from "@/store/os";
import { childrenOf, useFS, type FSNode } from "@/lib/fs";
import { WALLPAPERS } from "./wallpapers";
import { ActiveWallpaper } from "./Wallpaper";
import { FileIcon, FolderIcon, UrukMark } from "./icons";
import { useSystem } from "@/store/system";
import { useNotifications } from "@/store/notifications";
import { hasPin, verifyPin } from "@/lib/security";
import Spotlight from "./Spotlight";
import Launchpad from "./Launchpad";
import ControlCenter from "./ControlCenter";
import NotificationCenter from "./NotificationCenter";
import Banners from "./Banners";
import Screensaver from "./Screensaver";
import SystemServices from "./SystemServices";
import MenuBar from "./MenuBar";
import Dock from "./Dock";
import Window from "./Window";
import ContextMenu, { useContextMenu } from "./ContextMenu";
import Finder from "@/apps/Finder";
import Terminal from "@/apps/Terminal";
import Editor from "@/apps/Editor";
import Settings from "@/apps/Settings";
import Photos from "@/apps/Photos";
import Preview from "@/apps/Preview";
import Notes from "@/apps/Notes";
import Calculator from "@/apps/Calculator";
import Calendar from "@/apps/Calendar";
import Music from "@/apps/Music";
import BrowserApp from "@/apps/Browser";
import Code from "@/apps/Code";
import { openFileNode } from "@/lib/associations";

const APP_COMPONENTS: Record<AppId, React.ComponentType<{ win: never }>> = {
  finder: Finder as never,
  terminal: Terminal as never,
  editor: Editor as never,
  settings: Settings as never,
  photos: Photos as never,
  preview: Preview as never,
  notes: Notes as never,
  calculator: Calculator as never,
  calendar: Calendar as never,
  music: Music as never,
  browser: BrowserApp as never,
  code: Code as never,
};

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function BootScreen() {
  const setPhase = useOS((s) => s.setPhase);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / 1700);
      setProgress(p);
      if (p >= 1) {
        clearInterval(t);
        setTimeout(() => setPhase("login"), 250);
      }
    }, 40);
    return () => clearInterval(t);
  }, [setPhase]);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-black text-white" data-testid="boot-screen">
      <UrukMark size={86} />
      <div className="mt-5 text-[26px] font-semibold tracking-[0.35em]">URUK&nbsp;OS</div>
      <div className="mt-14 h-[5px] w-52 overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-white transition-[width] duration-100"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

function LoginScreen() {
  const login = useOS((s) => s.login);
  const hasSession = useOS((s) => s.windows.length > 0);
  const [pinSet, setPinSet] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setPinSet(hasPin());
  }, []);

  useEffect(() => {
    if (pinSet) pinInputRef.current?.focus();
  }, [pinSet]);

  const attempt = async () => {
    if (!pinSet) {
      login();
      return;
    }
    if (!pin) return;
    const ok = await verifyPin(pin);
    if (ok) {
      setError("");
      setPin("");
      login();
    } else {
      setError("Incorrect PIN — try again.");
      setPin("");
      setShakeKey((k) => k + 1);
      pinInputRef.current?.focus();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") void attempt();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, pinSet]);

  return (
    <div
      className="relative flex h-full flex-col items-center justify-center overflow-hidden"
      data-testid="login-screen"
      onClick={() => {
        if (pinSet) pinInputRef.current?.focus();
        else login();
      }}
    >
      <div className="absolute inset-0 scale-110 blur-md brightness-[0.82]">
        <ActiveWallpaper />
      </div>
      <div className="fade-in relative flex flex-col items-center">
        <div className="mb-10 flex flex-col items-center text-white" data-testid="login-clock">
          <div className="text-[64px] font-thin leading-none tracking-tight drop-shadow-lg">
            {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "")}
            <span className="ml-2 align-middle text-[22px] font-light text-white/85">
              {now.toLocaleTimeString([], { hour12: true }).match(/[AP]M/i)?.[0] ?? ""}
            </span>
          </div>
          <div className="mt-2 text-[16px] font-light text-white/90 drop-shadow">
            {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </div>
        </div>
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-b from-sky-400 to-blue-600 text-[38px] font-bold text-white shadow-2xl ring-2 ring-white/40">
          M
        </div>
        <div className="mt-4 text-[24px] font-semibold text-white drop-shadow">Mustafa</div>

        {pinSet ? (
          <div key={shakeKey} className={shakeKey ? "shake" : ""} onClick={(e) => e.stopPropagation()}>
            <div className="mt-4 flex flex-col items-center">
              <input
                ref={pinInputRef}
                data-testid="login-pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/[^\d]/g, "").slice(0, 12));
                  setError("");
                }}
                placeholder="Enter PIN"
                className="w-48 rounded-full border border-white/30 bg-white/15 px-4 py-1.5 text-center text-[14px] tracking-[0.3em] text-white placeholder:tracking-normal placeholder:text-white/60 backdrop-blur-md outline-none focus:border-white/60"
              />
              <button
                data-testid="login-pin-submit"
                className="mt-3 rounded-full bg-white/20 px-5 py-1.5 text-[13.5px] font-medium text-white backdrop-blur-md transition hover:bg-white/30"
                onClick={() => void attempt()}
              >
                Unlock
              </button>
              {error ? (
                <div data-testid="login-pin-error" className="mt-2 text-[12.5px] font-medium text-red-200">
                  {error}
                </div>
              ) : (
                <div className="mt-2 text-[12px] text-white/75">This machine is locked with a PIN</div>
              )}
            </div>
          </div>
        ) : (
          <>
            <button
              data-testid="login-button"
              className="mt-3 rounded-full bg-white/20 px-5 py-1.5 text-[13.5px] font-medium text-white backdrop-blur-md transition hover:bg-white/30"
              onClick={(e) => {
                e.stopPropagation();
                login();
              }}
            >
              {hasSession ? "Click to unlock" : "Click to log in"}
            </button>
            <div className="mt-2 text-[12px] text-white/75">or press Enter</div>
          </>
        )}
      </div>
      <div className="absolute bottom-5 text-[12px] tracking-[0.3em] text-white/60">URUK&nbsp;OS</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop surface                                                     */
/* ------------------------------------------------------------------ */

function DesktopSurface() {
  const nodes = useFS((s) => s.nodes);
  const fs = useFS.getState;
  const os = useOS();
  const closePanels = useSystem((s) => s.closePanels);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { menu, open, close } = useContextMenu();

  const desktopItems = childrenOf(nodes, "folder-desktop");

  const openNode = (node: FSNode) => {
    // All routing goes through the associations registry.
    const result = openFileNode(node);
    if (result === "info") {
      // No app claims this file — surface it in Finder at its folder instead.
      os.openApp("finder", { folderId: node.parentId ?? "folder-desktop" });
    }
  };

  const cycleWallpaper = () => {
    const idx = WALLPAPERS.findIndex((w) => w.id === os.wallpaper);
    os.setWallpaper(WALLPAPERS[(idx + 1) % WALLPAPERS.length].id);
  };

  return (
    <div
      className="absolute inset-0 pt-7"
      data-testid="desktop-surface"
      onClick={() => {
        setSelectedId(null);
        closePanels();
      }}
      onContextMenu={(e) =>
        open(e, [
          {
            label: "New Folder",
            action: () => void fs().createFolder("folder-desktop", "Untitled folder", true),
          },
          { label: "Import Files…", action: () => fileInputRef.current?.click() },
          { separator: true, label: "" },
          { label: "Change Wallpaper", action: cycleWallpaper },
          {
            label: os.appearance === "dark" ? "Use Light Mode" : "Use Dark Mode",
            action: () => os.setAppearance(os.appearance === "dark" ? "light" : "dark"),
          },
        ])
      }
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        if (files.length) void fs().importFiles("folder-desktop", files);
      }}
    >
      {/* icons: columns flowing down from the top-right, like a desktop */}
      <div className="absolute right-2 top-9 flex max-h-[calc(100%-120px)] flex-col flex-wrap-reverse gap-1">
        {desktopItems.map((node) => (
          <button
            key={node.id}
            data-testid={`desktop-icon-${node.name}`}
            className={`flex w-[92px] flex-col items-center gap-1 rounded-lg p-2 ${
              selectedId === node.id ? "bg-white/20 ring-1 ring-white/40" : ""
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(node.id);
            }}
            onDoubleClick={() => openNode(node)}
          >
            {node.type === "folder" ? (
              <FolderIcon size={46} />
            ) : (
              <FileIcon size={46} image={node.mime.startsWith("image/")} />
            )}
            <span className="line-clamp-2 break-words text-center text-[11.5px] font-medium leading-4 text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
              {node.name}
            </span>
          </button>
        ))}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void fs().importFiles("folder-desktop", files);
          e.target.value = "";
        }}
      />
      <ContextMenu menu={menu} onClose={close} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

export default function OSRoot() {
  const phase = useOS((s) => s.phase);
  const appearance = useOS((s) => s.appearance);
  const accent = useOS((s) => s.accent);
  const windows = useOS((s) => s.windows);
  const brightness = useSystem((s) => s.brightness);
  const loadFS = useFS((s) => s.load);
  const hydrateSettings = useOS((s) => s.hydrateSettings);
  const hydrateSystem = useSystem((s) => s.hydrateSystem);
  const hydrateNotifications = useNotifications((s) => s.hydrateNotifications);

  useEffect(() => {
    hydrateSettings();
    hydrateSystem();
    hydrateNotifications();
    void loadFS();
  }, [loadFS, hydrateSettings, hydrateSystem, hydrateNotifications]);

  return (
    <div
      className={`relative h-[100dvh] w-full overflow-hidden ${appearance === "dark" ? "dark" : ""}`}
      style={{ ["--accent" as string]: accent }}
      data-testid="os-root"
    >
      {phase === "boot" && <BootScreen />}

      {phase === "login" && <LoginScreen />}

      {phase === "desktop" && (
        <>
          <div className="absolute inset-0">
            <ActiveWallpaper />
          </div>
          <DesktopSurface />
          {windows.map((win) => {
            const App = APP_COMPONENTS[win.app] as React.ComponentType<{ win: typeof win }>;
            return (
              <Window key={win.id} win={win}>
                <App win={win} />
              </Window>
            );
          })}
          <MenuBar />
          <Dock />
          <SystemServices />
          <Launchpad />
          <ControlCenter />
          <NotificationCenter />
          <Spotlight />
          <Banners />
          <Screensaver />
          {/* Display brightness: a real composited dim over everything. */}
          <div
            data-testid="brightness-overlay"
            data-brightness={brightness}
            className="pointer-events-none fixed inset-0 z-[9900] bg-black"
            style={{ opacity: Math.max(0, 1 - brightness) }}
          />
        </>
      )}
    </div>
  );
}
