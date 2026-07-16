import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { platformReviewController } from '../controllers/platformReviewController';

const router = Router();

const REVIEW_MEDIA_DIR = path.join(process.cwd(), 'uploads', 'review-media');
fs.mkdirSync(REVIEW_MEDIA_DIR, { recursive: true });

// diskStorage streams straight to disk instead of buffering in memory, which
// matters here since testimonial videos are allowed up to 1GB each.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, REVIEW_MEDIA_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024, files: 6 }, // 1GB per file, up to 6 files per review
  fileFilter: (_req, file, cb) => {
    if (!/^(image|video)\//.test(file.mimetype)) {
      cb(new Error('Only image or video files are allowed'));
      return;
    }
    cb(null, true);
  },
});

router.get('/', platformReviewController.getAll);
router.get('/platforms', platformReviewController.getPlatforms);
router.get('/manager-options', platformReviewController.getManagerOptions);
router.get('/summary', platformReviewController.getSummary);
router.get('/manager-summary', platformReviewController.getManagerSummary);
router.post('/media', upload.array('files', 6), platformReviewController.uploadMedia);
router.post('/', platformReviewController.create);
router.delete('/:id', platformReviewController.delete);

export default router;
