import { Router } from 'express';
import { auditController } from '../controllers/auditController';
import { requireRole } from '../middleware/rbac';

const router = Router();

// All audit routes require ADMIN role
router.get('/', requireRole('ADMIN'), auditController.getAll);
router.get('/recent', requireRole('ADMIN'), auditController.getRecent);
router.get('/entity/:entityType/:entityId', requireRole('ADMIN'), auditController.getByEntity);
router.get('/user/:userId', requireRole('ADMIN'), auditController.getByUser);

export default router;
