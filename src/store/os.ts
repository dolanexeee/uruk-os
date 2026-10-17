import { create } from "zustand";
import {
  getActiveAccountId,
  settingsKeyFor,
  type Account,
} from "@/lib/accounts";

export type AppId =
  | "finder"
  | "terminal"
  | "editor"
  | "settings"
  | "photos"
  | "preview"
  | "notes"
  | "calculator"
  | "calendar"
  | "music"
  | "browser"
  | "code"
  | "clock"
  | "weather"
  | "maps"
  | "tools";
export type Phase = "boot" | "login" | "desktop";
export type Appearance = "light" | "dark";

export interface WindowProps {
  folderId?: string;
  fileId?: string;
  pane?: string;
  /** Calendar deep-link (Spotlight / widgets): show this YYYY-MM-DD. */
  date?: string;
}

export interface WinState {
  id: string;
  app: AppId;
  title: string;
  props: WindowProps;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  prevRect?: { x: number; y: number; w: number; h: number };
  closing?: boolean;
  minimizing?: boolean;
}

export interface FileMenuItem {
  label: string;
  action: () => void;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
}

/**
 * Display names — the approved URUK identity (design/NAMES.md).
 * Internal AppIds are unchanged; only what the user reads changed.
 */
export const APP_NAMES: Record<AppId, string> = {
  finder: "Uruk Files",
  terminal: "Uruk Shell",
  editor: "Scribe",
  settings: "Ukkin",
  photos: "Shamash Gallery",
  preview: "Shamash Eye",
  notes: "Tablet",
  calculator: "Abacus",
  calendar: "Nanna",
  music: "Lyre",
  browser: "Ishtar Gate",
  code: "Uruk Code",
  clock: "Clepsydra",
  weather: "Adad",
  maps: "Two Rivers",
  tools: "Forge",
};

const DEFAULT_RECTS: Record<AppId, { w: number; h: number }> = {
  finder: { w: 880, h: 540 },
  terminal: { w: 660, h: 430 },
  editor: { w: 720, h: 540 },
  settings: { w: 780, h: 560 },
  photos: { w: 900, h: 580 },
  preview: { w: 760, h: 560 },
  notes: { w: 820, h: 540 },
  calculator: { w: 340, h: 520 },
  calendar: { w: 900, h: 580 },
  music: { w: 780, h: 540 },
  browser: { w: 980, h: 620 },
  code: { w: 940, h: 620 },
  clock: { w: 720, h: 540 },
  weather: { w: 860, h: 600 },
  maps: { w: 980, h: 620 },
  tools: { w: 860, h: 580 },
};

/** Apps that exist as a single window; re-opening focuses + merges props. */
export const SINGLE_INSTANCE: ReadonlySet<AppId> = new Set([
  "settings",
  "photos",
  "notes",
  "calculator",
  "calendar",
  "music",
  "browser",
  "code",
  "clock",
  "weather",
  "maps",
  "tools",
]);

export const ACCENTS = [
  { name: "Blue", value: "#0a84ff" },
  { name: "Purple", value: "#bf5af2" },
  { name: "Pink", value: "#ff375f" },
  { name: "Orange", value: "#ff9f0a" },
  { name: "Green", value: "#30d158" },
  { name: "Graphite", value: "#98989d" },
];

interface Settings {
  appearance: Appearance;
  accent: string;
  wallpaper: string;
  /** FS node id of a user photo used as wallpaper (Photos → Set as Wallpaper). */
  customWallpaperId: string | null;
  /** Phase 4A: hide the Dock while any window is maximized (macOS-style). */
  dockAutoHide: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  appearance: "dark",
  accent: "#0a84ff",
  wallpaper: "ziggurat",
  customWallpaperId: null,
  dockAutoHide: true,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(settingsKeyFor(getActiveAccountId()));
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(settingsKeyFor(getActiveAccountId()), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

interface OSStore extends Settings {
  phase: Phase;
  windows: WinState[];
  focusedId: string | null;
  zCounter: number;
  fileMenuItems: FileMenuItem[] | null;

  /* Session (Phase 4A accounts) */
  accounts: Account[];
  accountsReady: boolean;
  currentAccount: Account | null;
  /** True when the login screen is a LOCK (session alive), not a sign-out. */
  sessionLocked: boolean;

  hydrateSettings: () => void;
  setPhase: (p: Phase) => void;
  setAccounts: (accounts: Account[], ready: boolean) => void;
  setCurrentAccount: (a: Account | null) => void;
  setSessionLocked: (locked: boolean) => void;
  login: () => void;
  lock: () => void;
  logout: () => void;

  openApp: (app: AppId, props?: WindowProps, title?: string) => string;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  toggleMaximize: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, rect: { x: number; y: number; w: number; h: number }) => void;
  setWindowTitle: (id: string, title: string) => void;
  setWindowProps: (id: string, props: WindowProps) => void;
  quitApp: (app: AppId) => void;
  setFileMenuItems: (items: FileMenuItem[] | null) => void;

  setAppearance: (a: Appearance) => void;
  setAccent: (a: string) => void;
  setWallpaper: (w: string) => void;
  setCustomWallpaper: (nodeId: string | null) => void;
  setDockAutoHide: (on: boolean) => void;
}

let winCounter = 0;

export const useOS = create<OSStore>((set, get) => {
  return {
    // Always start from defaults so the prerendered HTML and the first
    // client render agree; OSRoot applies the stored settings in a mount
    // effect (hydrateSettings) — a beat later, behind the boot screen.
    ...DEFAULT_SETTINGS,
    phase: "boot",
    windows: [],
    focusedId: null,
    zCounter: 10,
    fileMenuItems: null,

    accounts: [],
    accountsReady: false,
    currentAccount: null,
    sessionLocked: false,

    hydrateSettings: () => set(loadSettings()),
    setPhase: (p) => set({ phase: p }),
    setAccounts: (accounts, ready) => set({ accounts, accountsReady: ready }),
    setCurrentAccount: (currentAccount) => set({ currentAccount }),
    setSessionLocked: (sessionLocked) => set({ sessionLocked }),
    login: () => set({ phase: "desktop", sessionLocked: false }),
    lock: () => set({ phase: "login", sessionLocked: true }),
    logout: () =>
      set({
        phase: "login",
        windows: [],
        focusedId: null,
        fileMenuItems: null,
        sessionLocked: false,
      }),

    openApp: (app, props = {}, title) => {
      const state = get();
      // Single-instance apps (Settings, Photos, Music, …) focus instead of duplicating.
      if (SINGLE_INSTANCE.has(app)) {
        const existing = state.windows.find((w) => w.app === app);
        if (existing) {
          set({
            windows: state.windows.map((w) =>
              w.id === existing.id ? { ...w, props: { ...w.props, ...props } } : w,
            ),
          });
          state.focusWindow(existing.id);
          if (existing.minimized) state.restoreWindow(existing.id);
          return existing.id;
        }
      }
      const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
      const vh = typeof window !== "undefined" ? window.innerHeight : 800;
      const rect = DEFAULT_RECTS[app];
      const cascade = (state.windows.length % 6) * 28;
      const w = Math.min(rect.w, vw - 24);
      const h = Math.min(rect.h, vh - 90);
      const x = Math.max(8, Math.round((vw - w) / 2) + cascade - 40);
      const y = Math.max(30, Math.round((vh - h) / 2) + cascade - 30);
      const z = state.zCounter + 1;
      const id = `win-${++winCounter}-${Date.now().toString(36)}`;
      const win: WinState = {
        id,
        app,
        title: title ?? APP_NAMES[app],
        props,
        x,
        y,
        w,
        h,
        z,
        minimized: false,
        maximized: false,
      };
      set({ windows: [...state.windows, win], focusedId: id, zCounter: z });
      return id;
    },

    closeWindow: (id) => {
      set((s) => ({
        windows: s.windows.map((w) => (w.id === id ? { ...w, closing: true } : w)),
      }));
      setTimeout(() => {
        set((s) => {
          const windows = s.windows.filter((w) => w.id !== id);
          const focusedId =
            s.focusedId === id
              ? (windows.filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]?.id ?? null)
              : s.focusedId;
          return { windows, focusedId };
        });
      }, 160);
    },

    focusWindow: (id) => {
      const state = get();
      if (state.focusedId === id) return;
      const z = state.zCounter + 1;
      set({
        zCounter: z,
        focusedId: id,
        windows: state.windows.map((w) => (w.id === id ? { ...w, z } : w)),
      });
    },

    minimizeWindow: (id) => {
      set((s) => ({
        windows: s.windows.map((w) => (w.id === id ? { ...w, minimizing: true } : w)),
      }));
      setTimeout(() => {
        set((s) => {
          const windows = s.windows.map((w) =>
            w.id === id ? { ...w, minimized: true, minimizing: false } : w,
          );
          const focusedId =
            s.focusedId === id
              ? (windows.filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]?.id ?? null)
              : s.focusedId;
          return { windows, focusedId };
        });
      }, 230);
    },

    restoreWindow: (id) => {
      const state = get();
      const z = state.zCounter + 1;
      set({
        zCounter: z,
        focusedId: id,
        windows: state.windows.map((w) =>
          w.id === id ? { ...w, minimized: false, z } : w,
        ),
      });
    },

    toggleMaximize: (id) => {
      set((s) => ({
        windows: s.windows.map((w) => {
          if (w.id !== id) return w;
          if (w.maximized && w.prevRect) {
            return { ...w, ...w.prevRect, maximized: false, prevRect: undefined };
          }
          return {
            ...w,
            prevRect: { x: w.x, y: w.y, w: w.w, h: w.h },
            x: 0,
            y: 28,
            w: typeof window !== "undefined" ? window.innerWidth : w.w,
            h: (typeof window !== "undefined" ? window.innerHeight : w.h) - 28,
            maximized: true,
          };
        }),
      }));
      get().focusWindow(id);
    },

    moveWindow: (id, x, y) =>
      set((s) => ({
        windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
      })),

    resizeWindow: (id, rect) =>
      set((s) => ({
        windows: s.windows.map((w) => (w.id === id ? { ...w, ...rect } : w)),
      })),

    setWindowTitle: (id, title) =>
      set((s) => ({
        windows: s.windows.map((w) => (w.id === id ? { ...w, title } : w)),
      })),

    setWindowProps: (id, props) =>
      set((s) => ({
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, props: { ...w.props, ...props } } : w,
        ),
      })),

    quitApp: (app) => {
      const ids = get()
        .windows.filter((w) => w.app === app)
        .map((w) => w.id);
      ids.forEach((id) => get().closeWindow(id));
    },

    setFileMenuItems: (items) => set({ fileMenuItems: items }),

    setAppearance: (appearance) => {
      saveSettings({ ...pickSettings(get()), appearance });
      set({ appearance });
    },
    setAccent: (accent) => {
      saveSettings({ ...pickSettings(get()), accent });
      set({ accent });
    },
    setWallpaper: (wallpaper) => {
      // Choosing a built-in wallpaper clears any custom photo wallpaper.
      saveSettings({ ...pickSettings(get()), wallpaper, customWallpaperId: null });
      set({ wallpaper, customWallpaperId: null });
    },
    setCustomWallpaper: (customWallpaperId) => {
      saveSettings({ ...pickSettings(get()), customWallpaperId });
      set({ customWallpaperId });
    },
    setDockAutoHide: (dockAutoHide) => {
      saveSettings({ ...pickSettings(get()), dockAutoHide });
      set({ dockAutoHide });
    },
  };
});

function pickSettings(s: Settings): Settings {
  return {
    appearance: s.appearance,
    accent: s.accent,
    wallpaper: s.wallpaper,
    customWallpaperId: s.customWallpaperId,
    dockAutoHide: s.dockAutoHide,
  };
}

export function useFocusedWindow(): WinState | null {
  return useOS((s) => s.windows.find((w) => w.id === s.focusedId) ?? null);
}
