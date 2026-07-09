import { Request, Response } from 'express';
import { archiveService } from '../services/archiveService';
import { asyncHandler } from '../middleware/errorHandler';

export const archiveController = {
  getProjects: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await archiveService.getArchivedProjects({
      search: req.query.search as string,
      status: req.query.status as string,
      tab: req.query.tab as string,
      migrationType: req.query.migrationType as string,
      projectManager: req.query.projectManager as string,
      yearFrom: req.query.yearFrom as string,
      yearTo: req.query.yearTo as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    });
    res.json({ success: true, ...result });
  }),

  getStats: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const stats = await archiveService.getArchiveStats();
    res.json({ success: true, data: stats });
  }),

  getProjectData: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const data = await archiveService.getProjectFullData(id);
    if (!data) { res.status(404).json({ success: false, error: 'Project not found' }); return; }
    res.json({ success: true, data });
  }),

  restoreProject: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await archiveService.restoreProject(id);
    res.json({ success: true, message: 'Project restored to Active' });
  }),
};
