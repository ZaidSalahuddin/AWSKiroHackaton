import { pool } from '../db/client';

// Half-life of 15 minutes: λ = ln(2) / 15
const LAMBDA = Math.LN2 / 15;
const SENSOR_WEIGHT_MULTIPLIER = 5;
const WINDOW_MINUTES = 30;

export interface WaitTimeEstimate {
  minutes: number | null;
  unknown: boolean;
}

export interface WaitTimeReportRow {
  minutes: number;
  source: 'crowdsource' | 'sensor';
  age_minutes: number;
}

/**
 * Pure function: compute exponential-decay weighted average from a list of reports.
 * Each report has { minutes, source, age_minutes }.
 * Returns { minutes, unknown } — unknown=true when reports array is empty.
 */
export function computeWeightedAverage(reports: WaitTimeReportRow[]): WaitTimeEstimate {
  if (reports.length === 0) {
    return { minutes: null, unknown: true };
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const report of reports) {
    const decay = Math.exp(-LAMBDA * report.age_minutes);
    const weight = decay * (report.source === 'sensor' ? SENSOR_WEIGHT_MULTIPLIER : 1);
    weightedSum += weight * report.minutes;
    totalWeight += weight;
  }

  return {
    minutes: Math.round(weightedSum / totalWeight),
    unknown: false,
  };
}

export async function submitWaitTimeReport(
  studentId: string,
  diningHallId: string,
  minutes: number,
  source: 'crowdsource' | 'sensor' = 'crowdsource'
) {
  const result = await pool.query(
    `INSERT INTO wait_time_report (dining_hall_id, student_id, minutes, source)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [diningHallId, studentId, minutes, source]
  );
  return result.rows[0];
}

export async function getWaitTimeEstimate(diningHallId: string): Promise<WaitTimeEstimate> {
  const result = await pool.query(
    `SELECT minutes, source,
            EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 AS age_minutes
     FROM wait_time_report
     WHERE dining_hall_id = $1
       AND created_at >= NOW() - INTERVAL '${WINDOW_MINUTES} minutes'
     ORDER BY created_at DESC`,
    [diningHallId]
  );

  const reports: WaitTimeReportRow[] = result.rows.map((r) => ({
    minutes: Number(r.minutes),
    source: r.source as 'crowdsource' | 'sensor',
    age_minutes: Number(r.age_minutes),
  }));

  return computeWeightedAverage(reports);
}
