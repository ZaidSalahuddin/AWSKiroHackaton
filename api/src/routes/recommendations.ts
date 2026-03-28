import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { dietaryFilterMiddleware } from '../middleware/dietaryFilter';
import { getRecommendations } from '../services/recommendationEngine';

const router = Router();

/**
 * GET /api/recommendations?input=
 * Returns personalized recommendations for the authenticated student.
 */
router.get(
  '/recommendations',
  authMiddleware,
  dietaryFilterMiddleware,
  async (req: AuthRequest, res: Response) => {
    const studentId = req.studentId!;
    const input = typeof req.query.input === 'string' ? req.query.input : undefined;

    try {
      const result = await getRecommendations(studentId, input, req.dietaryProfile);
      return res.json(result);
    } catch (err) {
      console.error('[Recommendations] Error:', err);
      return res.status(500).json({ error: 'Failed to generate recommendations' });
    }
  },
);

export default router;
