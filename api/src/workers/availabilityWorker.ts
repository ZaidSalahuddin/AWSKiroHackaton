/**
 * Availability Prediction Worker
 * Daily BullMQ cron job that recomputes predictions and enqueues
 * availability_prediction notifications for subscribers (Req 17.9, 17.7).
 */

import { Worker } from 'bullmq';
import { availabilityPredictQueue } from './queues';
import { recomputePredictions, notifySubscribersIfPredictedSoon } from '../services/availabilityService';
import { pool } from '../db/client';

const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };

export function startAvailabilityWorker() {
  const worker = new Worker(
    'availability.predict',
    async (job) => {
      if (job.name === 'recompute') {
        // Recompute predictions for all items
        await recomputePredictions();

        // After recomputing, check each item and notify subscribers if predicted soon
        const items = await pool.query(`SELECT id FROM menu_item`);
        for (const row of items.rows) {
          await notifySubscribersIfPredictedSoon(row.id);
        }
      }
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    console.error(`availability.predict job ${job?.id} failed:`, err);
  });

  // Schedule daily cron at midnight UTC
  availabilityPredictQueue.add(
    'recompute',
    {},
    { repeat: { pattern: '0 0 * * *' } },
  );

  return worker;
}
