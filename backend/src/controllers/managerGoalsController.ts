import { Request, Response } from 'express';
import { managerGoalsService, gartnerStatsService } from '../services/managerGoalsService';
import { authService } from '../services/authService';
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

  getGartnerStats: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const statsData = await managerGoalsService.getManagerStatsWithGoals();
    const managerNames = statsData.map((s) => s.manager);
    const data = await gartnerStatsService.getAll(managerNames);
    res.json({ success: true, data });
  }),

  updateGartnerStats: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    let reqUser = null;
    if (token) {
      try { reqUser = await authService.getUserFromToken(token); } catch {}
    }
    if (!reqUser || reqUser.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: { message: 'Forbidden: Admin only' } });
      return;
    }
    const { managerName } = req.params;
    const { projects_closed, gartner_reviews } = req.body;
    if (projects_closed === undefined || gartner_reviews === undefined) {
      res.status(400).json({ success: false, error: { message: 'projects_closed and gartner_reviews are required' } });
      return;
    }
    const data = await gartnerStatsService.update(
      decodeURIComponent(managerName),
      parseInt(projects_closed, 10),
      parseInt(gartner_reviews, 10),
      reqUser.name || reqUser.email || 'admin'
    );
    res.json({ success: true, data });
  }),
};
