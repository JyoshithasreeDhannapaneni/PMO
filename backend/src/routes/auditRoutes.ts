import { Router } from 'express';
import { auditController } from '../controllers/auditController';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Audit Report is viewable by every authenticated role, not just ADMIN — the
// only requirement is being logged in (requireAuth populates req.user, which
// other middleware in this app depends on, but no role check is applied here).
router.get('/user-project-summary', requireAuth, auditController.getUserProjectSummary);
router.get('/activity-summary', requireAuth, auditController.getActivitySummary);
router.get('/manager-leaderboard', requireAuth, auditController.getManagerLeaderboard);
router.get('/weekly-trend', requireAuth, auditController.getWeeklyTrend);
router.get('/hygiene-board', requireAuth, auditController.getHygieneBoard);
router.get('/hygiene-board/weekly-trend', requireAuth, auditController.getHygieneWeeklyTrend);
router.get('/export/hygiene-board', requireAuth, auditController.exportHygieneExcel);
// Manual test trigger for the daily 6PM IST hygiene scorecard email — role check is inline (ADMIN only), see controller.
router.post('/hygiene-scorecard/run-now', requireAuth, auditController.runHygieneScorecardNow);
// Ad-hoc scheduled sends with a custom recipient list — role check is inline (ADMIN only), see controller.
router.post('/hygiene-scorecard/schedule', requireAuth, auditController.scheduleHygieneScorecard);
router.get('/hygiene-scorecard/schedules', requireAuth, auditController.listHygieneScorecardSchedules);
router.delete('/hygiene-scorecard/schedules/:id', requireAuth, auditController.cancelHygieneScorecardSchedule);
router.get('/export/log', requireAuth, auditController.exportLogExcel);
router.get('/export/leaderboard', requireAuth, auditController.exportLeaderboardExcel);
router.get('/', requireAuth, auditController.getAll);
router.get('/recent', requireAuth, auditController.getRecent);
router.get('/entity/:entityType/:entityId', requireAuth, auditController.getByEntity);
router.get('/user/:userId', requireAuth, auditController.getByUser);

export default router;
