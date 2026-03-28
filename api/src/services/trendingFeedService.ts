import { pool } from '../db/client';
import { redis } from '../cache/redis';

export interface TrendingItem {
  id: string;
  name: string;
  dining_hall_id: string;
  dining_hall_name: string;
  recency_score: number;
  rating_count_60min: number;
}

const CACHE_KEY = 'trending';
const CACHE_TTL = 60; // seconds

export async function computeTrendingFeed(): Promise<TrendingItem[]> {
  const result = await pool.query<TrendingItem>(`
    SELECT
      mi.id, mi.name, mi.dining_hall_id, dh.name as dining_hall_name,
      mi.recency_score,
      COUNT(r.id)::int as rating_count_60min
    FROM menu_item mi
    JOIN dining_hall dh ON dh.id = mi.dining_hall_id
    JOIN rating r ON r.menu_item_id = mi.id
    WHERE r.created_at >= NOW() - INTERVAL '60 minutes'
    GROUP BY mi.id, mi.name, mi.dining_hall_id, dh.name, mi.recency_score
    HAVING COUNT(r.id) >= 1
    ORDER BY COUNT(r.id) * mi.recency_score DESC
    LIMIT 10
  `);
  return result.rows;
}

export async function getTrendingFeed(): Promise<{
  items: TrendingItem[];
  insufficient_activity: boolean;
}> {
  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    const items: TrendingItem[] = JSON.parse(cached);
    return { items, insufficient_activity: items.length < 3 };
  }

  const items = await computeTrendingFeed();
  await redis.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify(items));
  return { items, insufficient_activity: items.length < 3 };
}
