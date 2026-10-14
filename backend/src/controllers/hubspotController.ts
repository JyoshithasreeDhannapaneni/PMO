import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { isHubspotConfigured, getDealsByCustomer, generateInsights, getSyncStatus, triggerHubspotSync } from '../services/hubspotService';

export const hubspotController = {
  getStatus: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: await getSyncStatus() });
  }),

  // Always answered from the database. ?refresh=true starts a background sync and still
  // returns the stored data immediately; the page picks up the new data on its next load.
  getSignals: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (req.query.refresh === 'true') triggerHubspotSync();
    res.json({ success: true, data: await getDealsByCustomer() });
  }),

  getInsights: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    if (!isHubspotConfigured()) {
      res.json({ success: true, data: { fetchedAt: null, insights: {} } });
      return;
    }
    const signalData = await getDealsByCustomer();
    const insights: Record<string, ReturnType<typeof generateInsights>> = {};
    for (const [key, customer] of Object.entries(signalData.customers)) {
      const customerInsights = generateInsights(customer);
      if (customerInsights.length > 0) insights[key] = customerInsights;
    }
    res.json({ success: true, data: { fetchedAt: signalData.fetchedAt, insights } });
  }),

  // POST /api/hubspot/sync (ADMIN): ?full=true re-reads every deal and drops deleted ones.
  triggerSync: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    triggerHubspotSync(req.query.full === 'true');
    res.status(202).json({ success: true, data: await getSyncStatus() });
  }),
};
