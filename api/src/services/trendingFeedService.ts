import { pool } from '../db/client';

export interface TrendingItem {
  id: string;
  name: string;
  dining_hall_id: string;
  dining_hall_name: string;
  recency_score: number;
  rating_count_60min: number;
}

export async function getTrendingFeed(): Promise<{ items: TrendingItem[]; insufficient_activity: boolean }> {
  const result = await pool.query(`
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
  const items = result.rows;
  return { items, insufficient_activity: items.length < 3 };
}
