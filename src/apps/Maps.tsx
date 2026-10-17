import React, { useState } from "react";
import { useSystem } from "@/store/system";
import type { WinState } from "@/store/os";

/**
 * Two Rivers — maps (Phase 5), named for the land between them.
 *
 * Renders OpenStreetMap's own embed viewer (openstreetmap.org/export/
 * embed.html, free with attribution) and searches with Nominatim —
 * both queried directly by the browser, no key, no proxy in between.
 * Selecting a result re-centers the embed on the result's own
 * bounding box with a marker. When the OS Wi-Fi switch is off, the
 * app says so instead of embedding a dead frame.
 */

interface Center {
  label: string;
  lat: number;
  lon: number;
  /** [minLon, minLat, maxLon, maxLat] */
  bbox: [number, number, number, number];
}

const BAGHDAD: Center = {
  label: "Baghdad, Iraq",
  lat: 33.3152,
  lon: 44.3661,
  bbox: [44.2761, 33.2602, 44.4561, 33.3702],
};

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: [string, string, string, string]; // [minLat, maxLat, minLon, maxLon]
}

function embedSrc(c: Center): string {
  const bbox = c.bbox.map((n) => n.toFixed(6)).join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${c.lat}%2C${c.lon}`;
}

export default function Maps({ win }: { win: WinState }) {
  void win;
  const wifiOn = useSystem((s) => s.wifiOn);
  const [center, setCenter] = useState<Center>(BAGHDAD);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError("");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) throw new Error(`nominatim ${res.status}`);
      const list = (await res.json()) as NominatimResult[];
      setResults(list);
      if (!list.length) setError(`No places match “${q}”`);
    } catch {
      setResults(null);
      setError("Could not reach the place search (Nominatim)");
    } finally {
      setSearching(false);
    }
  };

  const pick = (r: NominatimResult) => {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    const bb = r.boundingbox;
    const bbox: Center["bbox"] = bb
      ? [parseFloat(bb[2]), parseFloat(bb[0]), parseFloat(bb[3]), parseFloat(bb[1])]
      : [lon - 0.09, lat - 0.055, lon + 0.09, lat + 0.055];
    setCenter({ label: r.display_name, lat, lon, bbox });
    setResults(null);
    setQuery("");
  };

  const openRealTab = () => {
    window.open(
      `https://www.openstreetmap.org/?mlat=${center.lat}&mlon=${center.lon}#map=13/${center.lat}/${center.lon}`,
      "_blank",
      "noopener",
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-neutral-900" data-testid="maps">
      <div className="relative border-b border-black/10 px-3 py-2 dark:border-white/10">
        <div className="flex items-center gap-2">
          <input
            data-testid="maps-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void runSearch()}
            placeholder="Search for a place…"
            className="min-w-0 flex-1 rounded-md border border-black/10 bg-neutral-50 px-2.5 py-1.5 text-[13.5px] outline-none focus:border-[var(--accent)] dark:border-white/10 dark:bg-neutral-800"
          />
          <button
            data-testid="maps-search-btn"
            onClick={() => void runSearch()}
            disabled={searching}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
          <button
            data-testid="maps-open-tab"
            onClick={openRealTab}
            className="rounded-md bg-black/5 px-3 py-1.5 text-[13px] dark:bg-white/10"
          >
            Open in real tab ↗
          </button>
        </div>
        <div className="truncate pt-1 text-[12px] text-neutral-500 dark:text-neutral-400">
          📍 <span data-testid="maps-place">{center.label}</span>
        </div>
        {error && (
          <div data-testid="maps-error" className="pt-0.5 text-[12.5px] text-red-500">
            {error}
          </div>
        )}
        {results && results.length > 0 && (
          <div
            data-testid="maps-results"
            className="absolute inset-x-3 top-full z-20 mt-1 overflow-hidden rounded-lg border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-800"
          >
            {results.map((r, i) => (
              <button
                key={`${r.lat}-${r.lon}-${i}`}
                data-testid={`maps-result-${i}`}
                onClick={() => pick(r)}
                className="block w-full truncate px-3 py-2 text-left text-[13px] hover:bg-[var(--accent)] hover:text-white"
              >
                {r.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {wifiOn ? (
        <iframe
          key={embedSrc(center)}
          title="OpenStreetMap"
          data-testid="maps-frame"
          src={embedSrc(center)}
          className="min-h-0 flex-1 border-0"
          loading="lazy"
        />
      ) : (
        <div data-testid="maps-offline" className="flex flex-1 items-center justify-center px-8 text-center">
          <div>
            <div className="text-[15px] font-medium">Maps needs the network</div>
            <div className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">
              The OS Wi-Fi switch is off. Turn it on in Control Center and the
              map comes back — Two Rivers embeds live OpenStreetMap tiles, it
              does not fake them.
            </div>
          </div>
        </div>
      )}
      <div className="border-t border-black/5 px-3 py-1 text-[11px] text-neutral-400 dark:border-white/5">
        Map data © OpenStreetMap contributors — rendered by openstreetmap.org
      </div>
    </div>
  );
}
