import { Router, Request, Response } from 'express';
import * as authService from '../services/authService';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  const { email, username, display_name, password } = req.body;
  if (!email || !username || !display_name || !password) {
    return res.status(400).json({ error: 'email, username, display_name, and password are required' });
  }
  try {
    const result = await authService.register(email, username, display_name, password);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'email or username already taken' });
    }
    return res.status(500).json({ error: 'internal server error' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  try {
    const result = await authService.login(email, password);
    return res.json(result);
  } catch (err: any) {
    const status = err.status ?? 500;
    return res.status(status).json({ error: err.message });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  return res.json({ success: true });
});

export default router;
