import { pool } from '../db/client';

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

export function shouldAwardStreakBadge(streak: number): string | null {
  if (streak === 7) return 'streak_7';
  if (streak === 30) return 'streak_30';
  if (streak === 100) return 'streak_100';
  return null;
}

export function isFoodieExplorerEarned(
  ratings: Array<{ date: Date; itemId: string }>,
): boolean {
  if (ratings.length < 10) return false;

  const sorted = [...ratings].sort((a, b) => a.date.getTime() - b.date.getTime());

  for (let i = 0; i < sorted.length; i++) {
    const windowStart = sorted[i].date.getTime();
    const windowEnd = windowStart + 7 * 24 * 60 * 60 * 1000;

    const distinctItems = new Set<string>();
    for (let j = i; j < sorted.length; j++) {
      if (sorted[j].date.getTime() > windowEnd) break;
      distinctItems.add(sorted[j].itemId);
    }

    if (distinctItems.size >= 10) return true;
  }

  return false;
}

// ─── Streak computation at read time ─────────────────────────────────────────

async function computeStreak(studentId: string): Promise<number> {
  const result = await pool.query(
    `SELECT DISTINCT log_date FROM meal_log
     WHERE student_id = $1 AND deleted = false
     ORDER BY log_date DESC`,
    [studentId]
  );
  const dates = result.rows.map((r: any) => r.log_date as string);
  if (dates.length === 0) return 0;

  let streak = 0;
  let expected = new Date().toISOString().slice(0, 10);
  for (const d of dates) {
    if (d === expected) {
      streak++;
      const prev = new Date(expected);
      prev.setDate(prev.getDate() - 1);
      expected = prev.toISOString().slice(0, 10);
    } else {
      break;
    }
  }
  return streak;
}

// ─── Badge award ──────────────────────────────────────────────────────────────

export async function awardBadge(studentId: string, badgeType: string): Promise<void> {
  const existing = await pool.query(
    `SELECT id FROM badge WHERE student_id = $1 AND badge_type = $2`,
    [studentId, badgeType],
  );
  if ((existing.rowCount ?? 0) > 0) return;

  await pool.query(
    `INSERT INTO badge (student_id, badge_type) VALUES ($1, $2)`,
    [studentId, badgeType],
  );
}

// ─── Foodie Explorer check ────────────────────────────────────────────────────

export async function checkFoodieExplorer(studentId: string): Promise<void> {
  const result = await pool.query(
    `SELECT menu_item_id AS "itemId", created_at AS date
     FROM rating
     WHERE student_id = $1
     ORDER BY created_at ASC`,
    [studentId],
  );

  const ratings = result.rows.map((r: { itemId: string; date: string | Date }) => ({
    itemId: r.itemId,
    date: new Date(r.date),
  }));

  if (isFoodieExplorerEarned(ratings)) {
    await awardBadge(studentId, 'foodie_explorer');
  }
}

// ─── Gamification profile ─────────────────────────────────────────────────────

export async function getGamificationProfile(studentId: string): Promise<{
  streak: number;
  badges: Array<{ id: string; badge_type: string; awarded_at: Date }>;
  leaderboard_rank: number | null;
}> {
  const studentResult = await pool.query(
    `SELECT leaderboard_opt_out FROM student WHERE id = $1`,
    [studentId],
  );
  if ((studentResult.rowCount ?? 0) === 0) {
    throw Object.assign(new Error('not_found'), { status: 404, code: 'not_found' });
  }

  const { leaderboard_opt_out } = studentResult.rows[0];

  const streak = await computeStreak(studentId);

  // Award streak badge if milestone reached
  const badgeType = shouldAwardStreakBadge(streak);
  if (badgeType) {
    await awardBadge(studentId, badgeType);
  }

  const badgesResult = await pool.query(
    `SELECT id, badge_type, awarded_at FROM badge WHERE student_id = $1 ORDER BY awarded_at ASC`,
    [studentId],
  );

  let leaderboard_rank: number | null = null;
  if (!leaderboard_opt_out) {
    const weekStart = getWeekStart();
    const rankResult = await pool.query(
      `SELECT COUNT(*) AS rank
       FROM (
         SELECT r.student_id, COUNT(*) AS rating_count
         FROM rating r
         JOIN student s ON s.id = r.student_id
         WHERE r.created_at >= $1
           AND s.leaderboard_opt_out = false
         GROUP BY r.student_id
       ) sub
       WHERE sub.rating_count > (
         SELECT COUNT(*) FROM rating
         WHERE student_id = $2 AND created_at >= $1
       )`,
      [weekStart, studentId],
    );
    leaderboard_rank = parseInt(rankResult.rows[0].rank, 10) + 1;
  }

  return {
    streak,
    badges: badgesResult.rows,
    leaderboard_rank,
  };
}

// ─── Weekly leaderboard ───────────────────────────────────────────────────────

export async function getWeeklyLeaderboard(): Promise<
  Array<{ student_id: string; username: string; display_name: string; rating_count: number }>
> {
  const weekStart = getWeekStart();

  const result = await pool.query(
    `SELECT
       s.id AS student_id,
       s.username,
       s.display_name,
       COUNT(r.id)::int AS rating_count
     FROM student s
     JOIN rating r ON r.student_id = s.id
     WHERE r.created_at >= $1
       AND s.leaderboard_opt_out = false
     GROUP BY s.id, s.username, s.display_name
     ORDER BY rating_count DESC
     LIMIT 20`,
    [weekStart],
  );

  return result.rows;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = now.getUTCDate() - day;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff, 0, 0, 0, 0));
}
