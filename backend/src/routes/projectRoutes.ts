import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { projectController } from '../controllers/projectController';
import { validate, createProjectSchema, updateProjectSchema, projectIdSchema } from '../middleware/validation';
import { requireAuth } from '../middleware/auth';

const router = Router();

// RCA document upload — stored on disk, served statically via /uploads
const RCA_DOC_DIR = path.join(process.cwd(), 'uploads', 'rca-docs');
fs.mkdirSync(RCA_DOC_DIR, { recursive: true });

const rcaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, RCA_DOC_DIR),
  filename:    (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
});
const rcaUpload = multer({
  storage: rcaStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /pdf|msword|officedocument|wordprocessingml|spreadsheet|text\/|csv|image\//i;
    if (!allowed.test(file.mimetype)) {
      cb(new Error('Only PDF, Word, Excel, or image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

// GET /api/projects - Get all projects
router.get('/', projectController.getAll);

// GET /api/projects/delayed - Get delayed projects
router.get('/delayed', projectController.getDelayed);

// GET /api/projects/client-summary - Get aggregated stats for a client
router.get('/client-summary', projectController.getClientSummary);

// GET /api/projects/:id - Get project by ID
router.get('/:id', validate(projectIdSchema), projectController.getById);

// POST /api/projects - Create new project
router.post('/', validate(createProjectSchema), projectController.create);

// PUT /api/projects/:id - Update project
router.put('/:id', validate(updateProjectSchema), projectController.update);

// POST /api/projects/:id/rca-doc - Upload RCA document for a project
router.post('/:id/rca-doc', requireAuth, rcaUpload.single('file'), projectController.uploadRcaDoc);

// DELETE /api/projects/by-client/:clientName - Delete all projects for a client (must be before /:id)
router.delete('/by-client/:clientName', projectController.deleteClient);

// DELETE /api/projects/:id - Delete project
router.delete('/:id', validate(projectIdSchema), projectController.delete);

export default router;
