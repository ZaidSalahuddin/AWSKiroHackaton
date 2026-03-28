import { pool } from '../db/client';
import { notificationQueue } from '../workers/queues';

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

/**
 * Returns the badge type if the streak has hit a milestone, else null.
 * Milestones: 7, 30, 100 days.
 */
export function shouldAwardStreakBadge(streak: number): string | null {
  if (streak === 7) return 'streak_7';
  if (streak === 30) return 'streak_30';
  if (streak === 100) return 'streak_100';
  return null;
}

/**
 * Returns true if the student has rated ≥10 distinct menu items within any
 * 7-day sliding window.
 *
 * @param ratings - Array of { date: Date, itemId: string } sorted by date ascending.
 */
export function isFoodieExplorerEarned(
  ratings: Array<{ date: Date; itemId: string }>,
): boolean {
  if (ratings.length < 10) return false;

  // Sort by date ascending (defensive copy)
  const sorted = [...ratings].sort((a, b) => a.date.getTime() - b.date.getTime());

  for (let i = 0; i < sorted.length; i++) {
    const windowStart = sorted[i].date.getTime();
    const windowEnd = windowStart + 7 * 24 * 60 * 60 * 1000; // +7 days in ms

    const distinctItems = new Set<string>();
    for (let j = i; j < sorted.length; j++) {
      if (sorted[j].date.getTime() > windowEnd) break;
      distinctItems.add(sorted[j].itemId);
    }

    if (distinctItems.size >= 10) return true;
  }

  return false;
}

// ─── Badge award ──────────────────────────────────────────────────────────────

/**
 * Inserts a badge for the student if they don't already have it.
 * Enqueues a `badge_awarded` notification.
 */
export async function awardBadge(studentId: string, badgeType: string): Promise<void> {
  // Idempotent: skip if already awarded
  const existing = await pool.query(
    `SELECT id FROM badge WHERE student_id = $1 AND badge_type = $2`,
    [studentId, badgeType],
  );
  if ((existing.rowCount ?? 0) > 0) return;

  await pool.query(
    `INSERT INTO badge (student_id, badge_type) VALUES ($1, $2)`,
    [studentId, badgeType],
  );

  await notificationQueue.add('badge_awarded', { studentId, badgeType });
}

// ─── Streak management ────────────────────────────────────────────────────────

/**
 * Increments the student's streak by 1 and awards a badge if a milestone is reached.
 */
export async function incrementStreak(studentId: string): Promise<void> {
  const result = await pool.query(
    `UPDATE student SET streak = streak + 1 WHERE id = $1 RETURNING streak`,
    [studentId],
  );
  if ((result.rowCount ?? 0) === 0) return;

  const newStreak: number = result.rows[0].streak;
  const badgeType = shouldAwardStreakBadge(newStreak);
  if (badgeType) {
    await awardBadge(studentId, badgeType);
  }
}

/**
 * Resets the student's streak to 0 and enqueues a `streak_broken` notification.
 */
export async function resetStreak(studentId: string): Promise<void> {
  await pool.query(`UPDATE student SET streak = 0 WHERE id = $1`, [studentId]);
  await notificationQueue.add('streak_broken', { studentId });
}

// ─── Foodie Explorer check ────────────────────────────────────────────────────

/**
 * Checks whether the student qualifies for the Foodie Explorer badge and awards
 * it if so. Looks at all ratings the student has submitted.
 */
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

// ─── Daily streak cron job ────────────────────────────────────────────────────

/**
 * Runs once per day (called by a cron scheduler).
 * For each student: if they have a meal_log for today → increment streak;
 * otherwise → reset streak.
 */
export async function runDailyStreakJob(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Students who logged a meal today
  const loggedResult = await pool.query(
    `SELECT DISTINCT student_id FROM meal_log WHERE log_date = $1`,
    [today],
  );
  const loggedIds = new Set<string>(loggedResult.rows.map((r: { student_id: string }) => r.student_id));

  // All students
  const allResult = await pool.query(`SELECT id FROM student`);

  for (const row of allResult.rows) {
    const studentId: string = row.id;
    if (loggedIds.has(studentId)) {
      await incrementStreak(studentId);
    } else {
      await resetStreak(studentId);
    }
  }
}

// ─── Gamification profile ─────────────────────────────────────────────────────

/**
 * Returns the student's streak, badges, and leaderboard rank.
 * Rank is null if the student has opted out of the leaderboard.
 */
export async function getGamificationProfile(studentId: string): Promise<{
  streak: number;
  badges: Array<{ id: string; badge_type: string; awarded_at: Date }>;
  leaderboard_rank: number | null;
}> {
  const studentResult = await pool.query(
    `SELECT streak, leaderboard_opt_out FROM student WHERE id = $1`,
    [studentId],
  );
  if ((studentResult.rowCount ?? 0) === 0) {
    throw Object.assign(new Error('not_found'), { status: 404, code: 'not_found' });
  }

  const { streak, leaderboard_opt_out } = studentResult.rows[0];

  const badgesResult = await pool.query(
    `SELECT id, badge_type, awarded_at FROM badge WHERE student_id = $1 ORDER BY awarded_at ASC`,
    [studentId],
  );

  let leaderboard_rank: number | null = null;
  if (!leaderboard_opt_out) {
    // Compute rank: count of non-opted-out students with more ratings this week + 1
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

/**
 * Returns the top 20 students by rating count this week, excluding opted-out students.
 */
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
  const day = now.getUTCDay(); // 0 = Sunday
  const diff = now.getUTCDate() - day;
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff, 0, 0, 0, 0));
  return weekStart;
}
