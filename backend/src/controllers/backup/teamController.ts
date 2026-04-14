import { Request, Response } from 'express';
import { teamService } from '../services/teamService';
import { asyncHandler, AppError } from '../middleware/errorHandler';

export const teamController = {
  getByProject: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const members = await teamService.getByProject(projectId);
    res.json({ success: true, data: members });
  }),

  getById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const member = await teamService.getById(id);
    if (!member) throw new AppError('Team member not found', 404);
    res.json({ success: true, data: member });
  }),

  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const member = await teamService.create(req.body);
    res.status(201).json({ success: true, data: member });
  }),

  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const member = await teamService.update(id, req.body);
    res.json({ success: true, data: member });
  }),

  delete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await teamService.delete(id);
    res.json({ success: true, message: 'Team member removed' });
  }),

  getSummary: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const summary = await teamService.getTeamSummary(projectId);
    res.json({ success: true, data: summary });
  }),
};
