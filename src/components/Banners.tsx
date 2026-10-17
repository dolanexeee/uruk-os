import React, { useEffect } from "react";
import { useNotifications, type OSNotification } from "@/store/notifications";
import { useSystem } from "@/store/system";
import { BellGlyph } from "./glyphs";

/** Sliding notification banners (top-right, auto-dismiss). */

function Banner({ n }: { n: OSNotification }) {
  const dismiss = useNotifications((s) => s.dismissBanner);
  const setPanel = useSystem((s) => s.setPanel);

  useEffect(() => {
    const t = setTimeout(() => dismiss(n.id), 5600);
    return () => clearTimeout(t);
  }, [n.id, dismiss]);

  return (
    <button
      data-testid="notification-banner"
      data-source={n.source}
      className="banner-in pointer-events-auto flex w-[330px] items-start gap-2.5 rounded-3xl bg-white/70 p-3 text-left shadow-[0_14px_44px_rgba(0,0,0,0.4)] ring-1 ring-black/10 backdrop-blur-2xl dark:bg-neutral-800/80 dark:ring-white/15"
      onClick={() => {
        dismiss(n.id);
        setPanel("notifCenter");
      }}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
        <BellGlyph size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {n.source}
        </span>
        <span className="block truncate text-[13.5px] font-semibold text-neutral-800 dark:text-neutral-50">
          {n.title}
        </span>
        <span className="block text-[12.5px] leading-4 text-neutral-600 dark:text-neutral-300">
          {n.body}
        </span>
      </span>
    </button>
  );
}

export default function Banners() {
  const banners = useNotifications((s) => s.banners);
  if (!banners.length) return null;
  return (
    <div className="pointer-events-none fixed right-3 top-9 z-[9700] flex flex-col gap-2">
      {banners.map((b) => (
        <Banner key={b.id} n={b} />
      ))}
    </div>
  );
}
