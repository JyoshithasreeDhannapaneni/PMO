import { Request, Response } from 'express';
import { commentService } from '../services/commentService';
import { asyncHandler, AppError } from '../middleware/errorHandler';

export const commentController = {
  getByEntity: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { entityType, entityId } = req.params;
    const comments = await commentService.getByEntity(entityType, entityId);
    res.json({ success: true, data: comments });
  }),

  getById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const comment = await commentService.getById(id);
    if (!comment) throw new AppError('Comment not found', 404);
    res.json({ success: true, data: comment });
  }),

  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user) throw new AppError('Authentication required', 401);
    
    const { entityType, entityId, content, parentId } = req.body;
    
    const comment = await commentService.create({
      userId: user.id,
      entityType,
      entityId,
      content,
      parentId,
    });
    
    res.status(201).json({ success: true, data: comment });
  }),

  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user) throw new AppError('Authentication required', 401);
    
    const { id } = req.params;
    const { content } = req.body;
    
    const comment = await commentService.update(id, user.id, { content });
    res.json({ success: true, data: comment });
  }),

  delete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user) throw new AppError('Authentication required', 401);
    
    const { id } = req.params;
    const isAdmin = user.role === 'ADMIN';
    
    await commentService.delete(id, user.id, isAdmin);
    res.json({ success: true, message: 'Comment deleted' });
  }),

  getCount: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { entityType, entityId } = req.params;
    const count = await commentService.getCount(entityType, entityId);
    res.json({ success: true, data: { count } });
  }),
};
