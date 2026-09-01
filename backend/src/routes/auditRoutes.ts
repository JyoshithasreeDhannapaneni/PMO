import { Router } from 'express';
import { auditController } from '../controllers/auditController';
import { requireRole } from '../middleware/auth';

const router = Router();

// Audit Report exposes per-user identity and IP-address data across every
// endpoint below (audit_logs.ip_address is selected in getAll/getByUser/
// getByEntity/exports) — restricted to ADMIN only, same as other sensitive
// data in this app (e.g. call-transcript grading). Was previously
// requireAuth-only (any authenticated role) — tightened per security review.
router.get('/user-project-summary', requireRole('ADMIN'), auditController.getUserProjectSummary);
router.get('/activity-summary', requireRole('ADMIN'), auditController.getActivitySummary);
router.get('/manager-leaderboard', requireRole('ADMIN'), auditController.getManagerLeaderboard);
router.get('/manager-dashboard-leaderboard', requireRole('ADMIN'), auditController.getManagerDashboardLeaderboard);
router.get('/weekly-trend', requireRole('ADMIN'), auditController.getWeeklyTrend);
router.get('/hygiene-board', requireRole('ADMIN'), auditController.getHygieneBoard);
router.get('/hygiene-board/weekly-trend', requireRole('ADMIN'), auditController.getHygieneWeeklyTrend);
router.get('/export/hygiene-board', requireRole('ADMIN'), auditController.exportHygieneExcel);
// Manual test trigger for the daily 6PM IST hygiene scorecard email — role check is inline (ADMIN only), see controller.
router.post('/hygiene-scorecard/run-now', requireRole('ADMIN'), auditController.runHygieneScorecardNow);
// Ad-hoc scheduled sends with a custom recipient list — role check is inline (ADMIN only), see controller.
router.post('/hygiene-scorecard/schedule', requireRole('ADMIN'), auditController.scheduleHygieneScorecard);
router.get('/hygiene-scorecard/schedules', requireRole('ADMIN'), auditController.listHygieneScorecardSchedules);
router.delete('/hygiene-scorecard/schedules/:id', requireRole('ADMIN'), auditController.cancelHygieneScorecardSchedule);
router.get('/export/log', requireRole('ADMIN'), auditController.exportLogExcel);
router.get('/export/leaderboard', requireRole('ADMIN'), auditController.exportLeaderboardExcel);
router.get('/', requireRole('ADMIN'), auditController.getAll);
router.get('/recent', requireRole('ADMIN'), auditController.getRecent);
router.get('/entity/:entityType/:entityId', requireRole('ADMIN'), auditController.getByEntity);
router.get('/user/:userId', requireRole('ADMIN'), auditController.getByUser);

export default router;
