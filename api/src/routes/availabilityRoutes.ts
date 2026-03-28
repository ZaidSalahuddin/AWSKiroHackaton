/**
 * Availability History and Prediction Routes
 * Requirements: 17.1–17.9
 */

import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import * as availabilityService from '../services/availabilityService';

const router = Router();

/**
 * GET /api/menu-items/:id/availability-history
 * Returns the full appearance log for a menu item.
 */
router.get('/menu-items/:id/availability-history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const history = await availabilityService.getAvailabilityHistory(req.params.id);
    return res.json(history);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/menu-items/:id/availability-prediction
 * Returns predicted next appearance(s) or { prediction_available: false }.
 */
router.get('/menu-items/:id/availability-prediction', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const prediction = await availabilityService.getAvailabilityPrediction(req.params.id);
    return res.json(prediction);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/menu-items/:id/subscribe
 * Subscribe the authenticated student to availability notifications.
 */
router.post('/menu-items/:id/subscribe', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await availabilityService.subscribeToItem(req.studentId!, req.params.id);
    return res.status(201).json({ subscribed: true, menu_item_id: req.params.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/menu-items/:id/subscribe
 * Unsubscribe the authenticated student from availability notifications.
 */
router.delete('/menu-items/:id/subscribe', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await availabilityService.unsubscribeFromItem(req.studentId!, req.params.id);
    return res.status(200).json({ subscribed: false, menu_item_id: req.params.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
