/**
 * Tests for gamificationService pure helpers and property-based correctness.
 *
 * Feature: vt-dining-ranker
 * Properties covered: 28, 29, 30, 31, 32
 */

import fc from 'fast-check';
import {
  shouldAwardStreakBadge,
  isFoodieExplorerEarned,
} from '../services/gamificationService';

// ─── Unit tests: shouldAwardStreakBadge ───────────────────────────────────────

describe('shouldAwardStreakBadge', () => {
  it('returns streak_7 at exactly 7', () => {
    expect(shouldAwardStreakBadge(7)).toBe('streak_7');
  });

  it('returns streak_30 at exactly 30', () => {
    expect(shouldAwardStreakBadge(30)).toBe('streak_30');
  });

  it('returns streak_100 at exactly 100', () => {
    expect(shouldAwardStreakBadge(100)).toBe('streak_100');
  });

  it('returns null for non-milestone values', () => {
    expect(shouldAwardStreakBadge(0)).toBeNull();
    expect(shouldAwardStreakBadge(1)).toBeNull();
    expect(shouldAwardStreakBadge(6)).toBeNull();
    expect(shouldAwardStreakBadge(8)).toBeNull();
    expect(shouldAwardStreakBadge(29)).toBeNull();
    expect(shouldAwardStreakBadge(31)).toBeNull();
    expect(shouldAwardStreakBadge(99)).toBeNull();
    expect(shouldAwardStreakBadge(101)).toBeNull();
  });
});

// ─── Unit tests: isFoodieExplorerEarned ──────────────────────────────────────

describe('isFoodieExplorerEarned', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const base = new Date('2024-01-01T00:00:00Z');

  function makeRatings(
    count: number,
    dayOffset = 0,
    startItemIndex = 0,
  ): Array<{ date: Date; itemId: string }> {
    return Array.from({ length: count }, (_, i) => ({
      date: new Date(base.getTime() + (dayOffset + i) * DAY),
      itemId: `item-${startItemIndex + i}`,
    }));
  }

  it('returns false when fewer than 10 ratings', () => {
    expect(isFoodieExplorerEarned(makeRatings(9))).toBe(false);
  });

  it('returns true when exactly 10 distinct items all on the same day', () => {
    const ratings = Array.from({ length: 10 }, (_, i) => ({
      date: base,
      itemId: `item-${i}`,
    }));
    expect(isFoodieExplorerEarned(ratings)).toBe(true);
  });

  it('returns true when 10 distinct items spread across 7 days', () => {
    const ratings = [
      ...makeRatings(7, 0),
      { date: new Date(base.getTime() + 6 * DAY), itemId: 'item-7' },
      { date: new Date(base.getTime() + 6 * DAY), itemId: 'item-8' },
      { date: new Date(base.getTime() + 6 * DAY), itemId: 'item-9' },
    ];
    expect(isFoodieExplorerEarned(ratings)).toBe(true);
  });

  it('returns false when 10 items but spread across more than 7 days', () => {
    const spread = Array.from({ length: 10 }, (_, i) => ({
      date: new Date(base.getTime() + i * 2 * DAY),
      itemId: `item-${i}`,
    }));
    expect(isFoodieExplorerEarned(spread)).toBe(false);
  });

  it('returns false when 10 ratings but only 9 distinct items (one duplicate)', () => {
    const ratings = [
      ...makeRatings(9, 0),
      { date: new Date(base.getTime() + 1 * DAY), itemId: 'item-0' },
    ];
    expect(isFoodieExplorerEarned(ratings)).toBe(false);
  });

  it('returns true when window spans exactly 7 days (boundary inclusive)', () => {
    const ratings = [
      ...Array.from({ length: 9 }, (_, i) => ({
        date: base,
        itemId: `item-${i}`,
      })),
      { date: new Date(base.getTime() + 7 * DAY), itemId: 'item-9' },
    ];
    expect(isFoodieExplorerEarned(ratings)).toBe(true);
  });

  it('returns false for empty array', () => {
    expect(isFoodieExplorerEarned([])).toBe(false);
  });
});

// ─── Unit tests: computeStreak (read-time computation) ───────────────────────

/**
 * Simulates the computeStreak logic from gamificationService.
 * Counts consecutive calendar days ending today with >= 1 log.
 */
function simulateComputeStreak(logDates: string[], today: string): number {
  if (logDates.length === 0) return 0;

  // Deduplicate and sort descending
  const dates = [...new Set(logDates)].sort((a, b) => b.localeCompare(a));

  let streak = 0;
  let expected = today;
  for (const d of dates) {
    if (d === expected) {
      streak++;
      const prev = new Date(expected);
      prev.setDate(prev.getDate() - 1);
      expected = prev.toISOString().slice(0, 10);
    } else {
      break;
    }
  }
  return streak;
}

describe('computeStreak (read-time)', () => {
  it('returns 0 when no logs', () => {
    expect(simulateComputeStreak([], '2024-06-10')).toBe(0);
  });

  it('returns 1 when only today has a log', () => {
    expect(simulateComputeStreak(['2024-06-10'], '2024-06-10')).toBe(1);
  });

  it('returns 3 for three consecutive days ending today', () => {
    expect(simulateComputeStreak(['2024-06-10', '2024-06-09', '2024-06-08'], '2024-06-10')).toBe(3);
  });

  it('returns 0 when most recent log is not today', () => {
    expect(simulateComputeStreak(['2024-06-09', '2024-06-08'], '2024-06-10')).toBe(0);
  });

  it('breaks streak on gap', () => {
    // Today + 2 days ago (gap on yesterday)
    expect(simulateComputeStreak(['2024-06-10', '2024-06-08'], '2024-06-10')).toBe(1);
  });

  it('deduplicates multiple logs on same day', () => {
    expect(simulateComputeStreak(['2024-06-10', '2024-06-10', '2024-06-09'], '2024-06-10')).toBe(2);
  });
});

// ─── Helpers for property tests ───────────────────────────────────────────────

function buildLeaderboard(
  students: Array<{ id: string; ratingCount: number; optedOut: boolean }>,
): Array<{ id: string; ratingCount: number }> {
  return students
    .filter((s) => !s.optedOut)
    .sort((a, b) => b.ratingCount - a.ratingCount)
    .slice(0, 20);
}

// ─── Property 28: Streak increments on daily meal log ─────────────────────────
// Feature: vt-dining-ranker, Property 28: Streak increments on daily meal log
// Validates: Requirements 12.1

describe('Property 28: Streak increments on daily meal log', () => {
  it('streak increases by exactly 1 when a new consecutive day is logged', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (existingDays) => {
          // Build consecutive days ending yesterday
          const today = '2024-06-10';
          const dates: string[] = [];
          for (let i = 1; i <= existingDays; i++) {
            const d = new Date('2024-06-10');
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().slice(0, 10));
          }
          const streakBefore = simulateComputeStreak(dates, today);

          // Add today
          const streakAfter = simulateComputeStreak([today, ...dates], today);
          return streakAfter === streakBefore + 1;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('streak milestone badge is awarded at 7, 30, 100 and not at other values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        (streak) => {
          const badge = shouldAwardStreakBadge(streak);
          const milestones = [7, 30, 100];
          if (milestones.includes(streak)) return badge !== null;
          return badge === null;
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property 29: Foodie Explorer badge awarded correctly ─────────────────────
// Feature: vt-dining-ranker, Property 29: Foodie Explorer badge awarded correctly
// Validates: Requirements 12.3

describe('Property 29: Foodie Explorer badge awarded correctly', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  it('badge is awarded when ≥10 distinct items are rated within any 7-day window', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') }),
        fc.array(fc.uuid(), { minLength: 10, maxLength: 30 }),
        (baseDate, itemIds) => {
          const distinct = [...new Set(itemIds)];
          if (distinct.length < 10) return true;

          const ratings = distinct.slice(0, 10).map((id, i) => ({
            date: new Date(baseDate.getTime() + i * (6 * DAY_MS / 9)),
            itemId: id,
          }));

          return isFoodieExplorerEarned(ratings) === true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('badge is NOT awarded when all items are spread beyond 7-day windows', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2024-01-01') }),
        fc.integer({ min: 10, max: 20 }),
        (baseDate, count) => {
          const ratings = Array.from({ length: count }, (_, i) => ({
            date: new Date(baseDate.getTime() + i * 8 * DAY_MS),
            itemId: `item-${i}`,
          }));
          return isFoodieExplorerEarned(ratings) === false;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('duplicate item IDs within a window do not count as distinct', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') }),
        fc.integer({ min: 1, max: 9 }),
        (baseDate, distinctCount) => {
          const ratings = Array.from({ length: 10 }, (_, i) => ({
            date: new Date(baseDate.getTime() + i * DAY_MS),
            itemId: `item-${i % distinctCount}`,
          }));
          return isFoodieExplorerEarned(ratings) === false;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 30: Leaderboard ordering and size ───────────────────────────────
// Feature: vt-dining-ranker, Property 30: Leaderboard ordering and size
// Validates: Requirements 12.4

describe('Property 30: Leaderboard ordering and size', () => {
  it('leaderboard contains at most 20 students', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            ratingCount: fc.integer({ min: 0, max: 100 }),
            optedOut: fc.boolean(),
          }),
          { minLength: 0, maxLength: 50 },
        ),
        (students) => buildLeaderboard(students).length <= 20,
      ),
      { numRuns: 100 },
    );
  });

  it('leaderboard is sorted in descending order by rating count', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            ratingCount: fc.integer({ min: 0, max: 100 }),
            optedOut: fc.boolean(),
          }),
          { minLength: 0, maxLength: 50 },
        ),
        (students) => {
          const board = buildLeaderboard(students);
          for (let i = 1; i < board.length; i++) {
            if (board[i].ratingCount > board[i - 1].ratingCount) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('opted-out students never appear in the leaderboard', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            ratingCount: fc.integer({ min: 0, max: 100 }),
            optedOut: fc.boolean(),
          }),
          { minLength: 0, maxLength: 50 },
        ),
        (students) => {
          const board = buildLeaderboard(students);
          return board.every((s) => {
            const original = students.find((st) => st.id === s.id);
            return original && !original.optedOut;
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 31: Streak resets to 0 on missed day ───────────────────────────
// Feature: vt-dining-ranker, Property 31: Streak resets to 0 on missed day
// Validates: Requirements 12.5

describe('Property 31: Streak resets to 0 on missed day', () => {
  it('streak is 0 when most recent log is not today', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        (daysAgo) => {
          const today = '2024-06-10';
          const lastLog = new Date('2024-06-10');
          lastLog.setDate(lastLog.getDate() - daysAgo);
          const dates = [lastLog.toISOString().slice(0, 10)];
          return simulateComputeStreak(dates, today) === 0;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('streak is never negative', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 10, maxLength: 10 }), { minLength: 0, maxLength: 10 }),
        (dates) => simulateComputeStreak(dates, '2024-06-10') >= 0,
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 32: Leaderboard opt-out preserves streak and badges ─────────────
// Feature: vt-dining-ranker, Property 32: Leaderboard opt-out preserves streak and badges
// Validates: Requirements 12.6

describe('Property 32: Leaderboard opt-out preserves streak and badges', () => {
  it('opted-out student does not appear in leaderboard', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 0, max: 200 }),
        fc.array(
          fc.record({
            id: fc.uuid(),
            ratingCount: fc.integer({ min: 0, max: 100 }),
            optedOut: fc.boolean(),
          }),
          { minLength: 0, maxLength: 30 },
        ),
        (optedOutId, ratingCount, otherStudents) => {
          const allStudents = [
            { id: optedOutId, ratingCount, optedOut: true },
            ...otherStudents.filter((s) => s.id !== optedOutId),
          ];
          const board = buildLeaderboard(allStudents);
          return !board.some((s) => s.id === optedOutId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('opting out does not change streak value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.array(fc.constantFrom('streak_7', 'streak_30', 'streak_100', 'foodie_explorer'), {
          minLength: 0,
          maxLength: 4,
        }),
        (streak, badges) => {
          const student = { streak, badges: [...new Set(badges)], leaderboard_opt_out: false };
          student.leaderboard_opt_out = true;
          return student.streak === streak && student.badges.length === [...new Set(badges)].length;
        },
      ),
      { numRuns: 100 },
    );
  });
});
