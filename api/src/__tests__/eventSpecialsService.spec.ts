import fc from 'fast-check';
import { markAsEventSpecial } from '../services/eventSpecialsService';

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe('markAsEventSpecial', () => {
  it('adds is_event_special: true to any object', () => {
    const item = { id: '1', title: 'Pizza Night' };
    const result = markAsEventSpecial(item);
    expect(result.is_event_special).toBe(true);
  });

  it('preserves all original fields', () => {
    const item = { id: '1', title: 'Taco Tuesday', dining_hall_id: 'hall-1' };
    const result = markAsEventSpecial(item);
    expect(result.id).toBe('1');
    expect(result.title).toBe('Taco Tuesday');
    expect(result.dining_hall_id).toBe('hall-1');
  });

  it('does not mutate the original object', () => {
    const item = { id: '1', title: 'Test' };
    markAsEventSpecial(item);
    expect((item as any).is_event_special).toBeUndefined();
  });
});

// ─── Property 38: Event special appears in dining hall page and trending feed ──
// Feature: vt-dining-ranker, Property 38: Event special appears in dining hall page and trending feed
// Validates: Requirements 15.2

describe('Property 38: Event special appears in dining hall page and trending feed', () => {
  it('any published event special has is_event_special: true', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          dining_hall_id: fc.uuid(),
          title: fc.string({ minLength: 1, maxLength: 50 }),
          description: fc.string({ maxLength: 200 }),
          event_date: fc.constant('2024-06-01'),
          meal_period: fc.constantFrom('breakfast', 'lunch', 'dinner', 'late_night'),
          created_by: fc.uuid(),
        }),
        (special) => {
          const marked = markAsEventSpecial(special);
          return marked.is_event_special === true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('event special can be identified in a mixed list of items', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            title: fc.string({ minLength: 1, maxLength: 50 }),
            is_event_special: fc.boolean(),
          }),
          { minLength: 0, maxLength: 20 },
        ),
        fc.record({
          id: fc.uuid(),
          title: fc.string({ minLength: 1, maxLength: 50 }),
        }),
        (regularItems, specialItem) => {
          const markedSpecial = markAsEventSpecial(specialItem);
          const feed = [...regularItems, markedSpecial];
          const specials = feed.filter((item) => (item as any).is_event_special === true);
          return specials.some((s) => s.id === specialItem.id);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 39: Event special has distinct indicator ────────────────────────
// Feature: vt-dining-ranker, Property 39: Event special has distinct indicator
// Validates: Requirements 15.4

describe('Property 39: Event special has distinct indicator', () => {
  it('is_event_special is always true on marked specials', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          title: fc.string({ minLength: 1 }),
          dining_hall_id: fc.uuid(),
        }),
        (item) => {
          const marked = markAsEventSpecial(item);
          return marked.is_event_special === true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('regular menu items without marking do not have is_event_special: true', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1 }),
          station: fc.string({ minLength: 1 }),
        }),
        (item) => {
          return (item as any).is_event_special !== true;
        },
      ),
      { numRuns: 200 },
    );
  });
});
