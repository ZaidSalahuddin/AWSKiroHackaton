import { pool } from '../db/client';
import { DietaryProfile } from '../types';

export async function getStudent(id: string) {
  const result = await pool.query(
    `SELECT id, vt_email, username, display_name, dietary_profile,
            nutrition_targets, leaderboard_opt_out, privacy_setting,
            hokie_passport_connected, created_at
     FROM student WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function updateStudent(
  id: string,
  fields: {
    display_name?: string;
    privacy_setting?: 'public' | 'friends' | 'private';
    leaderboard_opt_out?: boolean;
  },
) {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (fields.display_name !== undefined) {
    setClauses.push(`display_name = $${idx++}`);
    values.push(fields.display_name);
  }
  if (fields.privacy_setting !== undefined) {
    setClauses.push(`privacy_setting = $${idx++}`);
    values.push(fields.privacy_setting);
  }
  if (fields.leaderboard_opt_out !== undefined) {
    setClauses.push(`leaderboard_opt_out = $${idx++}`);
    values.push(fields.leaderboard_opt_out);
  }

  if (setClauses.length === 0) return getStudent(id);

  values.push(id);
  const result = await pool.query(
    `UPDATE student SET ${setClauses.join(', ')}
     WHERE id = $${idx}
     RETURNING id, vt_email, username, display_name, dietary_profile,
               nutrition_targets, leaderboard_opt_out, privacy_setting,
               hokie_passport_connected, created_at`,
    values,
  );
  return result.rows[0] ?? null;
}

export async function getDietaryProfile(studentId: string): Promise<DietaryProfile | null> {
  const result = await pool.query(
    `SELECT dietary_profile FROM student WHERE id = $1`,
    [studentId],
  );
  return result.rows[0]?.dietary_profile ?? null;
}

export async function updateDietaryProfile(
  studentId: string,
  profile: DietaryProfile,
): Promise<DietaryProfile | null> {
  const result = await pool.query(
    `UPDATE student SET dietary_profile = $1
     WHERE id = $2
     RETURNING dietary_profile`,
    [JSON.stringify(profile), studentId],
  );
  return result.rows[0]?.dietary_profile ?? null;
}
