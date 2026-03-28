import { pool } from '../db/client';
import { mealPlanReminderQueue, menuChangeQueue } from '../workers/queues';
import { logMeal } from './nutritionalTrackingService';

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

/**
 * Compute the reminder timestamp: 30 minutes before the meal period starts.
 * Meal period start times (local):
 *   breakfast: 07:00, lunch: 11:00, dinner: 17:00, late_night: 21:00
 */
export function getReminderTime(plannedDate: string, mealPeriod: string): Date {
  const periodStartHours: Record<string, number> = {
    breakfast: 7,
    lunch: 11,
    dinner: 17,
    late_night: 21,
  };
  const startHour = periodStartHours[mealPeriod] ?? 12;
  const dt = new Date(`${plannedDate}T${String(startHour).padStart(2, '0')}:00:00.000Z`);
  return new Date(dt.getTime() - 30 * 60 * 1000); // 30 min before
}

// ─── DB operations ────────────────────────────────────────────────────────────

export async function getMealPlans(studentId: string) {
  const result = await pool.query(
    `SELECT mp.*, mi.name AS menu_item_name, mi.dining_hall_id, mi.meal_period AS item_meal_period
     FROM meal_plan_entry mp
     JOIN menu_item mi ON mi.id = mp.menu_item_id
     WHERE mp.student_id = $1
     ORDER BY mp.planned_date ASC, mp.meal_period ASC`,
    [studentId],
  );
  return result.rows;
}

export async function addMealPlan(
  studentId: string,
  menuItemId: string,
  plannedDate: string,
  mealPeriod: string,
) {
  const result = await pool.query(
    `INSERT INTO meal_plan_entry (student_id, menu_item_id, planned_date, meal_period, completed)
     VALUES ($1, $2, $3, $4, false)
     RETURNING *`,
    [studentId, menuItemId, plannedDate, mealPeriod],
  );
  const entry = result.rows[0];

  // Schedule reminder notification 30 min before meal period
  const reminderTime = getReminderTime(plannedDate, mealPeriod);
  const delay = Math.max(0, reminderTime.getTime() - Date.now());
  await mealPlanReminderQueue.add(
    'meal_plan_reminder',
    { studentId, menuItemId, plannedDate, mealPeriod, entryId: entry.id },
    { delay },
  );

  return entry;
}

export async function completeMealPlan(entryId: string, studentId: string) {
  // Mark as completed
  const result = await pool.query(
    `UPDATE meal_plan_entry SET completed = true
     WHERE id = $1 AND student_id = $2
     RETURNING *`,
    [entryId, studentId],
  );
  if ((result.rowCount ?? 0) === 0) {
    throw Object.assign(new Error('not_found'), { status: 404, code: 'not_found' });
  }
  const entry = result.rows[0];

  // Auto-log nutrition for the planned date
  try {
    await logMeal(studentId, entry.meal_period, entry.planned_date, [
      { menu_item_id: entry.menu_item_id, servings: 1 },
    ]);
  } catch {
    // Nutrition logging is best-effort; don't fail the completion
  }

  return entry;
}

/**
 * Called when a menu.updated event fires.
 * Checks all meal plan entries for the affected menu item and notifies students.
 */
export async function handleMenuChange(menuItemId: string, removed: boolean) {
  if (!removed) return;

  const result = await pool.query(
    `SELECT mp.*, s.id AS student_id
     FROM meal_plan_entry mp
     JOIN student s ON s.id = mp.student_id
     WHERE mp.menu_item_id = $1 AND mp.completed = false`,
    [menuItemId],
  );

  for (const entry of result.rows) {
    await menuChangeQueue.add('menu_change', {
      studentId: entry.student_id,
      menuItemId,
      entryId: entry.id,
      plannedDate: entry.planned_date,
      mealPeriod: entry.meal_period,
    });
  }
}
