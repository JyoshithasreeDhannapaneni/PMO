import { Router } from 'express';
import multer from 'multer';
import { archiveController } from '../controllers/archiveController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

const sharepointUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/', archiveController.getProjects);
router.get('/stats', archiveController.getStats);
router.get('/sharepoint-items', requireAuth, archiveController.getSharePointItems);
router.get('/sharepoint-sync/status', requireAuth, archiveController.getSharePointSyncStatus);
router.post('/sharepoint-sync', requireRole('ADMIN'), archiveController.syncSharePoint);
router.post('/sharepoint-import', requireRole('ADMIN'), sharepointUpload.single('file'), archiveController.importSharePointFile);
router.post('/sharepoint-attachments-import', requireRole('ADMIN'), sharepointUpload.single('file'), archiveController.importSharePointAttachments);
router.get('/:id/export', archiveController.getProjectData);
router.post('/:id/restore', archiveController.restoreProject);

export default router;
