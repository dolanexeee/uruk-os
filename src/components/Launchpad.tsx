import React, { useEffect, useRef, useState } from "react";
import { APP_NAMES, useOS, type AppId } from "@/store/os";
import { useSystem } from "@/store/system";
import { AppIcon } from "./icons";
import { SearchGlyph } from "./glyphs";

/** Launchpad — the full-screen app grid (Phase 3). */

const ALL_APPS = Object.keys(APP_NAMES) as AppId[];

export default function Launchpad() {
  const panel = useSystem((s) => s.panel);
  const closePanels = useSystem((s) => s.closePanels);
  const openApp = useOS((s) => s.openApp);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const openState = panel === "launchpad";

  useEffect(() => {
    if (openState) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [openState ]);

  useEffect(() => {
    if (!openState) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanels();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openState, closePanels]);

  if (!openState) return null;

  const apps = ALL_APPS.filter((a) =>
    APP_NAMES[a].toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div
      className="fade-in fixed inset-0 z-[9400] overflow-y-auto bg-black/35 backdrop-blur-2xl"
      data-testid="launchpad"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closePanels();
      }}
    >
      <div className="mx-auto flex min-h-full w-[min(880px,94vw)] flex-col items-center px-6 py-12">
        <div className="mb-10 flex w-72 items-center gap-2 rounded-lg bg-white/15 px-3 py-1.5 ring-1 ring-white/25 backdrop-blur">
          <SearchGlyph size={14} className="text-white/80" />
          <input
            ref={inputRef}
            data-testid="launchpad-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-white outline-none placeholder:text-white/60"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        {apps.length === 0 && (
          <div className="text-[14px] text-white/80">No applications match “{query}”.</div>
        )}
        <div className="grid grid-cols-4 gap-x-8 gap-y-9 sm:grid-cols-5 md:grid-cols-6">
          {apps.map((app) => (
            <button
              key={app}
              data-testid={`launchpad-app-${app}`}
              className="group flex w-[92px] flex-col items-center gap-1.5"
              onClick={() => {
                openApp(app);
                closePanels();
              }}
            >
              <span className="transition-transform duration-100 group-hover:scale-105 group-active:scale-95">
                <AppIcon app={app} size={72} />
              </span>
              <span className="text-center text-[12.5px] font-medium text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.7)]">
                {APP_NAMES[app]}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
