import { Request, Response } from 'express';
import { dealDeskService, testGraphAuth } from '../services/dealDeskService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export const dealDeskController = {
  getDeals: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, limit, status, search, matchType } = req.query;
    const result = await dealDeskService.getDeals({
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 25,
      status: status as string | undefined,
      search: search as string | undefined,
      matchType: matchType as string | undefined,
    });
    res.json({ success: true, ...result });
  }),

  getDealById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const deal = await dealDeskService.getDealById(req.params.id);
    if (!deal) { res.status(404).json({ success: false, error: 'Deal not found' }); return; }
    res.json({ success: true, data: deal });
  }),

  getStats: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const stats = await dealDeskService.getStats();
    res.json({ success: true, data: stats });
  }),

  triggerPoll: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!dealDeskService.isConfigured()) {
      res.status(503).json({ success: false, error: 'Microsoft Graph API credentials not configured in .env' });
      return;
    }
    logger.info('Deal Desk: manual poll triggered');
    try {
      const result = await dealDeskService.processNewEmails();
      res.json({ success: true, data: result });
    } catch (err: any) {
      const detail = err?.response?.data ? JSON.stringify(err.response.data) : (err?.message || String(err));
      logger.error('Deal Desk poll error:', detail);
      res.status(500).json({ success: false, error: detail });
    }
  }),

  testAuth: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const t = process.env.MS_GRAPH_TENANT_ID || '';
    const c = process.env.MS_GRAPH_CLIENT_ID || '';
    const s = process.env.MS_GRAPH_CLIENT_SECRET || '';
    const diagnostics = {
      tenantId: t ? `${t.substring(0, 8)}… (len ${t.length})` : '(empty)',
      clientId: c ? `${c.substring(0, 8)}… (len ${c.length})` : '(empty)',
      secretLen: s.length,
      secretFirst4: s ? s.substring(0, 4) : '(empty)',
      secretLast4: s ? s.substring(s.length - 4) : '(empty)',
      dealDeskEmail: process.env.DEAL_DESK_EMAIL || '(empty)',
      configured: dealDeskService.isConfigured(),
    };
    if (!dealDeskService.isConfigured()) {
      res.json({ success: true, data: { configured: false, diagnostics, error: 'MS_GRAPH_* env vars not set or still contain PASTE_ placeholder' } });
      return;
    }
    const result = await testGraphAuth();
    res.json({ success: true, data: { ...result, diagnostics } });
  }),

  reparseDeals: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await dealDeskService.reparseAllDeals();
    res.json({ success: true, data: result });
  }),

  updateDealMatch: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { matchedPsId, matchedProjectId } = req.body;
    await dealDeskService.updateDealMatch(id, matchedPsId || null, matchedProjectId || null);
    res.json({ success: true, message: 'Match updated' });
  }),

  checkConfig: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: { configured: dealDeskService.isConfigured() } });
  }),
};
