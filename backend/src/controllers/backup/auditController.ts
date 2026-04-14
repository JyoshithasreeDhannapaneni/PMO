import { Request, Response } from 'express';
import { auditService } from '../services/auditService';
import { asyncHandler } from '../middleware/errorHandler';

export const auditController = {
  getAll: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, limit, userId, entityType, entityId, action, startDate, endDate } = req.query;
    
    const result = await auditService.getAll({
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      userId: userId as string,
      entityType: entityType as string,
      entityId: entityId as string,
      action: action as any,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });
    
    res.json({ success: true, ...result });
  }),

  getByEntity: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { entityType, entityId } = req.params;
    const logs = await auditService.getByEntity(entityType, entityId);
    res.json({ success: true, data: logs });
  }),

  getByUser: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const { limit } = req.query;
    const logs = await auditService.getByUser(userId, limit ? parseInt(limit as string) : undefined);
    res.json({ success: true, data: logs });
  }),

  getRecent: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { limit } = req.query;
    const logs = await auditService.getRecentActivity(limit ? parseInt(limit as string) : undefined);
    res.json({ success: true, data: logs });
  }),
};
