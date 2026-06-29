import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import {
  isJiraConfigured,
  getSlaByManager,
  getEngineerStats,
  getLastMonthRange,
  listAllFields,
  listProjects,
  sampleTickets,
} from '../services/jiraService';
import {
  isOAuthConfigured,
  isOAuthConnected,
  loadTokens,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  revokeTokens,
} from '../services/jiraOAuthService';
import {
  parseJiraExcel,
  saveExcelData,
  loadExcelData,
  clearExcelData,
  isExcelDataAvailable,
  getExcelSlaByManager,
  getExcelEngineerStats,
} from '../services/jiraExcelService';
import { logger } from '../utils/logger';

export const jiraController = {
  getStatus: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, configured: isJiraConfigured() });
  }),

  getFields: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    if (!isJiraConfigured()) {
      res.json({ success: false, error: 'Jira not configured' });
      return;
    }
    try {
      const fields = await listAllFields();
      res.json({ success: true, fields });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }),

  listProjects: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    if (!isJiraConfigured()) { res.json({ success: false, error: 'Jira not configured' }); return; }
    try {
      const projects = await listProjects();
      res.json({ success: true, projects });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message, detail: err.response?.data });
    }
  }),

  sampleTickets: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    if (!isJiraConfigured()) {
      res.json({ success: false, error: 'Jira not configured' });
      return;
    }
    try {
      const samples = await sampleTickets();
      res.json({ success: true, samples });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message, detail: err.response?.data });
    }
  }),

  getSlaForManager: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const manager = req.query.manager as string | undefined;
    if (!manager) {
      res.status(400).json({ success: false, error: 'manager query param is required' });
      return;
    }

    const jiraBaseUrl = (process.env.JIRA_API_URL || 'https://cf2020.atlassian.net').replace(/\/+$/, '');

    // Excel upload takes priority over live Jira API
    if (isExcelDataAvailable()) {
      try {
        const store = loadExcelData()!;
        const data = getExcelSlaByManager(manager, store);
        res.json({ success: true, configured: true, source: 'excel', jiraBaseUrl, data });
        return;
      } catch (err: any) {
        logger.error(`[Excel] getSlaForManager failed: ${err.message}`);
      }
    }

    if (!isJiraConfigured()) {
      res.json({ success: true, configured: false, data: null });
      return;
    }
    try {
      const { startDate, endDate, nextMonthStart } = getLastMonthRange();
      logger.info(`[Jira] SLA for manager="${manager}" ${startDate}→${endDate}`);
      const data = await getSlaByManager(manager, startDate, endDate, nextMonthStart);
      res.json({ success: true, configured: true, jiraBaseUrl, data });
    } catch (err: any) {
      logger.error(`[Jira] getSlaForManager failed: ${err.message}`);
      res.status(500).json({ success: false, configured: true, error: err.message, hint: err.response?.data ?? null });
    }
  }),

  getEngineerStats: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    // Excel upload takes priority over live Jira API
    if (isExcelDataAvailable()) {
      try {
        const store = loadExcelData()!;
        const data = getExcelEngineerStats(store);
        res.json({ success: true, configured: true, source: 'excel', data });
        return;
      } catch (err: any) {
        logger.error(`[Excel] getEngineerStats failed: ${err.message}`);
      }
    }

    if (!isJiraConfigured()) {
      res.json({ success: true, configured: false, data: null });
      return;
    }
    try {
      const { startDate, endDate, nextMonthStart } = getLastMonthRange();
      logger.info(`[Jira] Engineer stats ${startDate}→${endDate}`);
      const data = await getEngineerStats(startDate, endDate, nextMonthStart);
      res.json({ success: true, configured: true, data });
    } catch (err: any) {
      logger.error(`[Jira] getEngineerStats failed: ${err.message}`);
      res.status(500).json({ success: false, configured: true, error: err.message, hint: err.response?.data ?? null });
    }
  }),

  // ── Excel upload endpoints ────────────────────────────────────────────────

  excelStatus: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const store = loadExcelData();
    if (!store) {
      res.json({ success: true, available: false });
      return;
    }
    res.json({
      success:    true,
      available:  true,
      filename:   store.filename,
      uploadedAt: store.uploadedAt,
      ticketCount: store.ticketCount,
      columnMap:  store.columnMap,
    });
  }),

  uploadExcel: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ success: false, error: 'No file uploaded. Send a multipart/form-data request with field name "file".' });
      return;
    }
    try {
      const store = parseJiraExcel(file.buffer, file.originalname);
      saveExcelData(store);
      res.json({
        success:     true,
        filename:    store.filename,
        ticketCount: store.ticketCount,
        columnMap:   store.columnMap,
        uploadedAt:  store.uploadedAt,
      });
    } catch (err: any) {
      logger.error(`[Excel] Upload failed: ${err.message}`);
      res.status(422).json({ success: false, error: err.message });
    }
  }),

  clearExcel: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    clearExcelData();
    res.json({ success: true, message: 'Excel data cleared' });
  }),

  // ── OAuth 2.0 endpoints ───────────────────────────────────────────────────

  oauthStatus: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const configured = isOAuthConfigured();
    const connected  = isOAuthConnected();
    const tokens     = connected ? loadTokens() : null;
    res.json({
      success:    true,
      configured,
      connected,
      connectedAs: tokens?.connectedAs ?? null,
      cloudUrl:    tokens?.cloudUrl    ?? null,
    });
  }),

  oauthConnect: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    if (!isOAuthConfigured()) {
      res.status(400).json({ success: false, error: 'JIRA_OAUTH_CLIENT_ID and JIRA_OAUTH_CLIENT_SECRET must be set in .env' });
      return;
    }
    const url = getAuthorizationUrl();
    res.redirect(url);
  }),

  oauthCallback: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { code, error } = req.query as Record<string, string>;
    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';

    if (error) {
      logger.error(`[Jira OAuth] Callback error: ${error}`);
      res.redirect(`${frontendBase}/manager-dashboard?jira_oauth=error&reason=${encodeURIComponent(error)}`);
      return;
    }
    if (!code) {
      res.redirect(`${frontendBase}/manager-dashboard?jira_oauth=error&reason=no_code`);
      return;
    }

    try {
      const tokens = await exchangeCodeForTokens(code);
      logger.info(`[Jira OAuth] Successfully connected as "${tokens.connectedAs}"`);
      res.redirect(`${frontendBase}/manager-dashboard?jira_oauth=success`);
    } catch (err: any) {
      logger.error(`[Jira OAuth] Token exchange failed: ${err.message}`);
      res.redirect(`${frontendBase}/manager-dashboard?jira_oauth=error&reason=${encodeURIComponent(err.message)}`);
    }
  }),

  oauthDisconnect: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    revokeTokens();
    res.json({ success: true, message: 'Jira OAuth disconnected' });
  }),
};
