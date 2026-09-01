import { Request, Response } from 'express';
import { actionItemService } from '../services/actionItemService';
import { asyncHandler } from '../middleware/errorHandler';

export const actionItemController = {
  getAll: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const items = await actionItemService.getAll();
    res.json({ success: true, data: items });
  }),

  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    const item = await actionItemService.create({
      ...req.body,
      createdBy: user?.name,
    });
    res.status(201).json({ success: true, data: item });
  }),

  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const item = await actionItemService.update(id, req.body);
    res.json({ success: true, data: item });
  }),

  remove: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await actionItemService.remove(id);
    res.json({ success: true, data: null });
  }),
};
