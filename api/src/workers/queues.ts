import { Queue } from 'bullmq';

const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };

export const recencyRecomputeQueue = new Queue('recency.recompute', { connection });
export const trendingRefreshQueue  = new Queue('trending.refresh',  { connection });
export const availabilityPredictQueue = new Queue('availability.predict', { connection });
export const notificationQueue     = new Queue('notification',      { connection });
