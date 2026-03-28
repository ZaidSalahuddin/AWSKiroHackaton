import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { DietaryProfile } from '../types';

export interface AuthRequest extends Request {
  studentId?: string;
  role?: string;
  dietaryProfile?: DietaryProfile;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'secret') as { sub: string; role?: string };
    req.studentId = payload.sub;
    req.role = payload.role ?? 'student';
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}
