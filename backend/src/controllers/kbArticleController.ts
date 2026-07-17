import { Request, Response } from 'express';
import { kbArticleService } from '../services/kbArticleService';
import { asyncHandler } from '../middleware/errorHandler';

export const kbArticleController = {
  getAll: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { search, category, projectManager, caseStudyId } = req.query as Record<string, string>;
    const articles = await kbArticleService.getAll({ search, category, projectManager, caseStudyId });
    res.json({ success: true, data: articles });
  }),

  getById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const article = await kbArticleService.getById(req.params.id);
    res.json({ success: true, data: article });
  }),

  extractFromCaseStudy: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const drafts = await kbArticleService.extractFromCaseStudy(req.params.caseStudyId);
    res.json({ success: true, data: drafts });
  }),

  bulkSave: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { caseStudyId, articles } = req.body;
    if (!caseStudyId || !Array.isArray(articles) || articles.length === 0) {
      res.status(400).json({ success: false, error: 'caseStudyId and articles array required' });
      return;
    }
    const saved = await kbArticleService.bulkSave(caseStudyId, articles);
    res.status(201).json({ success: true, data: saved });
  }),

  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const article = await kbArticleService.update(req.params.id, req.body);
    res.json({ success: true, data: article });
  }),

  delete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await kbArticleService.delete(req.params.id);
    res.json({ success: true, message: 'KB article deleted' });
  }),
};
