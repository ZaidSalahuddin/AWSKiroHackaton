import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import * as socialService from '../services/socialService';

const router = Router();

// POST /api/follows — follow a student
router.post('/follows', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { followee_id } = req.body;
  if (!followee_id) {
    return res.status(400).json({ error: 'followee_id is required' });
  }
  try {
    const follow = await socialService.followStudent(req.studentId!, followee_id);
    return res.status(201).json(follow);
  } catch (err: any) {
    return res.status(err.status ?? 500).json({ error: err.code ?? err.message });
  }
});

// DELETE /api/follows/:id — unfollow
router.delete('/follows/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await socialService.unfollowStudent(req.params.id, req.studentId!);
    return res.status(204).send();
  } catch (err: any) {
    return res.status(err.status ?? 500).json({ error: err.code ?? err.message });
  }
});

// GET /api/social-feed — paginated activity feed
router.get('/social-feed', authMiddleware, async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  try {
    const feed = await socialService.getSocialFeed(req.studentId!, page, limit);
    return res.json(feed);
  } catch (err: any) {
    return res.status(err.status ?? 500).json({ error: err.code ?? err.message });
  }
});

// PUT /api/privacy-settings — set visibility
router.put('/privacy-settings', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { privacy_setting } = req.body;
  if (!['public', 'friends', 'private'].includes(privacy_setting)) {
    return res.status(400).json({ error: 'privacy_setting must be public, friends, or private' });
  }
  try {
    const updated = await socialService.updatePrivacySettings(req.studentId!, privacy_setting);
    return res.json(updated);
  } catch (err: any) {
    return res.status(err.status ?? 500).json({ error: err.code ?? err.message });
  }
});

export default router;
