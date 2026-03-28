import { pool } from '../db/client';
import { MealLogItem, NutritionData, NutritionTargets, MealLog } from '../types';
import { checkFoodieExplorer } from './gamificationService';

// ─── Pure aggregation ─────────────────────────────────────────────────────────

export function aggregateNutrition(items: MealLogItem[], nutritionList: NutritionData[]): NutritionData {
  const zero: NutritionData = {
    calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
    fiber_g: 0, sodium_mg: 0, added_sugar_g: 0,
  };
  return items.reduce((acc, item, i) => {
    const n = nutritionList[i];
    const s = item.servings;
    return {
      calories:       acc.calories       + n.calories       * s,
      protein_g:      acc.protein_g      + n.protein_g      * s,
      carbs_g:        acc.carbs_g        + n.carbs_g        * s,
      fat_g:          acc.fat_g          + n.fat_g          * s,
      fiber_g:        acc.fiber_g        + n.fiber_g        * s,
      sodium_mg:      acc.sodium_mg      + n.sodium_mg      * s,
      added_sugar_g:  acc.added_sugar_g  + n.added_sugar_g  * s,
    };
  }, zero);
}

// ─── DB operations ────────────────────────────────────────────────────────────

export async function logMeal(
  studentId: string,
  mealPeriod: MealLog['meal_period'],
  logDate: string,
  items: MealLogItem[],
): Promise<MealLog> {
  if (!items.length) {
    throw Object.assign(new Error('items_required'), { status: 400, code: 'items_required' });
  }

  const ids = items.map((it) => it.menu_item_id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const menuResult = await pool.query(
    `SELECT id, nutrition FROM menu_item WHERE id IN (${placeholders})`,
    ids,
  );

  const nutritionMap = new Map<string, NutritionData>();
  for (const row of menuResult.rows) {
    if (row.nutrition) nutritionMap.set(row.id, row.nutrition as NutritionData);
  }

  const nutritionList: NutritionData[] = items.map((item) => {
    const n = nutritionMap.get(item.menu_item_id);
    if (!n) {
      throw Object.assign(
        new Error(`nutrition_missing:${item.menu_item_id}`),
        { status: 422, code: 'nutrition_missing' },
      );
    }
    return n;
  });

  const totals = aggregateNutrition(items, nutritionList);

  const result = await pool.query(
    `INSERT INTO meal_log (student_id, log_date, meal_period, items, nutrition_totals)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [studentId, logDate, mealPeriod, JSON.stringify(items), JSON.stringify(totals)],
  );

  const log = result.rows[0] as MealLog;

  // Write activity event for social feed
  await pool.query(
    `INSERT INTO activity_event (student_id, event_type, payload) VALUES ($1, $2, $3)`,
    [studentId, 'meal_logged', JSON.stringify({ log_date: logDate, meal_period: mealPeriod })]
  );

  // Check and award Foodie Explorer badge
  try {
    await checkFoodieExplorer(studentId);
  } catch {
    // Badge check is best-effort
  }

  return log;
}

export async function getMealLogs(
  studentId: string,
  date: string,
  range: 'daily' | 'weekly',
): Promise<{ logs: MealLog[]; totals: NutritionData; over_calorie_target: boolean }> {
  let startDate: string;
  let endDate: string;

  if (range === 'weekly') {
    const d = new Date(date);
    const day = d.getUTCDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + diff);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    startDate = monday.toISOString().split('T')[0];
    endDate = sunday.toISOString().split('T')[0];
  } else {
    startDate = date;
    endDate = date;
  }

  const logsResult = await pool.query(
    `SELECT * FROM meal_log
     WHERE student_id = $1
       AND log_date BETWEEN $2 AND $3
       AND deleted_at IS NULL
     ORDER BY log_date ASC, created_at ASC`,
    [studentId, startDate, endDate],
  );

  const logs = logsResult.rows as MealLog[];

  const zero: NutritionData = {
    calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
    fiber_g: 0, sodium_mg: 0, added_sugar_g: 0,
  };
  const totals = logs.reduce((acc, log) => {
    const n = log.nutrition_totals;
    return {
      calories:      acc.calories      + (n.calories      ?? 0),
      protein_g:     acc.protein_g     + (n.protein_g     ?? 0),
      carbs_g:       acc.carbs_g       + (n.carbs_g       ?? 0),
      fat_g:         acc.fat_g         + (n.fat_g         ?? 0),
      fiber_g:       acc.fiber_g       + (n.fiber_g       ?? 0),
      sodium_mg:     acc.sodium_mg     + (n.sodium_mg     ?? 0),
      added_sugar_g: acc.added_sugar_g + (n.added_sugar_g ?? 0),
    };
  }, zero);

  const studentResult = await pool.query(
    `SELECT nutrition_targets FROM student WHERE id = $1`,
    [studentId],
  );
  const targets: NutritionTargets | null = studentResult.rows[0]?.nutrition_targets ?? null;
  const over_calorie_target = targets?.calories != null && totals.calories > targets.calories;

  return { logs, totals, over_calorie_target };
}

export async function updateNutritionTargets(
  studentId: string,
  targets: NutritionTargets,
): Promise<NutritionTargets> {
  const result = await pool.query(
    `UPDATE student SET nutrition_targets = $1 WHERE id = $2 RETURNING nutrition_targets`,
    [JSON.stringify(targets), studentId],
  );
  if (!result.rows.length) {
    throw Object.assign(new Error('student_not_found'), { status: 404, code: 'student_not_found' });
  }
  return result.rows[0].nutrition_targets as NutritionTargets;
}
