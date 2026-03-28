import { pool } from '../db/client';
import { getWeather, WeatherData } from './weatherService';
import { applyDietaryFilter } from '../middleware/dietaryFilter';
import { MenuItem, DietaryProfile } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScoringContext {
  recencyScore: number;           // 0-1 (normalized from 0-5 scale)
  ratingHistoryAffinity: number;  // 0-1 (how much student liked similar items)
  cuisinePreferenceMatch: number; // 0-1
  weatherBoost: number;           // 0 or 0.2
}

export interface ScoredItem {
  item: MenuItem;
  score: number;
}

export interface RecommendationResult {
  items: ScoredItem[];
  relaxed_filters: string[];
}

// ─── Tag lists ────────────────────────────────────────────────────────────────

export const WARM_COMFORT_TAGS = [
  'soup', 'hot', 'warm', 'comfort', 'stew', 'chili', 'coffee', 'tea', 'cocoa',
];

export const COLD_LIGHT_TAGS = [
  'salad', 'cold', 'light', 'smoothie', 'ice', 'frozen', 'wrap', 'sandwich',
];

// Common English stop words to filter out during NLP parsing
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'i', 'me', 'my', 'we', 'you',
  'he', 'she', 'they', 'this', 'that', 'are', 'was', 'be', 'been', 'have',
  'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'can', 'want', 'like', 'feel', 'something', 'some',
  'any', 'get', 'give', 'eat', 'eating', 'food', 'meal', 'please',
]);

// ─── Meal period detection ────────────────────────────────────────────────────

export function getCurrentMealPeriod(): MenuItem['meal_period'] {
  const hour = new Date().getHours();
  if (hour >= 7 && hour <= 10) return 'breakfast';
  if (hour >= 11 && hour <= 14) return 'lunch';
  if (hour >= 17 && hour <= 21) return 'dinner';
  return 'late_night';
}

// ─── Pure scoring functions ───────────────────────────────────────────────────

/**
 * Compute base score from scoring context.
 * base_score = recency_score*0.4 + rating_history_affinity*0.3 + cuisine_preference_match*0.2 + weather_boost*0.1
 */
export function scoreItem(_item: MenuItem, context: ScoringContext): number {
  return (
    context.recencyScore * 0.4 +
    context.ratingHistoryAffinity * 0.3 +
    context.cuisinePreferenceMatch * 0.2 +
    context.weatherBoost * 0.1
  );
}

/**
 * Returns 0.2 if the item matches weather conditions, else 0.
 * - Warm/comfort boost when temp < 35°F or precipitation
 * - Cold/light boost when temp > 85°F
 */
export function applyWeatherBoost(item: MenuItem, weather: WeatherData | null): number {
  if (!weather) return 0;

  const searchText = [item.name, item.description, item.station]
    .join(' ')
    .toLowerCase();

  const isCold = weather.temperature_f < 35;
  const hasPrecip = /rain|snow|drizzle|sleet|shower|thunder|precipitation/i.test(
    weather.conditions,
  );
  const isHot = weather.temperature_f > 85;

  if (isCold || hasPrecip) {
    if (WARM_COMFORT_TAGS.some((tag) => searchText.includes(tag))) return 0.2;
  }

  if (isHot) {
    if (COLD_LIGHT_TAGS.some((tag) => searchText.includes(tag))) return 0.2;
  }

  return 0;
}

/**
 * Parse natural language input into filter tags.
 * Splits on whitespace, lowercases, removes stop words and short tokens.
 */
export function parseInputTags(input: string): string[] {
  if (!input || !input.trim()) return [];

  return input
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

/**
 * Check if an item matches a set of tags (any tag present in name/description/station).
 */
export function itemMatchesTags(item: MenuItem, tags: string[]): boolean {
  if (tags.length === 0) return true;
  const searchText = [item.name, item.description, item.station].join(' ').toLowerCase();
  return tags.some((tag) => searchText.includes(tag));
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function fetchAvailableItems(mealPeriod: string): Promise<MenuItem[]> {
  const today = new Date().toISOString().split('T')[0];
  const result = await pool.query(
    `SELECT * FROM menu_item WHERE menu_date = $1 AND meal_period = $2`,
    [today, mealPeriod],
  );
  return result.rows.map((r: any) => ({
    ...r,
    allergens: Array.isArray(r.allergens) ? r.allergens : JSON.parse(r.allergens ?? '[]'),
    recency_score_updated_at: new Date(r.recency_score_updated_at),
  }));
}

/**
 * Compute rating history affinity: average normalized rating the student gave to
 * items at the same station/dining hall. Defaults to 0.5 when no history.
 */
async function getRatingHistoryAffinity(
  studentId: string,
  item: MenuItem,
): Promise<number> {
  try {
    const result = await pool.query(
      `SELECT AVG(r.stars) as avg_stars
       FROM rating r
       JOIN menu_item mi ON mi.id = r.menu_item_id
       WHERE r.student_id = $1
         AND (mi.dining_hall_id = $2 OR mi.station = $3)
       LIMIT 1`,
      [studentId, item.dining_hall_id, item.station],
    );
    const avg = parseFloat(result.rows[0]?.avg_stars);
    if (isNaN(avg)) return 0.5;
    // Normalize from [1,5] to [0,1]
    return (avg - 1) / 4;
  } catch {
    return 0.5;
  }
}

// ─── Main recommendation function ────────────────────────────────────────────

/**
 * Generate personalized recommendations for a student.
 *
 * Pipeline:
 * 1. Fetch currently available menu items
 * 2. Apply dietary filter
 * 3. Score each item
 * 4. Sort by score descending
 * 5. If input provided, filter/re-rank by matching tags
 * 6. Progressive filter relaxation if no results
 */
export async function getRecommendations(
  studentId: string,
  input?: string,
  dietaryProfile?: DietaryProfile | null,
): Promise<RecommendationResult> {
  const relaxed_filters: string[] = [];

  const mealPeriod = getCurrentMealPeriod();
  const weather = await getWeather();

  // 1. Fetch available items
  let items = await fetchAvailableItems(mealPeriod);

  // 2. Apply dietary filter
  let dietaryFiltered = applyDietaryFilter(items, dietaryProfile ?? null);

  // 3. Parse input tags
  const inputTags = parseInputTags(input ?? '');

  // 4. Score each item
  const scored = await Promise.all(
    dietaryFiltered.map(async (item) => {
      const recencyScore = item.recency_score != null ? Math.min(item.recency_score / 5, 1) : 0.5;
      const ratingHistoryAffinity = await getRatingHistoryAffinity(studentId, item);
      const cuisinePreferenceMatch = 0.5; // default when no preference history
      const weatherBoost = applyWeatherBoost(item, weather);

      const context: ScoringContext = {
        recencyScore,
        ratingHistoryAffinity,
        cuisinePreferenceMatch,
        weatherBoost,
      };

      return { item, score: scoreItem(item, context) };
    }),
  );

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // 5. Filter by input tags if provided
  let results = inputTags.length > 0
    ? scored.filter(({ item }) => itemMatchesTags(item, inputTags))
    : scored;

  // 6. Progressive filter relaxation
  if (results.length === 0 && inputTags.length > 0) {
    // Relax input tags first
    relaxed_filters.push('input_tags');
    results = scored; // use all dietary-filtered items
  }

  if (results.length === 0 && dietaryProfile?.active) {
    // Relax dietary filter
    relaxed_filters.push('dietary_filter');
    const allScored = await Promise.all(
      items.map(async (item) => {
        const recencyScore = item.recency_score != null ? Math.min(item.recency_score / 5, 1) : 0.5;
        const ratingHistoryAffinity = await getRatingHistoryAffinity(studentId, item);
        const cuisinePreferenceMatch = 0.5;
        const weatherBoost = applyWeatherBoost(item, weather);
        const context: ScoringContext = {
          recencyScore,
          ratingHistoryAffinity,
          cuisinePreferenceMatch,
          weatherBoost,
        };
        return { item, score: scoreItem(item, context) };
      }),
    );
    allScored.sort((a, b) => b.score - a.score);
    results = allScored;
  }

  return { items: results, relaxed_filters };
}
