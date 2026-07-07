import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { isHubspotConfigured, getDealsByCustomer } from '../services/hubspotService';
import { logger } from '../utils/logger';

export const hubspotController = {

  getStatus: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: { configured: isHubspotConfigured() } });
  }),

  getSignals: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!isHubspotConfigured()) {
      res.json({ success: true, data: { configured: false, fetchedAt: null, customers: {} } });
      return;
    }
    try {
      const forceRefresh = req.query.refresh === 'true';
      const data = await getDealsByCustomer(forceRefresh);
      res.json({ success: true, data });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`[HubSpot] Failed to fetch deals: ${message}`);
      res.status(500).json({ success: false, error: 'Failed to fetch HubSpot deals — verify the access token and its scopes (crm.objects.deals.read, crm.objects.companies.read)' });
    }
  }),
};
