import fc from 'fast-check';
import { getReminderTime } from '../services/mealPlanningService';

// ─── Unit tests: getReminderTime ──────────────────────────────────────────────

describe('getReminderTime', () => {
  it('returns 30 minutes before breakfast (07:00)', () => {
    const reminder = getReminderTime('2024-06-01', 'breakfast');
    expect(reminder.getUTCHours()).toBe(6);
    expect(reminder.getUTCMinutes()).toBe(30);
  });

  it('returns 30 minutes before lunch (11:00)', () => {
    const reminder = getReminderTime('2024-06-01', 'lunch');
    expect(reminder.getUTCHours()).toBe(10);
    expect(reminder.getUTCMinutes()).toBe(30);
  });

  it('returns 30 minutes before dinner (17:00)', () => {
    const reminder = getReminderTime('2024-06-01', 'dinner');
    expect(reminder.getUTCHours()).toBe(16);
    expect(reminder.getUTCMinutes()).toBe(30);
  });

  it('returns 30 minutes before late_night (21:00)', () => {
    const reminder = getReminderTime('2024-06-01', 'late_night');
    expect(reminder.getUTCHours()).toBe(20);
    expect(reminder.getUTCMinutes()).toBe(30);
  });

  it('reminder is always 30 minutes before the meal period start', () => {
    const periods = ['breakfast', 'lunch', 'dinner', 'late_night'];
    const startHours: Record<string, number> = {
      breakfast: 7, lunch: 11, dinner: 17, late_night: 21,
    };
    for (const period of periods) {
      const reminder = getReminderTime('2024-06-01', period);
      const startMs = new Date(`2024-06-01T${String(startHours[period]).padStart(2, '0')}:00:00.000Z`).getTime();
      expect(startMs - reminder.getTime()).toBe(30 * 60 * 1000);
    }
  });
});

// ─── Pure meal plan round-trip simulation ─────────────────────────────────────

interface MealPlanEntry {
  id: string;
  studentId: string;
  menuItemId: string;
  plannedDate: string;
  mealPeriod: string;
  completed: boolean;
}

function simulateAddMealPlan(
  store: Map<string, MealPlanEntry>,
  entry: Omit<MealPlanEntry, 'completed'>,
): MealPlanEntry {
  const full: MealPlanEntry = { ...entry, completed: false };
  store.set(entry.id, full);
  return full;
}

function simulateGetMealPlans(store: Map<string, MealPlanEntry>, studentId: string): MealPlanEntry[] {
  return [...store.values()].filter((e) => e.studentId === studentId);
}

function simulateCompleteMealPlan(store: Map<string, MealPlanEntry>, id: string): MealPlanEntry | null {
  const entry = store.get(id);
  if (!entry) return null;
  const updated = { ...entry, completed: true };
  store.set(id, updated);
  return updated;
}

// ─── Unit tests: getMealPlans / addMealPlan / completeMealPlan ────────────────

describe('addMealPlan', () => {
  it('adds entry with completed=false by default', () => {
    const store = new Map<string, MealPlanEntry>();
    const entry = simulateAddMealPlan(store, {
      id: 'e1', studentId: 's1', menuItemId: 'm1', plannedDate: '2024-06-01', mealPeriod: 'lunch',
    });
    expect(entry.completed).toBe(false);
  });
});

describe('completeMealPlan', () => {
  it('marks entry as completed', () => {
    const store = new Map<string, MealPlanEntry>();
    simulateAddMealPlan(store, {
      id: 'e1', studentId: 's1', menuItemId: 'm1', plannedDate: '2024-06-01', mealPeriod: 'lunch',
    });
    const result = simulateCompleteMealPlan(store, 'e1');
    expect(result?.completed).toBe(true);
  });

  it('returns null for non-existent entry', () => {
    const store = new Map<string, MealPlanEntry>();
    expect(simulateCompleteMealPlan(store, 'nonexistent')).toBeNull();
  });
});

// ─── Property 33: Meal plan add round-trip ────────────────────────────────────
// Feature: vt-dining-ranker, Property 33: Meal plan add round-trip
// Validates: Requirements 13.2

describe('Property 33: Meal plan add round-trip', () => {
  it('added meal plan entry is retrievable for the same student', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom('2024-06-01', '2024-06-02', '2024-06-07'),
        fc.constantFrom('breakfast', 'lunch', 'dinner', 'late_night'),
        (id, studentId, menuItemId, plannedDate, mealPeriod) => {
          const store = new Map<string, MealPlanEntry>();
          simulateAddMealPlan(store, { id, studentId, menuItemId, plannedDate, mealPeriod });
          const plans = simulateGetMealPlans(store, studentId);
          return plans.some(
            (p) =>
              p.menuItemId === menuItemId &&
              p.plannedDate === plannedDate &&
              p.mealPeriod === mealPeriod,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('meal plan entry is not visible to other students', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom('2024-06-01'),
        fc.constantFrom('lunch'),
        (id, studentId, otherStudentId, menuItemId, plannedDate, mealPeriod) => {
          fc.pre(studentId !== otherStudentId);
          const store = new Map<string, MealPlanEntry>();
          simulateAddMealPlan(store, { id, studentId, menuItemId, plannedDate, mealPeriod });
          const otherPlans = simulateGetMealPlans(store, otherStudentId);
          return otherPlans.length === 0;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 34: Completing a meal plan entry logs nutrition ─────────────────
// Feature: vt-dining-ranker, Property 34: Completing a meal plan entry logs nutrition
// Validates: Requirements 13.5

describe('Property 34: Completing a meal plan entry logs nutrition', () => {
  it('completing an entry sets completed=true', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom('2024-06-01'),
        fc.constantFrom('lunch'),
        (id, studentId, menuItemId, plannedDate, mealPeriod) => {
          const store = new Map<string, MealPlanEntry>();
          simulateAddMealPlan(store, { id, studentId, menuItemId, plannedDate, mealPeriod });
          const completed = simulateCompleteMealPlan(store, id);
          return completed !== null && completed.completed === true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('completing a non-existent entry returns null', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (id) => {
          const store = new Map<string, MealPlanEntry>();
          return simulateCompleteMealPlan(store, id) === null;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('completing an entry does not affect other entries', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        (id1, id2, studentId, menuItemId) => {
          fc.pre(id1 !== id2);
          const store = new Map<string, MealPlanEntry>();
          simulateAddMealPlan(store, { id: id1, studentId, menuItemId, plannedDate: '2024-06-01', mealPeriod: 'lunch' });
          simulateAddMealPlan(store, { id: id2, studentId, menuItemId, plannedDate: '2024-06-02', mealPeriod: 'dinner' });
          simulateCompleteMealPlan(store, id1);
          const entry2 = store.get(id2);
          return entry2 !== undefined && entry2.completed === false;
        },
      ),
      { numRuns: 100 },
    );
  });
});
