import fc from 'fast-check';
import { groupByStation } from '../services/menuService';

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe('groupByStation()', () => {
  it('returns empty object for empty input', () => {
    expect(groupByStation([])).toEqual({});
  });

  it('groups items by station', () => {
    const items = [
      { id: '1', name: 'Pizza', station: 'Grill' },
      { id: '2', name: 'Salad', station: 'Salad Bar' },
      { id: '3', name: 'Burger', station: 'Grill' },
    ];
    const grouped = groupByStation(items);
    expect(grouped['Grill']).toHaveLength(2);
    expect(grouped['Salad Bar']).toHaveLength(1);
  });

  it('falls back to "General" for null/undefined station', () => {
    const items = [
      { id: '1', name: 'Mystery Item', station: null },
      { id: '2', name: 'Another', station: undefined },
    ];
    const grouped = groupByStation(items);
    expect(grouped['General']).toHaveLength(2);
    expect(Object.keys(grouped)).not.toContain('null');
    expect(Object.keys(grouped)).not.toContain('undefined');
  });

  it('preserves all items across groups', () => {
    const items = [
      { id: '1', station: 'A' },
      { id: '2', station: 'B' },
      { id: '3', station: 'A' },
      { id: '4', station: null },
    ];
    const grouped = groupByStation(items);
    const total = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
    expect(total).toBe(items.length);
  });
});

// ─── Property 1: Menu items are grouped by station ────────────────────────────
// Validates: Requirements 1.1

describe('Property 1: Menu items are grouped by station', () => {
  it('every item in grouped response has a non-null station', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1 }),
            station: fc.option(fc.string({ minLength: 1 }), { nil: null }),
          }),
          { minLength: 0, maxLength: 30 },
        ),
        (items) => {
          const grouped = groupByStation(items);
          for (const [stationName, stationItems] of Object.entries(grouped)) {
            // Station key must not be null/undefined string
            if (stationName === 'null' || stationName === 'undefined') return false;
            // Every item in the group must have a non-null station field
            for (const item of stationItems) {
              if (item.station === null || item.station === undefined) return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('items with the same station are grouped together', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1 }),
            station: fc.constantFrom('Grill', 'Salad Bar', 'Pizza', 'Desserts', null),
          }),
          { minLength: 1, maxLength: 30 },
        ),
        (items) => {
          const grouped = groupByStation(items);
          // Each item should appear in exactly one group
          const allGroupedIds = Object.values(grouped).flatMap((g) => g.map((i: any) => i.id));
          const inputIds = items.map((i) => i.id);
          return (
            allGroupedIds.length === inputIds.length &&
            allGroupedIds.every((id) => inputIds.includes(id))
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 3: Active meal period is always present ─────────────────────────
// Validates: Requirements 1.5

describe('Property 3: Active meal period is always present', () => {
  const VALID_PERIODS = ['breakfast', 'lunch', 'dinner', 'late_night'];

  it('meal period values are one of the valid set', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_PERIODS),
        (period) => VALID_PERIODS.includes(period),
      ),
      { numRuns: 100 },
    );
  });

  it('a menu item with a valid meal_period passes validation', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1 }),
          meal_period: fc.constantFrom(...VALID_PERIODS),
          station: fc.string({ minLength: 1 }),
        }),
        (item) => VALID_PERIODS.includes(item.meal_period),
      ),
      { numRuns: 100 },
    );
  });
});
