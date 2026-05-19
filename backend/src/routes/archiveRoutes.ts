import { Router } from 'express';
import { archiveController } from '../controllers/archiveController';

const router = Router();

router.get('/', archiveController.getProjects);
router.get('/stats', archiveController.getStats);
router.get('/:id/export', archiveController.getProjectData);
router.post('/:id/restore', archiveController.restoreProject);

export default router;
