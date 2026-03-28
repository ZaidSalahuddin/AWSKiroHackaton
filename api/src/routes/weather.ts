import { Router, Request, Response } from 'express';
import { getWeather } from '../services/weatherService';

const router = Router();

/**
 * GET /api/weather
 * Returns current weather conditions for Blacksburg, VA.
 * No authentication required.
 */
router.get('/weather', async (_req: Request, res: Response) => {
  const weather = await getWeather();

  if (!weather) {
    return res.status(503).json({ error: 'Weather data unavailable' });
  }

  return res.json(weather);
});

export default router;
