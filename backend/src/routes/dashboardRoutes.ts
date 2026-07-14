import { Router } from 'express';
import { dashboardController } from '../controllers/dashboardController';

const router = Router();

// GET /api/dashboard/overview - Get complete dashboard overview
router.get('/overview', dashboardController.getOverview);

// GET /api/dashboard/stats - Get main statistics
router.get('/stats', dashboardController.getStats);

// GET /api/dashboard/projects-by-status - Get projects by status
router.get('/projects-by-status', dashboardController.getProjectsByStatus);

// GET /api/dashboard/projects-by-phase - Get projects by phase
router.get('/projects-by-phase', dashboardController.getProjectsByPhase);

// GET /api/dashboard/projects-by-plan - Get projects by plan
router.get('/projects-by-plan', dashboardController.getProjectsByPlan);

// GET /api/dashboard/recent-activity - Get recent activity
router.get('/recent-activity', dashboardController.getRecentActivity);

// GET /api/dashboard/delay-summary - Get delay summary
router.get('/delay-summary', dashboardController.getDelaySummary);

// GET /api/dashboard/upcoming-deadlines - Get upcoming deadlines
router.get('/upcoming-deadlines', dashboardController.getUpcomingDeadlines);

// GET /api/dashboard/manager-stats - Get per-manager project stats
router.get('/manager-stats', dashboardController.getManagerStats);

// GET /api/dashboard/weekly-report - Get weekly report data
router.get('/weekly-report', dashboardController.getWeeklyReport);

// GET /api/dashboard/migration-type-stats - Get stats by migration type
router.get('/migration-type-stats', dashboardController.getMigrationTypeStats);

// GET /api/dashboard/projects-by-migration-type/:type - Get projects by migration type
router.get('/projects-by-migration-type/:type', dashboardController.getProjectsByMigrationType);

// GET /api/dashboard/overaged-projects - Projects past their due date and still active
router.get('/overaged-projects', dashboardController.getOveragedProjects);

// GET /api/dashboard/escalated-projects - Escalated or highly delayed projects
router.get('/escalated-projects', dashboardController.getEscalatedProjects);

// POST /api/dashboard/mark-overage/:id - Add a new overage event
router.post('/mark-overage/:id', dashboardController.markOverageProject);

// PUT /api/dashboard/update-overage/:id - Edit the latest overage event (no new history row)
router.put('/update-overage/:id', dashboardController.updateOverageProject);

// POST /api/dashboard/unmark-overage/:id - Remove overage from a project
router.post('/unmark-overage/:id', dashboardController.unmarkOverageProject);

// DELETE /api/dashboard/overage-history/:historyId - Delete a single overage history entry
router.delete('/overage-history/:historyId', dashboardController.deleteOverageHistoryEntry);

// POST /api/dashboard/escalate/:id - Mark a project as escalated
router.post('/escalate/:id', dashboardController.escalateProject);

// POST /api/dashboard/deescalate/:id - Remove escalation from a project
router.post('/deescalate/:id', dashboardController.deescalateProject);

// POST /api/dashboard/set-resolved-date/:id - Set or clear the resolved date
router.post('/set-resolved-date/:id', dashboardController.setResolvedDate);

// GET /api/dashboard/archived-escalations - Completed/archived escalated projects
router.get('/archived-escalations', dashboardController.getArchivedEscalations);

// POST /api/dashboard/archive-escalation/:id - Archive an escalated project
router.post('/archive-escalation/:id', dashboardController.archiveEscalation);

// POST /api/dashboard/unarchive-escalation/:id - Restore to active escalations
router.post('/unarchive-escalation/:id', dashboardController.unarchiveEscalation);

// GET /api/dashboard/escalation-daily-notes/:projectId - Get daily notes for an escalated project
router.get('/escalation-daily-notes/:projectId', dashboardController.getEscalationDailyNotes);

// POST /api/dashboard/escalation-daily-notes/:projectId - Add a daily note
router.post('/escalation-daily-notes/:projectId', dashboardController.addEscalationDailyNote);

// DELETE /api/dashboard/escalation-daily-notes/:projectId/:noteId - Delete a daily note
router.delete('/escalation-daily-notes/:projectId/:noteId', dashboardController.deleteEscalationDailyNote);

export default router;
