import { Request, Response } from 'express';
import { ticketingService, SearchFilters } from '../services/ticketingService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export const ticketingController = {
  checkConfig: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: { configured: ticketingService.isConfigured() } });
  }),

  getStats: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    if (!ticketingService.isConfigured()) {
      res.status(503).json({ success: false, error: 'NTA_API_KEY not configured' });
      return;
    }
    const data = await ticketingService.getStats();
    res.json({ success: true, data });
  }),

  getSpaces: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    if (!ticketingService.isConfigured()) {
      res.status(503).json({ success: false, error: 'NTA_API_KEY not configured' });
      return;
    }
    const data = await ticketingService.getSpaces();
    res.json({ success: true, data });
  }),

  getCustomerTickets: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!ticketingService.isConfigured()) {
      res.status(503).json({ success: false, error: 'NTA_API_KEY not configured' });
      return;
    }
    const raw = (req.query.customers as string) || '';
    const customerNames = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!customerNames.length) { res.status(400).json({ success: false, error: 'customers query param required' }); return; }
    logger.info(`NTA customer tickets requested: ${customerNames.length} customers`);
    const result = await ticketingService.getTicketsForCustomers(customerNames);
    res.json({ success: true, data: result.tickets, total: result.tickets.length, scanned: result.scanned, truncated: result.truncated });
  }),

  searchTickets: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!ticketingService.isConfigured()) {
      res.status(503).json({ success: false, error: 'NTA_API_KEY not configured' });
      return;
    }
    const filters: SearchFilters = {
      key:        (req.query.key        as string) || undefined,
      summary:    (req.query.summary    as string) || undefined,
      status:     (req.query.status     as string) || undefined,
      priority:   (req.query.priority   as string) || undefined,
      customer:   (req.query.customer   as string) || undefined,
      assignee:   (req.query.assignee   as string) || undefined,
      reporter:   (req.query.reporter   as string) || undefined,
      department: (req.query.department as string) || undefined,
      spaces:     (req.query.spaces     as string) || undefined,
    };
    logger.info(`NTA search: ${JSON.stringify(filters)}`);
    const result = await ticketingService.searchTickets(filters);
    res.json({ success: true, data: result.tickets, total: result.total, cached: result.cached, cacheAge: result.cacheAge });
  }),

  getIssues: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!ticketingService.isConfigured()) {
      res.status(503).json({ success: false, error: 'NTA_API_KEY not configured' });
      return;
    }
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);
    const page = Math.max(parseInt((req.query.page as string) || '1', 10), 1);
    const spaces = (req.query.spaces as string) || '';

    logger.info(`NTA tickets requested: page=${page} limit=${limit} spaces=${spaces}`);
    const data = await ticketingService.getIssues({ limit, page, spaces: spaces || undefined });
    res.json({ success: true, data: data.issues, total: data.total, page: data.page, totalPages: data.totalPages });
  }),
};
