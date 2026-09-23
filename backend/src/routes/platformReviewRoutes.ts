import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { platformReviewController } from '../controllers/platformReviewController';
import { requireAuth } from '../middleware/auth';

const router = Router();

const REVIEW_MEDIA_DIR = path.join(process.cwd(), 'uploads', 'review-media');
fs.mkdirSync(REVIEW_MEDIA_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, REVIEW_MEDIA_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
});

// Up to 1GB per file (testimonial videos) — see the uploadMedia comment in
// frontend/src/services/api.ts for why this is multipart, not base64-in-JSON.
const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!/^(image|video)\//.test(file.mimetype)) {
      cb(new Error('Only image or video files are allowed'));
      return;
    }
    cb(null, true);
  },
});

router.get('/', requireAuth, platformReviewController.getAll);
router.get('/platforms', requireAuth, platformReviewController.getPlatforms);
router.get('/manager-options', requireAuth, platformReviewController.getManagerOptions);
router.post('/media', requireAuth, upload.array('files', 5), platformReviewController.uploadMedia);
router.post('/', requireAuth, platformReviewController.create);
router.delete('/:id', requireAuth, platformReviewController.delete);

export default router;
