import { NutritionData } from '../types';

/**
 * Computes a health score for a menu item based on its nutritional data.
 *
 * Formula:
 *   Base score: 10
 *   Deductions:
 *     - Excess calories (>600 kcal/serving): −2
 *     - High sodium (>800 mg): −2
 *     - High added sugar (>20 g): −1
 *   Bonuses:
 *     - High fiber (>5 g): +1
 *     - High protein (>20 g): +1
 *   Clamped to [1, 10]
 */
export function healthScore(nutrition: NutritionData): number {
  let score = 10;

  // Deductions
  if (nutrition.calories > 600) score -= 2;
  if (nutrition.sodium_mg > 800) score -= 2;
  if (nutrition.added_sugar_g > 20) score -= 1;

  // Bonuses
  if (nutrition.fiber_g > 5) score += 1;
  if (nutrition.protein_g > 20) score += 1;

  // Clamp to [1, 10]
  return Math.min(10, Math.max(1, score));
}

/**
 * Returns null when nutrition data is unavailable, otherwise delegates to healthScore().
 */
export function healthScoreOrNull(nutrition: NutritionData | null): number | null {
  if (nutrition === null) return null;
  return healthScore(nutrition);
}
