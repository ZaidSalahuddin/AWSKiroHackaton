import axios from 'axios';
import { redis } from '../cache/redis';

const CACHE_KEY = 'weather:blacksburg';
const CACHE_TTL_SECONDS = 900; // 15 minutes

const LAT = 37.2296;
const LON = -80.4139;

export interface WeatherData {
  temperature_f: number;
  conditions: string;
  weather_stale: boolean;
}

interface WeatherAPIResponse {
  temperature_f: number;
  conditions: string;
  raw: unknown;
}

/**
 * Fetches current weather from OpenWeatherMap for Blacksburg, VA.
 * Returns null if API key is missing or request fails.
 */
export async function fetchWeatherFromAPI(): Promise<WeatherAPIResponse | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    console.warn('[WeatherService] OPENWEATHER_API_KEY is not set — skipping API fetch');
    return null;
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&units=imperial&appid=${apiKey}`;

  const response = await axios.get(url, { timeout: 10_000 });
  const raw = response.data;

  const temperature_f: number = raw?.main?.temp;
  const conditions: string = raw?.weather?.[0]?.description ?? 'unknown';

  return { temperature_f, conditions, raw };
}

/**
 * Returns current weather data.
 * - Tries Redis cache first.
 * - Falls back to OpenWeatherMap API and caches the result.
 * - Returns { weather_stale: true } when serving from cache after an API failure.
 * - Returns null when no data is available at all.
 */
export async function getWeather(): Promise<WeatherData | null> {
  // 1. Try cache
  let cached: string | null = null;
  try {
    cached = await redis.get(CACHE_KEY);
  } catch (err) {
    console.warn('[WeatherService] Redis read failed:', err);
  }

  // 2. Try API
  try {
    const fresh = await fetchWeatherFromAPI();
    if (fresh) {
      const payload = JSON.stringify({ temperature_f: fresh.temperature_f, conditions: fresh.conditions });
      try {
        await redis.set(CACHE_KEY, payload, { EX: CACHE_TTL_SECONDS });
      } catch (err) {
        console.warn('[WeatherService] Redis write failed:', err);
      }
      return { temperature_f: fresh.temperature_f, conditions: fresh.conditions, weather_stale: false };
    }
  } catch (err) {
    console.warn('[WeatherService] API fetch failed:', err);
  }

  // 3. Fall back to cache
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      return { temperature_f: parsed.temperature_f, conditions: parsed.conditions, weather_stale: true };
    } catch {
      // malformed cache entry — fall through to null
    }
  }

  return null;
}

/**
 * Starts a 15-minute polling interval to keep the weather cache warm.
 */
export function startWeatherPoller(): void {
  const INTERVAL_MS = 15 * 60 * 1000;

  const poll = async () => {
    try {
      const apiKey = process.env.OPENWEATHER_API_KEY;
      if (!apiKey) {
        console.warn('[WeatherService] Poller: OPENWEATHER_API_KEY not set, skipping refresh');
        return;
      }
      const fresh = await fetchWeatherFromAPI();
      if (fresh) {
        const payload = JSON.stringify({ temperature_f: fresh.temperature_f, conditions: fresh.conditions });
        await redis.set(CACHE_KEY, payload, { EX: CACHE_TTL_SECONDS });
        console.log(`[WeatherService] Cache refreshed — ${fresh.temperature_f}°F, ${fresh.conditions}`);
      }
    } catch (err) {
      console.warn('[WeatherService] Poller refresh failed:', err);
    }
  };

  setInterval(poll, INTERVAL_MS);
  console.log('[WeatherService] Poller started (15-min interval)');
}
