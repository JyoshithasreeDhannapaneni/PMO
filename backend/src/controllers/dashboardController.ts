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
   * GET /api/dashboard/manager-stats
   */
  getManagerStats: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const managerName = req.query.manager as string | undefined;
    const data = await dashboardService.getManagerStats(managerName);
    res.json({ success: true, data });
  }),

  /**
   * GET /api/dashboard/weekly-report
   * Get weekly report data (newly added, closed, changes by managers)
   */
  getWeeklyReport: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const managerName = req.query.manager as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const data = await dashboardService.getWeeklyReport(managerName, startDate, endDate);
    res.json({ success: true, data });
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
    res.json({ success: true, data });
  }),

  getOveragedProjects: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const managerName = req.query.manager as string | undefined;
    const data = await dashboardService.getOveragedProjects(managerName);
    res.json({ success: true, data });
  }),

  getEscalatedProjects: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const managerName = req.query.manager as string | undefined;
    const data = await dashboardService.getEscalatedProjects(managerName);
    res.json({ success: true, data });
  }),

  markOverageProject: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { overageAmount, notes, extendedStartDate, extendedEndDate } = req.body;
    await dashboardService.markOverageProject(id, overageAmount, notes, extendedStartDate, extendedEndDate);
    res.json({ success: true, message: 'Project marked as overaged' });
  }),

  updateOverageProject: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { overageAmount, notes, extendedStartDate, extendedEndDate } = req.body;
    await dashboardService.updateOverageProject(id, overageAmount, notes, extendedStartDate, extendedEndDate);
    res.json({ success: true, message: 'Overage updated' });
  }),

  unmarkOverageProject: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await dashboardService.unmarkOverageProject(id);
    res.json({ success: true, message: 'Overage removed' });
  }),

  escalateProject: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { priority = 'MEDIUM', notes } = req.body;
    await dashboardService.escalateProject(id, priority, notes);
    res.json({ success: true, message: 'Project escalated' });
  }),

  deescalateProject: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await dashboardService.deescalateProject(id);
    res.json({ success: true, message: 'Escalation removed' });
  }),

  setResolvedDate: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { resolvedDate } = req.body;
    await dashboardService.setResolvedDate(id, resolvedDate || null);
    res.json({ success: true, message: 'Resolved date updated' });
  }),

  getArchivedEscalations: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const manager = req.query.manager as string | undefined;
    const data = await dashboardService.getArchivedEscalations(manager);
    res.json({ success: true, data });
  }),

  archiveEscalation: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await dashboardService.archiveEscalation(id);
    res.json({ success: true, message: 'Escalation archived' });
  }),

  unarchiveEscalation: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await dashboardService.unarchiveEscalation(id);
    res.json({ success: true, message: 'Escalation restored to active' });
  }),

  getEscalationDailyNotes: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const notes = await dashboardService.getEscalationDailyNotes(projectId);
    res.json({ success: true, data: notes });
  }),

  addEscalationDailyNote: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const { note, author, noteDate } = req.body;
    if (!note?.trim()) { res.status(400).json({ success: false, message: 'Note text is required' }); return; }
    const result = await dashboardService.addEscalationDailyNote(projectId, note.trim(), author, noteDate);
    res.json({ success: true, data: result });
  }),

  deleteEscalationDailyNote: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId, noteId } = req.params;
    await dashboardService.deleteEscalationDailyNote(projectId, noteId);
    res.json({ success: true, message: 'Note deleted' });
  }),
};
