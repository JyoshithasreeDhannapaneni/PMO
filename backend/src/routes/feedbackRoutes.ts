import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { feedbackController } from '../controllers/feedbackController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

const FEEDBACK_IMAGES_DIR = path.join(process.cwd(), 'uploads', 'feedback-images');
fs.mkdirSync(FEEDBACK_IMAGES_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, FEEDBACK_IMAGES_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 3 }, // 5MB per image, up to 3 per submission
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

// Shared feed — any authenticated user can see and add to it; only ADMIN moves status.
router.get('/', requireAuth, feedbackController.getAll);
router.post('/', requireAuth, upload.array('images', 3), feedbackController.create);
router.put('/:id/status', requireRole('ADMIN'), feedbackController.updateStatus);

export default router;
