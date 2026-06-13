import { Router } from 'express';
import { auditController } from '../controllers/auditController';
import { requireRole } from '../middleware/rbac';

const router = Router();

// Project-based activity summary — open (no req.user middleware in this app)
router.get('/user-project-summary', auditController.getUserProjectSummary);
router.get('/activity-summary', auditController.getActivitySummary);

// All other audit routes require ADMIN role
router.get('/', requireRole('ADMIN'), auditController.getAll);
router.get('/recent', requireRole('ADMIN'), auditController.getRecent);
router.get('/entity/:entityType/:entityId', requireRole('ADMIN'), auditController.getByEntity);
router.get('/user/:userId', requireRole('ADMIN'), auditController.getByUser);

export default router;
