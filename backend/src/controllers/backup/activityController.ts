import { Request, Response } from 'express';
import { activityService } from '../services/activityService';
import { asyncHandler } from '../middleware/errorHandler';

export const activityController = {
  getAll: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, limit, entityType, entityId } = req.query;
    
    const result = await activityService.getAll({
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      entityType: entityType as string,
      entityId: entityId as string,
    });
    
    res.json({ success: true, ...result });
  }),

  getByEntity: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { entityType, entityId } = req.params;
    const { limit } = req.query;
    const activities = await activityService.getByEntity(
      entityType,
      entityId,
      limit ? parseInt(limit as string) : undefined
    );
    res.json({ success: true, data: activities });
  }),

  getRecent: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { limit } = req.query;
    const activities = await activityService.getRecentGlobal(limit ? parseInt(limit as string) : undefined);
    res.json({ success: true, data: activities });
  }),

  getByUser: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const { limit } = req.query;
    const activities = await activityService.getByUser(userId, limit ? parseInt(limit as string) : undefined);
    res.json({ success: true, data: activities });
  }),
};
