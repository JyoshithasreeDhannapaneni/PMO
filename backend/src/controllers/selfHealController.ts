import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { selfHealService } from '../services/selfHealService';

export const selfHealController = {
  getIncidents: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const incidents = await selfHealService.getRecentIncidents(limit);
    res.json({
      success: true,
      data: { incidents, isConfigured: selfHealService.isConfigured(), isGithubConfigured: selfHealService.isGithubConfigured() },
    });
  }),

  resolveIncident: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await selfHealService.resolveIncident(req.params.id, req.body?.notes);
    res.json({ success: true });
  }),

  // Manual trigger — runs the same full self-heal pass as the 15-minute cron right now
  // (auto-resolve, diagnose, fix PRs) instead of waiting for the next tick.
  triggerDiagnosis: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const result = await selfHealService.runFullPass();
    res.json({ success: true, data: result });
  }),
};
