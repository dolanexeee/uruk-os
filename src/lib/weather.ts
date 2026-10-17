import { useEffect, useState } from "react";
import { useSystem } from "@/store/system";

/**
 * Weather — Phase 3, from the free Open-Meteo API (no key, no account).
 *
 * Honesty rules: we only ever show data the API actually returned.
 * The last successful reading is cached on-device; when the network is
 * unreachable or in-OS Wi-Fi is off we show that cached reading marked
 * as such, or an explicit "unavailable" — never an invented forecast.
 */

export interface WeatherReading {
  city: string;
  tempC: number;
  hiC: number;
  loC: number;
  code: number;
  windKmh: number;
  fetchedAt: number;
  /** True when this is the on-device cache, not a fresh reading. */
  cached: boolean;
}

const CACHE_KEY = "uruk-os-weather-v1";

function loadCache(): WeatherReading | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as WeatherReading;
  } catch {
    /* ignore */
  }
  return null;
}

function saveCache(r: WeatherReading) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

/** WMO weather-code → short label + glyph (our own wording). */
export function describeCode(code: number): { label: string; glyph: string } {
  if (code === 0) return { label: "Clear sky", glyph: "☀" };
  if (code <= 2) return { label: "Partly cloudy", glyph: "⛅" };
  if (code === 3) return { label: "Overcast", glyph: "☁" };
  if (code === 45 || code === 48) return { label: "Fog", glyph: "🌫" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", glyph: "🌦" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return { label: "Rain", glyph: "🌧" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { label: "Snow", glyph: "🌨" };
  if (code >= 95) return { label: "Thunderstorm", glyph: "⛈" };
  return { label: "—", glyph: "·" };
}

async function fetchReading(city: string): Promise<WeatherReading> {
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
  );
  if (!geoRes.ok) throw new Error(`geocoding ${geoRes.status}`);
  const geo = (await geoRes.json()) as {
    results?: { latitude: number; longitude: number; name: string }[];
  };
  const place = geo.results?.[0];
  if (!place) throw new Error("city not found");
  const fcRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`,
  );
  if (!fcRes.ok) throw new Error(`forecast ${fcRes.status}`);
  const fc = (await fcRes.json()) as {
    current: { temperature_2m: number; weather_code: number; wind_speed_10m: number };
    daily: { temperature_2m_max: number[]; temperature_2m_min: number[] };
  };
  return {
    city: place.name,
    tempC: Math.round(fc.current.temperature_2m),
    hiC: Math.round(fc.daily.temperature_2m_max[0]),
    loC: Math.round(fc.daily.temperature_2m_min[0]),
    code: fc.current.weather_code,
    windKmh: Math.round(fc.current.wind_speed_10m),
    fetchedAt: Date.now(),
    cached: false,
  };
}

export type WeatherState =
  | { status: "loading" }
  | { status: "ok"; reading: WeatherReading }
  | { status: "unavailable"; reason: string };

/**
 * Live weather for the configured city. Refetches when the city or the
 * Wi-Fi switch changes, and on a 15-minute cadence while mounted.
 */
export function useWeather(): WeatherState {
  const city = useSystem((s) => s.weatherCity);
  const wifiOn = useSystem((s) => s.wifiOn);
  const [state, setState] = useState<WeatherState>({ status: "loading" });

  useEffect(() => {
    let live = true;
    const cached = loadCache();
    const cachedForCity =
      cached && cached.city.toLowerCase() === city.toLowerCase()
        ? { ...cached, cached: true }
        : null;

    if (!wifiOn) {
      setState(
        cachedForCity
          ? { status: "ok", reading: cachedForCity }
          : { status: "unavailable", reason: "Wi-Fi is off" },
      );
      return;
    }

    setState(
      cachedForCity ? { status: "ok", reading: cachedForCity } : { status: "loading" },
    );
    const run = async () => {
      try {
        const reading = await fetchReading(city);
        saveCache(reading);
        if (live) setState({ status: "ok", reading });
      } catch {
        if (!live) return;
        setState(
          cachedForCity
            ? { status: "ok", reading: cachedForCity }
            : { status: "unavailable", reason: "Could not reach the weather service" },
        );
      }
    };
    void run();
    const t = setInterval(run, 15 * 60 * 1000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [city, wifiOn]);

  return state;
}
