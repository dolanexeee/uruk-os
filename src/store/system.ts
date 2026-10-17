import { create } from "zustand";
import { getActiveAccountId, systemKeyFor } from "@/lib/accounts";

/**
 * System store — Phase 3.
 *
 * The OS-wide services that live *outside* any single app: display
 * brightness, the in-OS network switch (Wi-Fi), Do Not Disturb, the
 * master volume the Music app plays at, the weather city, the idle
 * (screensaver) timeout, and which system panel is open.
 *
 * Preferences persist to localStorage; panel state and the now-playing
 * registration are ephemeral by design.
 */

export type PanelKind = "spotlight" | "launchpad" | "controlCenter" | "notifCenter" | null;

export interface NowPlaying {
  title: string;
  subtitle: string;
  playing: boolean;
}

interface SystemPrefs {
  /** 0.35–1 — rendered as a black overlay at (1 - brightness). */
  brightness: number;
  wifiOn: boolean;
  dnd: boolean;
  airplane: boolean;
  /** 0–1, shared with the Music app. */
  volume: number;
  weatherCity: string;
  /** Seconds of inactivity before the screensaver. 0 = never. */
  idleTimeoutSec: number;
}

const prefsKey = () => systemKeyFor(getActiveAccountId());

const DEFAULT_PREFS: SystemPrefs = {
  brightness: 1,
  wifiOn: true,
  dnd: false,
  airplane: false,
  volume: 0.85,
  weatherCity: "Baghdad",
  idleTimeoutSec: 0,
};

function loadPrefs(): SystemPrefs {
  try {
    const raw = localStorage.getItem(prefsKey());
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<SystemPrefs>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFS;
}

interface SystemStore extends SystemPrefs {
  panel: PanelKind;
  nowPlaying: NowPlaying | null;

  hydrateSystem: () => void;
  setBrightness: (v: number) => void;
  setWifi: (on: boolean) => void;
  setDnd: (on: boolean) => void;
  setAirplane: (on: boolean) => void;
  setVolume: (v: number) => void;
  setWeatherCity: (city: string) => void;
  setIdleTimeoutSec: (sec: number) => void;
  replacePrefs: (prefs: Partial<SystemPrefs>) => void;

  setPanel: (p: PanelKind) => void;
  togglePanel: (p: Exclude<PanelKind, null>) => void;
  closePanels: () => void;

  setNowPlaying: (np: NowPlaying | null) => void;
  /** The Music app registers its play/pause so widgets can drive it. */
  registerPlaybackToggle: (fn: (() => void) | null) => void;
  togglePlayback: () => void;
}

let playbackToggle: (() => void) | null = null;

export const useSystem = create<SystemStore>((set, get) => {
  const persist = (patch: Partial<SystemPrefs>) => {
    const next = { ...pickPrefs(get()), ...patch };
    try {
      localStorage.setItem(prefsKey(), JSON.stringify(next));
    } catch {
      /* ignore */
    }
    set(patch);
  };

  return {
    ...DEFAULT_PREFS,
    panel: null,
    nowPlaying: null,

    hydrateSystem: () => set(loadPrefs()),

    setBrightness: (v) => persist({ brightness: Math.min(1, Math.max(0.35, v)) }),

    setWifi: (on) => {
      // Touching Wi-Fi directly cancels Airplane mode (like a real OS).
      persist({ wifiOn: on, airplane: on ? get().airplane : false });
    },

    setDnd: (on) => persist({ dnd: on }),

    setAirplane: (on) => {
      // Composite, and honest about it: Airplane = radios off + silenced.
      if (on) persist({ airplane: true, wifiOn: false, dnd: true });
      else persist({ airplane: false, wifiOn: true, dnd: false });
    },

    setVolume: (v) => persist({ volume: Math.min(1, Math.max(0, v)) }),
    setWeatherCity: (city) => persist({ weatherCity: city.trim() || "Baghdad" }),
    setIdleTimeoutSec: (sec) => persist({ idleTimeoutSec: sec }),

    replacePrefs: (prefs) => {
      const next = { ...DEFAULT_PREFS, ...pickPrefs(get()), ...prefs };
      try {
        localStorage.setItem(prefsKey(), JSON.stringify(next));
      } catch {
        /* ignore */
      }
      set(next);
    },

    setPanel: (p) => set({ panel: p }),
    togglePanel: (p) => set({ panel: get().panel === p ? null : p }),
    closePanels: () => set({ panel: null }),

    setNowPlaying: (np) => set({ nowPlaying: np }),
    registerPlaybackToggle: (fn) => {
      playbackToggle = fn;
    },
    togglePlayback: () => playbackToggle?.(),
  };
});

function pickPrefs(s: SystemPrefs): SystemPrefs {
  return {
    brightness: s.brightness,
    wifiOn: s.wifiOn,
    dnd: s.dnd,
    airplane: s.airplane,
    volume: s.volume,
    weatherCity: s.weatherCity,
    idleTimeoutSec: s.idleTimeoutSec,
  };
}
