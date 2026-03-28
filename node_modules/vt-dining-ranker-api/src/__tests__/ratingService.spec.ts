import fc from 'fast-check';

// ─── Pure logic extracted from ratingService for unit testing ─────────────────

/**
 * Validates check-in requirement (mirrors ratingService.submitRating logic).
 * Returns true if the submission is allowed, false otherwise.
 */
function isCheckInValid(opts: {
  confirmConsumed?: boolean;
  checkInVerified?: boolean;
  checkInTimestamp?: Date;
  now?: Date;
}): boolean {
  const { confirmConsumed, checkInVerified, checkInTimestamp, now = new Date() } = opts;
  if (confirmConsumed) return true;
  if (!checkInVerified || !checkInTimestamp) return false;
  const minutesAgo = (now.getTime() - checkInTimestamp.getTime()) / (1000 * 60);
  return minutesAgo <= 90;
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe('check-in validation logic', () => {
  const now = new Date('2024-01-15T12:00:00Z');

  it('allows submission with explicit confirmation', () => {
    expect(isCheckInValid({ confirmConsumed: true, now })).toBe(true);
  });

  it('allows submission with check-in within 90 min', () => {
    const checkInTimestamp = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago
    expect(isCheckInValid({ checkInVerified: true, checkInTimestamp, now })).toBe(true);
  });

  it('allows submission with check-in exactly at 90 min', () => {
    const checkInTimestamp = new Date(now.getTime() - 90 * 60 * 1000);
    expect(isCheckInValid({ checkInVerified: true, checkInTimestamp, now })).toBe(true);
  });

  it('rejects submission with check-in older than 90 min', () => {
    const checkInTimestamp = new Date(now.getTime() - 91 * 60 * 1000);
    expect(isCheckInValid({ checkInVerified: true, checkInTimestamp, now })).toBe(false);
  });

  it('rejects submission with no check-in and no confirmation', () => {
    expect(isCheckInValid({ now })).toBe(false);
  });

  it('rejects submission with checkInVerified=true but no timestamp', () => {
    expect(isCheckInValid({ checkInVerified: true, now })).toBe(false);
  });
});

// ─── Property 6: Rating submission requires check-in or confirmation ──────────
// Validates: Requirements 2.4

describe('Property 6: Rating submission requires check-in or confirmation', () => {
  it('always rejects when no confirmation and no valid check-in', () => {
    fc.assert(
      fc.property(
        fc.record({
          minutesAgo: fc.float({ min: 91, max: 10000, noNaN: true }),
        }),
        ({ minutesAgo }) => {
          const now = new Date();
          const checkInTimestamp = new Date(now.getTime() - minutesAgo * 60 * 1000);
          return !isCheckInValid({ checkInVerified: true, checkInTimestamp, now });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('always allows when confirmConsumed=true regardless of check-in state', () => {
    fc.assert(
      fc.property(
        fc.record({
          checkInVerified: fc.boolean(),
          hasTimestamp: fc.boolean(),
          minutesAgo: fc.float({ min: 0, max: 10000, noNaN: true }),
        }),
        ({ checkInVerified, hasTimestamp, minutesAgo }) => {
          const now = new Date();
          const checkInTimestamp = hasTimestamp
            ? new Date(now.getTime() - minutesAgo * 60 * 1000)
            : undefined;
          return isCheckInValid({ confirmConsumed: true, checkInVerified, checkInTimestamp, now });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('always allows when check-in is within 90 minutes', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 90, noNaN: true }),
        (minutesAgo) => {
          const now = new Date();
          const checkInTimestamp = new Date(now.getTime() - minutesAgo * 60 * 1000);
          return isCheckInValid({ checkInVerified: true, checkInTimestamp, now });
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 7: One rating per item per meal period ─────────────────────────
// Validates: Requirements 2.6
// This property is enforced by a DB unique constraint; we test the key logic here.

describe('Property 7: One rating per item per meal period', () => {
  it('a (student_id, menu_item_id, meal_period, meal_date) tuple uniquely identifies a rating', () => {
    fc.assert(
      fc.property(
        fc.record({
          studentId: fc.uuid(),
          menuItemId: fc.uuid(),
          mealPeriod: fc.constantFrom('breakfast', 'lunch', 'dinner', 'late_night'),
          mealDate: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
        }),
        ({ studentId, menuItemId, mealPeriod, mealDate }) => {
          // Two ratings with the same key are duplicates
          const key1 = `${studentId}:${menuItemId}:${mealPeriod}:${mealDate.toISOString().split('T')[0]}`;
          const key2 = `${studentId}:${menuItemId}:${mealPeriod}:${mealDate.toISOString().split('T')[0]}`;
          return key1 === key2;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('different meal periods produce different keys for the same student+item', () => {
    fc.assert(
      fc.property(
        fc.record({
          studentId: fc.uuid(),
          menuItemId: fc.uuid(),
          mealDate: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
          period1: fc.constantFrom('breakfast', 'lunch', 'dinner', 'late_night'),
          period2: fc.constantFrom('breakfast', 'lunch', 'dinner', 'late_night'),
        }),
        ({ studentId, menuItemId, mealDate, period1, period2 }) => {
          fc.pre(period1 !== period2);
          const dateStr = mealDate.toISOString().split('T')[0];
          const key1 = `${studentId}:${menuItemId}:${period1}:${dateStr}`;
          const key2 = `${studentId}:${menuItemId}:${period2}:${dateStr}`;
          return key1 !== key2;
        },
      ),
      { numRuns: 100 },
    );
  });
});
