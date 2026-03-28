import axios from 'axios';
import { pool } from '../db/client';
import { redis } from '../cache/redis';
import { EventEmitter } from 'events';
import { healthScoreOrNull } from './healthScoreService';

export const menuEvents = new EventEmitter();

const MENU_CACHE_TTL = 300; // 5 min in seconds

// Poll VT Dining Services every 5 minutes
export function startMenuPoller() {
  pollMenus();
  setInterval(pollMenus, 5 * 60 * 1000);
}

async function pollMenus() {
  try {
    const baseUrl = process.env.VT_DINING_API_URL;
    if (!baseUrl) return;

    const { data } = await axios.get(`${baseUrl}/menus`);
    await ingestMenuData(data);
  } catch (err) {
    console.error('Menu poll failed:', err);
  }
}

export async function ingestMenuData(menuData: any[]) {
  for (const item of menuData) {
    const result = await pool.query(
      `INSERT INTO menu_item (id, dining_hall_id, name, description, station, meal_period, menu_date, allergens, allergen_data_complete, nutrition)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (dining_hall_id, name, meal_period, menu_date) DO UPDATE
       SET description = EXCLUDED.description, station = EXCLUDED.station,
           allergens = EXCLUDED.allergens, nutrition = EXCLUDED.nutrition
       RETURNING id, dining_hall_id, menu_date, meal_period`,
      [
        item.dining_hall_id,
        item.name,
        item.description ?? '',
        item.station ?? 'General',
        item.meal_period,
        item.menu_date,
        JSON.stringify(item.allergens ?? []),
        item.allergen_data_complete ?? true,
        item.nutrition ? JSON.stringify(item.nutrition) : null,
      ]
    );

    if (result.rows[0]) {
      const row = result.rows[0];

      // Compute and persist health_score
      const score = healthScoreOrNull(item.nutrition ?? null);
      await pool.query(
        `UPDATE menu_item SET health_score = $1 WHERE id = $2`,
        [score, row.id]
      );

      await pool.query(
        `INSERT INTO availability_log (menu_item_id, dining_hall_id, appeared_on, meal_period)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (menu_item_id, dining_hall_id, appeared_on, meal_period) DO NOTHING`,
        [row.id, row.dining_hall_id, row.menu_date, row.meal_period]
      );
    }
  }

  // Invalidate menu cache
  const keys = await redis.keys('menu:*');
  if (keys.length > 0) await redis.del(keys);

  menuEvents.emit('menu.updated');
}

export async function getDiningHalls() {
  const cacheKey = 'dining-halls';
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const result = await pool.query('SELECT * FROM dining_hall ORDER BY name');
  const halls = result.rows;
  await redis.setEx(cacheKey, MENU_CACHE_TTL, JSON.stringify(halls));
  return halls;
}

export async function getDiningHallMenu(hallId: string, date?: string, period?: string) {
  const today = date ?? new Date().toISOString().split('T')[0];
  const cacheKey = `menu:${hallId}:${today}:${period ?? 'all'}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {}

  try {
    let query = `SELECT * FROM menu_item WHERE dining_hall_id = $1 AND menu_date = $2`;
    const params: any[] = [hallId, today];

    if (period) {
      query += ` AND meal_period = $3`;
      params.push(period);
    }

    query += ` ORDER BY station, name`;
    const result = await pool.query(query, params);

    // Group by station (Task 4.1)
    const grouped = groupByStation(result.rows);
    const response = { stations: grouped, stale: false };

    await redis.setEx(cacheKey, MENU_CACHE_TTL, JSON.stringify(response));
    return response;
  } catch (err) {
    // Try to return stale cache
    const keys = await redis.keys(`menu:${hallId}:*`);
    if (keys.length > 0) {
      const stale = await redis.get(keys[0]);
      if (stale) {
        const data = JSON.parse(stale);
        return { ...data, stale: true };
      }
    }
    return { available: false };
  }
}

// Task 4.1: Group items by station, ensuring no null stations
export function groupByStation(items: any[]): Record<string, any[]> {
  // Use Object.create(null) to avoid prototype pollution (e.g. station named "valueOf")
  const grouped: Record<string, any[]> = Object.create(null);
  for (const item of items) {
    const station = item.station ?? 'General';
    if (!Object.prototype.hasOwnProperty.call(grouped, station)) grouped[station] = [];
    grouped[station].push({ ...item, station });
  }
  return grouped;
}

export async function getMenuItem(itemId: string) {
  const cacheKey = `menu-item:${itemId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const result = await pool.query('SELECT * FROM menu_item WHERE id = $1', [itemId]);
  const item = result.rows[0] ?? null;
  if (item) {
    await redis.setEx(cacheKey, MENU_CACHE_TTL, JSON.stringify(item));
  }
  return item;
}
