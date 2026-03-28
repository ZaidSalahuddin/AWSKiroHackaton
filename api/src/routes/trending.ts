import { Router, Request, Response } from 'express';
import { getTrendingFeed } from '../services/trendingFeedService';

const router = Router();

router.get('/trending', async (_req: Request, res: Response) => {
  const result = await getTrendingFeed();
  return res.json(result);
});

export default router;
