import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { emailHygieneService } from '../services/emailHygieneService';
import { asyncHandler } from '../middleware/errorHandler';

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

export const emailHygieneController = {
  getMetrics: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const forceRefresh = req.query.refresh === 'true';
    const result = await emailHygieneService.getHygieneMetrics(forceRefresh);
    res.json({ success: true, data: result });
  }),

  exportExcel: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const { metrics } = await emailHygieneService.getHygieneMetrics(false);
    const rows = metrics.map(m => ({
      'Team Member': m.userName,
      Email: m.userEmail,
      'Customer Threads': m.uniqueCustomerThreads,
      // Speed
      'Avg First Reply (h)': m.avgFirstReplyTimeHours ?? 'N/A',
      'SLA Hit Rate (% ≤4h)': m.slaHitRate,
      'Avg Full Resolution (h)': m.avgFullResolutionTimeHours ?? 'N/A',
      // Quality
      'Relevancy Score': m.relevancyScore ?? 'N/A',
      'Accuracy Rate (%)': m.accuracyRate,
      'Completeness Rate (%)': m.completenessRate,
      // Resolution
      'One-Reply Resolution (%)': m.oneReplyResolutionRate,
      'Reopened Thread Rate (%)': m.reopenedThreadRate,
      // Tone (out of 20)
      'Tone Score (/20)': m.toneScore,
      // Category scores on new scale
      'Speed Score (/30)': m.speedScore,
      'Quality Score (/30)': m.qualityScore,
      'Resolution Score (/20)': m.resolutionScore,
      'Email Hygiene Score (/100)': m.emailHygieneScore,
    }));
    sendWorkbook(
      res,
      { 'Email Hygiene': rows },
      `email-hygiene-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }),
};
