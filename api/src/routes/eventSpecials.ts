import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import * as eventSpecialsService from '../services/eventSpecialsService';

const router = Router();

/**
 * POST /api/event-specials — staff role required
 */
router.post('/event-specials', authMiddleware, async (req: AuthRequest, res: Response) => {
  // Role check: only staff can publish specials
  if (req.role !== 'staff' && req.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }

  const { dining_hall_id, title, description, event_date, meal_period } = req.body;
  if (!dining_hall_id || !title || !event_date || !meal_period) {
    return res.status(400).json({ error: 'dining_hall_id, title, event_date, and meal_period are required' });
  }

  try {
    const special = await eventSpecialsService.publishEventSpecial(
      dining_hall_id,
      title,
      description ?? '',
      event_date,
      meal_period,
      req.studentId!,
    );
    return res.status(201).json(special);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/dining-halls/:id/specials
 */
router.get('/dining-halls/:id/specials', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const specials = await eventSpecialsService.getSpecialsForHall(req.params.id);
    return res.json(specials);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
