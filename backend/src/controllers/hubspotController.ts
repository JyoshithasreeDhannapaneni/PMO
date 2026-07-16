import { Request, Response } from 'express';
import axios from 'axios';
import { asyncHandler } from '../middleware/errorHandler';
import { isHubspotConfigured, getDealsByCustomer, generateInsights } from '../services/hubspotService';
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
      res.json({
        success: true,
        data: {
          configured: true,
          fetchedAt: null,
          customers: {},
          error: 'HubSpot API request failed — verify the token has crm.objects.deals.read and crm.objects.companies.read scopes',
        },
      });
    }
  }),

  // Returns AI-style insights per customer derived from their deal patterns
  getInsights: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!isHubspotConfigured()) {
      res.json({ success: true, data: {} });
      return;
    }
    const forceRefresh = req.query.refresh === 'true';
    const signalData = await getDealsByCustomer(forceRefresh);
    const insights: Record<string, ReturnType<typeof generateInsights>> = {};
    for (const [key, customer] of Object.entries(signalData.customers)) {
      const customerInsights = generateInsights(customer);
      if (customerInsights.length > 0) insights[key] = customerInsights;
    }
    res.json({ success: true, data: { fetchedAt: signalData.fetchedAt, insights } });
  }),

  // Returns all company keys and deal names currently indexed — for diagnosing match failures
  debugKeys: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    if (!isHubspotConfigured()) {
      res.json({ success: false, error: 'HubSpot not configured' });
      return;
    }
    try {
      const signalData = await getDealsByCustomer(true); // force fresh fetch
      const entries = Object.entries(signalData.customers).map(([key, c]) => ({
        normalizedKey: key,
        companyName: c.companyName,
        dealCount: c.deals.length,
        openDeals: c.deals.filter(d => d.isOpen).length,
        wonDeals: c.deals.filter(d => d.isClosedWon).length,
        lostDeals: c.deals.filter(d => d.isClosedLost).length,
        dealNames: c.deals.map((d) => d.name),
      }));
      res.json({
        success: true,
        data: {
          totalCompanies: entries.length,
          diagnostics: signalData.diagnostics,
          entries,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.json({ success: false, error: msg });
    }
  }),

  // Diagnostic endpoint — open in browser to verify connectivity and token scopes
  testConnection: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const token = (process.env.HUBSPOT_ACCESS_TOKEN || '').trim();
    if (!token || token.startsWith('PASTE_') || token === 'your-hubspot-access-token-here') {
      res.json({ success: false, configured: false, error: 'HUBSPOT_ACCESS_TOKEN not set in backend/.env' });
      return;
    }

    const client = axios.create({
      baseURL: 'https://api.hubapi.com',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15_000,
    });

    const checks: Record<string, { ok: boolean; detail: string }> = {};

    // 1. Portal/account identity — private app tokens use account-info, not oauth introspection
    try {
      const { data } = await client.get('/account-info/v3/details');
      checks.token = { ok: true, detail: `Portal ID ${data.portalId} · timezone ${data.timeZone || 'unknown'}` };
    } catch (e: any) {
      // Fallback: if account-info fails but deals/companies work, the token is still valid
      checks.token = { ok: false, detail: e?.response?.data?.message || e?.message || 'Could not fetch portal info' };
    }

    // 2. Pipelines (needs crm.objects.pipelines.read)
    try {
      const { data } = await client.get('/crm/v3/pipelines/deals');
      checks.pipelines = { ok: true, detail: `${(data.results || []).length} pipeline(s) accessible` };
    } catch (e: any) {
      checks.pipelines = { ok: false, detail: e?.response?.data?.message || 'Missing scope: crm.objects.pipelines.read' };
    }

    // 3. Deals (needs crm.objects.deals.read)
    try {
      const { data } = await client.get('/crm/v3/objects/deals', { params: { limit: 1, properties: 'dealname' } });
      checks.deals = { ok: true, detail: `Deal access confirmed (total not counted on this check)` };
    } catch (e: any) {
      checks.deals = { ok: false, detail: e?.response?.data?.message || 'Missing scope: crm.objects.deals.read' };
    }

    // 4. Companies (needs crm.objects.companies.read)
    try {
      const { data } = await client.get('/crm/v3/objects/companies', { params: { limit: 1, properties: 'name' } });
      checks.companies = { ok: true, detail: `Company access confirmed` };
    } catch (e: any) {
      checks.companies = { ok: false, detail: e?.response?.data?.message || 'Missing scope: crm.objects.companies.read' };
    }

    // success = all 3 API scope checks pass (token identity is informational only)
    const allOk = checks.pipelines.ok && checks.deals.ok && checks.companies.ok;
    res.json({ success: allOk, configured: true, checks });
  }),
};
