import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { emailHygieneService } from '../services/emailHygieneService';
import { asyncHandler } from '../middleware/errorHandler';

// Excel's hard per-cell text limit is 32,767 characters — a raw email/Teams thread
// (quoted history, signatures) can exceed that easily. Cap well under it; a cell this
// long is unreadable anyway, so this is a readability trim, not just a safety margin.
const CELL_TEXT_LIMIT = 4000;
function cell(text: string | null | undefined): string {
  if (!text) return '';
  return text.length > CELL_TEXT_LIMIT ? `${text.slice(0, CELL_TEXT_LIMIT)}… (truncated)` : text;
}

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

// Shared by exportExcel (rolling 30-day window) and exportLastMonthExcel (finalized
// calendar-month snapshot) — same UserEmailHygiene/TeamHygieneRow shape either way.
function buildHygieneSheets(
  metrics: import('../services/emailHygieneService').UserEmailHygiene[],
  teamHygiene: import('../services/emailHygieneService').TeamHygieneRow[],
  segmentHeads: Record<'ENT' | 'SMB', import('../services/emailHygieneService').SegmentHead>
) {
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
  return {
    'Email Hygiene': rows,
    'Team Hygiene': [...segmentRows, ...teamRows],
    'Evidence (Best-Worst)': buildEvidenceRows(metrics),
    'Score Breakdown': buildScoreBreakdownRows(metrics),
    'Improvement Insights': buildInsightRows(metrics),
  };
}

const CATEGORY_LABEL: Record<'speed' | 'quality' | 'resolution' | 'tone', string> = {
  speed: 'Speed', quality: 'Quality', resolution: 'Resolution', tone: 'Tone',
};

// Real customer-message / team-reply pairs behind each category's best and worst scored
// exchange — the actual proof an emailHygieneScore isn't just a number, one row per
// person per category per best/worst example that actually exists.
function buildEvidenceRows(metrics: import('../services/emailHygieneService').UserEmailHygiene[]) {
  const out: Record<string, any>[] = [];
  for (const m of metrics) {
    for (const cat of ['speed', 'quality', 'resolution', 'tone'] as const) {
      for (const type of ['best', 'worst'] as const) {
        const ex = m.bestWorst?.[cat]?.[type];
        if (!ex) continue;
        out.push({
          'Team Member': m.userName,
          Email: m.userEmail,
          Category: CATEGORY_LABEL[cat],
          Type: type === 'best' ? 'Best' : 'Worst',
          Label: ex.label,
          'Customer Message': cell(ex.customerText),
          'Team Reply': cell(ex.replyText),
        });
      }
    }
  }
  return out;
}

// Every sub-metric behind every category score, with up to 2 real named examples
// (who, when, what happened) for whichever sub-metrics are weak enough to have one.
function buildScoreBreakdownRows(metrics: import('../services/emailHygieneService').UserEmailHygiene[]) {
  const out: Record<string, any>[] = [];
  for (const m of metrics) {
    for (const cat of ['speed', 'quality', 'resolution', 'tone'] as const) {
      for (const item of m.scoreBreakdown?.[cat] ?? []) {
        const [ex1, ex2] = item.examples ?? [];
        out.push({
          'Team Member': m.userName,
          Email: m.userEmail,
          Category: CATEGORY_LABEL[cat],
          'Sub-Metric': item.label,
          Value: item.value,
          'Sub-Score': `${item.subScore}/${item.maxSubScore}`,
          Tip: cell(item.tip),
          'Example 1 Customer': ex1?.customer ?? '',
          'Example 1 Date': ex1?.when ?? '',
          'Example 1 Detail': cell(ex1?.detail),
          'Example 1 Body': cell(ex1?.body),
          'Example 2 Customer': ex2?.customer ?? '',
          'Example 2 Date': ex2?.when ?? '',
          'Example 2 Detail': cell(ex2?.detail),
          'Example 2 Body': cell(ex2?.body),
        });
      }
    }
  }
  return out;
}

// Coaching lines — the specific weak behavior observed and the concrete improvement,
// only generated for categories that scored low enough to need one.
function buildInsightRows(metrics: import('../services/emailHygieneService').UserEmailHygiene[]) {
  const out: Record<string, any>[] = [];
  for (const m of metrics) {
    for (const insight of m.insights ?? []) {
      out.push({
        'Team Member': m.userName,
        Email: m.userEmail,
        Category: CATEGORY_LABEL[insight.category],
        Metric: insight.metric,
        Score: `${insight.score}/${insight.maxScore}`,
        'Current Behavior': cell(insight.originalLine),
        'Suggested Improvement': cell(insight.improvedLine),
      });
    }
  }
  return out;
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

  getWeeklyTrend: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await emailHygieneService.getWeeklyTrend();
    res.json({ success: true, data });
  }),

  getDailyTrend: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await emailHygieneService.getDailyTrend();
    res.json({ success: true, data });
  }),

  getRangeMetrics: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { start, end } = req.query;
    if (typeof start !== 'string' || typeof end !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      res.status(400).json({ success: false, error: 'start and end query params are required, each as YYYY-MM-DD' });
      return;
    }
    const data = await emailHygieneService.getRangeMetrics(start, end);
    res.json({ success: true, data });
  }),

  getLastMonth: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await emailHygieneService.getLastMonthMetrics();
    res.json({ success: true, data });
  }),

  // POST /api/email-hygiene/finalize-month — admin-triggered backfill/refresh of last
  // month's snapshot. Fires in the background and returns 202 immediately (same reasoning
  // as triggerSync above: this re-runs a full Graph fetch + grading pass over a month of
  // mail, which can take several minutes).
  triggerMonthFinalize: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const result = emailHygieneService.triggerMonthFinalize(1);
    res.status(result.alreadyRunning ? 200 : 202).json({
      success: true,
      data: { alreadyRunning: result.alreadyRunning, ...emailHygieneService.getMonthFinalizeState() },
    });
  }),

  getMonthFinalizeStatus: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: emailHygieneService.getMonthFinalizeState() });
  }),

  exportExcel: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const { metrics, teamHygiene, segmentHeads } = await emailHygieneService.getHygieneMetrics(false);
    sendWorkbook(
      res,
      buildHygieneSheets(metrics, teamHygiene, segmentHeads),
      `email-hygiene-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }),

  // GET /api/email-hygiene/export/last-month — the finalized calendar-month snapshot
  // (e.g. computed in September, this is August), matching what the Manager Dashboard's
  // "Email Hygiene — Last Month" card shows on screen. Distinct from exportExcel above,
  // which is always the rolling 30-day window, not a clean calendar month.
  exportLastMonthExcel: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const { metrics, teamHygiene, segmentHeads, monthLabel, finalized } = await emailHygieneService.getLastMonthMetrics();
    if (!finalized) {
      res.status(404).json({ success: false, error: `${monthLabel || 'Last month'}'s hygiene scores haven't been computed yet.` });
      return;
    }
    sendWorkbook(
      res,
      buildHygieneSheets(metrics, teamHygiene, segmentHeads),
      `email-hygiene-${monthLabel.replace(/\s+/g, '-').toLowerCase()}.xlsx`
    );
  }),
};
