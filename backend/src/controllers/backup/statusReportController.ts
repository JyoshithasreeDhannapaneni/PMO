import { Request, Response } from 'express';
import { statusReportService } from '../services/statusReportService';
import { asyncHandler, AppError } from '../middleware/errorHandler';

export const statusReportController = {
  getByProject: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const reports = await statusReportService.getByProject(projectId);
    res.json({ success: true, data: reports });
  }),

  getById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const report = await statusReportService.getById(id);
    if (!report) throw new AppError('Report not found', 404);
    res.json({ success: true, data: report });
  }),

  getLatest: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const report = await statusReportService.getLatest(projectId);
    res.json({ success: true, data: report });
  }),

  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const report = await statusReportService.create(req.body);
    res.status(201).json({ success: true, data: report });
  }),

  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const report = await statusReportService.update(id, req.body);
    res.json({ success: true, data: report });
  }),

  delete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await statusReportService.delete(id);
    res.json({ success: true, message: 'Report deleted' });
  }),

  generateWeekly: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const { createdBy } = req.body;
    const report = await statusReportService.generateWeeklyReport(projectId, createdBy);
    if (!report) throw new AppError('Project not found', 404);
    res.status(201).json({ success: true, data: report });
  }),
};
