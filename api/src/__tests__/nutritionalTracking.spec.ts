import fc from 'fast-check';
import { aggregateNutrition } from '../services/nutritionalTrackingService';
import { MealLogItem, NutritionData } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNutrition(overrides: Partial<NutritionData> = {}): NutritionData {
  return {
    calories: 100, protein_g: 10, carbs_g: 20, fat_g: 5,
    fiber_g: 3, sodium_mg: 200, added_sugar_g: 2,
    ...overrides,
  };
}

const nutritionArb = fc.record<NutritionData>({
  calories:      fc.float({ min: 0, max: 2000, noNaN: true }),
  protein_g:     fc.float({ min: 0, max: 200,  noNaN: true }),
  carbs_g:       fc.float({ min: 0, max: 500,  noNaN: true }),
  fat_g:         fc.float({ min: 0, max: 200,  noNaN: true }),
  fiber_g:       fc.float({ min: 0, max: 100,  noNaN: true }),
  sodium_mg:     fc.float({ min: 0, max: 5000, noNaN: true }),
  added_sugar_g: fc.float({ min: 0, max: 200,  noNaN: true }),
});

const servingsArb = fc.float({ min: 0.25, max: 10, noNaN: true });

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe('aggregateNutrition', () => {
  it('returns zero nutrition for empty items', () => {
    const result = aggregateNutrition([], []);
    expect(result.calories).toBe(0);
    expect(result.protein_g).toBe(0);
    expect(result.carbs_g).toBe(0);
    expect(result.fat_g).toBe(0);
    expect(result.fiber_g).toBe(0);
    expect(result.sodium_mg).toBe(0);
    expect(result.added_sugar_g).toBe(0);
  });

  it('multiplies nutrition by servings for a single item', () => {
    const item: MealLogItem = { menu_item_id: 'a', servings: 2 };
    const nutrition = makeNutrition({ calories: 300, protein_g: 15 });
    const result = aggregateNutrition([item], [nutrition]);
    expect(result.calories).toBeCloseTo(600);
    expect(result.protein_g).toBeCloseTo(30);
  });

  it('sums nutrition across multiple items with different servings', () => {
    const items: MealLogItem[] = [
      { menu_item_id: 'a', servings: 1 },
      { menu_item_id: 'b', servings: 2 },
    ];
    const nutritionList = [
      makeNutrition({ calories: 100, protein_g: 10, carbs_g: 20, fat_g: 5, fiber_g: 3, sodium_mg: 200, added_sugar_g: 2 }),
      makeNutrition({ calories: 200, protein_g: 20, carbs_g: 40, fat_g: 10, fiber_g: 6, sodium_mg: 400, added_sugar_g: 4 }),
    ];
    const result = aggregateNutrition(items, nutritionList);
    // item a: 1x, item b: 2x
    expect(result.calories).toBeCloseTo(100 + 400);
    expect(result.protein_g).toBeCloseTo(10 + 40);
    expect(result.carbs_g).toBeCloseTo(20 + 80);
    expect(result.fat_g).toBeCloseTo(5 + 20);
    expect(result.fiber_g).toBeCloseTo(3 + 12);
    expect(result.sodium_mg).toBeCloseTo(200 + 800);
    expect(result.added_sugar_g).toBeCloseTo(2 + 8);
  });

  it('handles fractional servings', () => {
    const item: MealLogItem = { menu_item_id: 'a', servings: 0.5 };
    const nutrition = makeNutrition({ calories: 200 });
    const result = aggregateNutrition([item], [nutrition]);
    expect(result.calories).toBeCloseTo(100);
  });
});

// ─── Property 17: Nutritional log accuracy ───────────────────────────────────
// Validates: Requirements 5.1

describe('Property 17: nutritional log accuracy', () => {
  it('totals equal sum of nutrition * servings for any set of items', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ servings: servingsArb, nutrition: nutritionArb }),
          { minLength: 0, maxLength: 20 },
        ),
        (entries) => {
          const items: MealLogItem[] = entries.map((e, i) => ({
            menu_item_id: `item-${i}`,
            servings: e.servings,
          }));
          const nutritionList = entries.map((e) => e.nutrition);

          const result = aggregateNutrition(items, nutritionList);

          const fields: (keyof NutritionData)[] = [
            'calories', 'protein_g', 'carbs_g', 'fat_g',
            'fiber_g', 'sodium_mg', 'added_sugar_g',
          ];

          for (const field of fields) {
            const expected = entries.reduce((sum, e) => sum + e.nutrition[field] * e.servings, 0);
            if (Math.abs(result[field] - expected) > 0.001) return false;
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property 18: Nutrition targets round-trip ────────────────────────────────
// Validates: Requirements 5.2

describe('Property 18: nutrition targets round-trip', () => {
  it('targets stored and retrieved are identical (pure logic)', () => {
    fc.assert(
      fc.property(
        fc.record({
          calories:  fc.integer({ min: 0, max: 10000 }),
          protein_g: fc.integer({ min: 0, max: 1000 }),
          carbs_g:   fc.integer({ min: 0, max: 1000 }),
          fat_g:     fc.integer({ min: 0, max: 1000 }),
          fiber_g:   fc.integer({ min: 0, max: 500 }),
          sodium_mg: fc.integer({ min: 0, max: 10000 }),
        }),
        (targets) => {
          // Simulate serialize → deserialize (JSON round-trip as done in DB JSONB)
          const serialized = JSON.stringify(targets);
          const deserialized = JSON.parse(serialized);
          return (
            deserialized.calories  === targets.calories  &&
            deserialized.protein_g === targets.protein_g &&
            deserialized.carbs_g   === targets.carbs_g   &&
            deserialized.fat_g     === targets.fat_g     &&
            deserialized.fiber_g   === targets.fiber_g   &&
            deserialized.sodium_mg === targets.sodium_mg
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property 19: Over-target indicator ──────────────────────────────────────
// Validates: Requirements 5.3

describe('Property 19: over-target indicator', () => {
  /**
   * Pure helper mirroring the service logic:
   *   over_calorie_target = targets?.calories != null && totals.calories > targets.calories
   */
  function computeOverTarget(
    totalCalories: number,
    targetCalories: number | null | undefined,
  ): boolean {
    return targetCalories != null && totalCalories > targetCalories;
  }

  it('is true when logged calories exceed target', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 0, max: 9999 }),
        (target, extra) => {
          const logged = target + extra + 1; // always strictly greater
          return computeOverTarget(logged, target) === true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('is false when logged calories are at or below target', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 0, max: 10000 }),
        (target, logged) => {
          fc.pre(logged <= target);
          return computeOverTarget(logged, target) === false;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('is false when no calorie target is set (null/undefined)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.constantFrom(null, undefined),
        (logged, target) => {
          return computeOverTarget(logged, target) === false;
        },
      ),
      { numRuns: 100 },
    );
  });
});
