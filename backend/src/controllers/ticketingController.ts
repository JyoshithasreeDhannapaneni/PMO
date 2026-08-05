import { Request, Response } from 'express';
import { ticketingService, SearchFilters } from '../services/ticketingService';
import { ntaSyncService } from '../services/ntaSyncService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

function filtersFromQuery(req: Request): SearchFilters {
  return {
    key:           (req.query.key           as string) || undefined,
    summary:       (req.query.summary       as string) || undefined,
    status:        (req.query.status        as string) || undefined,
    priority:      (req.query.priority      as string) || undefined,
    customer:      (req.query.customer      as string) || undefined,
    assignee:      (req.query.assignee      as string) || undefined,
    reporter:      (req.query.reporter      as string) || undefined,
    projectManager:(req.query.projectManager as string) || undefined,
    department:    (req.query.department    as string) || undefined,
    spaces:        (req.query.spaces        as string) || undefined,
    createdFrom:   (req.query.createdFrom   as string) || undefined,
    createdTo:     (req.query.createdTo     as string) || undefined,
  };
}

export const ticketingController = {
  checkConfig: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const configured = ticketingService.isConfigured();
    const enabled = await ticketingService.isEnabled();
    res.json({ success: true, data: { configured, enabled } });
  }),

  setEnabled: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ success: false, error: '`enabled` must be a boolean' });
      return;
    }
    await ticketingService.setEnabled(enabled);
    logger.info(`NTA ticketing ${enabled ? 'enabled' : 'disabled'} via UI`);
    res.json({ success: true, data: { enabled } });
  }),

  getStats: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await ticketingService.getStats();
    res.json({ success: true, data });
  }),

  getSpaces: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await ticketingService.getSpaces();
    res.json({ success: true, data });
  }),

  getIssues: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);
    const page  = Math.max(parseInt((req.query.page  as string) || '1',  10), 1);
    const spaces = (req.query.spaces as string) || '';
    logger.info(`NTA tickets requested from DB: page=${page} limit=${limit} spaces=${spaces}`);
    const data = await ticketingService.getIssues({ limit, page, spaces: spaces || undefined });
    res.json({ success: true, data: data.issues, total: data.total, page: data.page, totalPages: data.totalPages });
  }),

  searchTickets: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const filters = filtersFromQuery(req);
    logger.info(`NTA search from DB: ${JSON.stringify(filters)}`);
    const result = await ticketingService.searchTickets(filters);
    res.json({ success: true, data: result.tickets, total: result.total, cached: result.cached, cacheAge: result.cacheAge });
  }),

  getAssignees: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await ticketingService.getAssignees();
    res.json({ success: true, data });
  }),

  getReporters: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await ticketingService.getReporters();
    res.json({ success: true, data });
  }),

  getProjectManagers: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await ticketingService.getProjectManagers();
    res.json({ success: true, data });
  }),

  getDepartments: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await ticketingService.getDepartments();
    res.json({ success: true, data });
  }),

  getTrends: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const groupBy = (req.query.groupBy as string) === 'month' ? 'month' : 'week';
    const filters = filtersFromQuery(req);
    logger.info(`NTA trends from DB: groupBy=${groupBy}`);
    const result = await ticketingService.getTrends({ groupBy, ...filters });
    res.json({ success: true, data: result.buckets });
  }),

  getCustomerTickets: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const raw = (req.query.customers as string) || '';
    const customerNames = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!customerNames.length) {
      res.status(400).json({ success: false, error: 'customers query param required' });
      return;
    }
    const result = await ticketingService.getTicketsForCustomers(customerNames);
    res.json({ success: true, data: result.tickets, total: result.tickets.length, scanned: result.scanned, truncated: result.truncated });
  }),

  // ─── Sync ─────────────────────────────────────────────────────────────────

  getSyncStatus: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const lastSync = ntaSyncService.getLastSync();
    const dbCount  = await ntaSyncService.getDbCount();
    res.json({
      success: true,
      data: {
        syncing:   ntaSyncService.isSyncing(),
        lastSyncAt: lastSync ? new Date(lastSync.at).toISOString() : null,
        lastSyncCount: lastSync?.synced ?? null,
        dbTotal:   dbCount,
        configured: ticketingService.isConfigured(),
      },
    });
  }),

  triggerSync: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    if (!ticketingService.isConfigured()) {
      res.status(503).json({ success: false, error: 'NTA_API_KEY not configured' });
      return;
    }
    if (ntaSyncService.isSyncing()) {
      res.json({ success: true, message: 'Sync already in progress' });
      return;
    }
    // Fire-and-forget: respond immediately, sync runs in background
    ntaSyncService.syncFromNta().catch((err) => logger.error(`Manual sync failed: ${err}`));
    res.json({ success: true, message: 'Sync started' });
  }),
};
