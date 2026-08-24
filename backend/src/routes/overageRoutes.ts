import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { overageController } from '../controllers/overageController';
import { requireAuth } from '../middleware/auth';

const router = Router();

const OVERAGE_SOW_DIR = path.join(process.cwd(), 'uploads', 'overage-sow');
fs.mkdirSync(OVERAGE_SOW_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, OVERAGE_SOW_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 10 }, // 25MB per file, up to 10 SOW files per upload
  fileFilter: (_req, file, cb) => {
    if (!/^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|image\/)/.test(file.mimetype)) {
      cb(new Error('Only PDF, Word, or image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

router.post('/:id/sow', requireAuth, upload.array('files', 10), overageController.uploadSow);

export default router;
