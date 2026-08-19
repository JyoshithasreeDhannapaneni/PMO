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

  // POST /api/email-hygiene/sync — fires a background Graph API sync and returns 202 immediately.
  // Prevents 504 timeouts caused by holding the connection open during a 2–5 min sync.
  triggerSync: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const result = emailHygieneService.triggerBackgroundSync();
    res.status(result.alreadyRunning ? 200 : 202).json({
      success: true,
      data: { alreadyRunning: result.alreadyRunning, ...emailHygieneService.getSyncState() },
    });
  }),

  getSyncStatus: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: emailHygieneService.getSyncState() });
  }),

  exportExcel: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const { metrics, teamHygiene, segmentHeads } = await emailHygieneService.getHygieneMetrics(false);
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
    const teamRows = teamHygiene.map(t => ({
      Level: 'Team',
      Segment: t.segment,
      Manager: t.managerName,
      'Manager Email': t.managerEmail,
      'Hygiene Score (/100)': t.teamScore ?? 'N/A',
      Basis: `${t.scoredMemberCount}/${t.memberCount} members scored`,
    }));
    // Segment head rows — their score IS the average of their segment's team scores
    // (mean(team4, team6) for ENT; mean(team1,2,3,5) for SMB), not their own mailbox
    // activity. Appended to the same sheet so the export is a complete rollup.
    const segmentRows = (['ENT', 'SMB'] as const).map(seg => {
      const head = segmentHeads[seg];
      return {
        Level: 'Segment',
        Segment: seg,
        Manager: head.name,
        'Manager Email': head.email,
        'Hygiene Score (/100)': head.score ?? 'N/A',
        Basis: `avg of ${head.teamIds.join(', ')}`,
      };
    });
    sendWorkbook(
      res,
      { 'Email Hygiene': rows, 'Team Hygiene': [...segmentRows, ...teamRows] },
      `email-hygiene-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }),
};
