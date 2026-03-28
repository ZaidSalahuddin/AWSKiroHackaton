import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import * as waitTimeService from '../services/waitTimeService';

const router = Router();

// POST /api/wait-time-reports
router.post('/wait-time-reports', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { dining_hall_id, minutes, source } = req.body;

  if (!dining_hall_id || minutes == null) {
    return res.status(400).json({ error: 'dining_hall_id and minutes are required' });
  }
  if (typeof minutes !== 'number' || minutes < 0) {
    return res.status(400).json({ error: 'minutes must be a non-negative number' });
  }
  if (source && source !== 'crowdsource' && source !== 'sensor') {
    return res.status(400).json({ error: 'source must be crowdsource or sensor' });
  }

  try {
    const report = await waitTimeService.submitWaitTimeReport(
      req.studentId!,
      dining_hall_id,
      minutes,
      source ?? 'crowdsource'
    );
    return res.status(201).json(report);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/dining-halls/:id/wait-time
router.get('/dining-halls/:id/wait-time', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const estimate = await waitTimeService.getWaitTimeEstimate(id);
    return res.json(estimate);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
