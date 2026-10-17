import React, { useEffect, useRef, useState } from "react";
import {
  describeCode,
  fetchForecast,
  geocodeFirst,
  searchPlaces,
  type ForecastData,
  type PlaceResult,
} from "@/lib/weather";
import { getActiveAccountId, weatherKeyFor } from "@/lib/accounts";
import { useSystem } from "@/store/system";
import type { WinState } from "@/store/os";

/**
 * Adad — the weather app (Phase 5), named for the storm god.
 *
 * Shares the Phase 3 weather data layer (lib/weather.ts, Open-Meteo,
 * no key): current conditions, the next 24 hours, and a 7-day
 * forecast. The default city is the one set in Ukkin; picking a
 * searched city makes it the system city, so this app and the
 * Notification Center widget never disagree. Honesty rules are the
 * widget's: a failed fetch shows the cached reading marked as such,
 * or an explicit unavailable state — never invented weather.
 */

const forecastCacheKey = () => `${weatherKeyFor(getActiveAccountId())}-forecast`;

function loadForecastCache(placeKey: string): ForecastData | null {
  try {
    const raw = localStorage.getItem(forecastCacheKey());
    if (raw) {
      const parsed = JSON.parse(raw) as { placeKey: string; data: ForecastData };
      if (parsed.placeKey === placeKey) return { ...parsed.data, cached: true };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveForecastCache(placeKey: string, data: ForecastData) {
  try {
    localStorage.setItem(forecastCacheKey(), JSON.stringify({ placeKey, data }));
  } catch {
    /* ignore */
  }
}

const placeKeyOf = (p: PlaceResult) => `${p.name}|${p.latitude},${p.longitude}`;

function dayName(isoDate: string, idx: number): string {
  if (idx === 0) return "Today";
  const d = new Date(`${isoDate}T12:00:00`);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(d);
}

function hourLabel(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false }).format(d) + ":00";
}

export default function Weather({ win }: { win: WinState }) {
  void win;
  const weatherCity = useSystem((s) => s.weatherCity);
  const setWeatherCity = useSystem((s) => s.setWeatherCity);
  const wifiOn = useSystem((s) => s.wifiOn);

  const [place, setPlace] = useState<PlaceResult | null>(null);
  const [data, setData] = useState<ForecastData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "unavailable">("loading");
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const selectingRef = useRef(false);

  /* Resolve the Settings city to a place (unless the user just picked
   * a search result, which also updates the Settings city). */
  useEffect(() => {
    if (selectingRef.current) {
      selectingRef.current = false;
      return;
    }
    let live = true;
    if (!wifiOn) {
      setStatus("unavailable");
      setReason("Wi-Fi is off");
      return;
    }
    setStatus((s) => (data ? s : "loading"));
    geocodeFirst(weatherCity)
      .then((p) => {
        if (live) setPlace(p);
      })
      .catch(() => {
        if (live) {
          setStatus("unavailable");
          setReason(`Could not find “${weatherCity}”`);
        }
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherCity, wifiOn]);

  /* Fetch the forecast whenever the place changes. */
  useEffect(() => {
    if (!place) return;
    let live = true;
    const key = placeKeyOf(place);
    const cached = loadForecastCache(key);
    if (!wifiOn) {
      if (cached) {
        setData(cached);
        setStatus("ok");
      } else {
        setStatus("unavailable");
        setReason("Wi-Fi is off");
      }
      return;
    }
    if (cached) {
      setData(cached);
      setStatus("ok");
    } else {
      setStatus("loading");
    }
    fetchForecast(place)
      .then((fc) => {
        saveForecastCache(key, fc);
        if (live) {
          setData(fc);
          setStatus("ok");
        }
      })
      .catch(() => {
        if (!live) return;
        if (cached) {
          setData(cached);
          setStatus("ok");
        } else {
          setStatus("unavailable");
          setReason("Could not reach the weather service");
        }
      });
    return () => {
      live = false;
    };
  }, [place, wifiOn]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    if (!wifiOn) {
      setSearchError("Wi-Fi is off");
      setResults(null);
      return;
    }
    setSearching(true);
    setSearchError("");
    try {
      const places = await searchPlaces(q);
      setResults(places);
      if (!places.length) setSearchError(`No places match “${q}”`);
    } catch {
      setResults(null);
      setSearchError("Could not reach the place search");
    } finally {
      setSearching(false);
    }
  };

  const pickPlace = (p: PlaceResult) => {
    selectingRef.current = true;
    setResults(null);
    setQuery("");
    setPlace(p);
    // One weather source for the whole OS: the widget follows.
    setWeatherCity(p.name);
  };

  const cond = data ? describeCode(data.current.code) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-neutral-900" data-testid="weather">
      {/* search */}
      <div className="relative border-b border-black/10 px-3 py-2 dark:border-white/10">
        <div className="flex items-center gap-2">
          <input
            data-testid="weather-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void runSearch()}
            placeholder="Search for a city…"
            className="min-w-0 flex-1 rounded-md border border-black/10 bg-neutral-50 px-2.5 py-1.5 text-[13.5px] outline-none focus:border-[var(--accent)] dark:border-white/10 dark:bg-neutral-800"
          />
          <button
            data-testid="weather-search-btn"
            onClick={() => void runSearch()}
            disabled={searching}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        {searchError && (
          <div data-testid="weather-search-error" className="pt-1.5 text-[12.5px] text-red-500">
            {searchError}
          </div>
        )}
        {results && results.length > 0 && (
          <div
            data-testid="weather-results"
            className="absolute inset-x-3 top-full z-20 mt-1 overflow-hidden rounded-lg border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-800"
          >
            {results.map((p, i) => (
              <button
                key={`${p.name}-${p.latitude}-${p.longitude}`}
                data-testid={`weather-result-${i}`}
                onClick={() => pickPlace(p)}
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-[var(--accent)] hover:text-white"
              >
                <span className="text-[13.5px] font-medium">{p.name}</span>
                <span className="truncate text-[12px] opacity-60">
                  {[p.admin1, p.country].filter(Boolean).join(", ")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="uruk-scroll min-h-0 flex-1 overflow-y-auto p-4">
        {status === "loading" && (
          <div className="py-10 text-center text-[13.5px] text-neutral-400">
            Fetching the sky over {weatherCity}…
          </div>
        )}

        {status === "unavailable" && (
          <div data-testid="weather-unavailable" className="py-10 text-center">
            <div className="text-[15px] font-medium">Weather unavailable</div>
            <div className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">{reason}</div>
            <div className="mx-auto mt-3 max-w-sm text-[12.5px] text-neutral-400">
              Adad only shows readings the Open-Meteo service actually returned —
              it never invents a forecast.
            </div>
          </div>
        )}

        {status === "ok" && data && cond && (
          <div>
            <div data-testid="weather-current" className="flex items-start gap-4">
              <div className="text-[44px] leading-none">{cond.glyph}</div>
              <div className="min-w-0 flex-1">
                <div data-testid="weather-city" className="truncate text-[20px] font-semibold">
                  {data.placeName}
                </div>
                <div className="text-[13px] text-neutral-500 dark:text-neutral-400">
                  {cond.label} · H {data.hiC}° · L {data.loC}°
                </div>
                {data.cached && (
                  <div data-testid="weather-cached" className="mt-0.5 text-[12px] text-amber-600 dark:text-amber-400">
                    Cached reading from{" "}
                    {new Date(data.fetchedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    — showing the last real data, not a guess.
                  </div>
                )}
              </div>
              <div data-testid="weather-temp" data-temp={data.current.tempC} className="text-[44px] font-light tabular-nums">
                {data.current.tempC}°
              </div>
            </div>

            <div className="mt-3 flex gap-4 text-[12.5px] text-neutral-500 dark:text-neutral-400">
              <span data-testid="weather-feels">Feels like {data.current.feelsC}°</span>
              <span data-testid="weather-humidity">Humidity {data.current.humidity}%</span>
              <span data-testid="weather-wind">Wind {data.current.windKmh} km/h</span>
            </div>

            <div className="mt-5 text-[12px] font-semibold tracking-wide text-neutral-400 uppercase">
              Next 24 hours
            </div>
            <div className="uruk-scroll mt-1.5 flex gap-1 overflow-x-auto pb-1" data-testid="weather-hourly">
              {data.hourly.map((h) => {
                const c = describeCode(h.code);
                return (
                  <div
                    key={h.time}
                    data-testid="weather-hour"
                    className="flex w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-lg bg-black/[0.03] py-2 dark:bg-white/[0.05]"
                  >
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      {hourLabel(h.time)}
                    </span>
                    <span className="text-[15px]">{c.glyph}</span>
                    <span className="text-[12.5px] font-medium tabular-nums">{h.tempC}°</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 text-[12px] font-semibold tracking-wide text-neutral-400 uppercase">
              7-day forecast
            </div>
            <div className="mt-1.5 divide-y divide-black/5 dark:divide-white/5" data-testid="weather-daily">
              {data.daily.map((d, i) => {
                const c = describeCode(d.code);
                return (
                  <div key={d.date} data-testid={`weather-day-${i}`} className="flex items-center gap-3 py-2">
                    <span className="w-14 text-[13.5px] font-medium">{dayName(d.date, i)}</span>
                    <span className="text-[15px]">{c.glyph}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-neutral-500 dark:text-neutral-400">
                      {c.label}
                    </span>
                    <span className="font-mono text-[13px] tabular-nums">
                      <span data-testid={`weather-day-${i}-lo`} className="text-neutral-400">{d.loC}°</span>
                      {"  "}
                      <span data-testid={`weather-day-${i}-hi`}>{d.hiC}°</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
