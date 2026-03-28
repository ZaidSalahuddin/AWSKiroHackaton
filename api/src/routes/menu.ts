import { Router, Request, Response } from 'express';
import * as menuService from '../services/menuService';
import * as ratingService from '../services/ratingService';

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

router.get('/menu-items/:id', async (req: Request, res: Response) => {
  const item = await menuService.getMenuItem(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  return res.json(item);
});

// GET /api/menu-items/:id/ratings (paginated)
router.get('/menu-items/:id/ratings', async (req: Request, res: Response) => {
  const page = parseInt((req.query.page as string) ?? '1', 10);
  const limit = parseInt((req.query.limit as string) ?? '20', 10);
  const data = await ratingService.getRatingsForItem(req.params.id, page, limit);
  return res.json(data);
});

// GET /api/dining-halls/:id/ranked-items
router.get('/dining-halls/:id/ranked-items', async (req: Request, res: Response) => {
  const items = await ratingService.getRankedItems(req.params.id);
  return res.json(items);
});

export default router;
