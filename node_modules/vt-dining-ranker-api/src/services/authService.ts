import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db/client';

const SALT_ROUNDS = 10;
const JWT_EXPIRY = '7d';

function jwtSecret(): string {
  return process.env.JWT_SECRET ?? 'secret';
}

export function generateToken(studentId: string): string {
  return jwt.sign({ sub: studentId }, jwtSecret(), { expiresIn: JWT_EXPIRY });
}

export async function register(
  email: string,
  username: string,
  displayName: string,
  password: string,
) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = await pool.query(
    `INSERT INTO student (vt_email, username, display_name, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, vt_email, username, display_name, dietary_profile,
               nutrition_targets, leaderboard_opt_out, privacy_setting,
               hokie_passport_connected, created_at`,
    [email, username, displayName, passwordHash],
  );
  const student = result.rows[0];
  const token = generateToken(student.id);
  return { token, student };
}

export async function login(email: string, password: string) {
  const result = await pool.query(
    `SELECT id, vt_email, username, display_name, password_hash, dietary_profile,
            nutrition_targets, leaderboard_opt_out, privacy_setting,
            hokie_passport_connected, created_at
     FROM student WHERE vt_email = $1`,
    [email],
  );
  const row = result.rows[0];
  if (!row) {
    throw Object.assign(new Error('invalid credentials'), { status: 401 });
  }
  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) {
    throw Object.assign(new Error('invalid credentials'), { status: 401 });
  }
  const { password_hash: _omit, ...student } = row;
  const token = generateToken(student.id);
  return { token, student };
}
