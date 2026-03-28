import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import * as ratingService from '../services/ratingService';

const router = Router();

// POST /api/ratings
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const {
    menu_item_id, stars, meal_period, meal_date,
    confirm_consumed, check_in_timestamp,
  } = req.body;

  if (!menu_item_id || !stars || !meal_period || !meal_date) {
    return res.status(400).json({ error: 'menu_item_id, stars, meal_period, meal_date are required' });
  }

  try {
    const rating = await ratingService.submitRating({
      studentId: req.studentId!,
      menuItemId: menu_item_id,
      stars,
      mealPeriod: meal_period,
      mealDate: meal_date,
      checkInVerified: !!check_in_timestamp,
      confirmConsumed: confirm_consumed,
      checkInTimestamp: check_in_timestamp ? new Date(check_in_timestamp) : undefined,
    });
    return res.status(201).json(rating);
  } catch (err: any) {
    const status = err.status ?? 500;
    return res.status(status).json({ error: err.code ?? err.message });
  }
});

export default router;
