import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { auditService } from '../services/auditService';
import { asyncHandler } from '../middleware/errorHandler';

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
};
