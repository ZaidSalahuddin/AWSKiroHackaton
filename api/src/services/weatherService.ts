import axios from 'axios';

const LAT = 37.2296;
const LON = -80.4139;
const TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface WeatherData {
  temperature_f: number;
  conditions: string;
  weather_stale: boolean;
}

let weatherCache: { data: WeatherData; fetchedAt: number } | null = null;

export async function getCurrentWeather(): Promise<WeatherData | null> {
  const now = Date.now();
  if (weatherCache && now - weatherCache.fetchedAt < TTL_MS) {
    return weatherCache.data;
  }
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) return weatherCache ? { ...weatherCache.data, weather_stale: true } : null;
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&units=imperial&appid=${apiKey}`;
    const { data } = await axios.get(url, { timeout: 10_000 });
    const fresh: WeatherData = {
      temperature_f: data.main.temp,
      conditions: data.weather?.[0]?.description ?? 'unknown',
      weather_stale: false,
    };
    weatherCache = { data: fresh, fetchedAt: now };
    return fresh;
  } catch {
    if (weatherCache) return { ...weatherCache.data, weather_stale: true };
    return null;
  }
}

// Alias for backward compat with recommendationEngine
export const getWeather = getCurrentWeather;
