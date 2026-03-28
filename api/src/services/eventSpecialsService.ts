import { pool } from '../db/client';
import { notificationQueue } from '../workers/queues';

export interface EventSpecial {
  id: string;
  dining_hall_id: string;
  title: string;
  description: string;
  event_date: string;
  meal_period: string;
  created_by: string;
  created_at: Date;
  is_event_special: true;
}

/**
 * Pure helper: attach the is_event_special flag to any event special object.
 */
export function markAsEventSpecial<T extends object>(item: T): T & { is_event_special: true } {
  return { ...item, is_event_special: true as const };
}

export async function publishEventSpecial(
  diningHallId: string,
  title: string,
  description: string,
  eventDate: string,
  mealPeriod: string,
  createdBy: string,
): Promise<EventSpecial> {
  const result = await pool.query(
    `INSERT INTO event_special (dining_hall_id, title, description, event_date, meal_period, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [diningHallId, title, description, eventDate, mealPeriod, createdBy],
  );
  const special = markAsEventSpecial(result.rows[0]) as EventSpecial;

  // Notify students who favorited this dining hall
  // (Favoriting is tracked via a student preference; for now enqueue a broadcast)
  await notificationQueue.add('event_special', {
    diningHallId,
    specialId: special.id,
    title,
    eventDate,
    mealPeriod,
  });

  return special;
}

export async function getSpecialsForHall(diningHallId: string): Promise<EventSpecial[]> {
  const result = await pool.query(
    `SELECT * FROM event_special
     WHERE dining_hall_id = $1
     ORDER BY event_date ASC, created_at DESC`,
    [diningHallId],
  );
  return result.rows.map((r) => markAsEventSpecial(r) as EventSpecial);
}

/**
 * Get active specials for injection into the trending feed.
 * "Active" = event_date is today or in the future.
 */
export async function getActiveSpecials(): Promise<EventSpecial[]> {
  const today = new Date().toISOString().split('T')[0];
  const result = await pool.query(
    `SELECT * FROM event_special
     WHERE event_date >= $1
     ORDER BY event_date ASC`,
    [today],
  );
  return result.rows.map((r) => markAsEventSpecial(r) as EventSpecial);
}
