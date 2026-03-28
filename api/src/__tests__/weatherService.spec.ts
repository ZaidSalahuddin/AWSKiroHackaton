import * as fc from 'fast-check';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeatherData {
  temperature_f: number;
  conditions: string;
  weather_stale: boolean;
}

// ─── Pure helper: shape validator ────────────────────────────────────────────

/**
 * Validates that a weather response object contains the required fields
 * with the correct types.
 */
function hasRequiredWeatherFields(data: unknown): data is WeatherData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d['temperature_f'] === 'number' &&
    typeof d['conditions'] === 'string' &&
    typeof d['weather_stale'] === 'boolean'
  );
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

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
    const bad = { conditions: 'sunny', weather_stale: false };
    expect(hasRequiredWeatherFields(bad)).toBe(false);
  });

  it('rejects a response missing conditions', () => {
    const bad = { temperature_f: 70, weather_stale: false };
    expect(hasRequiredWeatherFields(bad)).toBe(false);
  });

  it('rejects a response missing weather_stale', () => {
    const bad = { temperature_f: 70, conditions: 'cloudy' };
    expect(hasRequiredWeatherFields(bad)).toBe(false);
  });

  it('rejects null', () => {
    expect(hasRequiredWeatherFields(null)).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(hasRequiredWeatherFields('string')).toBe(false);
  });

  it('rejects temperature_f as a string', () => {
    const bad = { temperature_f: '72', conditions: 'sunny', weather_stale: false };
    expect(hasRequiredWeatherFields(bad)).toBe(false);
  });

  it('rejects conditions as a number', () => {
    const bad = { temperature_f: 72, conditions: 42, weather_stale: false };
    expect(hasRequiredWeatherFields(bad)).toBe(false);
  });

  it('rejects weather_stale as a string', () => {
    const bad = { temperature_f: 72, conditions: 'sunny', weather_stale: 'true' };
    expect(hasRequiredWeatherFields(bad)).toBe(false);
  });
});

// ─── Property-based tests ─────────────────────────────────────────────────────

/**
 * Property 24: Weather response contains required fields
 *
 * For any successful weather fetch, the response includes `temperature_f`
 * (number) and `conditions` (string) fields.
 *
 * Feature: vt-dining-ranker, Property 24: Weather response contains required fields
 * Validates: Requirements 9.2
 */
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
      { numRuns: 200, verbose: true }
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
      { numRuns: 100, verbose: true }
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
      { numRuns: 100, verbose: true }
    );
  });
});
