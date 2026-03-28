import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import * as gamificationService from '../services/gamificationService';

const router = Router();

// GET /api/students/:id/gamification — streak, badges, leaderboard rank
router.get('/students/:id/gamification', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await gamificationService.getGamificationProfile(req.params.id);
    return res.json(profile);
  } catch (err: any) {
    return res.status(err.status ?? 500).json({ error: err.code ?? err.message });
  }
});

// GET /api/leaderboard/weekly — top 20 students by ratings this week
router.get('/leaderboard/weekly', authMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const leaderboard = await gamificationService.getWeeklyLeaderboard();
    return res.json({ leaderboard });
  } catch (err: any) {
    return res.status(err.status ?? 500).json({ error: err.code ?? err.message });
  }
});

export default router;
