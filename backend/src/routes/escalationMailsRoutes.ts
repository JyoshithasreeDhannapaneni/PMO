import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { escalationMailController } from '../controllers/escalationMailController';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Parse uploads (email/PDF/Word) stay in memory — they're small and read once.
const parseUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Evidence media (screenshots / screen-recordings) streams to disk, since
// videos can be large. Served statically via /uploads (see index.ts).
const MEDIA_DIR = path.join(process.cwd(), 'uploads', 'escalation-media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });
const mediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
});
const mediaUpload = multer({
  storage: mediaStorage,
  limits: { fileSize: 500 * 1024 * 1024, files: 8 }, // 500MB per file, up to 8 per escalation
  fileFilter: (_req, file, cb) => {
    if (!/^(image|video)\//.test(file.mimetype)) {
      cb(new Error('Only image or video files are allowed'));
      return;
    }
    cb(null, true);
  },
});

// RCA documents — PDF/Word/Excel/text/images accepted (not videos). Same disk dir.
const RCA_DOC_RE = /(pdf|word|excel|spreadsheet|officedocument|msword|ms-excel|text\/|csv|image\/)/i;
const rcaDocUpload = multer({
  storage: mediaStorage,
  limits: { fileSize: 50 * 1024 * 1024, files: 6 }, // 50MB per doc, up to 6
  fileFilter: (_req, file, cb) => {
    if (!RCA_DOC_RE.test(file.mimetype)) {
      cb(new Error('Only document or image files are allowed for RCA'));
      return;
    }
    cb(null, true);
  },
});

router.use(requireAuth);

router.get('/', escalationMailController.getAll);
router.get('/stats', escalationMailController.getStats);
router.get('/config', escalationMailController.getConfig);
router.post('/parse', parseUpload.single('file'), escalationMailController.parse);
router.post('/media', mediaUpload.array('files', 8), escalationMailController.uploadMedia);
router.post('/rca-docs', rcaDocUpload.array('files', 6), escalationMailController.uploadRcaDoc);
router.post('/', escalationMailController.create);
router.patch('/:id/status', escalationMailController.updateStatus);
router.patch('/:id/owner', escalationMailController.updateOwner);
router.patch('/:id/received-at', escalationMailController.updateReceivedAt);
router.patch('/:id/resolve', escalationMailController.resolve);
router.patch('/:id/resolution', escalationMailController.updateResolution);
router.delete('/:id', escalationMailController.delete);

export default router;
