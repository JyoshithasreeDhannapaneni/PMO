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
      'Emails Sent (Ext)': m.externalEmailsSent,
      'Emails Received (Ext)': m.externalEmailsReceived,
      'Customer Threads': m.uniqueCustomerThreads,
      'Avg Response Time (h)': m.avgResponseTimeHours ?? 'N/A',
      'Median Response Time (h)': m.medianResponseTimeHours ?? 'N/A',
      'Replied ≤4h': m.responsesWithin4h,
      'Replied ≤24h': m.responsesWithin24h,
      'Replied >24h': m.responsesOver24h,
      'Unreplied Threads': m.unrepliedThreads,
      'Response Rate (%)': m.responseRate,
      'Avg Reply Length (chars)': m.avgReplyLengthChars,
      'Auto-Replies': m.autoRepliesDetected,
      'AI Relevancy Score': m.relevancyScore ?? 'N/A',
      'AI Sample Reason': m.relevancySample ?? '',
      'Response Time Score': m.responseTimeScore,
      'Response Rate Score': m.responseRateScore,
      'Quality Score': m.qualityScore,
      'Email Hygiene Score': m.emailHygieneScore,
    }));
    sendWorkbook(
      res,
      { 'Email Hygiene': rows },
      `email-hygiene-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }),
};
