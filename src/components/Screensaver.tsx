import React, { useEffect, useRef, useState } from "react";
import { useOS } from "@/store/os";
import { useSystem } from "@/store/system";
import { ActiveWallpaper } from "./Wallpaper";

/**
 * Idle screensaver (Phase 3). After the configured idle period the
 * screen fades to the wallpaper and a clock; any input wakes it —
 * straight to the lock screen, like a real machine.
 *
 * Mounted only during the desktop phase.
 */
export default function Screensaver() {
  const idleTimeoutSec = useSystem((s) => s.idleTimeoutSec);
  const lock = useOS((s) => s.lock);
  const closePanels = useSystem((s) => s.closePanels);
  const [active, setActive] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const lastActivity = useRef(Date.now());
  const activeRef = useRef(false);
  activeRef.current = active;

  useEffect(() => {
    lastActivity.current = Date.now();
    if (!idleTimeoutSec) setActive(false);
  }, [idleTimeoutSec]);

  useEffect(() => {
    const onActivity = () => {
      if (activeRef.current) {
        setActive(false);
        closePanels();
        lock();
      }
      lastActivity.current = Date.now();
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"] as const;
    for (const e of events) window.addEventListener(e, onActivity, { passive: true });
    const t = setInterval(() => {
      if (
        idleTimeoutSec > 0 &&
        !activeRef.current &&
        Date.now() - lastActivity.current >= idleTimeoutSec * 1000
      ) {
        setActive(true);
        setNow(new Date());
      }
    }, 500);
    return () => {
      for (const e of events) window.removeEventListener(e, onActivity);
      clearInterval(t);
    };
  }, [idleTimeoutSec, lock, closePanels]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;

  return (
    <div
      className="fade-in fixed inset-0 z-[9800] overflow-hidden bg-black"
      data-testid="screensaver"
    >
      <div className="absolute inset-0 opacity-90">
        <ActiveWallpaper />
      </div>
      <div className="absolute inset-0 bg-black/25" />
      <div className="relative flex h-full flex-col items-center justify-center text-white">
        <div className="text-[88px] font-bold leading-none tracking-tight drop-shadow-2xl">
          {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/i, "")}
        </div>
        <div className="mt-3 text-[19px] font-medium text-white/85 drop-shadow">
          {now.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </div>
        <div className="absolute bottom-10 text-[12.5px] tracking-[0.25em] text-white/60">
          URUK&nbsp;OS
        </div>
      </div>
    </div>
  );
}
