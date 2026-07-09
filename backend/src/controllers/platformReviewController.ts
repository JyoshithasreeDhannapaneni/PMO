import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AppError } from '../middleware/errorHandler';
import { platformReviewService } from '../services/platformReviewService';

export const platformReviewController = {
  getAll: asyncHandler(async (req: Request, res: Response) => {
    const { platform, projectName, projectManager, accountManager, minRating, segment } = req.query as {
      platform?: string; projectName?: string; projectManager?: string; accountManager?: string; minRating?: string; segment?: string;
    };
    const data = await platformReviewService.getAll({
      platform,
      projectName,
      projectManager,
      accountManager,
      minRating: minRating ? Number(minRating) : undefined,
      segment,
    });
    res.json({ success: true, data });
  }),

  getPlatforms: asyncHandler(async (_req: Request, res: Response) => {
    const data = await platformReviewService.getPlatforms();
    res.json({ success: true, data });
  }),

  getManagerOptions: asyncHandler(async (_req: Request, res: Response) => {
    const data = await platformReviewService.getManagerOptions();
    res.json({ success: true, data });
  }),

  getSummary: asyncHandler(async (_req: Request, res: Response) => {
    const data = await platformReviewService.getSummaryByPlatform();
    res.json({ success: true, data });
  }),

  getManagerSummary: asyncHandler(async (req: Request, res: Response) => {
    const { type } = req.query as { type?: string };
    const field = type === 'accountManager' ? 'account_manager' : 'project_manager';
    const data = await platformReviewService.getSummaryByManager(field);
    res.json({ success: true, data });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const b = req.body;
    if (!b.platform || !b.projectName) {
      throw new AppError('platform and projectName are required', 400);
    }
    if (typeof b.rating !== 'number' || b.rating < 0 || b.rating > 5) {
      throw new AppError('rating must be a number between 0 and 5', 400);
    }
    if (b.segment && !['SMB', 'ENT'].includes(b.segment)) {
      throw new AppError('segment must be SMB or ENT', 400);
    }
    const data = await platformReviewService.create(b);
    res.status(201).json({ success: true, data });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    await platformReviewService.delete(req.params.id);
    res.json({ success: true });
  }),
};
