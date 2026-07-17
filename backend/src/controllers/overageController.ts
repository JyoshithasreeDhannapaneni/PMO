import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboardService';
import { asyncHandler, AppError } from '../middleware/errorHandler';

export const overageController = {
  uploadSow: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) throw new AppError('No file uploaded', 400);

    const uploaded = files.map((f) => ({
      url: `/uploads/overage-sow/${f.filename}`,
      name: f.originalname,
    }));
    const combined = await dashboardService.addOverageSowFiles(id, uploaded);
    res.json({ success: true, data: combined });
  }),
};
