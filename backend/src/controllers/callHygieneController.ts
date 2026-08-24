import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { callHygieneService, type UserCallHygiene } from '../services/callHygieneService';
import { asyncHandler, AppError } from '../middleware/errorHandler';

function sendWorkbook(res: Response, sheets: Record<string, any[]>, filename: string) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
}

// Quality is HR-adjacent content (an AI grade of what someone said in a meeting), so
// unlike the old calendar-metadata score, exposure needs real per-person scoping, not
// just a field strip. ADMIN sees everyone; PROJECT_MANAGER sees only their own row.
function scopeToRole(metrics: UserCallHygiene[], role: string, email: string): UserCallHygiene[] {
  if (role === 'ADMIN') return metrics;
  const lower = email.toLowerCase();
  return metrics.filter(m => m.userEmail.toLowerCase() === lower);
}

export const callHygieneController = {
  getMetrics: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const forceRefresh = req.query.refresh === 'true';
    const result = await callHygieneService.getHygieneMetrics(forceRefresh);
    const user = (req as any).user;
    const metrics = scopeToRole(result.metrics, user.role, user.email);
    res.json({ success: true, data: { ...result, metrics } });
  }),

  exportExcel: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { metrics } = await callHygieneService.getHygieneMetrics(false);
    const user = (req as any).user;
    const scoped = scopeToRole(metrics, user.role, user.email);
    const rows = scoped.map(m => ({
      'Team Member': m.userName,
      Email: m.userEmail,
      'Customer Calls (30d)': m.totalCustomerCalls,
      'PM-Scheduled': m.internallyScheduled,
      'Customer-Scheduled': m.externallyScheduled,
      'Unique Customers': m.uniqueCustomers,
      'Calls / Week': m.callsPerWeek,
      'Days Since Last Customer Call': m.daysSinceLastCustomerCall ?? 'N/A',
      'Cancelled Calls': m.cancelledCalls,
      'Declined/No-Response Calls': m.declinedCalls,
      'Cancelled Rate (%)': m.cancelledRate,
      'Online Meeting Rate (%)': m.onlineMeetingRate,
      'Quality Score (/100)': m.qualityScore ?? 'N/A',
      'Quality Coverage': `${m.qualityCoverage.graded} graded / ${m.qualityCoverage.noQuestion} no-Q&A / ${m.qualityCoverage.excluded} excluded / ${m.qualityCoverage.pending} pending (of ${m.qualityCoverage.total})`,
    }));
    sendWorkbook(
      res,
      { 'Call Hygiene': rows },
      `call-hygiene-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }),

  // Best/worst-scored Q&A exchange across ALL of one person's graded calls, not just one
  // meeting. ADMIN can look up anyone; everyone else can only look up their own email —
  // same HR-adjacent scoping as scopeToRole() above.
  getBestWorst: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    const targetEmail = String(req.query.userEmail || user.email);
    if (user.role !== 'ADMIN' && targetEmail.toLowerCase() !== user.email.toLowerCase()) {
      throw new AppError('You can only view your own best/worst answers', 403);
    }
    const result = await callHygieneService.getBestWorstForUser(targetEmail);
    res.json({ success: true, data: result });
  }),

  getOrgBestWorst: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const result = await callHygieneService.getBestWorstOrgWide();
    res.json({ success: true, data: result });
  }),

  getWeeklyTrend: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await callHygieneService.getWeeklyTrend();
    const user = (req as any).user;
    const weeks = result.weeks.map(w => ({ ...w, metrics: scopeToRole(w.metrics, user.role, user.email) }));
    res.json({ success: true, data: { ...result, weeks } });
  }),
};
