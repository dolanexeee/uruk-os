"use client";

import React, { useEffect, useRef, useState } from "react";
import { useOS, type AppId } from "@/store/os";
import { childrenOf, useFS, type FSNode } from "@/lib/fs";
import { WallpaperById, WALLPAPERS } from "./wallpapers";
import { FileIcon, FolderIcon, UrukMark } from "./icons";
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
/* Active wallpaper (built-in scene OR a photo the user picked)        */
/* ------------------------------------------------------------------ */

export function ActiveWallpaper() {
  const wallpaper = useOS((s) => s.wallpaper);
  const customId = useOS((s) => s.customWallpaperId);
  const node = useFS((s) => (customId ? s.nodes[customId] : undefined));
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!node?.blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(node.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [node]);

  if (customId && node?.blob && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        data-testid="custom-wallpaper-img"
        className="h-full w-full object-cover"
        draggable={false}
      />
    );
  }
  return <WallpaperById id={wallpaper} />;
}

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") login();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [login]);

  return (
    <div
      className="relative flex h-full flex-col items-center justify-center overflow-hidden"
      data-testid="login-screen"
      onClick={login}
    >
      <div className="absolute inset-0 scale-110 blur-md brightness-[0.82]">
        <ActiveWallpaper />
      </div>
      <div className="fade-in relative flex flex-col items-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-b from-sky-400 to-blue-600 text-[38px] font-bold text-white shadow-2xl ring-2 ring-white/40">
          M
        </div>
        <div className="mt-4 text-[24px] font-semibold text-white drop-shadow">Mustafa</div>
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
      onClick={() => setSelectedId(null)}
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
  const loadFS = useFS((s) => s.load);
  const hydrateSettings = useOS((s) => s.hydrateSettings);

  useEffect(() => {
    hydrateSettings();
    void loadFS();
  }, [loadFS, hydrateSettings]);

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
        </>
      )}
    </div>
  );
}
