import { Request, Response } from 'express';
import { taskService } from '../services/taskService';
import { asyncHandler, AppError } from '../middleware/errorHandler';

export const taskController = {
  getProjectTasks: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const phases = await taskService.getProjectTasks(projectId);
    res.json({
      success: true,
      data: phases,
    });
  }),

  getGanttData: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const data = await taskService.getGanttData(projectId);

    if (!data) {
      throw new AppError('Project not found', 404);
    }

    res.json({
      success: true,
      data,
    });
  }),

  getTaskById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { taskId } = req.params;
    const task = await taskService.getTaskById(taskId);

    if (!task) {
      throw new AppError('Task not found', 404);
    }

    res.json({
      success: true,
      data: task,
    });
  }),

  updateTask: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { taskId } = req.params;
    const task = await taskService.updateTask(taskId, req.body);
    res.json({
      success: true,
      data: task,
    });
  }),

  updateTaskStatus: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { taskId } = req.params;
    const { status } = req.body;

    if (!status) {
      throw new AppError('Status is required', 400);
    }

    const task = await taskService.updateTaskStatus(taskId, status);
    res.json({
      success: true,
      data: task,
    });
  }),

  createFromTemplate: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const { templateCode, startDate } = req.body;

    if (!templateCode) {
      throw new AppError('Template code is required', 400);
    }

    const result = await taskService.createProjectTasksFromTemplate(
      projectId,
      templateCode,
      startDate ? new Date(startDate) : new Date()
    );

    if (!result) {
      throw new AppError('Template not found', 404);
    }

    res.json({
      success: true,
      message: 'Tasks created from template successfully',
    });
  }),

  autoUpdateStatuses: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const updatedCount = await taskService.autoUpdateTaskStatuses(projectId);
    
    res.json({
      success: true,
      message: `Auto-updated ${updatedCount} phase(s) based on task dates`,
      data: { updatedPhases: updatedCount },
    });
  }),
};
