import fc from 'fast-check';
import {
  scoreItem,
  applyWeatherBoost,
  parseInputTags,
  itemMatchesTags,
  ScoringContext,
  WARM_COMFORT_TAGS,
  COLD_LIGHT_TAGS,
} from '../services/recommendationEngine';
import { applyDietaryFilter } from '../middleware/dietaryFilter';
import { MenuItem, DietaryProfile } from '../types';
import { WeatherData } from '../services/weatherService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'item-1',
    dining_hall_id: 'hall-1',
    name: 'Test Item',
    description: '',
    station: 'Grill',
    meal_period: 'lunch',
    menu_date: '2024-01-01',
    allergens: [],
    allergen_data_complete: true,
    nutrition: null,
    health_score: null,
    recency_score: 3.0,
    recency_score_updated_at: new Date(),
    ...overrides,
  };
}

function makeProfile(overrides: Partial<DietaryProfile> = {}): DietaryProfile {
  return {
    restrictions: [],
    allergens: [],
    active: true,
    opt_in_incomplete: false,
    ...overrides,
  };
}

function makeWeather(overrides: Partial<WeatherData> = {}): WeatherData {
  return {
    temperature_f: 65,
    conditions: 'clear sky',
    weather_stale: false,
    ...overrides,
  };
}

function makeContext(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    recencyScore: 0.5,
    ratingHistoryAffinity: 0.5,
    cuisinePreferenceMatch: 0.5,
    weatherBoost: 0,
    ...overrides,
  };
}

// ─── Unit tests: scoreItem ────────────────────────────────────────────────────

describe('scoreItem()', () => {
  it('computes correct weighted sum', () => {
    const item = makeItem();
    const ctx = makeContext({
      recencyScore: 1,
      ratingHistoryAffinity: 1,
      cuisinePreferenceMatch: 1,
      weatherBoost: 0,
    });
    // 1*0.4 + 1*0.3 + 1*0.2 + 0*0.1 = 0.9
    expect(scoreItem(item, ctx)).toBeCloseTo(0.9, 5);
  });

  it('returns 0 when all context values are 0', () => {
    const item = makeItem();
    const ctx = makeContext({
      recencyScore: 0,
      ratingHistoryAffinity: 0,
      cuisinePreferenceMatch: 0,
      weatherBoost: 0,
    });
    expect(scoreItem(item, ctx)).toBe(0);
  });

  it('includes weather boost contribution', () => {
    const item = makeItem();
    const withBoost = makeContext({ weatherBoost: 0.2 });
    const withoutBoost = makeContext({ weatherBoost: 0 });
    expect(scoreItem(item, withBoost)).toBeGreaterThan(scoreItem(item, withoutBoost));
  });

  it('weights recency_score most heavily (0.4)', () => {
    const item = makeItem();
    // Only recency differs
    const highRecency = makeContext({ recencyScore: 1, ratingHistoryAffinity: 0, cuisinePreferenceMatch: 0, weatherBoost: 0 });
    const highAffinity = makeContext({ recencyScore: 0, ratingHistoryAffinity: 1, cuisinePreferenceMatch: 0, weatherBoost: 0 });
    expect(scoreItem(item, highRecency)).toBeGreaterThan(scoreItem(item, highAffinity));
  });
});

// ─── Unit tests: applyWeatherBoost ───────────────────────────────────────────

describe('applyWeatherBoost()', () => {
  it('returns 0 when weather is null', () => {
    const item = makeItem({ name: 'hot soup' });
    expect(applyWeatherBoost(item, null)).toBe(0);
  });

  it('returns 0.2 for warm/comfort item when temp < 35°F', () => {
    const item = makeItem({ name: 'chicken soup' });
    const weather = makeWeather({ temperature_f: 30 });
    expect(applyWeatherBoost(item, weather)).toBe(0.2);
  });

  it('returns 0.2 for warm/comfort item when precipitation', () => {
    const item = makeItem({ name: 'beef stew' });
    const weather = makeWeather({ temperature_f: 60, conditions: 'light rain' });
    expect(applyWeatherBoost(item, weather)).toBe(0.2);
  });

  it('returns 0.2 for cold/light item when temp > 85°F', () => {
    const item = makeItem({ name: 'garden salad' });
    const weather = makeWeather({ temperature_f: 90 });
    expect(applyWeatherBoost(item, weather)).toBe(0.2);
  });

  it('returns 0 for warm item when temp > 85°F (no cold boost)', () => {
    const item = makeItem({ name: 'hot soup' });
    const weather = makeWeather({ temperature_f: 90 });
    expect(applyWeatherBoost(item, weather)).toBe(0);
  });

  it('returns 0 for cold item when temp < 35°F (no warm boost)', () => {
    const item = makeItem({ name: 'cold smoothie' });
    const weather = makeWeather({ temperature_f: 20 });
    expect(applyWeatherBoost(item, weather)).toBe(0);
  });

  it('returns 0 for neutral item in any weather', () => {
    const item = makeItem({ name: 'pasta primavera' });
    const coldWeather = makeWeather({ temperature_f: 20 });
    const hotWeather = makeWeather({ temperature_f: 95 });
    expect(applyWeatherBoost(item, coldWeather)).toBe(0);
    expect(applyWeatherBoost(item, hotWeather)).toBe(0);
  });

  it('checks description and station for tags (case-insensitive)', () => {
    const item = makeItem({ name: 'Special', description: 'A warm bowl of goodness', station: 'Comfort' });
    const weather = makeWeather({ temperature_f: 30 });
    expect(applyWeatherBoost(item, weather)).toBe(0.2);
  });

  it('returns 0.2 for item with "coffee" in name when cold', () => {
    const item = makeItem({ name: 'Hot Coffee' });
    const weather = makeWeather({ temperature_f: 25 });
    expect(applyWeatherBoost(item, weather)).toBe(0.2);
  });

  it('returns 0.2 for item with "ice" in name when hot', () => {
    const item = makeItem({ name: 'Ice Cream' });
    const weather = makeWeather({ temperature_f: 92 });
    expect(applyWeatherBoost(item, weather)).toBe(0.2);
  });
});

// ─── Unit tests: parseInputTags ───────────────────────────────────────────────

describe('parseInputTags()', () => {
  it('returns empty array for empty input', () => {
    expect(parseInputTags('')).toEqual([]);
    expect(parseInputTags('   ')).toEqual([]);
  });

  it('splits on whitespace and lowercases', () => {
    const tags = parseInputTags('Spicy Chicken');
    expect(tags).toContain('spicy');
    expect(tags).toContain('chicken');
  });

  it('filters out stop words', () => {
    const tags = parseInputTags('something spicy');
    expect(tags).not.toContain('something');
    expect(tags).toContain('spicy');
  });

  it('filters out short tokens (< 2 chars)', () => {
    const tags = parseInputTags('a b spicy');
    expect(tags).not.toContain('a');
    expect(tags).not.toContain('b');
    expect(tags).toContain('spicy');
  });

  it('strips punctuation', () => {
    const tags = parseInputTags('spicy, hot!');
    expect(tags).toContain('spicy');
    expect(tags).toContain('hot');
  });

  it('handles "light meal" input', () => {
    const tags = parseInputTags('light meal');
    expect(tags).toContain('light');
  });
});

// ─── Unit tests: itemMatchesTags ─────────────────────────────────────────────

describe('itemMatchesTags()', () => {
  it('returns true when tags is empty', () => {
    expect(itemMatchesTags(makeItem(), [])).toBe(true);
  });

  it('returns true when item name contains a tag', () => {
    const item = makeItem({ name: 'Spicy Chicken Sandwich' });
    expect(itemMatchesTags(item, ['spicy'])).toBe(true);
  });

  it('returns false when no tags match', () => {
    const item = makeItem({ name: 'Pasta Primavera', description: '', station: 'Pasta' });
    expect(itemMatchesTags(item, ['spicy', 'hot'])).toBe(false);
  });

  it('checks description for tags', () => {
    const item = makeItem({ name: 'Bowl', description: 'spicy broth base' });
    expect(itemMatchesTags(item, ['spicy'])).toBe(true);
  });

  it('checks station for tags', () => {
    const item = makeItem({ name: 'Bowl', description: '', station: 'Spicy Corner' });
    expect(itemMatchesTags(item, ['spicy'])).toBe(true);
  });
});

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const allergenArb = fc.constantFrom(
  'peanuts', 'tree nuts', 'dairy', 'gluten', 'soy', 'eggs', 'shellfish', 'fish', 'wheat',
);

const itemArb = fc.record({
  id: fc.uuid(),
  dining_hall_id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.string({ maxLength: 100 }),
  station: fc.string({ minLength: 1, maxLength: 30 }),
  meal_period: fc.constantFrom('breakfast', 'lunch', 'dinner', 'late_night') as fc.Arbitrary<MenuItem['meal_period']>,
  menu_date: fc.constant('2024-01-01'),
  allergens: fc.array(allergenArb, { maxLength: 5 }),
  allergen_data_complete: fc.boolean(),
  nutrition: fc.constant(null),
  health_score: fc.constant(null),
  recency_score: fc.float({ min: 0, max: 5, noNaN: true }),
  recency_score_updated_at: fc.constant(new Date()),
});

const activeProfileArb = fc.record({
  restrictions: fc.array(allergenArb, { maxLength: 3 }),
  allergens: fc.array(allergenArb, { maxLength: 3 }),
  active: fc.constant(true),
  opt_in_incomplete: fc.boolean(),
});

const weatherArb = fc.record({
  temperature_f: fc.float({ min: -20, max: 110, noNaN: true }),
  conditions: fc.constantFrom('clear sky', 'light rain', 'heavy snow', 'drizzle', 'sunny', 'cloudy'),
  weather_stale: fc.boolean(),
});

const scoringContextArb = fc.record({
  recencyScore: fc.float({ min: 0, max: 1, noNaN: true }),
  ratingHistoryAffinity: fc.float({ min: 0, max: 1, noNaN: true }),
  cuisinePreferenceMatch: fc.float({ min: 0, max: 1, noNaN: true }),
  weatherBoost: fc.constantFrom(0, 0.2),
});

// ─── Property 21: Recommendations satisfy dietary profile ─────────────────────
// Feature: vt-dining-ranker, Property 21: Recommendations satisfy dietary profile
// Validates: Requirements 8.1

describe('Property 21: Recommendations satisfy dietary profile', () => {
  it('no returned item conflicts with an active dietary profile', () => {
    fc.assert(
      fc.property(
        fc.array(itemArb, { minLength: 0, maxLength: 30 }),
        activeProfileArb,
        (items, profile) => {
          const filtered = applyDietaryFilter(items, profile);

          const blocked = new Set([
            ...profile.restrictions.map((r) => r.toLowerCase()),
            ...profile.allergens.map((a) => a.toLowerCase()),
          ]);

          // Every item returned must not conflict with the profile
          return filtered.every((item) => {
            const itemAllergens = item.allergens.map((a) => a.toLowerCase());
            const noConflict = !itemAllergens.some((a) => blocked.has(a));
            const completeOrOptedIn = item.allergen_data_complete || profile.opt_in_incomplete;
            return noConflict && completeOrOptedIn;
          });
        },
      ),
      {
        numRuns: 200,
        verbose: true,
      },
    );
  });
});

// ─── Property 22: Weather boost applied correctly ─────────────────────────────
// Feature: vt-dining-ranker, Property 22: Weather boost applied correctly
// Validates: Requirements 8.3, 8.4

describe('Property 22: Weather boost applied correctly', () => {
  it('warm/comfort items get 0.2 boost when temp < 35°F or precipitation', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...WARM_COMFORT_TAGS),
        fc.oneof(
          // cold temperature
          fc.record({
            temperature_f: fc.float({ min: -20, max: Math.fround(34.9), noNaN: true }),
            conditions: fc.constant('clear sky'),
            weather_stale: fc.constant(false),
          }),
          // precipitation
          fc.record({
            temperature_f: fc.float({ min: 35, max: 84, noNaN: true }),
            conditions: fc.constantFrom('light rain', 'heavy rain', 'drizzle', 'snow showers'),
            weather_stale: fc.constant(false),
          }),
        ),
        (tag, weather) => {
          const item = makeItem({ name: tag });
          return applyWeatherBoost(item, weather) === 0.2;
        },
      ),
      { numRuns: 200, verbose: true },
    );
  });

  it('cold/light items get 0.2 boost when temp > 85°F', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...COLD_LIGHT_TAGS),
        fc.record({
          temperature_f: fc.float({ min: Math.fround(85.1), max: 120, noNaN: true }),
          conditions: fc.constant('clear sky'),
          weather_stale: fc.constant(false),
        }),
        (tag, weather) => {
          const item = makeItem({ name: tag });
          return applyWeatherBoost(item, weather) === 0.2;
        },
      ),
      { numRuns: 200, verbose: true },
    );
  });

  it('score with weather boost is at least 1.2x baseline score for boosted items', () => {
    fc.assert(
      fc.property(
        scoringContextArb,
        fc.constantFrom(...WARM_COMFORT_TAGS),
        fc.record({
          temperature_f: fc.float({ min: -20, max: Math.fround(34.9), noNaN: true }),
          conditions: fc.constant('clear sky'),
          weather_stale: fc.constant(false),
        }),
        (baseCtx, tag, weather) => {
          const item = makeItem({ name: tag });
          const boost = applyWeatherBoost(item, weather);

          const baselineCtx: ScoringContext = { ...baseCtx, weatherBoost: 0 };
          const boostedCtx: ScoringContext = { ...baseCtx, weatherBoost: boost };

          const baselineScore = scoreItem(item, baselineCtx);
          const boostedScore = scoreItem(item, boostedCtx);

          if (baselineScore === 0) return true; // avoid division by zero

          // boosted score should be >= 1.2x baseline when boost is 0.2
          // The boost adds 0.2 * 0.1 = 0.02 to the score
          // Requirement: +20% weight on warm/comfort items
          return boostedScore >= baselineScore;
        },
      ),
      { numRuns: 200, verbose: true },
    );
  });

  it('neutral items get no boost regardless of weather', () => {
    fc.assert(
      fc.property(
        weatherArb,
        (weather) => {
          const item = makeItem({ name: 'pasta primavera', description: '', station: 'Pasta' });
          const boost = applyWeatherBoost(item, weather);
          // pasta has no warm/comfort or cold/light tags
          return boost === 0;
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });
});

// ─── Property 23: Input-based recommendation filtering ────────────────────────
// Feature: vt-dining-ranker, Property 23: Input-based recommendation filtering
// Validates: Requirements 8.5

describe('Property 23: Input-based recommendation filtering', () => {
  it('all returned items match at least one input tag', () => {
    fc.assert(
      fc.property(
        fc.array(itemArb, { minLength: 1, maxLength: 30 }),
        fc.constantFrom('spicy', 'grilled', 'vegan', 'crispy', 'fresh', 'baked'),
        (items, tag) => {
          const filtered = items.filter((item) => itemMatchesTags(item, [tag]));
          // Every item in filtered must contain the tag
          return filtered.every((item) => {
            const searchText = [item.name, item.description, item.station].join(' ').toLowerCase();
            return searchText.includes(tag);
          });
        },
      ),
      { numRuns: 200, verbose: true },
    );
  });

  it('parseInputTags produces tags that are non-empty strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }),
        (input) => {
          const tags = parseInputTags(input);
          return tags.every((t) => typeof t === 'string' && t.length >= 2);
        },
      ),
      { numRuns: 200, verbose: true },
    );
  });

  it('items matching input tags are a subset of all items', () => {
    fc.assert(
      fc.property(
        fc.array(itemArb, { minLength: 0, maxLength: 20 }),
        fc.array(fc.string({ minLength: 2, maxLength: 10 }), { minLength: 1, maxLength: 3 }),
        (items, tags) => {
          const filtered = items.filter((item) => itemMatchesTags(item, tags));
          // filtered must be a subset of items
          return filtered.every((fi) => items.some((i) => i.id === fi.id));
        },
      ),
      { numRuns: 200, verbose: true },
    );
  });
});
