import { pool } from '../db/client';
import { logMeal } from './nutritionalTrackingService';

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

export function getReminderTime(plannedDate: string, mealPeriod: string): Date {
  const periodStartHours: Record<string, number> = {
    breakfast: 7,
    lunch: 11,
    dinner: 17,
    late_night: 21,
  };
  const startHour = periodStartHours[mealPeriod] ?? 12;
  const dt = new Date(`${plannedDate}T${String(startHour).padStart(2, '0')}:00:00.000Z`);
  return new Date(dt.getTime() - 30 * 60 * 1000);
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
  return result.rows[0];
}

export async function completeMealPlan(entryId: string, studentId: string) {
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

  try {
    await logMeal(studentId, entry.meal_period, entry.planned_date, [
      { menu_item_id: entry.menu_item_id, servings: 1 },
    ]);
  } catch {
    // Nutrition logging is best-effort; don't fail the completion
  }

  await pool.query(
    `INSERT INTO activity_event (student_id, event_type, payload) VALUES ($1, $2, $3)`,
    [studentId, 'meal_logged', JSON.stringify({ planned_date: entry.planned_date, meal_period: entry.meal_period })]
  );

  return entry;
}
