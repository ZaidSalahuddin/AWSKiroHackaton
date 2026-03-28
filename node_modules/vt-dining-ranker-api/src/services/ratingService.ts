import { pool } from '../db/client';
import { recencyRecomputeQueue } from '../workers/queues';

export interface SubmitRatingInput {
  studentId: string;
  menuItemId: string;
  stars: number;
  mealPeriod: string;
  mealDate: string;
  checkInVerified: boolean;
  confirmConsumed?: boolean; // explicit confirmation flag
  checkInTimestamp?: Date;   // when student checked in
}

export async function submitRating(input: SubmitRatingInput) {
  const {
    studentId, menuItemId, stars, mealPeriod, mealDate,
    checkInVerified, confirmConsumed, checkInTimestamp,
  } = input;

  // Requirement 2.4: must have checked in within 90 min OR explicit confirmation
  if (!confirmConsumed) {
    if (!checkInVerified || !checkInTimestamp) {
      throw Object.assign(new Error('check_in_required'), { status: 400, code: 'check_in_required' });
    }
    const minutesAgo = (Date.now() - checkInTimestamp.getTime()) / (1000 * 60);
    if (minutesAgo > 90) {
      throw Object.assign(new Error('check_in_required'), { status: 400, code: 'check_in_required' });
    }
  }

  try {
    const result = await pool.query(
      `INSERT INTO rating (student_id, menu_item_id, stars, meal_period, meal_date, check_in_verified)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [studentId, menuItemId, stars, mealPeriod, mealDate, checkInVerified || !!confirmConsumed]
    );

    const rating = result.rows[0];

    // Enqueue recency recompute job (Requirement 2.1)
    await recencyRecomputeQueue.add('recompute', { menuItemId }, { attempts: 3 });

    return rating;
  } catch (err: any) {
    if (err.code === '23505') {
      // Unique constraint violation: duplicate rating (Requirement 2.6)
      throw Object.assign(new Error('already_rated'), { status: 409, code: 'already_rated' });
    }
    throw err;
  }
}

export async function getRatingsForItem(menuItemId: string, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const result = await pool.query(
    `SELECT r.*, s.username, s.display_name
     FROM rating r
     JOIN student s ON s.id = r.student_id
     WHERE r.menu_item_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [menuItemId, limit, offset]
  );
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM rating WHERE menu_item_id = $1`,
    [menuItemId]
  );
  return {
    ratings: result.rows,
    total: parseInt(countResult.rows[0].count, 10),
    page,
    limit,
  };
}

export async function getRankedItems(diningHallId: string) {
  // Return items for today sorted by recency_score descending (Requirement 2.3)
  const today = new Date().toISOString().split('T')[0];
  const result = await pool.query(
    `SELECT * FROM menu_item
     WHERE dining_hall_id = $1
       AND menu_date = $2
     ORDER BY recency_score DESC`,
    [diningHallId, today]
  );
  return result.rows;
}
