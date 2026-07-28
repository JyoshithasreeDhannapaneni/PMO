import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { auditService } from '../services/auditService';
import { hygieneScorecardService } from '../services/hygieneScorecardService';
import { asyncHandler, AppError } from '../middleware/errorHandler';

function sendWorkbook(res: Response, sheets: Record<string, any[]>, filename: string) {
  const workbook = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31)); // Excel sheet names cap at 31 chars
  }
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

export const auditController = {
  getAll: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, limit, userId, entityType, entityId, action, startDate, endDate } = req.query;
    
    const result = await auditService.getAll({
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      userId: userId as string,
      entityType: entityType as string,
      entityId: entityId as string,
      action: action as any,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });
    
    res.json({ success: true, ...result });
  }),

  getByEntity: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { entityType, entityId } = req.params;
    const logs = await auditService.getByEntity(entityType, entityId);
    res.json({ success: true, data: logs });
  }),

  getByUser: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const { limit } = req.query;
    const logs = await auditService.getByUser(userId, limit ? parseInt(limit as string) : undefined);
    res.json({ success: true, data: logs });
  }),

  getUserProjectSummary: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      res.status(400).json({ success: false, error: { message: 'startDate and endDate are required' } });
      return;
    }
    const result = await auditService.getUserProjectSummary(
      new Date(startDate as string),
      new Date(endDate as string)
    );
    res.json({ success: true, data: result });
  }),

  getActivitySummary: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      res.status(400).json({ success: false, error: { message: 'startDate and endDate are required' } });
      return;
    }
    const result = await auditService.getActivitySummary(
      new Date(startDate as string),
      new Date(endDate as string)
    );
    res.json({ success: true, data: result });
  }),

  getWeeklyTrend: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { endDate, weeks } = req.query;
    const result = await auditService.getWeeklyTrend(
      endDate ? new Date(endDate as string) : new Date(),
      weeks ? parseInt(weeks as string) : 8
    );
    res.json({ success: true, data: result });
  }),

  getManagerLeaderboard: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      res.status(400).json({ success: false, error: { message: 'startDate and endDate are required' } });
      return;
    }
    const result = await auditService.getManagerLeaderboard(
      new Date(startDate as string),
      new Date(endDate as string)
    );
    res.json({ success: true, data: result });
  }),

  exportLogExcel: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, entityType, entityId, action, startDate, endDate } = req.query;

    const result = await auditService.getAll({
      page: 1,
      limit: 5000, // export cap — matches the service's own max page size
      userId: userId as string,
      entityType: entityType as string,
      entityId: entityId as string,
      action: action as any,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    const rows = result.data.map((l: any) => ({
      Timestamp: l.createdAt ? new Date(l.createdAt).toLocaleString() : '',
      User: l.user?.name || '',
      Email: l.user?.email || '',
      Action: l.action,
      'Entity Type': l.entityType,
      'Entity Name': l.entityName || '',
      'Entity ID': l.entityId || '',
      'IP Address': l.ipAddress || '',
    }));

    sendWorkbook(res, { 'Activity Log': rows }, `audit-log-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }),

  exportLeaderboardExcel: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      res.status(400).json({ success: false, error: { message: 'startDate and endDate are required' } });
      return;
    }

    const result = await auditService.getManagerLeaderboard(
      new Date(startDate as string),
      new Date(endDate as string)
    );

    const toRows = (segment: string, role: string, list: any[]) => list.map((m) => ({
      Segment: segment,
      Role: role,
      Manager: m.name,
      Email: m.email || '',
      'Total Projects': m.total,
      Completed: m.completed,
      'Newly Added': m.newlyAdded,
      Escalations: m.escalations,
      Overage: m.overageCount,
    }));

    const rows = [
      ...toRows('Enterprise', 'Project Manager', result.projectManagers.ENT),
      ...toRows('SMB', 'Project Manager', result.projectManagers.SMB),
      ...toRows('Enterprise', 'Account Manager', result.accountManagers.ENT),
      ...toRows('SMB', 'Account Manager', result.accountManagers.SMB),
    ];

    const summaryRows = [{
      'Total Escalations': result.summary.totalEscalations,
      'Total Overage ($)': result.summary.totalOverageAmount,
      'Enterprise Projects': result.summary.entProjects,
      'SMB Projects': result.summary.smbProjects,
    }];

    sendWorkbook(
      res,
      { 'Manager Leaderboard': rows, Summary: summaryRows },
      `manager-leaderboard-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }),

  getRecent: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { limit } = req.query;
    const logs = await auditService.getRecentActivity(limit ? parseInt(limit as string) : undefined);
    res.json({ success: true, data: logs });
  }),

  getHygieneBoard: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await auditService.getHygieneBoard();
    res.json({ success: true, data });
  }),

  exportHygieneExcel: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const board = await auditService.getHygieneBoard();
    const rows = board.map((pm) => ({
      'Project Manager': pm.projectManager,
      'Total Projects': pm.totalProjects,
      'Active / On-Hold': pm.activeProjects,
      'Completed / Archived': pm.completedProjects,
      // Activity (from audit_logs)
      'Logins (30d)': pm.logins30d,
      'Project Updates (30d)': pm.projectUpdates30d,
      'Case Study Updates (30d)': pm.caseStudyUpdates30d,
      'Last Login': pm.lastLoginAt ? new Date(pm.lastLoginAt).toISOString().slice(0, 10) : '',
      'Last Action': pm.lastActionAt ? new Date(pm.lastActionAt).toISOString().slice(0, 10) : '',
      'Days Since Last Action': pm.daysSinceLastAction ?? 'Never',
      // Data quality
      'Missing Kickoff Date': pm.missingKickoffDate,
      'Missing Planned Dates': pm.missingPlannedDates,
      'Missing Customer Email': pm.missingCustomerEmail,
      'Missing Notes': pm.missingNotes,
      'Overdue (Not Flagged)': pm.overdueNotFlagged,
      'Missing Project Size': pm.missingProjectSize,
      'Missing Budget': pm.missingBudget,
      // Case studies
      'Case Studies Done': pm.csDone,
      'Case Studies Pending': pm.csPending,
      'No Case Study': pm.csMissing,
      // Delay accountability
      'Delayed Projects': pm.delayedProjectsCount,
      'Missing RCA Note': pm.missingRcaCount,
      // Phase-date integrity
      'Same-Day Date Violations': pm.dateViolationsCount,
      // Scores
      'Activity Score': pm.activityScore,
      'Data Quality Score': pm.qualityScore,
      'Case Study Score': pm.caseStudyScore,
      'Delay Accountability Score': pm.delayScore,
      'Phase Date Integrity Score': pm.dateIntegrityScore,
      'Hygiene Score': pm.hygieneScore,
    }));
    sendWorkbook(
      res,
      { 'Hygiene Board': rows },
      `hygiene-board-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }),

  runHygieneScorecardNow: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const requestingUser = (req as any).user;
    if (!requestingUser || requestingUser.role !== 'ADMIN') {
      throw new AppError('Only admins can trigger the hygiene scorecard send', 403);
    }
    const result = await hygieneScorecardService.sendDailyScorecard(true);
    res.json({ success: true, data: result });
  }),

  scheduleHygieneScorecard: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const requestingUser = (req as any).user;
    if (!requestingUser || requestingUser.role !== 'ADMIN') {
      throw new AppError('Only admins can schedule the hygiene scorecard send', 403);
    }
    const { recipients, scheduledAt } = req.body;
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new AppError('At least one recipient is required', 400);
    }
    if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) {
      throw new AppError('A valid scheduledAt date/time is required', 400);
    }
    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate.getTime() <= Date.now()) {
      throw new AppError('Scheduled time must be in the future', 400);
    }
    const schedule = await hygieneScorecardService.createSchedule(
      recipients,
      scheduledDate,
      requestingUser.email || requestingUser.id
    );
    res.json({ success: true, data: schedule });
  }),

  listHygieneScorecardSchedules: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const schedules = await hygieneScorecardService.listSchedules();
    res.json({ success: true, data: schedules });
  }),

  cancelHygieneScorecardSchedule: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const requestingUser = (req as any).user;
    if (!requestingUser || requestingUser.role !== 'ADMIN') {
      throw new AppError('Only admins can cancel a scheduled send', 403);
    }
    const { id } = req.params;
    const cancelled = await hygieneScorecardService.cancelSchedule(id);
    if (!cancelled) {
      throw new AppError('Schedule not found or already sent/cancelled', 404);
    }
    res.json({ success: true, data: cancelled });
  }),
};
