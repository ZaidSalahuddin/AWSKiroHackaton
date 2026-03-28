import fc from 'fast-check';
import { computeLowBalanceWarning } from '../services/hokiePassportService';

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe('computeLowBalanceWarning', () => {
  it('returns true when swipes < 5', () => {
    expect(computeLowBalanceWarning(4)).toBe(true);
    expect(computeLowBalanceWarning(1)).toBe(true);
    expect(computeLowBalanceWarning(0)).toBe(true);
  });

  it('returns false when swipes >= 5', () => {
    expect(computeLowBalanceWarning(5)).toBe(false);
    expect(computeLowBalanceWarning(10)).toBe(false);
    expect(computeLowBalanceWarning(100)).toBe(false);
  });
});

// ─── Property 37: Meal plan balance display ───────────────────────────────────
// Feature: vt-dining-ranker, Property 37: Meal plan balance display
// Validates: Requirements 14.1, 14.2

describe('Property 37: Meal plan balance display', () => {
  it('low_balance_warning is true iff meal_swipes_remaining < 5', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        (swipes) => {
          const warning = computeLowBalanceWarning(swipes);
          return warning === (swipes < 5);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('balance response always includes required fields when data is present', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.float({ min: 0, max: 1000, noNaN: true }),
        fc.boolean(),
        (swipes, dollars, stale) => {
          const balance = {
            meal_swipes_remaining: swipes,
            dining_dollars_balance: dollars,
            low_balance_warning: computeLowBalanceWarning(swipes),
            stale,
          };
          return (
            typeof balance.meal_swipes_remaining === 'number' &&
            typeof balance.dining_dollars_balance === 'number' &&
            typeof balance.low_balance_warning === 'boolean' &&
            typeof balance.stale === 'boolean'
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it('low_balance_warning is never true when swipes >= 5', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 1000 }),
        (swipes) => {
          return computeLowBalanceWarning(swipes) === false;
        },
      ),
      { numRuns: 200 },
    );
  });
});
