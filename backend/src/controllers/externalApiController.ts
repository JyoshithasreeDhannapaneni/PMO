import { Request, Response } from 'express';
import { externalApiService } from '../services/externalApiService';
import { asyncHandler } from '../middleware/errorHandler';

export const externalApiController = {
  getAllProjects: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const projects = await externalApiService.getAllProjects();
    res.json({ success: true, data: projects, total: projects.length });
  }),
};
