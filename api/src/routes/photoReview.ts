import { Router, Response, Request } from 'express';
import multer from 'multer';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import {
  validatePhoto,
  createPhotoReview,
  reportPhoto,
} from '../services/photoReviewService';

const router = Router();

// Store in memory for now; in production, pipe to S3-compatible storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/**
 * POST /api/ratings/:id/photo
 * Upload a photo review for a rating.
 */
router.post(
  '/ratings/:id/photo',
  authMiddleware,
  upload.single('photo'),
  async (req: AuthRequest, res: Response) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'photo file is required' });
    }

    const validation = validatePhoto(file.mimetype, file.size);
    if (!validation.valid) {
      return res.status(422).json({ error: 'invalid_photo', detail: validation.error });
    }

    // In production: upload file.buffer to S3 and get CDN URL
    // For now, use a placeholder URL pattern
    const storageUrl = `https://cdn.vtdining.example.com/photos/${Date.now()}-${file.originalname}`;

    try {
      const photo = await createPhotoReview(req.params.id, storageUrl);
      return res.status(201).json(photo);
    } catch (err: any) {
      return res.status(err.status ?? 500).json({ error: err.code ?? err.message });
    }
  },
);

/**
 * POST /api/photos/:id/report
 * Report a photo as inappropriate — hides it immediately.
 */
router.post('/photos/:id/report', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const photo = await reportPhoto(req.params.id);
    return res.json(photo);
  } catch (err: any) {
    return res.status(err.status ?? 500).json({ error: err.code ?? err.message });
  }
});

export default router;
