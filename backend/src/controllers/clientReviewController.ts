import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AppError } from '../middleware/errorHandler';
import { clientReviewService } from '../services/clientReviewService';

export const clientReviewController = {
  getAll: asyncHandler(async (req: Request, res: Response) => {
    const { projectManager, customerName } = req.query as { projectManager?: string; customerName?: string };
    const data = await clientReviewService.getAll({ projectManager, customerName });
    res.json({ success: true, data });
  }),

  getManagerSummary: asyncHandler(async (_req: Request, res: Response) => {
    const data = await clientReviewService.getManagerSummary();
    res.json({ success: true, data });
  }),

  getByProject: asyncHandler(async (req: Request, res: Response) => {
    const data = await clientReviewService.getByProject(req.params.projectId);
    res.json({ success: true, data });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const b = req.body;
    if (!b.projectId || !b.reviewerName) {
      throw new AppError('projectId and reviewerName are required', 400);
    }
    for (const field of ['communicationScore', 'deliveryScore', 'qualityScore', 'supportScore']) {
      const val = b[field];
      if (typeof val !== 'number' || val < 1 || val > 5) {
        throw new AppError(`${field} must be a number between 1 and 5`, 400);
      }
    }
    const data = await clientReviewService.create(b);
    res.status(201).json({ success: true, data });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const data = await clientReviewService.update(req.params.id, req.body);
    if (!data) throw new AppError('Review not found', 404);
    res.json({ success: true, data });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    await clientReviewService.delete(req.params.id);
    res.json({ success: true });
  }),
};
