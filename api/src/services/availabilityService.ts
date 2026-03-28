/**
 * Availability History and Prediction Service
 * Requirements: 17.1–17.9
 */

import { pool } from '../db/client';
import { notificationQueue } from '../workers/queues';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AvailabilityLogEntry {
  id: string;
  menu_item_id: string;
  dining_hall_id: string;
  appeared_on: string;
  meal_period: string;
  logged_at: Date;
}

export interface RecurrencePattern {
  day_of_week: number; // 0=Sunday … 6=Saturday
  meal_period: string;
  dining_hall_id: string;
  appearance_count: number;
  frequency_pct: number; // fraction of weeks in window where this pattern appeared
}

export interface PredictionResult {
  prediction_available: true;
  patterns: RecurrencePattern[];
  predicted_next: PredictedOccurrence[];
}

export interface PredictionUnavailable {
  prediction_available: false;
  message: string;
}

export interface PredictedOccurrence {
  day_of_week: number;
  day_name: string;
  meal_period: string;
  dining_hall_id: string;
  next_date: string; // ISO date of the next calendar occurrence
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return the next calendar date (ISO string) for a given day_of_week (0–6). */
function nextDateForDayOfWeek(dayOfWeek: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (dayOfWeek - today.getDay() + 7) % 7 || 7; // at least 1 day ahead
  const next = new Date(today);
  next.setDate(today.getDate() + diff);
  return next.toISOString().split('T')[0];
}

/** Return true if nextDate is within 24 hours from now. */
function isWithin24Hours(isoDate: string): boolean {
  const target = new Date(isoDate);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  return diffMs >= 0 && diffMs <= 24 * 60 * 60 * 1000;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * GET /api/menu-items/:id/availability-history
 * Returns the full appearance log for a menu item (Req 17.1, 17.2).
 */
export async function getAvailabilityHistory(menuItemId: string): Promise<AvailabilityLogEntry[]> {
  const result = await pool.query(
    `SELECT id, menu_item_id, dining_hall_id,
            appeared_on::text AS appeared_on,
            meal_period, logged_at
     FROM availability_log
     WHERE menu_item_id = $1
     ORDER BY appeared_on DESC, logged_at DESC`,
    [menuItemId],
  );
  return result.rows;
}

/**
 * Core prediction algorithm (pure, exported for testing).
 *
 * Groups appearances by (day_of_week, meal_period, dining_hall_id) over the
 * trailing 90 days. Requires ≥4 total appearances; threshold ≥25% of weeks.
 * Returns PredictionResult or PredictionUnavailable.
 *
 * Req 17.4, 17.6
 */
export function computePrediction(
  logs: Array<{ appeared_on: string; meal_period: string; dining_hall_id: string }>,
  referenceDate: Date = new Date(),
): PredictionResult | PredictionUnavailable {
  // Filter to trailing 90 days
  const cutoff = new Date(referenceDate);
  cutoff.setDate(cutoff.getDate() - 90);

  const recent = logs.filter((l) => new Date(l.appeared_on) >= cutoff);

  if (recent.length < 4) {
    return { prediction_available: false, message: 'Not enough history to predict' };
  }

  // Number of weeks in the 90-day window
  const weeksInWindow = 90 / 7; // ≈ 12.86

  // Group by (day_of_week, meal_period, dining_hall_id)
  const groups = new Map<string, { count: number; day_of_week: number; meal_period: string; dining_hall_id: string }>();

  for (const log of recent) {
    const dow = new Date(log.appeared_on).getDay();
    const key = `${dow}|${log.meal_period}|${log.dining_hall_id}`;
    if (!groups.has(key)) {
      groups.set(key, { count: 0, day_of_week: dow, meal_period: log.meal_period, dining_hall_id: log.dining_hall_id });
    }
    groups.get(key)!.count++;
  }

  // Apply threshold: ≥25% of weeks in window
  const threshold = 0.25 * weeksInWindow; // ≈ 3.21 appearances

  const patterns: RecurrencePattern[] = [];
  for (const g of groups.values()) {
    if (g.count >= threshold) {
      patterns.push({
        day_of_week: g.day_of_week,
        meal_period: g.meal_period,
        dining_hall_id: g.dining_hall_id,
        appearance_count: g.count,
        frequency_pct: g.count / weeksInWindow,
      });
    }
  }

  if (patterns.length === 0) {
    return { prediction_available: false, message: 'Not enough history to predict' };
  }

  // Build predicted_next occurrences
  const predicted_next: PredictedOccurrence[] = patterns.map((p) => ({
    day_of_week: p.day_of_week,
    day_name: DAY_NAMES[p.day_of_week],
    meal_period: p.meal_period,
    dining_hall_id: p.dining_hall_id,
    next_date: nextDateForDayOfWeek(p.day_of_week),
  }));

  return { prediction_available: true, patterns, predicted_next };
}

/**
 * GET /api/menu-items/:id/availability-prediction
 * Returns cached prediction from DB or computes on-the-fly (Req 17.4, 17.5, 17.6).
 */
export async function getAvailabilityPrediction(
  menuItemId: string,
): Promise<PredictionResult | PredictionUnavailable> {
  // Try cached prediction first
  const cached = await pool.query(
    `SELECT prediction_data FROM menu_item WHERE id = $1`,
    [menuItemId],
  );

  if (cached.rows.length === 0) {
    return { prediction_available: false, message: 'Menu item not found' };
  }

  if (cached.rows[0].prediction_data) {
    return cached.rows[0].prediction_data as PredictionResult | PredictionUnavailable;
  }

  // Compute on-the-fly if no cache
  return computePredictionForItem(menuItemId);
}

/** Compute and persist prediction for a single item. */
async function computePredictionForItem(
  menuItemId: string,
): Promise<PredictionResult | PredictionUnavailable> {
  const logsResult = await pool.query(
    `SELECT appeared_on::text AS appeared_on, meal_period, dining_hall_id
     FROM availability_log
     WHERE menu_item_id = $1`,
    [menuItemId],
  );

  const prediction = computePrediction(logsResult.rows);

  // Persist to cache
  await pool.query(
    `UPDATE menu_item SET prediction_data = $1 WHERE id = $2`,
    [JSON.stringify(prediction), menuItemId],
  );

  return prediction;
}

/**
 * Recompute predictions for all menu items.
 * Called by the daily BullMQ cron job (Req 17.9).
 */
export async function recomputePredictions(): Promise<void> {
  const items = await pool.query(`SELECT id FROM menu_item`);

  for (const row of items.rows) {
    await computePredictionForItem(row.id);
  }
}

/**
 * POST /api/menu-items/:id/subscribe
 * Subscribe a student to availability notifications (Req 17.7).
 */
export async function subscribeToItem(studentId: string, menuItemId: string): Promise<void> {
  await pool.query(
    `INSERT INTO availability_subscription (student_id, menu_item_id)
     VALUES ($1, $2)
     ON CONFLICT (student_id, menu_item_id) DO NOTHING`,
    [studentId, menuItemId],
  );
}

/**
 * DELETE /api/menu-items/:id/subscribe
 * Unsubscribe a student from availability notifications (Req 17.7).
 */
export async function unsubscribeFromItem(studentId: string, menuItemId: string): Promise<void> {
  await pool.query(
    `DELETE FROM availability_subscription
     WHERE student_id = $1 AND menu_item_id = $2`,
    [studentId, menuItemId],
  );
}

/**
 * Enqueue availability_prediction notifications for subscribers when the item
 * is predicted to appear within 24 hours (Req 17.7).
 */
export async function notifySubscribersIfPredictedSoon(menuItemId: string): Promise<void> {
  const prediction = await getAvailabilityPrediction(menuItemId);

  if (!prediction.prediction_available) return;

  const soonOccurrences = prediction.predicted_next.filter((o) => isWithin24Hours(o.next_date));
  if (soonOccurrences.length === 0) return;

  const subs = await pool.query(
    `SELECT student_id FROM availability_subscription WHERE menu_item_id = $1`,
    [menuItemId],
  );

  for (const sub of subs.rows) {
    await notificationQueue.add('availability_prediction', {
      studentId: sub.student_id,
      menuItemId,
      predictedOccurrences: soonOccurrences,
    });
  }
}

/**
 * Enqueue availability_confirmed notifications for all subscribers when the
 * item appears on a confirmed upcoming menu (Req 17.8).
 */
export async function notifySubscribersConfirmed(
  menuItemId: string,
  date: string,
  mealPeriod: string,
  diningHallId: string,
): Promise<void> {
  const subs = await pool.query(
    `SELECT student_id FROM availability_subscription WHERE menu_item_id = $1`,
    [menuItemId],
  );

  for (const sub of subs.rows) {
    await notificationQueue.add('availability_confirmed', {
      studentId: sub.student_id,
      menuItemId,
      date,
      mealPeriod,
      diningHallId,
    });
  }
}
