import { create } from "zustand";

export type AppId = "finder" | "terminal" | "editor" | "settings";
export type Phase = "boot" | "login" | "desktop";
export type Appearance = "light" | "dark";

export interface WindowProps {
  folderId?: string;
  fileId?: string;
  pane?: string;
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

export const APP_NAMES: Record<AppId, string> = {
  finder: "Finder",
  terminal: "Terminal",
  editor: "Editor",
  settings: "Settings",
};

const DEFAULT_RECTS: Record<AppId, { w: number; h: number }> = {
  finder: { w: 880, h: 540 },
  terminal: { w: 660, h: 430 },
  editor: { w: 720, h: 540 },
  settings: { w: 780, h: 560 },
};

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
}

const SETTINGS_KEY = "uruk-os-settings-v1";
const DEFAULT_SETTINGS: Settings = {
  appearance: "dark",
  accent: "#0a84ff",
  wallpaper: "ziggurat",
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
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

  hydrateSettings: () => void;
  setPhase: (p: Phase) => void;
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

    hydrateSettings: () => set(loadSettings()),
    setPhase: (p) => set({ phase: p }),
    login: () => set({ phase: "desktop" }),
    lock: () => set({ phase: "login" }),
    logout: () => set({ phase: "login", windows: [], focusedId: null, fileMenuItems: null }),

    openApp: (app, props = {}, title) => {
      const state = get();
      // Settings is single-instance (like the real thing).
      if (app === "settings") {
        const existing = state.windows.find((w) => w.app === "settings");
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
      const s = { appearance, accent: get().accent, wallpaper: get().wallpaper };
      saveSettings(s);
      set({ appearance });
    },
    setAccent: (accent) => {
      const s = { appearance: get().appearance, accent, wallpaper: get().wallpaper };
      saveSettings(s);
      set({ accent });
    },
    setWallpaper: (wallpaper) => {
      const s = { appearance: get().appearance, accent: get().accent, wallpaper };
      saveSettings(s);
      set({ wallpaper });
    },
  };
});

export function useFocusedWindow(): WinState | null {
  return useOS((s) => s.windows.find((w) => w.id === s.focusedId) ?? null);
}
