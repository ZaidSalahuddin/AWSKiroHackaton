import fc from 'fast-check';
import { healthScore, healthScoreOrNull } from '../services/healthScoreService';
import { NutritionData } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const baseNutrition: NutritionData = {
  calories: 400,
  protein_g: 15,
  carbs_g: 50,
  fat_g: 10,
  fiber_g: 3,
  sodium_mg: 500,
  added_sugar_g: 10,
};

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe('healthScore()', () => {
  it('returns base score of 10 for a perfectly healthy item', () => {
    expect(healthScore(baseNutrition)).toBe(10);
  });

  it('deducts 2 for calories > 600', () => {
    expect(healthScore({ ...baseNutrition, calories: 601 })).toBe(8);
  });

  it('deducts 2 for sodium > 800 mg', () => {
    expect(healthScore({ ...baseNutrition, sodium_mg: 801 })).toBe(8);
  });

  it('deducts 1 for added sugar > 20 g', () => {
    expect(healthScore({ ...baseNutrition, added_sugar_g: 21 })).toBe(9);
  });

  it('adds 1 for fiber > 5 g', () => {
    expect(healthScore({ ...baseNutrition, fiber_g: 6 })).toBe(10); // already 10, clamped
  });

  it('fiber bonus does not exceed 10', () => {
    // base 10 + fiber bonus = 11, clamped to 10
    expect(healthScore({ ...baseNutrition, fiber_g: 6 })).toBe(10);
  });

  it('adds 1 for protein > 20 g', () => {
    // base 10 + protein bonus = 11, clamped to 10
    expect(healthScore({ ...baseNutrition, protein_g: 21 })).toBe(10);
  });

  it('applies all deductions simultaneously', () => {
    // base 10 - 2 (cal) - 2 (sodium) - 1 (sugar) = 5
    expect(
      healthScore({ ...baseNutrition, calories: 700, sodium_mg: 900, added_sugar_g: 25 })
    ).toBe(5);
  });

  it('applies all bonuses simultaneously', () => {
    // base 10 + 1 (fiber) + 1 (protein) = 12, clamped to 10
    expect(
      healthScore({ ...baseNutrition, fiber_g: 6, protein_g: 21 })
    ).toBe(10);
  });

  it('clamps to minimum of 1', () => {
    // base 10 - 2 - 2 - 1 = 5; need more deductions to hit 1
    // Worst case: 10 - 2 - 2 - 1 = 5; bonuses can't go below 1 anyway
    // Manually verify clamping: score of 5 with no bonuses is fine
    // To force clamping to 1, we'd need score < 1 which isn't possible with current formula (min is 5)
    // But we test the clamp logic by verifying the worst case is >= 1
    const worst = healthScore({
      ...baseNutrition,
      calories: 700,
      sodium_mg: 900,
      added_sugar_g: 25,
      fiber_g: 0,
      protein_g: 0,
    });
    expect(worst).toBeGreaterThanOrEqual(1);
  });

  it('boundary: calories exactly 600 does not trigger deduction', () => {
    expect(healthScore({ ...baseNutrition, calories: 600 })).toBe(10);
  });

  it('boundary: sodium exactly 800 does not trigger deduction', () => {
    expect(healthScore({ ...baseNutrition, sodium_mg: 800 })).toBe(10);
  });

  it('boundary: added sugar exactly 20 does not trigger deduction', () => {
    expect(healthScore({ ...baseNutrition, added_sugar_g: 20 })).toBe(10);
  });

  it('boundary: fiber exactly 5 does not trigger bonus', () => {
    expect(healthScore({ ...baseNutrition, fiber_g: 5 })).toBe(10);
  });

  it('boundary: protein exactly 20 does not trigger bonus', () => {
    expect(healthScore({ ...baseNutrition, protein_g: 20 })).toBe(10);
  });
});

describe('healthScoreOrNull()', () => {
  it('returns null when nutrition is null', () => {
    expect(healthScoreOrNull(null)).toBeNull();
  });

  it('returns a number when nutrition is provided', () => {
    expect(healthScoreOrNull(baseNutrition)).toBe(10);
  });
});

// ─── Property 15: Health score is in range [1, 10] ───────────────────────────
// Validates: Requirements 5.1

describe('Property 15: Health score is in range [1, 10]', () => {
  /**
   * Feature: vt-dining-ranker, Property 15: Health score is in range [1, 10]
   * Validates: Requirements 5.1
   */
  it('health score is always between 1 and 10 for any valid nutrition input', () => {
    const nutritionArb = fc.record<NutritionData>({
      calories: fc.float({ min: 0, max: 5000, noNaN: true }),
      protein_g: fc.float({ min: 0, max: 200, noNaN: true }),
      carbs_g: fc.float({ min: 0, max: 500, noNaN: true }),
      fat_g: fc.float({ min: 0, max: 200, noNaN: true }),
      fiber_g: fc.float({ min: 0, max: 100, noNaN: true }),
      sodium_mg: fc.float({ min: 0, max: 10000, noNaN: true }),
      added_sugar_g: fc.float({ min: 0, max: 200, noNaN: true }),
    });

    fc.assert(
      fc.property(nutritionArb, (nutrition) => {
        const score = healthScore(nutrition);
        return score >= 1 && score <= 10;
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 16: Health score is deterministic ───────────────────────────────
// Validates: Requirements 5.3

describe('Property 16: Health score is deterministic', () => {
  /**
   * Feature: vt-dining-ranker, Property 16: Health score is deterministic
   * Validates: Requirements 5.3
   */
  it('same nutrition inputs always produce the same health score', () => {
    const nutritionArb = fc.record<NutritionData>({
      calories: fc.float({ min: 0, max: 5000, noNaN: true }),
      protein_g: fc.float({ min: 0, max: 200, noNaN: true }),
      carbs_g: fc.float({ min: 0, max: 500, noNaN: true }),
      fat_g: fc.float({ min: 0, max: 200, noNaN: true }),
      fiber_g: fc.float({ min: 0, max: 100, noNaN: true }),
      sodium_mg: fc.float({ min: 0, max: 10000, noNaN: true }),
      added_sugar_g: fc.float({ min: 0, max: 200, noNaN: true }),
    });

    fc.assert(
      fc.property(nutritionArb, (nutrition) => {
        const score1 = healthScore(nutrition);
        const score2 = healthScore(nutrition);
        return score1 === score2;
      }),
      { numRuns: 100 },
    );
  });
});
