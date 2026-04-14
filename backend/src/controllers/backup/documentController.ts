import { Request, Response } from 'express';
import { documentService } from '../services/documentService';
import { asyncHandler, AppError } from '../middleware/errorHandler';

export const documentController = {
  getByProject: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const docs = await documentService.getByProject(projectId);
    res.json({ success: true, data: docs });
  }),

  getById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const doc = await documentService.getById(id);
    if (!doc) throw new AppError('Document not found', 404);
    res.json({ success: true, data: doc });
  }),

  getByCategory: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId, category } = req.params;
    const docs = await documentService.getByCategory(projectId, category as any);
    res.json({ success: true, data: docs });
  }),

  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const doc = await documentService.create(req.body);
    res.status(201).json({ success: true, data: doc });
  }),

  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const doc = await documentService.update(id, req.body);
    res.json({ success: true, data: doc });
  }),

  delete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await documentService.delete(id);
    res.json({ success: true, message: 'Document deleted' });
  }),

  getSummary: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const summary = await documentService.getSummary(projectId);
    res.json({ success: true, data: summary });
  }),
};
