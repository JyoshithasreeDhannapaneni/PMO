import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { isJiraConfigured, getSlaByManager, getLastMonthRange } from '../services/jiraService';

export const jiraController = {
  getStatus: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, configured: isJiraConfigured() });
  }),

  getSlaForManager: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const manager = req.query.manager as string | undefined;
    if (!manager) {
      res.status(400).json({ success: false, error: { message: 'manager query param is required' } });
      return;
    }

    if (!isJiraConfigured()) {
      res.json({ success: true, configured: false, data: null });
      return;
    }

    const { startDate, endDate } = getLastMonthRange();
    const data = await getSlaByManager(manager, startDate, endDate);
    res.json({ success: true, configured: true, data });
  }),
};
