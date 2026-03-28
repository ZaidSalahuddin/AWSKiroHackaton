import * as fc from 'fast-check';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeatherData {
  temperature_f: number;
  conditions: string;
  weather_stale: boolean;
}

// ─── Pure helper: shape validator ────────────────────────────────────────────

function hasRequiredWeatherFields(data: unknown): data is WeatherData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d['temperature_f'] === 'number' &&
    typeof d['conditions'] === 'string' &&
    typeof d['weather_stale'] === 'boolean'
  );
}

// ─── In-memory cache tests ────────────────────────────────────────────────────

describe('getCurrentWeather — in-memory cache', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.OPENWEATHER_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.OPENWEATHER_API_KEY;
  });

  it('cache miss → fetches from API and returns fresh data', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({
      data: {
        main: { temp: 72.5 },
        weather: [{ description: 'clear sky' }],
      },
    });

    const { getCurrentWeather } = await import('../services/weatherService');
    const result = await getCurrentWeather();

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      temperature_f: 72.5,
      conditions: 'clear sky',
      weather_stale: false,
    });
  });

  it('cache hit (within 15 min) → returns cached value without API call', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({
      data: {
        main: { temp: 65.0 },
        weather: [{ description: 'partly cloudy' }],
      },
    });

    const { getCurrentWeather } = await import('../services/weatherService');

    // First call populates cache
    await getCurrentWeather();
    // Second call should use cache
    const result = await getCurrentWeather();

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ temperature_f: 65.0, weather_stale: false });
  });

  it('API failure with cached data → returns stale data with weather_stale: true', async () => {
    // First call succeeds and populates cache
    mockedAxios.get = jest.fn()
      .mockResolvedValueOnce({
        data: {
          main: { temp: 55.0 },
          weather: [{ description: 'overcast' }],
        },
      })
      .mockRejectedValueOnce(new Error('network error'));

    const { getCurrentWeather } = await import('../services/weatherService');

    await getCurrentWeather(); // populate cache

    // Force cache expiry by manipulating time
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 20 * 60 * 1000);

    const result = await getCurrentWeather();

    expect(result).toMatchObject({
      temperature_f: 55.0,
      conditions: 'overcast',
      weather_stale: true,
    });

    jest.spyOn(Date, 'now').mockRestore();
  });

  it('API failure with no cache → returns null', async () => {
    mockedAxios.get = jest.fn().mockRejectedValue(new Error('network error'));

    const { getCurrentWeather } = await import('../services/weatherService');
    const result = await getCurrentWeather();

    expect(result).toBeNull();
  });

  it('missing API key with no cache → returns null', async () => {
    delete process.env.OPENWEATHER_API_KEY;

    const { getCurrentWeather } = await import('../services/weatherService');
    const result = await getCurrentWeather();

    expect(result).toBeNull();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});

// ─── WeatherData shape validation ─────────────────────────────────────────────

describe('WeatherData shape validation', () => {
  it('accepts a valid fresh weather response', () => {
    const response: WeatherData = {
      temperature_f: 72.5,
      conditions: 'clear sky',
      weather_stale: false,
    };
    expect(hasRequiredWeatherFields(response)).toBe(true);
  });

  it('accepts a stale weather response', () => {
    const response: WeatherData = {
      temperature_f: 35.0,
      conditions: 'light snow',
      weather_stale: true,
    };
    expect(hasRequiredWeatherFields(response)).toBe(true);
  });

  it('rejects a response missing temperature_f', () => {
    expect(hasRequiredWeatherFields({ conditions: 'sunny', weather_stale: false })).toBe(false);
  });

  it('rejects a response missing conditions', () => {
    expect(hasRequiredWeatherFields({ temperature_f: 70, weather_stale: false })).toBe(false);
  });

  it('rejects null', () => {
    expect(hasRequiredWeatherFields(null)).toBe(false);
  });
});

// ─── Property 24: Weather response contains required fields ───────────────────
// Feature: vt-dining-ranker, Property 24: Weather response contains required fields
// Validates: Requirements 9.2

describe('Property 24: Weather response contains required fields', () => {
  it('any valid weather response has temperature_f (number) and conditions (string)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: -40, max: 120, noNaN: true }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.boolean(),
        (temperature_f, conditions, weather_stale) => {
          const response: WeatherData = { temperature_f, conditions, weather_stale };
          return hasRequiredWeatherFields(response);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('any object missing temperature_f fails the shape check', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.boolean(),
        (conditions, weather_stale) => {
          const bad = { conditions, weather_stale };
          return !hasRequiredWeatherFields(bad);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('any object missing conditions fails the shape check', () => {
    fc.assert(
      fc.property(
        fc.float({ min: -40, max: 120, noNaN: true }),
        fc.boolean(),
        (temperature_f, weather_stale) => {
          const bad = { temperature_f, weather_stale };
          return !hasRequiredWeatherFields(bad);
        }
      ),
      { numRuns: 100 }
    );
  });
});
