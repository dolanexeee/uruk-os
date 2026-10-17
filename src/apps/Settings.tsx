import React, { useEffect, useState } from "react";
import { ACCENTS, useOS, type WinState } from "@/store/os";
import { formatBytes, totalSize, useFS } from "@/lib/fs";
import { UrukMark } from "@/components/icons";
import { WALLPAPERS } from "@/components/wallpapers";

const PANES = [
  { id: "appearance", name: "Appearance", glyph: "◐" },
  { id: "wallpaper", name: "Wallpaper", glyph: "🖼" },
  { id: "about", name: "About", glyph: "ℹ" },
] as const;

type PaneId = (typeof PANES)[number]["id"];

export default function Settings({ win }: { win: WinState }) {
  const os = useOS();
  const nodes = useFS((s) => s.nodes);
  const [pane, setPane] = useState<PaneId>((win.props.pane as PaneId) || "appearance");
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    if (win.props.pane) setPane(win.props.pane as PaneId);
  }, [win.props.pane]);

  useEffect(() => {
    os.setWindowTitle(win.id, "Settings");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.id]);

  useEffect(() => {
    let live = true;
    const read = async () => {
      if (navigator.storage?.estimate) {
        const e = await navigator.storage.estimate();
        if (live) setEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 });
      }
    };
    void read();
    const t = setInterval(read, 3000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const nodeCount = Object.keys(nodes).length;
  const fileCount = Object.values(nodes).filter((n) => n.type === "file").length;

  return (
    <div className="flex min-h-0 flex-1 text-neutral-800 dark:text-neutral-100">
      {/* sidebar */}
      <div className="w-48 shrink-0 border-r border-black/10 bg-neutral-200/60 p-2 dark:border-white/10 dark:bg-neutral-800/60">
        <div className="mb-3 flex items-center gap-2.5 px-1.5 pt-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-sky-400 to-blue-600 text-[17px] font-bold text-white">
            M
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold">Mustafa</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Local Account</div>
          </div>
        </div>
        {PANES.map((p) => (
          <button
            key={p.id}
            data-testid={`settings-pane-${p.id}`}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left text-[13px] ${
              pane === p.id
                ? "bg-[var(--accent)] text-white"
                : "hover:bg-black/5 dark:hover:bg-white/10"
            }`}
            onClick={() => setPane(p.id)}
          >
            <span className="w-4 text-center">{p.glyph}</span> {p.name}
          </button>
        ))}
      </div>

      {/* pane */}
      <div className="uruk-scroll min-w-0 flex-1 overflow-y-auto bg-white p-5 dark:bg-neutral-900">
        {pane === "appearance" && (
          <div data-testid="settings-appearance">
            <h2 className="mb-4 text-[19px] font-bold">Appearance</h2>
            <div className="mb-2 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Theme</div>
            <div className="mb-6 flex gap-3">
              {(["light", "dark"] as const).map((mode) => (
                <button
                  key={mode}
                  data-testid={`settings-theme-${mode}`}
                  onClick={() => os.setAppearance(mode)}
                  className={`w-28 rounded-xl border-2 p-2 ${
                    os.appearance === mode
                      ? "border-[var(--accent)]"
                      : "border-black/10 dark:border-white/10"
                  }`}
                >
                  <div
                    className={`mb-2 h-14 rounded-lg ${mode === "dark" ? "bg-neutral-800" : "bg-neutral-100 border border-black/10"}`}
                  >
                    <div className={`h-3.5 rounded-t-lg ${mode === "dark" ? "bg-neutral-700" : "bg-neutral-300"}`} />
                    <div className={`mx-2 mt-2 h-2 w-14 rounded ${mode === "dark" ? "bg-neutral-600" : "bg-neutral-300"}`} />
                    <div className={`mx-2 mt-1 h-2 w-9 rounded ${mode === "dark" ? "bg-neutral-600" : "bg-neutral-300"}`} />
                  </div>
                  <div className="text-center text-[13px] capitalize">{mode}</div>
                </button>
              ))}
            </div>

            <div className="mb-2 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Accent Color</div>
            <div className="flex gap-2.5">
              {ACCENTS.map((a) => (
                <button
                  key={a.value}
                  data-testid={`settings-accent-${a.name.toLowerCase()}`}
                  title={a.name}
                  onClick={() => os.setAccent(a.value)}
                  className={`h-8 w-8 rounded-full transition-transform hover:scale-110 ${
                    os.accent === a.value ? "ring-2 ring-offset-2 ring-neutral-400 dark:ring-offset-neutral-900" : ""
                  }`}
                  style={{ backgroundColor: a.value }}
                />
              ))}
            </div>
            <p className="mt-3 text-[12px] text-neutral-500 dark:text-neutral-400">
              The accent recolors selections, highlights, and controls across URUK OS.
            </p>
          </div>
        )}

        {pane === "wallpaper" && (
          <div data-testid="settings-wallpaper">
            <h2 className="mb-4 text-[19px] font-bold">Wallpaper</h2>
            <div className="grid grid-cols-2 gap-3">
              {WALLPAPERS.map((w) => {
                const C = w.Component;
                return (
                  <button
                    key={w.id}
                    data-testid={`settings-wallpaper-${w.id}`}
                    onClick={() => os.setWallpaper(w.id)}
                    className={`overflow-hidden rounded-xl border-2 text-left ${
                      os.wallpaper === w.id && !os.customWallpaperId
                        ? "border-[var(--accent)]"
                        : "border-black/10 dark:border-white/10"
                    }`}
                  >
                    <div className="pointer-events-none h-24 w-full">
                      <C />
                    </div>
                    <div className="bg-neutral-50 px-2.5 py-1.5 text-[12.5px] dark:bg-neutral-800">
                      {w.name}
                      {os.wallpaper === w.id && !os.customWallpaperId && (
                        <span className="float-right text-[var(--accent)]">✓</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[12px] text-neutral-500 dark:text-neutral-400">
              All five wallpapers are original vector artwork drawn for URUK OS.
            </p>
            {os.customWallpaperId && (
              <div
                data-testid="settings-wallpaper-custom"
                className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--accent)]/10 px-3 py-2 text-[12.5px]"
              >
                <span>
                  A photo from your library is currently set as the
                  wallpaper (pick any wallpaper above to switch back).
                </span>
                <button
                  className="ml-auto shrink-0 rounded-md bg-[var(--accent)] px-2.5 py-1 font-medium text-white"
                  onClick={() => os.setCustomWallpaper(null)}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}

        {pane === "about" && (
          <div data-testid="settings-about" className="flex flex-col items-center pt-2 text-center">
            <div className="mb-2 text-neutral-800 dark:text-neutral-100">
              <UrukMark size={64} />
            </div>
            <div className="text-[22px] font-bold tracking-tight">URUK OS</div>
            <div className="mb-5 text-[13px] text-neutral-500 dark:text-neutral-400">
              Version 0.2.0 · Browser build
            </div>
            <dl className="w-full max-w-sm space-y-2 text-left text-[13px]">
              <div className="flex justify-between border-b border-black/5 pb-1.5 dark:border-white/5">
                <dt className="text-neutral-500 dark:text-neutral-400">Device</dt>
                <dd>Web browser (this tab)</dd>
              </div>
              <div className="flex justify-between border-b border-black/5 pb-1.5 dark:border-white/5">
                <dt className="text-neutral-500 dark:text-neutral-400">User</dt>
                <dd>Mustafa</dd>
              </div>
              <div className="flex justify-between border-b border-black/5 pb-1.5 dark:border-white/5">
                <dt className="text-neutral-500 dark:text-neutral-400">File system</dt>
                <dd data-testid="about-fs-stats">
                  {nodeCount} items · {fileCount} files · {formatBytes(totalSize(nodes))}
                </dd>
              </div>
              <div className="flex justify-between border-b border-black/5 pb-1.5 dark:border-white/5">
                <dt className="text-neutral-500 dark:text-neutral-400">Storage (this origin)</dt>
                <dd>
                  {estimate
                    ? `${formatBytes(estimate.usage)} of ${formatBytes(estimate.quota)}`
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500 dark:text-neutral-400">Storage engine</dt>
                <dd>IndexedDB · local-first · $0</dd>
              </div>
            </dl>
            <p className="mt-6 max-w-sm text-[12px] leading-5 text-neutral-500 dark:text-neutral-400">
              URUK OS is a clean-room recreation of the desktop experience.
              All artwork is original. Not affiliated with Apple; “macOS” is
              used descriptively only.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
