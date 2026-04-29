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

export default router;
