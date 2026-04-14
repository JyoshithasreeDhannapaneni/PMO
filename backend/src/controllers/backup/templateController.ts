import { Request, Response } from 'express';
import { templateService } from '../services/templateService';
import { asyncHandler, AppError } from '../middleware/errorHandler';

export const templateController = {
  getAll: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const templates = await templateService.getAll();
    res.json({
      success: true,
      data: templates,
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const template = await templateService.getById(id);

    if (!template) {
      throw new AppError('Template not found', 404);
    }

    res.json({
      success: true,
      data: template,
    });
  }),

  getByCode: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { code } = req.params;
    const template = await templateService.getByCode(code);

    if (!template) {
      throw new AppError('Template not found', 404);
    }

    res.json({
      success: true,
      data: template,
    });
  }),

  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const template = await templateService.create(req.body);
    res.status(201).json({
      success: true,
      data: template,
    });
  }),

  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const template = await templateService.update(id, req.body);
    res.json({
      success: true,
      data: template,
    });
  }),

  delete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await templateService.delete(id);
    res.json({
      success: true,
      message: 'Template deleted successfully',
    });
  }),

  addPhase: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const phase = await templateService.addPhase(id, req.body);
    res.status(201).json({
      success: true,
      data: phase,
    });
  }),

  updatePhase: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { phaseId } = req.params;
    const phase = await templateService.updatePhase(phaseId, req.body);
    res.json({
      success: true,
      data: phase,
    });
  }),

  deletePhase: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { phaseId } = req.params;
    await templateService.deletePhase(phaseId);
    res.json({
      success: true,
      message: 'Phase deleted successfully',
    });
  }),

  addTask: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { phaseId } = req.params;
    const task = await templateService.addTask(phaseId, req.body);
    res.status(201).json({
      success: true,
      data: task,
    });
  }),

  updateTask: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { taskId } = req.params;
    const task = await templateService.updateTask(taskId, req.body);
    res.json({
      success: true,
      data: task,
    });
  }),

  deleteTask: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { taskId } = req.params;
    await templateService.deleteTask(taskId);
    res.json({
      success: true,
      message: 'Task deleted successfully',
    });
  }),

  seedDefaults: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await templateService.seedDefaultTemplates();
    res.json({
      success: true,
      message: 'Default templates seeded successfully',
    });
  }),
};
