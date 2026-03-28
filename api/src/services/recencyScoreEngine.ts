import { pool } from '../db/client';

// λ = ln(2)/6 ensures decay(6h) = 0.5 * decay(0h), satisfying requirement 2.2
export const LAMBDA = Math.LN2 / 6;

/**
 * Exponential decay weight for a rating submitted t_hours ago.
 * decay(t) = exp(-λ * t_hours)
 */
export function decay(t_hours: number): number {
  return Math.exp(-LAMBDA * t_hours);
}

export interface RatingInput {
  stars: number;       // 1-5
  created_at: Date;
}

/**
 * Compute recency-weighted score for a set of ratings.
 * recency_score = Σ[stars_i * decay(t_i)] / Σ[decay(t_i)]
 * Returns 0 if no ratings provided.
 */
export function recencyScore(ratings: RatingInput[], now: Date = new Date()): number {
  if (ratings.length === 0) return 0;

  let weightedSum = 0;
  let weightSum = 0;

  for (const r of ratings) {
    const t_hours = (now.getTime() - r.created_at.getTime()) / (1000 * 60 * 60);
    const w = decay(t_hours);
    weightedSum += r.stars * w;
    weightSum += w;
  }

  return weightSum === 0 ? 0 : weightedSum / weightSum;
}

/**
 * Recompute and return the recency score for a menu item by fetching its ratings from DB.
 */
export async function recomputeItemScore(menuItemId: string): Promise<number> {
  const result = await pool.query(
    `SELECT stars, created_at FROM rating WHERE menu_item_id = $1`,
    [menuItemId]
  );

  const ratings: RatingInput[] = result.rows.map((r: any) => ({
    stars: r.stars,
    created_at: new Date(r.created_at),
  }));

  const score = recencyScore(ratings);

  await pool.query(
    `UPDATE menu_item SET recency_score = $1, recency_score_updated_at = now() WHERE id = $2`,
    [score, menuItemId]
  );

  return score;
}
