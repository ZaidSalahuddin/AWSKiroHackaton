import axios from 'axios';
import { redis } from '../cache/redis';
import { pool } from '../db/client';

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const LOW_BALANCE_THRESHOLD = 5;

export interface HokiePassportBalance {
  meal_swipes_remaining: number;
  dining_dollars_balance: number;
  low_balance_warning: boolean;
  stale: boolean;
}

function cacheKey(studentId: string): string {
  return `hokie_passport:${studentId}`;
}

/**
 * Pure helper: compute low_balance_warning flag.
 */
export function computeLowBalanceWarning(mealSwipesRemaining: number): boolean {
  return mealSwipesRemaining < LOW_BALANCE_THRESHOLD;
}

/**
 * Fetch balance from the Hokie Passport API.
 * Returns null if the service is unavailable or token is missing.
 */
async function fetchFromAPI(
  token: string,
): Promise<{ meal_swipes_remaining: number; dining_dollars_balance: number } | null> {
  const apiUrl = process.env.HOKIE_PASSPORT_API_URL;
  if (!apiUrl) {
    console.warn('[HokiePassport] HOKIE_PASSPORT_API_URL not set');
    return null;
  }
  const response = await axios.get(`${apiUrl}/balance`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10_000,
  });
  return {
    meal_swipes_remaining: response.data.meal_swipes_remaining ?? 0,
    dining_dollars_balance: response.data.dining_dollars_balance ?? 0,
  };
}

export async function getBalance(studentId: string): Promise<HokiePassportBalance | null> {
  // Check if student has connected Hokie Passport
  const studentResult = await pool.query(
    `SELECT hokie_passport_connected, hokie_passport_token_enc FROM student WHERE id = $1`,
    [studentId],
  );
  if ((studentResult.rowCount ?? 0) === 0) return null;
  const { hokie_passport_connected, hokie_passport_token_enc } = studentResult.rows[0];
  if (!hokie_passport_connected || !hokie_passport_token_enc) return null;

  const key = cacheKey(studentId);

  // Try API first
  try {
    const fresh = await fetchFromAPI(hokie_passport_token_enc);
    if (fresh) {
      await redis.set(key, JSON.stringify(fresh), { EX: CACHE_TTL_SECONDS });
      return {
        ...fresh,
        low_balance_warning: computeLowBalanceWarning(fresh.meal_swipes_remaining),
        stale: false,
      };
    }
  } catch (err) {
    console.warn('[HokiePassport] API fetch failed:', err);
  }

  // Fall back to cache
  const cached = await redis.get(key);
  if (cached) {
    const parsed = JSON.parse(cached);
    return {
      ...parsed,
      low_balance_warning: computeLowBalanceWarning(parsed.meal_swipes_remaining),
      stale: true,
    };
  }

  return null;
}

export async function connectHokiePassport(studentId: string, token: string) {
  await pool.query(
    `UPDATE student SET hokie_passport_connected = true, hokie_passport_token_enc = $1 WHERE id = $2`,
    [token, studentId],
  );
  // Immediately fetch and cache balance
  return getBalance(studentId);
}

export async function refreshBalance(studentId: string) {
  // Invalidate cache and re-fetch
  await redis.del(cacheKey(studentId));
  return getBalance(studentId);
}
