import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { platformReviewService } from '../services/platformReviewService';

export const platformReviewController = {
  getAll: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { platform, projectName, projectManager, accountManager, minRating, segment } = req.query;
    const data = await platformReviewService.getAll({
      platform: platform as string | undefined,
      projectName: projectName as string | undefined,
      projectManager: projectManager as string | undefined,
      accountManager: accountManager as string | undefined,
      segment: segment as string | undefined,
      minRating: minRating !== undefined ? Number(minRating) : undefined,
    });
    res.json({ success: true, data });
  }),

  getPlatforms: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await platformReviewService.getPlatforms();
    res.json({ success: true, data });
  }),

  getManagerOptions: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await platformReviewService.getManagerOptions();
    res.json({ success: true, data });
  }),

  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { platform, projectName, rating } = req.body;
    if (!platform || !projectName || rating === undefined || rating === null) {
      throw new AppError('platform, projectName, and rating are required', 400);
    }
    const ratingNum = Number(rating);
    if (Number.isNaN(ratingNum) || ratingNum < 0 || ratingNum > 5) {
      throw new AppError('rating must be a number between 0 and 5', 400);
    }
    const data = await platformReviewService.create({ ...req.body, rating: ratingNum });
    res.status(201).json({ success: true, data });
  }),

  // POST /api/platform-reviews/media — multipart upload, files already written to disk by
  // the upload.array() middleware; this just maps them to the {url, type} shape the create
  // form attaches to the review it's about to submit.
  uploadMedia: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) throw new AppError('No files uploaded', 400);

    const data = files.map((f) => ({
      url: `/uploads/review-media/${f.filename}`,
      type: f.mimetype.startsWith('video/') ? 'video' : 'image',
    }));
    res.json({ success: true, data });
  }),

  delete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const deleted = await platformReviewService.delete(req.params.id);
    if (!deleted) throw new AppError('Review not found', 404);
    res.json({ success: true });
  }),
};
