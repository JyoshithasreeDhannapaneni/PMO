import { Request, Response } from 'express';
import { searchService } from '../services/searchService';
import { asyncHandler } from '../middleware/errorHandler';

export const searchController = {
  globalSearch: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { q, limit } = req.query;
    
    if (!q || typeof q !== 'string') {
      res.json({ success: true, data: [] });
      return;
    }
    
    const results = await searchService.globalSearch(
      q,
      limit ? parseInt(limit as string) : undefined
    );
    
    res.json({ success: true, data: results });
  }),

  searchProjects: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { q, status, phase, migrationType } = req.query;
    
    const results = await searchService.searchProjects(
      (q as string) || '',
      {
        status: status as string,
        phase: phase as string,
        migrationType: migrationType as string,
      }
    );
    
    res.json({ success: true, data: results });
  }),
};
