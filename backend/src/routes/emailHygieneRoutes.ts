import { Router } from 'express';
import { emailHygieneController } from '../controllers/emailHygieneController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, emailHygieneController.getMetrics);
router.get('/export', requireAuth, emailHygieneController.exportExcel);
router.get('/export/last-month', requireAuth, emailHygieneController.exportLastMonthExcel);
router.post('/sync', requireAuth, emailHygieneController.triggerSync);
router.get('/sync-status', requireAuth, emailHygieneController.getSyncStatus);
router.get('/weekly-trend', requireAuth, emailHygieneController.getWeeklyTrend);
router.get('/daily-trend', requireAuth, emailHygieneController.getDailyTrend);
router.get('/range', requireAuth, emailHygieneController.getRangeMetrics);
router.get('/last-month', requireAuth, emailHygieneController.getLastMonth);
router.post('/finalize-month', requireRole('ADMIN'), emailHygieneController.triggerMonthFinalize);
router.get('/finalize-month-status', requireAuth, emailHygieneController.getMonthFinalizeStatus);

export default router;
