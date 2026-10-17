"use client";

import React, { useEffect, useRef, useState } from "react";
import { useOS, type AppId } from "@/store/os";
import { childrenOf, useFS, type FSNode } from "@/lib/fs";
import { WALLPAPERS } from "./wallpapers";
import { ActiveWallpaper } from "./Wallpaper";
import { FileIcon, FolderIcon, UrukMark } from "./icons";
import { useSystem } from "@/store/system";
import { hasPin, setPin, verifyPin } from "@/lib/security";
import {
  AVATAR_COLORS,
  AVATAR_GLYPHS,
  createAccount,
  defaultGlyph,
  type Account,
} from "@/lib/accounts";
import { bootSession, enterAccount, enterGuest } from "@/lib/session";
import Avatar from "./Avatar";
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
  const accounts = useOS((s) => s.accounts);
  const accountsReady = useOS((s) => s.accountsReady);
  const currentAccount = useOS((s) => s.currentAccount);
  const sessionLocked = useOS((s) => s.sessionLocked);
  const hasSession = useOS((s) => s.windows.length > 0);
  const loginPhase = useOS((s) => s.login);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
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

  // When locked, only the session's own account is on offer.
  const visibleAccounts = sessionLocked && currentAccount ? [currentAccount] : accounts;
  const selected =
    visibleAccounts.find((a) => a.id === (selectedId ?? currentAccount?.id)) ??
    visibleAccounts[0] ??
    null;

  useEffect(() => {
    setPinSet(selected ? hasPin(selected.id) : false);
    setPin("");
    setError("");
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pinSet) pinInputRef.current?.focus();
  }, [pinSet]);

  const proceed = async () => {
    if (!selected) return;
    if (sessionLocked && currentAccount && selected.id === currentAccount.id) {
      loginPhase(); // unlock: the session never ended
      return;
    }
    await enterAccount(selected);
  };

  const attempt = async () => {
    if (!selected) return;
    if (!pinSet) {
      await proceed();
      return;
    }
    if (!pin) return;
    const ok = await verifyPin(pin, selected.id);
    if (ok) {
      setError("");
      setPin("");
      await proceed();
    } else {
      setError("Incorrect PIN — try again.");
      setPin("");
      setShakeKey((k) => k + 1);
      pinInputRef.current?.focus();
    }
  };

  const showCreate = creating || (accountsReady && !sessionLocked && accounts.length === 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !showCreate) void attempt();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, pinSet, selected?.id, showCreate, sessionLocked]);

  return (
    <div
      className="relative flex h-full flex-col items-center justify-center overflow-hidden"
      data-testid="login-screen"
      onClick={() => {
        if (pinSet) pinInputRef.current?.focus();
      }}
    >
      <div className="absolute inset-0 scale-110 blur-md brightness-[0.82]">
        <ActiveWallpaper />
      </div>
      <div className="fade-in relative flex max-h-full flex-col items-center overflow-y-auto px-4 py-6">
        <div className="mb-8 flex flex-col items-center text-white" data-testid="login-clock">
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

        {showCreate ? (
          <CreateAccountForm
            firstRun={accounts.length === 0}
            onCancel={accounts.length > 0 ? () => setCreating(false) : undefined}
          />
        ) : (
          <>
            {/* account picker */}
            <div className="flex flex-wrap items-start justify-center gap-5">
              {visibleAccounts.map((a) => (
                <button
                  key={a.id}
                  data-testid={`login-account-${a.id}`}
                  data-account-name={a.name}
                  className={`flex w-24 flex-col items-center gap-2 rounded-2xl p-2 transition ${
                    selected?.id === a.id ? "bg-white/15 ring-2 ring-white/60" : "hover:bg-white/10"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(a.id);
                  }}
                  onDoubleClick={() => {
                    setSelectedId(a.id);
                    if (!hasPin(a.id)) void enterAccount(a);
                  }}
                >
                  <Avatar account={a} size={64} />
                  <span className="max-w-full truncate text-[14px] font-medium text-white drop-shadow">
                    {a.name}
                  </span>
                  {a.guest && (
                    <span className="-mt-1 rounded-full bg-white/20 px-2 py-px text-[10.5px] font-semibold uppercase tracking-wide text-white/90">
                      Guest
                    </span>
                  )}
                </button>
              ))}
            </div>

            {selected && (
              <div className="mt-5 flex flex-col items-center">
                {pinSet ? (
                  <div key={shakeKey} className={shakeKey ? "shake" : ""} onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col items-center">
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
                        placeholder={`PIN for ${selected.name}`}
                        className="w-52 rounded-full border border-white/30 bg-white/15 px-4 py-1.5 text-center text-[14px] tracking-[0.3em] text-white placeholder:tracking-normal placeholder:text-white/60 backdrop-blur-md outline-none focus:border-white/60"
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
                        <div className="mt-2 text-[12px] text-white/75">
                          {selected.name}&apos;s account is locked with a PIN
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      data-testid="login-button"
                      className="rounded-full bg-white/20 px-5 py-1.5 text-[13.5px] font-medium text-white backdrop-blur-md transition hover:bg-white/30"
                      onClick={(e) => {
                        e.stopPropagation();
                        void attempt();
                      }}
                    >
                      {sessionLocked || hasSession ? "Click to unlock" : `Log in as ${selected.name}`}
                    </button>
                    <div className="mt-2 text-[12px] text-white/75">or press Enter</div>
                  </>
                )}
              </div>
            )}

            {!sessionLocked && accountsReady && (
              <div className="mt-7 flex items-center gap-2.5">
                <button
                  data-testid="login-create-toggle"
                  className="rounded-full bg-white/15 px-4 py-1.5 text-[13px] font-medium text-white backdrop-blur-md transition hover:bg-white/25"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCreating(true);
                  }}
                >
                  + Create Account
                </button>
                <button
                  data-testid="login-guest"
                  className="rounded-full bg-white/10 px-4 py-1.5 text-[13px] font-medium text-white/90 backdrop-blur-md transition hover:bg-white/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    void enterGuest();
                  }}
                >
                  Continue as Guest
                </button>
              </div>
            )}
            {!sessionLocked && (
              <div className="mt-3 max-w-sm text-center text-[11.5px] leading-4 text-white/65">
                Guest mode has its own separate space — its files stay apart
                from every account. Accounts live on this device, in this
                browser: local-first, no server, $0.
              </div>
            )}
          </>
        )}
      </div>
      <div className="absolute bottom-5 text-[12px] tracking-[0.3em] text-white/60">URUK&nbsp;OS</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Create-account form (on the login screen)                           */
/* ------------------------------------------------------------------ */

function CreateAccountForm({
  firstRun,
  onCancel,
}: {
  firstRun: boolean;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [colorIdx, setColorIdx] = useState(0);
  const [glyphIdx, setGlyphIdx] = useState(-1); // -1 = first letter of the name
  const [pin, setPinValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const glyph = glyphIdx >= 0 ? AVATAR_GLYPHS[glyphIdx] : defaultGlyph(name || "U");
  const preview: Account = {
    id: "preview",
    name: name || "New User",
    color: AVATAR_COLORS[colorIdx],
    glyph,
    createdAt: 0,
  };

  const submit = async () => {
    const clean = name.trim();
    if (!clean) {
      setError("Give the account a name first.");
      return;
    }
    if (pin && !/^\d{4,12}$/.test(pin)) {
      setError("The optional PIN must be 4–12 digits.");
      return;
    }
    setBusy(true);
    try {
      const account = createAccount({
        name: clean,
        color: AVATAR_COLORS[colorIdx],
        glyph,
      });
      if (pin) await setPin(pin, account.id);
      await enterAccount(account);
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-64 rounded-full border border-white/30 bg-white/15 px-4 py-1.5 text-center text-[14px] text-white placeholder:text-white/60 backdrop-blur-md outline-none focus:border-white/60";

  return (
    <div
      data-testid="create-account-form"
      className="flex flex-col items-center"
      onClick={(e) => e.stopPropagation()}
    >
      <Avatar account={preview} size={72} />
      <div className="mb-1 mt-3 text-[19px] font-semibold text-white drop-shadow">
        {firstRun ? "Welcome — create your account" : "Create an account"}
      </div>
      <div className="mb-4 max-w-sm text-center text-[12px] leading-4 text-white/75">
        Your account, files, and settings live on this device only —
        nothing is sent to a server, and it costs nothing.
      </div>

      <input
        data-testid="account-name-input"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError("");
        }}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder="Display name"
        autoFocus
        className={inputCls}
      />

      <div className="mt-4 flex items-center gap-2">
        {AVATAR_COLORS.map((c, i) => (
          <button
            key={c}
            data-testid={`account-color-${i}`}
            title={c}
            className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${
              colorIdx === i ? "ring-2 ring-white ring-offset-2 ring-offset-transparent" : "ring-1 ring-white/40"
            }`}
            style={{ backgroundColor: c }}
            onClick={() => setColorIdx(i)}
          />
        ))}
      </div>

      <div className="mt-3 flex max-w-xs flex-wrap items-center justify-center gap-1.5">
        {AVATAR_GLYPHS.map((g, i) => (
          <button
            key={g}
            data-testid={`account-glyph-${i}`}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-[15px] text-white backdrop-blur-md transition ${
              glyphIdx === i ? "bg-white/35 ring-2 ring-white/70" : "bg-white/12 hover:bg-white/25"
            }`}
            onClick={() => setGlyphIdx(i)}
          >
            {g}
          </button>
        ))}
      </div>

      <input
        data-testid="account-pin-input"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={pin}
        onChange={(e) => {
          setPinValue(e.target.value.replace(/[^\d]/g, "").slice(0, 12));
          setError("");
        }}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder="PIN (optional)"
        className={`${inputCls} mt-4 tracking-[0.3em] placeholder:tracking-normal`}
      />
      <div className="mt-1.5 text-[11.5px] text-white/65">
        Optional. Stored only as a salted SHA-256 hash on this device.
      </div>

      {error && (
        <div data-testid="account-create-error" className="mt-2 text-[12.5px] font-medium text-red-200">
          {error}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2.5">
        <button
          data-testid="account-create-submit"
          disabled={busy}
          className="rounded-full bg-white/25 px-5 py-1.5 text-[13.5px] font-semibold text-white backdrop-blur-md transition hover:bg-white/35 disabled:opacity-50"
          onClick={() => void submit()}
        >
          Create &amp; Log In
        </button>
        {onCancel && (
          <button
            data-testid="account-create-cancel"
            className="rounded-full bg-white/10 px-4 py-1.5 text-[13px] font-medium text-white/90 backdrop-blur-md transition hover:bg-white/20"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
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

  // Boot the account session: migration + bind the preselected
  // account's settings, prefs, notifications, and file system.
  useEffect(() => {
    void bootSession();
  }, []);

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
