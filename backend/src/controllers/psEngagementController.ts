import { Request, Response } from 'express';
import { psEngagementService } from '../services/psEngagementService';
import { asyncHandler } from '../middleware/errorHandler';

export const psEngagementController = {
  getAll: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const engagements = await psEngagementService.getAll();
    res.json({ success: true, data: engagements });
  }),

  getById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const engagement = await psEngagementService.getById(id);
    res.json({ success: true, data: engagement });
  }),

  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const engagement = await psEngagementService.create(req.body);
    res.status(201).json({ success: true, data: engagement });
  }),

  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const engagement = await psEngagementService.update(id, req.body);
    res.json({ success: true, data: engagement });
  }),

  remove: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await psEngagementService.remove(id);
    res.json({ success: true, data: null });
  }),
};
