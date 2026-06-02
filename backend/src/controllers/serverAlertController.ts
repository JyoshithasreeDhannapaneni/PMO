import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { serverAlertService } from '../services/serverAlertService';

export const serverAlertController = {
  getStatus: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await serverAlertService.getAlertStatus();
    res.json({ success: true, data });
  }),

  getLogs: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const limit = parseInt(String(_req.query.limit || '100'));
    const data = await serverAlertService.getLogs(limit);
    res.json({ success: true, data });
  }),

  sendManual: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const result = await serverAlertService.sendManual(id);
    res.json(result);
  }),

  runNow: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const result = await serverAlertService.runDailyAlerts();
    res.json({ success: true, data: result });
  }),
};
