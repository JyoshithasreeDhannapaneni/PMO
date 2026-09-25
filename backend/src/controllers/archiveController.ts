import { Request, Response } from 'express';
import { archiveService } from '../services/archiveService';
import { sharepointSyncService } from '../services/sharepointSyncService';
import { asyncHandler } from '../middleware/errorHandler';

export const archiveController = {
  getProjects: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await archiveService.getArchivedProjects({
      search: req.query.search as string,
      status: req.query.status as string,
      tab: req.query.tab as string,
      migrationType: req.query.migrationType as string,
      projectManager: req.query.projectManager as string,
      monthFrom: req.query.monthFrom as string,
      monthTo: req.query.monthTo as string,
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

  getSharePointItems: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await sharepointSyncService.getItems({
      search: (req.query.search as string) || undefined,
      includeRemoved: req.query.includeRemoved === 'true',
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
    });
    res.json({ success: true, data: result });
  }),

  syncSharePoint: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = (req as Request & { user?: { name?: string; email?: string } }).user;
    try {
      const report = await sharepointSyncService.syncFromGraph(user?.name || user?.email || 'admin');
      res.json({ success: true, data: report });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'SharePoint sync failed' });
    }
  }),

  importSharePointFile: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = (req as Request & { user?: { name?: string; email?: string } }).user;
    if (!req.file) {
      res.status(400).json({ success: false, error: 'Upload an .xlsx or .csv export of the SharePoint list in the "file" field.' });
      return;
    }
    try {
      const report = await sharepointSyncService.importFile(req.file.buffer, user?.name || user?.email || 'admin');
      res.json({ success: true, data: report });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'SharePoint file import failed' });
    }
  }),

  importSharePointAttachments: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = (req as Request & { user?: { name?: string; email?: string } }).user;
    if (!req.file) {
      res.status(400).json({ success: false, error: 'Upload the saved SharePoint attachments page in the "file" field.' });
      return;
    }
    try {
      const report = await sharepointSyncService.importAttachments(req.file.buffer, user?.name || user?.email || 'admin');
      res.json({ success: true, data: report });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Attachment import failed' });
    }
  }),

  getSharePointSyncStatus: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const lastRun = await sharepointSyncService.getLastRun();
    res.json({ success: true, data: { isConfigured: sharepointSyncService.isConfigured(), lastRun } });
  }),
};
