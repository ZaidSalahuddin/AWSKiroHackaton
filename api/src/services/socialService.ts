import { pool } from '../db/client';

// ─── Pure helper ─────────────────────────────────────────────────────────────

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
  const result = await pool.query(
    `SELECT ae.id, ae.student_id, ae.event_type, ae.payload, ae.created_at,
            s.username, s.display_name
     FROM activity_event ae
     JOIN student s ON s.id = ae.student_id
     JOIN follow f ON f.followee_id = ae.student_id
     WHERE f.follower_id = $1
       AND s.privacy_setting != 'private'
     ORDER BY ae.created_at DESC
     LIMIT $2 OFFSET $3`,
    [studentId, limit, offset],
  );
  return { events: result.rows, page, limit };
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
