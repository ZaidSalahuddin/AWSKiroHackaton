import { Worker } from 'bullmq';
import { recomputeItemScore } from '../services/recencyScoreEngine';

const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };

export function startRecencyWorker() {
  const worker = new Worker(
    'recency.recompute',
    async (job) => {
      const { menuItemId } = job.data;
      await recomputeItemScore(menuItemId);
    },
    { connection, concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    console.error(`recency.recompute job ${job?.id} failed:`, err);
  });

  return worker;
}
