import React, { useEffect, useRef } from "react";
import { useOS } from "@/store/os";
import { useSystem } from "@/store/system";
import {
  AirplaneGlyph,
  LockGlyph,
  MoonGlyph,
  SunGlyph,
  VolumeGlyph,
  WifiGlyph,
  WifiOffGlyph,
} from "./glyphs";

/**
 * Control Center — Phase 3. Every control here drives a real system
 * service: appearance, the in-OS Wi-Fi switch, Do Not Disturb, display
 * brightness (a composited dim over the whole desktop), and the master
 * volume the Music app actually plays at.
 */

function ToggleTile({
  testid,
  on,
  onClick,
  glyph,
  label,
  state,
  color,
}: {
  testid: string;
  on: boolean;
  onClick: () => void;
  glyph: React.ReactNode;
  label: string;
  state: string;
  color: string;
}) {
  return (
    <button
      data-testid={testid}
      data-on={on}
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-2xl bg-white/55 p-2.5 text-left ring-1 ring-black/5 transition hover:bg-white/70 dark:bg-white/10 dark:ring-white/10 dark:hover:bg-white/15"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition-colors"
        style={{ backgroundColor: on ? color : "#8e8e93" }}
      >
        {glyph}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[12.5px] font-semibold text-neutral-800 dark:text-neutral-50">
          {label}
        </span>
        <span className="block text-[11.5px] text-neutral-500 dark:text-neutral-400">{state}</span>
      </span>
    </button>
  );
}

export default function ControlCenter() {
  const panel = useSystem((s) => s.panel);
  const sys = useSystem();
  const os = useOS();
  const ref = useRef<HTMLDivElement>(null);

  const openState = panel === "controlCenter";

  useEffect(() => {
    if (!openState) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t)) return;
      if (t.closest("[data-panel-toggle]")) return;
      sys.closePanels();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") sys.closePanels();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openState ]);

  if (!openState) return null;

  const dark = os.appearance === "dark";

  return (
    <div
      ref={ref}
      data-testid="control-center"
      className="fade-in fixed right-2.5 top-9 z-[9600] w-[324px] rounded-[26px] bg-white/60 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] ring-1 ring-black/10 backdrop-blur-3xl dark:bg-neutral-800/70 dark:ring-white/15"
    >
      <div className="grid grid-cols-2 gap-2.5">
        <ToggleTile
          testid="cc-wifi"
          on={sys.wifiOn}
          onClick={() => sys.setWifi(!sys.wifiOn)}
          glyph={sys.wifiOn ? <WifiGlyph size={17} /> : <WifiOffGlyph size={17} />}
          label="Wi-Fi"
          state={sys.wifiOn ? "On" : "Off"}
          color="#0a84ff"
        />
        <ToggleTile
          testid="cc-airplane"
          on={sys.airplane}
          onClick={() => sys.setAirplane(!sys.airplane)}
          glyph={<AirplaneGlyph size={17} />}
          label="Airplane Mode"
          state={sys.airplane ? "On" : "Off"}
          color="#ff9f0a"
        />
        <ToggleTile
          testid="cc-dnd"
          on={sys.dnd}
          onClick={() => sys.setDnd(!sys.dnd)}
          glyph={<MoonGlyph size={16} />}
          label="Do Not Disturb"
          state={sys.dnd ? "On" : "Off"}
          color="#5e5ce6"
        />
        <ToggleTile
          testid="cc-dark"
          on={dark}
          onClick={() => os.setAppearance(dark ? "light" : "dark")}
          glyph={<span className="text-[15px] leading-none">{dark ? "☾" : "☀"}</span>}
          label="Dark Mode"
          state={dark ? "On" : "Off"}
          color="#48484a"
        />
      </div>

      <div className="mt-2.5 rounded-2xl bg-white/55 p-3 ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
        <div className="mb-1.5 text-[12.5px] font-semibold text-neutral-800 dark:text-neutral-50">
          Display
        </div>
        <div className="flex items-center gap-2.5">
          <SunGlyph size={16} className="shrink-0 text-neutral-500 dark:text-neutral-300" />
          <input
            data-testid="cc-brightness"
            type="range"
            min={0.35}
            max={1}
            step={0.01}
            value={sys.brightness}
            onChange={(e) => sys.setBrightness(parseFloat(e.target.value))}
            className="w-full accent-[var(--accent)]"
            aria-label="Brightness"
          />
        </div>
        <div className="mb-1.5 mt-3.5 text-[12.5px] font-semibold text-neutral-800 dark:text-neutral-50">
          Sound
        </div>
        <div className="flex items-center gap-2.5">
          <VolumeGlyph size={16} className="shrink-0 text-neutral-500 dark:text-neutral-300" />
          <input
            data-testid="cc-volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sys.volume}
            onChange={(e) => sys.setVolume(parseFloat(e.target.value))}
            className="w-full accent-[var(--accent)]"
            aria-label="Volume"
          />
        </div>
      </div>

      <button
        data-testid="cc-lock"
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/55 py-2.5 text-[13px] font-semibold text-neutral-800 ring-1 ring-black/5 transition hover:bg-white/70 dark:bg-white/10 dark:text-neutral-50 dark:ring-white/10 dark:hover:bg-white/15"
        onClick={() => {
          sys.closePanels();
          os.lock();
        }}
      >
        <LockGlyph size={15} /> Lock Screen
      </button>
    </div>
  );
}
