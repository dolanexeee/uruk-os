import React, { useEffect, useRef, useState } from "react";
import { useOS, type WinState } from "@/store/os";
import { useSystem } from "@/store/system";
import { WifiOffGlyph } from "@/components/glyphs";

/**
 * Ishtar Gate (the URUK Browser) — a real (if small) web browser: tabs,
 * and an address bar that takes URLs or search terms.
 *
 * Phase 4A: pages load through the OS's own same-origin proxy
 * (/api/proxy), which fetches them server-side and rewrites their
 * URLs — so sites that refuse to be iframed directly now render
 * inside the OS. YouTube watch pages become the official embed
 * player. Same-origin pages (the OS's own test fixtures) load
 * directly.
 *
 * Honest limitation, surfaced in the UI rather than hidden: a
 * rewriting proxy cannot carry everything — logins do not persist
 * (no cookies are forwarded), and JavaScript-heavy web apps that
 * mint their own absolute URLs or need websockets/service workers
 * may not fully work. When the proxy cannot fetch a page we say so
 * and offer the always-visible “Open in real tab” button. We never
 * fake a loaded page.
 */

const START_URL = "uruk://start";
const SEARCH_URL = (q: string) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;

interface Tab {
  id: number;
  /** The real URL shown in the address bar (never the proxy URL). */
  url: string;
  /** The iframe src actually loaded (proxy URL, embed, or direct). */
  src: string;
  title: string;
  navKey: number;
  blocked: boolean;
  error?: string;
}

/** YouTube watch/shorts/share URLs → the youtube-nocookie embed. */
function youtubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www\.|m\.)/, "");
    let id: string | null = null;
    if (host === "youtube.com" && u.pathname === "/watch") id = u.searchParams.get("v");
    else if (host === "youtu.be") id = u.pathname.replace("/", "");
    else if (host === "youtube.com" && u.pathname.startsWith("/shorts/"))
      id = u.pathname.split("/")[2] ?? null;
    if (id && /^[\w-]{6,}$/.test(id))
      return `https://www.youtube-nocookie.com/embed/${id}`;
  } catch {
    /* not a URL we recognize */
  }
  return null;
}

/** What the iframe should actually load for a real URL. */
function frameSrcFor(url: string): string {
  if (url === START_URL) return url;
  const embed = youtubeEmbed(url);
  if (embed) return embed;
  if (typeof window !== "undefined") {
    try {
      if (new URL(url).origin === window.location.origin) return url;
    } catch {
      /* fall through to the proxy */
    }
  }
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

let tabCounter = 0;
function newTab(url: string = START_URL): Tab {
  return {
    id: ++tabCounter,
    url,
    src: frameSrcFor(url),
    title: url === START_URL ? "Start Page" : "New Tab",
    navKey: 0,
    blocked: false,
  };
}

function normalizeInput(raw: string): string {
  const text = raw.trim();
  if (!text) return START_URL;
  if (/^https?:\/\//i.test(text)) return text;
  if (/^(localhost|127\.|\[::1\])/i.test(text)) return `http://${text}`;
  if (!/\s/.test(text) && text.includes(".")) return `https://${text}`;
  return SEARCH_URL(text);
}

function titleFor(url: string): string {
  if (url === START_URL) return "Start Page";
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

const QUICK_LINKS: { name: string; url: string; blurb: string }[] = [
  { name: "Example", url: "https://example.com", blurb: "The classic placeholder page (allows framing)" },
  { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Uruk", blurb: "Read about the ancient city of Uruk" },
  { name: "DuckDuckGo", url: "https://html.duckduckgo.com/html/", blurb: "The lightweight search front page" },
  { name: "Hacker News", url: "https://news.ycombinator.com", blurb: "Tech news — may refuse framing" },
  { name: "Uruk Cut", url: "https://uruk-cut.vercel.app", blurb: "The first app in the URUK suite" },
  { name: "OpenStreetMap", url: "https://www.openstreetmap.org", blurb: "The free map of the world" },
];

export default function BrowserApp({ win }: { win: WinState }) {
  const os = useOS();
  const wifiOn = useSystem((s) => s.wifiOn);
  const focused = os.focusedId === win.id;
  const [tabs, setTabs] = useState<Tab[]>(() => [newTab()]);
  const [activeId, setActiveId] = useState<number>(() => tabCounter);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const [address, setAddress] = useState("");
  const iframeRefs = useRef<Map<number, HTMLIFrameElement>>(new Map());

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  useEffect(() => {
    os.setWindowTitle(win.id, active ? `Ishtar Gate — ${active.title}` : "Ishtar Gate");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.title, win.id]);

  useEffect(() => {
    setAddress(active && active.url !== START_URL ? active.url : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const patchTab = (id: number, patch: Partial<Tab>) =>
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const navigate = (raw: string) => {
    if (!active) return;
    const url = normalizeInput(raw);
    patchTab(active.id, {
      url,
      src: frameSrcFor(url),
      title: titleFor(url),
      blocked: false,
      error: undefined,
      navKey: active.navKey + 1,
    });
    setAddress(url === START_URL ? "" : url);
  };

  const closeTab = (id: number) => {
    setTabs((ts) => {
      const idx = ts.findIndex((t) => t.id === id);
      const next = ts.filter((t) => t.id !== id);
      if (next.length === 0) {
        const fresh = newTab();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) {
        setActiveId(next[Math.max(0, idx - 1)].id);
      }
      return next;
    });
  };

  const addTab = () => {
    const t = newTab();
    setTabs((ts) => [...ts, t]);
    setActiveId(t.id);
  };

  const frameNav = (fn: (w: Window) => void) => {
    const frame = active && iframeRefs.current.get(active.id);
    if (!frame?.contentWindow) return;
    try {
      fn(frame.contentWindow);
    } catch {
      /* cross-origin navigation guards — ignore */
    }
  };

  /**
   * After a frame loads, sync the tab with where the frame actually
   * is: proxied pages are same-origin with the OS, so we can read the
   * frame's location, recover the real URL from the proxy parameter,
   * take the page's own <title>, and spot the proxy's error marker.
   * Cross-origin frames (the YouTube embed) refuse inspection — for
   * those the navigate-time title stands.
   */
  const onFrameLoad = (tab: Tab) => {
    const frame = iframeRefs.current.get(tab.id);
    if (!frame) return;
    try {
      const w = frame.contentWindow;
      const doc = frame.contentDocument;
      if (!w || !doc) return;
      const loc = w.location;
      let realUrl = tab.url;
      if (loc.pathname === "/api/proxy") {
        const p = new URLSearchParams(loc.search).get("url");
        if (p) realUrl = p;
      } else if (loc.href && loc.href !== "about:blank") {
        realUrl = loc.href;
      }
      const errEl = doc.querySelector("[data-uruk-proxy-error]");
      const error = errEl
        ? errEl.getAttribute("data-uruk-proxy-error") ||
          "The page could not be loaded through the proxy."
        : undefined;
      patchTab(tab.id, {
        ...(realUrl !== tab.url ? { url: realUrl } : {}),
        ...(doc.title ? { title: doc.title } : {}),
        error,
        blocked: false,
      });
      if (tab.id === activeIdRef.current && realUrl !== tab.url) {
        setAddress(realUrl === START_URL ? "" : realUrl);
      }
    } catch {
      /* cross-origin: nothing to sync */
    }
    window.setTimeout(() => {
      try {
        const doc = frame.contentDocument;
        if (doc && (doc.URL === "about:blank" || doc.URL === "")) {
          patchTab(tab.id, { blocked: true });
        }
      } catch {
        /* cross-origin page really loaded — nothing to flag */
      }
    }, 700);
  };

  useEffect(() => {
    if (!focused) return;
    os.setFileMenuItems([
      { label: "New Tab", action: addTab },
      {
        label: "Open Current Page in Real Tab",
        disabled: !active || active.url === START_URL,
        action: () => active && window.open(active.url, "_blank", "noopener"),
      },
    ]);
    return () => os.setFileMenuItems(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, active?.url]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-neutral-100 dark:bg-neutral-900" data-testid="browser">
      {/* tab strip */}
      <div className="flex items-end gap-1 overflow-x-auto bg-neutral-200/80 px-2 pt-1.5 dark:bg-neutral-800">
        {tabs.map((t) => (
          <div
            key={t.id}
            data-testid="browser-tab"
            className={`group flex max-w-[180px] items-center gap-1.5 rounded-t-lg px-2.5 py-1.5 text-[12px] ${
              t.id === activeId
                ? "bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100"
                : "bg-black/[0.06] text-neutral-500 hover:bg-black/[0.1] dark:bg-white/[0.06] dark:text-neutral-400"
            }`}
          >
            <button className="min-w-0 flex-1 truncate text-left" onClick={() => setActiveId(t.id)}>
              {t.title}
            </button>
            <button
              data-testid="browser-tab-close"
              className="rounded px-0.5 leading-none hover:bg-black/10 dark:hover:bg-white/15"
              onClick={() => closeTab(t.id)}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          data-testid="browser-newtab"
          className="mb-0.5 rounded-md px-2 py-1 text-[15px] leading-none text-neutral-500 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
          onClick={addTab}
        >
          +
        </button>
      </div>

      {/* toolbar */}
      <div className="flex items-center gap-1.5 border-b border-black/10 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-neutral-900">
        <button
          data-testid="browser-back"
          className="rounded-md px-2 py-1 text-[15px] hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => frameNav((w) => w.history.back())}
        >
          ‹
        </button>
        <button
          data-testid="browser-forward"
          className="rounded-md px-2 py-1 text-[15px] hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => frameNav((w) => w.history.forward())}
        >
          ›
        </button>
        <button
          data-testid="browser-reload"
          className="rounded-md px-2 py-1 text-[14px] hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() =>
            active && patchTab(active.id, { navKey: active.navKey + 1, blocked: false, error: undefined })
          }
        >
          ⟳
        </button>
        <button
          data-testid="browser-home"
          className="rounded-md px-2 py-1 text-[14px] hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() =>
            active &&
            patchTab(active.id, { url: START_URL, src: START_URL, title: "Start Page", blocked: false, error: undefined })
          }
        >
          ⌂
        </button>
        <input
          data-testid="browser-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && navigate(address)}
          onFocus={(e) => e.target.select()}
          placeholder="Search or enter a website name"
          className="min-w-0 flex-1 rounded-full border border-black/10 bg-neutral-100 px-3 py-1 text-[13px] text-neutral-900 outline-none focus:border-[var(--accent)] dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-100"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          data-testid="browser-open-external"
          disabled={!active || active.url === START_URL}
          className="shrink-0 rounded-md border border-black/10 px-2.5 py-1 text-[12.5px] disabled:opacity-40 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => active && window.open(active.url, "_blank", "noopener")}
        >
          Open in real tab ↗
        </button>
      </div>

      {/* blocked notice */}
      {active && active.blocked && active.url !== START_URL && (
        <div
          data-testid="browser-blocked-notice"
          className="flex items-center gap-2 border-b border-amber-300/60 bg-amber-50 px-3 py-1.5 text-[12.5px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <span>
            This site refused to be embedded (it sends framing-protection
            headers), so there is nothing to show here — that is the site's
            choice, not a broken page.
          </span>
          <button
            className="ml-auto shrink-0 rounded bg-amber-600 px-2 py-0.5 font-medium text-white"
            onClick={() => window.open(active.url, "_blank", "noopener")}
          >
            Open it in a real tab
          </button>
        </div>
      )}

      {/* proxy error state */}
      {active && active.error && active.url !== START_URL && wifiOn && (
        <div
          data-testid="browser-proxy-error"
          className="flex items-center gap-2 border-b border-red-300/60 bg-red-50 px-3 py-1.5 text-[12.5px] text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
        >
          <span className="min-w-0 flex-1">
            <b>Could not load this page through the URUK proxy.</b>{" "}
            <span className="opacity-80">{active.error}</span>
          </span>
          <button
            className="shrink-0 rounded bg-red-600 px-2 py-0.5 font-medium text-white"
            onClick={() => window.open(active.url, "_blank", "noopener")}
          >
            Open it in a real tab
          </button>
        </div>
      )}

      {/* content */}
      <div className="relative min-h-0 flex-1 bg-white">
        {!wifiOn && (
          <div
            data-testid="browser-offline"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-neutral-50 px-8 text-center dark:bg-neutral-900"
          >
            <WifiOffGlyph size={40} className="text-neutral-400" />
            <div className="text-[16px] font-semibold text-neutral-700 dark:text-neutral-200">
              Wi-Fi is off
            </div>
            <p className="max-w-sm text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
              This machine's network switch is off, so no pages can load.
              Turn Wi-Fi back on in Control Center (top-right of the menu
              bar) and pages will load again.
            </p>
          </div>
        )}
        {wifiOn && tabs.map((t) =>
          t.url === START_URL ? (
            t.id === activeId ? (
              <StartPage key={t.id} onNavigate={navigate} />
            ) : null
          ) : (
            <iframe
              key={`${t.id}-${t.navKey}`}
              ref={(el) => {
                if (el) iframeRefs.current.set(t.id, el);
                else iframeRefs.current.delete(t.id);
              }}
              src={t.src}
              title={t.title}
              data-testid={t.id === activeId ? "browser-frame" : undefined}
              className="absolute inset-0 h-full w-full border-0 bg-white"
              style={{ display: t.id === activeId ? "block" : "none" }}
              onLoad={() => onFrameLoad(t)}
            />
          ),
        )}
      </div>
    </div>
  );
}

function StartPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  return (
    <div className="uruk-scroll absolute inset-0 overflow-y-auto bg-neutral-50 dark:bg-neutral-900" data-testid="browser-start">
      <div className="mx-auto max-w-xl px-6 py-10">
        <div className="mb-1 text-center text-[26px] font-bold tracking-tight text-neutral-800 dark:text-neutral-100">
          Ishtar Gate
        </div>
        <p className="mb-8 text-center text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
          A small, honest browser. Type an address or a search above.
          Pages load through the URUK proxy, so sites that refuse to be
          framed can still appear here. Some things still cannot work
          through any proxy — logins do not persist, and heavy web apps
          may misbehave — and when a page cannot load we will tell you
          and offer the real tab instead of pretending.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {QUICK_LINKS.map((l) => (
            <button
              key={l.url}
              className="rounded-xl bg-white p-3.5 text-left shadow-sm ring-1 ring-black/5 transition hover:ring-[var(--accent)] dark:bg-neutral-800 dark:ring-white/10"
              onClick={() => onNavigate(l.url)}
            >
              <div className="text-[14px] font-semibold text-neutral-800 dark:text-neutral-100">{l.name}</div>
              <div className="mt-0.5 text-[12px] leading-4 text-neutral-500 dark:text-neutral-400">{l.blurb}</div>
            </button>
          ))}
        </div>
        <p className="mt-8 text-center text-[12px] text-neutral-400 dark:text-neutral-500">
          Pages are fetched by the URUK OS server and shown here — the
          proxy forwards no cookies and keeps no browsing history.
        </p>
      </div>
    </div>
  );
}
