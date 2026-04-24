import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboardService';
import { asyncHandler } from '../middleware/errorHandler';

export const dashboardController = {
  /**
   * GET /api/dashboard/stats
   * Get main dashboard statistics
   */
  getStats: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const stats = await dashboardService.getStats();

    res.json({
      success: true,
      data: stats,
    });
  }),

  /**
   * GET /api/dashboard/projects-by-status
   * Get projects grouped by status
   */
  getProjectsByStatus: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await dashboardService.getProjectsByStatus();

    res.json({
      success: true,
      data,
    });
  }),

  /**
   * GET /api/dashboard/projects-by-phase
   * Get projects grouped by phase
   */
  getProjectsByPhase: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await dashboardService.getProjectsByPhase();

    res.json({
      success: true,
      data,
    });
  }),

  /**
   * GET /api/dashboard/projects-by-plan
   * Get projects grouped by plan type
   */
  getProjectsByPlan: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await dashboardService.getProjectsByPlan();

    res.json({
      success: true,
      data,
    });
  }),

  /**
   * GET /api/dashboard/recent-activity
   * Get recent activity feed
   */
  getRecentActivity: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = parseInt(req.query.limit as string) || 10;
    const data = await dashboardService.getRecentActivity(limit);

    res.json({
      success: true,
      data,
    });
  }),

  /**
   * GET /api/dashboard/delay-summary
   * Get delay summary
   */
  getDelaySummary: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await dashboardService.getDelaySummary();

    res.json({
      success: true,
      data,
    });
  }),

  /**
   * GET /api/dashboard/upcoming-deadlines
   * Get upcoming project deadlines
   */
  getUpcomingDeadlines: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const days = parseInt(req.query.days as string) || 14;
    const data = await dashboardService.getUpcomingDeadlines(days);

    res.json({
      success: true,
      data,
    });
  }),

  /**
   * GET /api/dashboard/overview
   * Get complete dashboard overview (all data in one call)
   */
  getOverview: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Optional ?manager=Name filter — used for My View (manager sees only their projects)
    const managerName = req.query.manager as string | undefined;

    const [
      stats,
      projectsByStatus,
      projectsByPhase,
      projectsByPlan,
      recentActivity,
      delaySummary,
      upcomingDeadlines,
      migrationTypeStats,
    ] = await Promise.all([
      dashboardService.getStats(managerName),
      dashboardService.getProjectsByStatus(managerName),
      dashboardService.getProjectsByPhase(managerName),
      dashboardService.getProjectsByPlan(managerName),
      dashboardService.getRecentActivity(5, managerName),
      dashboardService.getDelaySummary(managerName),
      dashboardService.getUpcomingDeadlines(14, managerName),
      dashboardService.getMigrationTypeStats(managerName),
    ]);

    res.json({
      success: true,
      data: {
        stats,
        projectsByStatus,
        projectsByPhase,
        projectsByPlan,
        recentActivity,
        delaySummary,
        upcomingDeadlines,
        migrationTypeStats,
      },
    });
  }),

  /**
   * GET /api/dashboard/migration-type-stats
   * Get statistics by migration type for PM Dashboard
   */
  getMigrationTypeStats: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await dashboardService.getMigrationTypeStats();

    res.json({
      success: true,
      data,
    });
  }),

  /**
   * GET /api/dashboard/projects-by-migration-type/:type
   * Get projects filtered by migration type
   */
  getProjectsByMigrationType: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { type } = req.params;
    const data = await dashboardService.getProjectsByMigrationType(type);

    res.json({
      success: true,
      data,
    });
  }),
};
