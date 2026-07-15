import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AppError } from '../middleware/errorHandler';
import { externalService } from '../services/externalService';

export const externalController = {
  getAllData: asyncHandler(async (_req: Request, res: Response) => {
    const data = await externalService.getAllData();
    res.json({ success: true, data });
  }),

  getMigrationManagerData: asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
    const data = await externalService.getMigrationManagerData(startDate, endDate);
    res.json({ success: true, data });
  }),

  getMbrData: asyncHandler(async (req: Request, res: Response) => {
    const { manager, startDate, endDate } = req.query as { manager?: string; startDate?: string; endDate?: string };
    const data = await externalService.getMbrData(manager, startDate, endDate);
    res.json({ success: true, data });
  }),

  getApiKey: asyncHandler(async (req: Request, res: Response) => {
    const { scope } = req.params;
    if (!externalService.isValidScope(scope)) {
      throw new AppError('Invalid API key scope', 400);
    }
    const apiKey = await externalService.getApiKey(scope);
    res.json({ success: true, data: { scope, apiKey } });
  }),

  regenerateApiKey: asyncHandler(async (req: Request, res: Response) => {
    const { scope } = req.params;
    if (!externalService.isValidScope(scope)) {
      throw new AppError('Invalid API key scope', 400);
    }
    const apiKey = await externalService.regenerateApiKey(scope);
    res.json({ success: true, data: { scope, apiKey } });
  }),
};
