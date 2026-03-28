import { pool } from '../db/client';
import { socialActivityQueue } from '../workers/queues';

// ─── Pure helper ─────────────────────────────────────────────────────────────

/**
 * Returns true if the student's activity should be published to followers.
 * Private users' events are always dropped before fan-out.
 */
export function shouldPublishActivity(privacySetting: string): boolean {
  return privacySetting !== 'private';
}

// ─── Follow / Unfollow ───────────────────────────────────────────────────────

export async function followStudent(followerId: string, followeeId: string) {
  try {
    const result = await pool.query(
      `INSERT INTO follow (follower_id, followee_id)
       VALUES ($1, $2)
       RETURNING *`,
      [followerId, followeeId],
    );
    return result.rows[0];
  } catch (err: any) {
    if (err.code === '23505') {
      throw Object.assign(new Error('already_following'), { status: 409, code: 'already_following' });
    }
    throw err;
  }
}

export async function unfollowStudent(followId: string, followerId: string) {
  const result = await pool.query(
    `DELETE FROM follow WHERE id = $1 AND follower_id = $2`,
    [followId, followerId],
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error('not_found'), { status: 404, code: 'not_found' });
  }
}

// ─── Social Feed ─────────────────────────────────────────────────────────────

export async function getSocialFeed(studentId: string, page = 1, limit = 20) {
  const offset = (page - 1) * limit;

  // Ratings from followed non-private students
  const ratingsResult = await pool.query(
    `SELECT
       'rating' AS event_type,
       r.id,
       r.student_id,
       s.username,
       s.display_name,
       r.menu_item_id,
       mi.name AS menu_item_name,
       r.stars,
       r.meal_period,
       r.meal_date,
       r.created_at
     FROM rating r
     JOIN student s ON s.id = r.student_id
     JOIN menu_item mi ON mi.id = r.menu_item_id
     JOIN follow f ON f.followee_id = r.student_id
     WHERE f.follower_id = $1
       AND s.privacy_setting != 'private'
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [studentId, limit, offset],
  );

  // Meal logs from followed non-private students
  const logsResult = await pool.query(
    `SELECT
       'meal_log' AS event_type,
       ml.id,
       ml.student_id,
       s.username,
       s.display_name,
       ml.log_date,
       ml.meal_period,
       ml.nutrition_totals,
       ml.created_at
     FROM meal_log ml
     JOIN student s ON s.id = ml.student_id
     JOIN follow f ON f.followee_id = ml.student_id
     WHERE f.follower_id = $1
       AND s.privacy_setting != 'private'
     ORDER BY ml.created_at DESC
     LIMIT $2 OFFSET $3`,
    [studentId, limit, offset],
  );

  // Merge and sort by created_at descending, then paginate
  const combined = [...ratingsResult.rows, ...logsResult.rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return {
    events: combined.slice(0, limit),
    page,
    limit,
  };
}

// ─── Privacy Settings ────────────────────────────────────────────────────────

export async function updatePrivacySettings(
  studentId: string,
  setting: 'public' | 'friends' | 'private',
) {
  const result = await pool.query(
    `UPDATE student SET privacy_setting = $1 WHERE id = $2 RETURNING id, privacy_setting`,
    [setting, studentId],
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error('not_found'), { status: 404, code: 'not_found' });
  }
  return result.rows[0];
}

// ─── Activity Event Publishing ───────────────────────────────────────────────

export async function publishActivityEvent(
  studentId: string,
  eventType: 'rating' | 'meal_log',
  payload: Record<string, unknown>,
) {
  // Fetch student's privacy setting
  const result = await pool.query(
    `SELECT privacy_setting FROM student WHERE id = $1`,
    [studentId],
  );
  if (result.rowCount === 0) return;

  const { privacy_setting } = result.rows[0];

  // Drop events for private users before fan-out (Requirement 10.4)
  if (!shouldPublishActivity(privacy_setting)) return;

  await socialActivityQueue.add('fan-out', {
    studentId,
    eventType,
    privacySetting: privacy_setting,
    payload,
  });
}
