import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import * as hokiePassportService from '../services/hokiePassportService';

const router = Router();

// GET /api/hokie-passport/balance
router.get('/hokie-passport/balance', authMiddleware, async (req: AuthRequest, res: Response) => {
  const balance = await hokiePassportService.getBalance(req.studentId!);
  if (!balance) {
    return res.status(404).json({ error: 'hokie_passport_not_connected' });
  }
  return res.json(balance);
});

// POST /api/hokie-passport/connect
router.post('/hokie-passport/connect', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'token is required' });
  }
  try {
    const balance = await hokiePassportService.connectHokiePassport(req.studentId!, token);
    return res.json(balance ?? { connected: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/hokie-passport/refresh
router.post('/hokie-passport/refresh', authMiddleware, async (req: AuthRequest, res: Response) => {
  const balance = await hokiePassportService.refreshBalance(req.studentId!);
  if (!balance) {
    return res.status(404).json({ error: 'hokie_passport_not_connected' });
  }
  return res.json(balance);
});

export default router;
