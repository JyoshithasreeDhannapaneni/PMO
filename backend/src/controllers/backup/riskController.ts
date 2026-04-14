import { Request, Response } from 'express';
import { riskService } from '../services/riskService';
import { asyncHandler, AppError } from '../middleware/errorHandler';

export const riskController = {
  getByProject: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const risks = await riskService.getByProject(projectId);
    res.json({ success: true, data: risks });
  }),

  getById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const risk = await riskService.getById(id);
    if (!risk) throw new AppError('Risk not found', 404);
    res.json({ success: true, data: risk });
  }),

  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const risk = await riskService.create(req.body);
    res.status(201).json({ success: true, data: risk });
  }),

  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const risk = await riskService.update(id, req.body);
    res.json({ success: true, data: risk });
  }),

  delete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await riskService.delete(id);
    res.json({ success: true, message: 'Risk deleted' });
  }),

  getRiskMatrix: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const matrix = await riskService.getRiskMatrix(projectId);
    res.json({ success: true, data: matrix });
  }),

  getSummary: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const summary = await riskService.getRiskSummary(projectId);
    res.json({ success: true, data: summary });
  }),
};
