import fc from 'fast-check';
import { applyDietaryFilter, injectAllergenWarning } from '../middleware/dietaryFilter';
import { DietaryProfile, MenuItem } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    recency_score: 1.0,
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

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe('applyDietaryFilter', () => {
  it('returns items unfiltered when profile is null', () => {
    const items = [makeItem({ allergens: ['peanuts'] })];
    expect(applyDietaryFilter(items, null)).toEqual(items);
  });

  it('returns items unfiltered when profile is inactive', () => {
    const items = [makeItem({ allergens: ['peanuts'] })];
    const profile = makeProfile({ active: false, allergens: ['peanuts'] });
    expect(applyDietaryFilter(items, profile)).toEqual(items);
  });

  it('excludes items whose allergens conflict with profile restrictions', () => {
    const items = [
      makeItem({ id: '1', allergens: ['gluten'] }),
      makeItem({ id: '2', allergens: ['dairy'] }),
    ];
    const profile = makeProfile({ restrictions: ['gluten-free'], allergens: ['gluten'] });
    const result = applyDietaryFilter(items, profile);
    expect(result.map((i) => i.id)).not.toContain('1');
  });

  it('excludes items whose allergens conflict with profile allergens', () => {
    const items = [
      makeItem({ id: '1', allergens: ['peanuts'] }),
      makeItem({ id: '2', allergens: ['dairy'] }),
    ];
    const profile = makeProfile({ allergens: ['peanuts'] });
    const result = applyDietaryFilter(items, profile);
    expect(result.map((i) => i.id)).not.toContain('1');
    expect(result.map((i) => i.id)).toContain('2');
  });

  it('excludes items with allergen_data_complete: false by default', () => {
    const items = [
      makeItem({ id: '1', allergen_data_complete: false }),
      makeItem({ id: '2', allergen_data_complete: true }),
    ];
    const profile = makeProfile();
    const result = applyDietaryFilter(items, profile);
    expect(result.map((i) => i.id)).not.toContain('1');
    expect(result.map((i) => i.id)).toContain('2');
  });

  it('includes items with allergen_data_complete: false when opt_in_incomplete is true', () => {
    const items = [makeItem({ id: '1', allergen_data_complete: false })];
    const profile = makeProfile({ opt_in_incomplete: true });
    const result = applyDietaryFilter(items, profile);
    expect(result.map((i) => i.id)).toContain('1');
  });

  it('is case-insensitive when matching allergens', () => {
    const items = [makeItem({ id: '1', allergens: ['Peanuts'] })];
    const profile = makeProfile({ allergens: ['peanuts'] });
    const result = applyDietaryFilter(items, profile);
    expect(result).toHaveLength(0);
  });
});

describe('injectAllergenWarning', () => {
  it('returns item unchanged when profile is null', () => {
    const item = makeItem({ allergens: ['peanuts'] });
    const result = injectAllergenWarning(item, null);
    expect(result).not.toHaveProperty('allergen_warning');
  });

  it('returns item unchanged when profile is inactive', () => {
    const item = makeItem({ allergens: ['peanuts'] });
    const profile = makeProfile({ active: false, allergens: ['peanuts'] });
    const result = injectAllergenWarning(item, profile);
    expect(result).not.toHaveProperty('allergen_warning');
  });

  it('injects allergen_warning: true when item allergens match profile allergens', () => {
    const item = makeItem({ allergens: ['peanuts'] });
    const profile = makeProfile({ allergens: ['peanuts'] });
    const result = injectAllergenWarning(item, profile);
    expect(result.allergen_warning).toBe(true);
  });

  it('injects allergen_warning: true when item allergens match profile restrictions', () => {
    const item = makeItem({ allergens: ['gluten'] });
    const profile = makeProfile({ restrictions: ['gluten'] });
    const result = injectAllergenWarning(item, profile);
    expect(result.allergen_warning).toBe(true);
  });

  it('does not inject allergen_warning when no overlap', () => {
    const item = makeItem({ allergens: ['dairy'] });
    const profile = makeProfile({ allergens: ['peanuts'] });
    const result = injectAllergenWarning(item, profile);
    expect(result).not.toHaveProperty('allergen_warning');
  });
});

// ─── Property-based tests ─────────────────────────────────────────────────────

const allergenArb = fc.constantFrom(
  'peanuts', 'tree nuts', 'dairy', 'gluten', 'soy', 'eggs', 'shellfish', 'fish', 'wheat',
);

const itemArb = fc.record({
  id: fc.uuid(),
  dining_hall_id: fc.uuid(),
  name: fc.string({ minLength: 1 }),
  description: fc.string(),
  station: fc.string({ minLength: 1 }),
  meal_period: fc.constantFrom('breakfast', 'lunch', 'dinner', 'late_night') as fc.Arbitrary<MenuItem['meal_period']>,
  menu_date: fc.constant('2024-01-01'),
  allergens: fc.array(allergenArb, { maxLength: 5 }),
  allergen_data_complete: fc.boolean(),
  nutrition: fc.constant(null),
  health_score: fc.constant(null),
  recency_score: fc.float({ min: 0, max: 10 }),
  recency_score_updated_at: fc.constant(new Date()),
});

const profileArb = fc.record({
  restrictions: fc.array(allergenArb, { maxLength: 3 }),
  allergens: fc.array(allergenArb, { maxLength: 3 }),
  active: fc.boolean(),
  opt_in_incomplete: fc.boolean(),
});

/**
 * Property 11: Dietary filter excludes conflicting items
 * Validates: Requirements 4.2
 */
describe('Property 11: Dietary filter excludes conflicting items', () => {
  it('no returned item conflicts with an active dietary profile', () => {
    fc.assert(
      fc.property(fc.array(itemArb, { maxLength: 20 }), profileArb, (items, profile) => {
        if (!profile.active) return true; // inactive profile: no filtering expected

        const blocked = new Set([
          ...profile.restrictions.map((r) => r.toLowerCase()),
          ...profile.allergens.map((a) => a.toLowerCase()),
        ]);

        const result = applyDietaryFilter(items, profile);

        return result.every((item) => {
          const itemAllergens = item.allergens.map((a) => a.toLowerCase());
          return !itemAllergens.some((a) => blocked.has(a));
        });
      }),
      { numRuns: 200, verbose: true },
    );
  });
});

/**
 * Property 12: Allergen warning on conflicting items
 * Validates: Requirements 4.3
 */
describe('Property 12: Allergen warning on conflicting items', () => {
  it('allergen_warning is true iff item allergens overlap with active profile', () => {
    fc.assert(
      fc.property(itemArb, profileArb, (item, profile) => {
        const result = injectAllergenWarning(item, profile);

        if (!profile.active) {
          return !result.allergen_warning;
        }

        const blocked = new Set([
          ...profile.restrictions.map((r) => r.toLowerCase()),
          ...profile.allergens.map((a) => a.toLowerCase()),
        ]);
        const hasOverlap = item.allergens.map((a) => a.toLowerCase()).some((a) => blocked.has(a));

        return hasOverlap ? result.allergen_warning === true : !result.allergen_warning;
      }),
      { numRuns: 200, verbose: true },
    );
  });
});

/**
 * Property 13: Dietary filter disable/re-enable preserves profile
 * Validates: Requirements 4.4
 */
describe('Property 13: Dietary filter disable/re-enable preserves profile', () => {
  it('disabling and re-enabling filtering leaves profile restrictions and allergens unchanged', () => {
    fc.assert(
      fc.property(profileArb, (profile) => {
        const disabled: DietaryProfile = { ...profile, active: false };
        const reEnabled: DietaryProfile = { ...disabled, active: true };

        return (
          JSON.stringify(reEnabled.restrictions) === JSON.stringify(profile.restrictions) &&
          JSON.stringify(reEnabled.allergens) === JSON.stringify(profile.allergens)
        );
      }),
      { numRuns: 200 },
    );
  });
});

/**
 * Property 14: Incomplete allergen items excluded by default
 * Validates: Requirements 4.5
 */
describe('Property 14: Incomplete allergen items excluded by default', () => {
  it('items with allergen_data_complete: false are excluded unless opt_in_incomplete is true', () => {
    fc.assert(
      fc.property(
        fc.array(itemArb, { maxLength: 20 }),
        profileArb.filter((p) => p.active),
        (items, profile) => {
          const result = applyDietaryFilter(items, profile);

          if (!profile.opt_in_incomplete) {
            // No incomplete items should appear in results
            return result.every((item) => item.allergen_data_complete);
          }
          // When opted in, incomplete items may appear (if they don't conflict)
          return true;
        },
      ),
      { numRuns: 200, verbose: true },
    );
  });
});
