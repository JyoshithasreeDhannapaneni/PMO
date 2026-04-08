import { Request, Response } from 'express';
import { exportService } from '../services/exportService';
import { asyncHandler, AppError } from '../middleware/errorHandler';

export const exportController = {
  exportProjects: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { status, phase, format } = req.query;
    
    const csv = await exportService.exportProjectsToCSV({
      status: status as string,
      phase: phase as string,
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=projects-${Date.now()}.csv`);
    res.send(csv);
  }),

  exportProjectDetail: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    
    const data = await exportService.exportProjectDetailToJSON(projectId);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=project-${projectId}.json`);
    res.json(data);
  }),

  exportStatusReport: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { reportId } = req.params;
    
    const html = await exportService.exportStatusReportToHTML(reportId);
    
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename=status-report-${reportId}.html`);
    res.send(html);
  }),

  exportTasks: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    
    const csv = await exportService.exportTasksToCSV(projectId);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=tasks-${projectId}.csv`);
    res.send(csv);
  }),

  exportRisks: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    
    const csv = await exportService.exportRisksToCSV(projectId);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=risks-${projectId}.csv`);
    res.send(csv);
  }),
};
