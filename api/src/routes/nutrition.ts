import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import * as nutritionalTrackingService from '../services/nutritionalTrackingService';

const router = Router();

// POST /api/meal-logs
router.post('/meal-logs', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { meal_period, log_date, items } = req.body;

  if (!meal_period || !log_date || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'meal_period, log_date, and items are required' });
  }

  try {
    const log = await nutritionalTrackingService.logMeal(
      req.studentId!,
      meal_period,
      log_date,
      items,
    );
    return res.status(201).json(log);
  } catch (err: any) {
    const status = err.status ?? 500;
    return res.status(status).json({ error: err.code ?? err.message });
  }
});

// GET /api/meal-logs?date=YYYY-MM-DD&range=daily|weekly
router.get('/meal-logs', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { date, range = 'daily' } = req.query as { date?: string; range?: string };

  if (!date) {
    return res.status(400).json({ error: 'date query parameter is required' });
  }
  if (range !== 'daily' && range !== 'weekly') {
    return res.status(400).json({ error: 'range must be daily or weekly' });
  }

  try {
    const result = await nutritionalTrackingService.getMealLogs(
      req.studentId!,
      date,
      range,
    );
    return res.json(result);
  } catch (err: any) {
    const status = err.status ?? 500;
    return res.status(status).json({ error: err.code ?? err.message });
  }
});

// PUT /api/nutrition-targets
router.put('/nutrition-targets', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg } = req.body;

  if (
    calories == null || protein_g == null || carbs_g == null ||
    fat_g == null || fiber_g == null || sodium_mg == null
  ) {
    return res.status(400).json({ error: 'calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg are required' });
  }

  try {
    const targets = await nutritionalTrackingService.updateNutritionTargets(req.studentId!, {
      calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg,
    });
    return res.json(targets);
  } catch (err: any) {
    const status = err.status ?? 500;
    return res.status(status).json({ error: err.code ?? err.message });
  }
});

export default router;
