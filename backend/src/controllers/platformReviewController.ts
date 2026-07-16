import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AppError } from '../middleware/errorHandler';
import { platformReviewService } from '../services/platformReviewService';
import * as fs from 'fs';
import * as path from 'path';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB per image — videos are allowed up to multer's 1GB route limit

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

  // Files are already written to disk by multer at this point (see
  // platformReviewRoutes.ts) — this just validates image size and reports
  // back the URLs so the client can attach them on the subsequent create call.
  uploadMedia: asyncHandler(async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[]) || [];

    const oversizedImage = files.find((f) => !f.mimetype.startsWith('video/') && f.size > MAX_IMAGE_BYTES);
    if (oversizedImage) {
      for (const f of files) {
        try { fs.unlinkSync(f.path); } catch {}
      }
      throw new AppError(`"${oversizedImage.originalname}" is larger than 10MB — images must be 10MB or smaller`, 400);
    }

    const data = files.map((f) => ({
      url: `/uploads/review-media/${f.filename}`,
      type: f.mimetype.startsWith('video/') ? 'video' as const : 'image' as const,
    }));
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
    if (b.segment && !['SMB', 'ENT', 'PS'].includes(b.segment)) {
      throw new AppError('segment must be SMB, ENT, or PS', 400);
    }

    const mediaItems = Array.isArray(b.media)
      ? b.media.filter((m: any) => m && typeof m.url === 'string' && (m.type === 'image' || m.type === 'video'))
      : [];

    const data = await platformReviewService.create({ ...b, mediaItems });
    res.status(201).json({ success: true, data });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const existing = await platformReviewService.getById(req.params.id);
    for (const item of existing?.media || []) {
      const filePath = path.join(process.cwd(), item.url.replace(/^\//, ''));
      try { fs.unlinkSync(filePath); } catch {}
    }
    await platformReviewService.delete(req.params.id);
    res.json({ success: true });
  }),
};
