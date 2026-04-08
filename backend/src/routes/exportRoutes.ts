import { Router } from 'express';
import { exportController } from '../controllers/exportController';
import { requirePermission } from '../middleware/rbac';

const router = Router();

router.get('/projects', requirePermission('export:all', 'export:own'), exportController.exportProjects);
router.get('/project/:projectId', requirePermission('export:all', 'export:own'), exportController.exportProjectDetail);
router.get('/report/:reportId', requirePermission('export:all', 'export:own'), exportController.exportStatusReport);
router.get('/tasks/:projectId', requirePermission('export:all', 'export:own'), exportController.exportTasks);
router.get('/risks/:projectId', requirePermission('export:all', 'export:own'), exportController.exportRisks);

export default router;
