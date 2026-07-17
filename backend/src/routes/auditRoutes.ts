import { Router } from 'express';
import { auditController } from '../controllers/auditController';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const router = Router();

// requireAuth must run before requireRole — requireRole reads req.user, which
// only requireAuth populates. Without it, requireRole always 401s (even for
// real admins) since req.user is never set.
router.get('/user-project-summary', requireAuth, auditController.getUserProjectSummary);
router.get('/activity-summary', requireAuth, auditController.getActivitySummary);

// All other audit routes require ADMIN role
router.get('/manager-leaderboard', requireAuth, requireRole('ADMIN'), auditController.getManagerLeaderboard);
router.get('/weekly-trend', requireAuth, requireRole('ADMIN'), auditController.getWeeklyTrend);
router.get('/export/log', requireAuth, requireRole('ADMIN'), auditController.exportLogExcel);
router.get('/export/leaderboard', requireAuth, requireRole('ADMIN'), auditController.exportLeaderboardExcel);
router.get('/', requireAuth, requireRole('ADMIN'), auditController.getAll);
router.get('/recent', requireAuth, requireRole('ADMIN'), auditController.getRecent);
router.get('/entity/:entityType/:entityId', requireAuth, requireRole('ADMIN'), auditController.getByEntity);
router.get('/user/:userId', requireAuth, requireRole('ADMIN'), auditController.getByUser);

export default router;
