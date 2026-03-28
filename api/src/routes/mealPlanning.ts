import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import * as mealPlanningService from '../services/mealPlanningService';

const router = Router();

// GET /api/meal-plans
router.get('/meal-plans', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const plans = await mealPlanningService.getMealPlans(req.studentId!);
    return res.json(plans);
  } catch (err: any) {
    return res.status(err.status ?? 500).json({ error: err.code ?? err.message });
  }
});

// POST /api/meal-plans
router.post('/meal-plans', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { menu_item_id, planned_date, meal_period } = req.body;
  if (!menu_item_id || !planned_date || !meal_period) {
    return res.status(400).json({ error: 'menu_item_id, planned_date, and meal_period are required' });
  }
  try {
    const entry = await mealPlanningService.addMealPlan(
      req.studentId!,
      menu_item_id,
      planned_date,
      meal_period,
    );
    return res.status(201).json(entry);
  } catch (err: any) {
    return res.status(err.status ?? 500).json({ error: err.code ?? err.message });
  }
});

// PUT /api/meal-plans/:id/complete
router.put('/meal-plans/:id/complete', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const entry = await mealPlanningService.completeMealPlan(req.params.id, req.studentId!);
    return res.json(entry);
  } catch (err: any) {
    return res.status(err.status ?? 500).json({ error: err.code ?? err.message });
  }
});

export default router;
