import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { callHygieneService } from '../services/callHygieneService';
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

export const callHygieneController = {
  getMetrics: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const forceRefresh = req.query.refresh === 'true';
    const result = await callHygieneService.getHygieneMetrics(forceRefresh);
    res.json({ success: true, data: result });
  }),

  exportExcel: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const { metrics } = await callHygieneService.getHygieneMetrics(false);
    const rows = metrics.map(m => ({
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
      'Volume Score (/40)': m.volumeScore,
      'Cadence Score (/30)': m.cadenceScore,
      'Reliability Score (/30)': m.reliabilityScore,
      'Call Hygiene Score (/100)': m.callHygieneScore,
    }));
    sendWorkbook(
      res,
      { 'Call Hygiene': rows },
      `call-hygiene-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }),
};
