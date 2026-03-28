import { Worker } from 'bullmq';
import { trendingRefreshQueue } from './queues';
import { computeTrendingFeed } from '../services/trendingFeedService';
import { redis } from '../cache/redis';

const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
const CACHE_KEY = 'trending';
const CACHE_TTL = 60;

export function startTrendingWorker() {
  const worker = new Worker(
    'trending.refresh',
    async () => {
      const items = await computeTrendingFeed();
      await redis.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify(items));
    },
    { connection }
  );

  worker.on('failed', (job, err) => {
    console.error(`trending.refresh job ${job?.id} failed:`, err);
  });

  // Schedule repeating job every 60 seconds
  trendingRefreshQueue.add(
    'refresh',
    {},
    { repeat: { every: 60000 } }
  );

  return worker;
}
