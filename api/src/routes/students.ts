import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import * as studentService from '../services/studentService';

const router = Router();

router.use(authMiddleware);

router.get('/me/dietary-profile', async (req: AuthRequest, res: Response) => {
  const profile = await studentService.getDietaryProfile(req.studentId!);
  if (profile === null) return res.status(404).json({ error: 'not found' });
  return res.json(profile);
});

router.put('/me/dietary-profile', async (req: AuthRequest, res: Response) => {
  const profile = await studentService.updateDietaryProfile(req.studentId!, req.body);
  if (profile === null) return res.status(404).json({ error: 'not found' });
  return res.json(profile);
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const student = await studentService.getStudent(req.params.id);
  if (!student) return res.status(404).json({ error: 'not found' });
  return res.json(student);
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  if (req.studentId !== req.params.id) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { display_name, privacy_setting, leaderboard_opt_out } = req.body;
  const student = await studentService.updateStudent(req.params.id, {
    display_name,
    privacy_setting,
    leaderboard_opt_out,
  });
  if (!student) return res.status(404).json({ error: 'not found' });
  return res.json(student);
});

export default router;
