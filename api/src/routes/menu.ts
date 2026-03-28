import { Router, Request, Response } from 'express';
import * as menuService from '../services/menuService';
import * as ratingService from '../services/ratingService';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import {
  dietaryFilterMiddleware,
  applyDietaryFilter,
  injectAllergenWarning,
} from '../middleware/dietaryFilter';

const router = Router();

router.get('/dining-halls', async (_req: Request, res: Response) => {
  const halls = await menuService.getDiningHalls();
  return res.json(halls);
});

router.get('/dining-halls/:id/menu', async (req: Request, res: Response) => {
  const { date, period } = req.query as { date?: string; period?: string };
  const menu = await menuService.getDiningHallMenu(req.params.id, date, period);
  if ((menu as any).available === false) {
    return res.status(404).json(menu);
  }
  return res.json(menu);
});

// GET /api/menu-items/:id — inject allergen warning on detail
router.get(
  '/menu-items/:id',
  authMiddleware,
  dietaryFilterMiddleware,
  async (req: AuthRequest, res: Response) => {
    const item = await menuService.getMenuItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });
    const result = injectAllergenWarning(item, req.dietaryProfile ?? null);
    return res.json(result);
  },
);

// GET /api/menu-items/:id/ratings (paginated)
router.get('/menu-items/:id/ratings', async (req: Request, res: Response) => {
  const page = parseInt((req.query.page as string) ?? '1', 10);
  const limit = parseInt((req.query.limit as string) ?? '20', 10);
  const data = await ratingService.getRatingsForItem(req.params.id, page, limit);
  return res.json(data);
});

// GET /api/dining-halls/:id/ranked-items — apply dietary filter
router.get(
  '/dining-halls/:id/ranked-items',
  authMiddleware,
  dietaryFilterMiddleware,
  async (req: AuthRequest, res: Response) => {
    const items = await ratingService.getRankedItems(req.params.id);
    const filtered = applyDietaryFilter(items, req.dietaryProfile ?? null);
    return res.json(filtered);
  },
);

export default router;
