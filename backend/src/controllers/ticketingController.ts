import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import {
  parseNtaCsv, saveNtaData, loadNtaData, clearNtaData, isNtaDataAvailable,
  getNtaManuallyDisabled, setNtaManuallyDisabled,
  getStats, getSpaces, getAssignees, getReporters, getProjectManagers, getDepartments,
  getIssues, searchTickets, getTrends, type NtaSearchFilters,
} from '../services/ntaExcelService';

// Every read endpoint below is a thin wrapper: load the uploaded snapshot (or an empty
// one if nothing's been uploaded yet, so the dashboard renders "no data" instead of
// erroring) and hand it to the matching ntaExcelService aggregation function.
function currentStore() {
  return loadNtaData() ?? { uploadedAt: '', filename: '', ticketCount: 0, tickets: [] };
}

function filtersFromQuery(q: Request['query']): NtaSearchFilters {
  return {
    key: q.key as string,
    summary: q.summary as string,
    status: q.status as string,
    priority: q.priority as string,
    customer: q.customer as string,
    assignee: q.assignee as string,
    reporter: q.reporter as string,
    projectManager: q.projectManager as string,
    department: q.department as string,
    spaces: q.spaces as string,
    createdFrom: q.createdFrom as string,
    createdTo: q.createdTo as string,
  };
}

export const ticketingController = {
  excelStatus: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const store = loadNtaData();
    if (!store) { res.json({ success: true, available: false }); return; }
    res.json({ success: true, available: true, filename: store.filename, uploadedAt: store.uploadedAt, ticketCount: store.ticketCount });
  }),

  uploadExcel: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ success: false, error: 'No file uploaded. Send a multipart/form-data request with field name "file".' });
      return;
    }
    try {
      const store = parseNtaCsv(file.buffer, file.originalname);
      saveNtaData(store);
      res.json({ success: true, filename: store.filename, ticketCount: store.ticketCount, uploadedAt: store.uploadedAt });
    } catch (err: any) {
      logger.error(`[NTA Excel] Upload failed: ${err.message}`);
      res.status(422).json({ success: false, error: err.message });
    }
  }),

  clearExcel: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    clearNtaData();
    res.json({ success: true, message: 'Ticket data cleared' });
  }),

  getSyncStatus: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    // No live sync exists (see ntaExcelService.ts header comment) -- reported as "idle"
    // rather than an error so the (currently unused) sync-status poller doesn't alarm.
    res.json({ success: true, data: { syncing: false, lastSyncAt: null } });
  }),

  triggerSync: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.status(501).json({ success: false, error: 'No live Neutara Ticketing sync is configured — upload a ticket export CSV instead.' });
  }),

  getConfig: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    // "configured" = a data source exists at all (an uploaded export, in this design);
    // "enabled" = the manual show/hide toggle, independent of whether data exists.
    res.json({ success: true, data: { configured: isNtaDataAvailable(), enabled: !getNtaManuallyDisabled() } });
  }),

  setConfig: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ success: false, error: '"enabled" (boolean) is required' });
      return;
    }
    setNtaManuallyDisabled(!enabled);
    res.json({ success: true, data: { enabled } });
  }),

  getStats: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: getStats(currentStore()) });
  }),

  getSpaces: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: getSpaces(currentStore()) });
  }),

  getAssignees: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: getAssignees(currentStore()) });
  }),

  getReporters: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: getReporters(currentStore()) });
  }),

  getProjectManagers: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: getProjectManagers(currentStore()) });
  }),

  getDepartments: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: getDepartments(currentStore()) });
  }),

  getIssues: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const result = getIssues(currentStore(), page, limit);
    res.json({ success: true, data: result.data, total: result.total, totalPages: result.totalPages });
  }),

  search: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const results = searchTickets(currentStore(), filtersFromQuery(req.query));
    res.json({ success: true, data: results, total: results.length });
  }),

  getTrends: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const groupBy = (req.query.groupBy as string) === 'month' ? 'month' : 'week';
    const buckets = getTrends(currentStore(), groupBy, filtersFromQuery(req.query));
    res.json({ success: true, data: buckets });
  }),

  getByCustomers: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const customers = ((req.query.customers as string) || '').split(',').filter(Boolean);
    const results = searchTickets(currentStore(), {}).filter((t) => customers.some((c) => (t.customerName || '').toLowerCase().includes(c.toLowerCase())));
    res.json({ success: true, data: results });
  }),
};
