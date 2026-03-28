import axios from 'axios';
import { pool } from '../db/client';
import { healthScoreOrNull } from './healthScoreService';

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
       RETURNING id`,
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
      const { id } = result.rows[0];
      const score = healthScoreOrNull(item.nutrition ?? null);
      await pool.query(
        `UPDATE menu_item SET health_score = $1 WHERE id = $2`,
        [score, id]
      );
    }
  }
}

export async function getDiningHalls() {
  const result = await pool.query('SELECT * FROM dining_hall ORDER BY name');
  return result.rows;
}

export async function getDiningHallMenu(hallId: string, date?: string, period?: string) {
  const today = date ?? new Date().toISOString().split('T')[0];

  try {
    let query = `SELECT * FROM menu_item WHERE dining_hall_id = $1 AND menu_date = $2`;
    const params: any[] = [hallId, today];

    if (period) {
      query += ` AND meal_period = $3`;
      params.push(period);
    }

    query += ` ORDER BY station, name`;
    const result = await pool.query(query, params);
    const grouped = groupByStation(result.rows);
    return { stations: grouped, stale: false };
  } catch {
    return { available: false };
  }
}

export async function getMenuItem(itemId: string) {
  const result = await pool.query('SELECT * FROM menu_item WHERE id = $1', [itemId]);
  return result.rows[0] ?? null;
}

// Pure function: group items by station, ensuring no null stations
export function groupByStation(items: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = Object.create(null);
  for (const item of items) {
    const station = item.station ?? 'General';
    if (!Object.prototype.hasOwnProperty.call(grouped, station)) grouped[station] = [];
    grouped[station].push({ ...item, station });
  }
  return grouped;
}
