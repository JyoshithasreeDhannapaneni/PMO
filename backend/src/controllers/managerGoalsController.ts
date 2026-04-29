import { Request, Response } from 'express';
import { managerGoalsService } from '../services/managerGoalsService';
import { asyncHandler } from '../middleware/errorHandler';

export const managerGoalsController = {
  getAll: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await managerGoalsService.getAll();
    res.json({ success: true, data });
  }),

  getWithStats: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const managerName = req.query.manager as string | undefined;
    const data = await managerGoalsService.getManagerStatsWithGoals(managerName);
    res.json({ success: true, data });
  }),

  upsert: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { managerName, goalPct } = req.body;
    if (!managerName || goalPct === undefined) {
      res.status(400).json({ success: false, error: { message: 'managerName and goalPct are required' } });
      return;
    }
    const pct = parseInt(goalPct, 10);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      res.status(400).json({ success: false, error: { message: 'goalPct must be 0–100' } });
      return;
    }
    const data = await managerGoalsService.upsert(managerName, pct);
    res.json({ success: true, data });
  }),

  delete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await managerGoalsService.delete(id);
    res.json({ success: true, message: 'Manager goal deleted' });
  }),
};
