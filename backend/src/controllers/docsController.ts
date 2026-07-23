import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as docsService from '../services/docsService';
import * as docsAuto from '../services/docsAutomationService';

export const docsController = {
  listDocuments: asyncHandler(async (_req: Request, res: Response) => {
    const documents = await docsService.listDocuments();
    res.json({ success: true, data: documents, total: documents.length });
  }),

  getDocument: asyncHandler(async (req: Request, res: Response) => {
    const doc = await docsService.getDocument(req.params.id);
    res.json({ success: true, data: doc });
  }),

  downloadDocument: asyncHandler(async (req: Request, res: Response) => {
    const { data, fileName } = await docsService.downloadDocument(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Content-Length', data.length);
    res.end(data);
  }),

  listQuotes: asyncHandler(async (_req: Request, res: Response) => {
    const quotes = await docsService.listQuotes();
    res.json({ success: true, data: quotes, total: quotes.length });
  }),

  processDocument: asyncHandler(async (req: Request, res: Response) => {
    const projectManagerName: string = req.body?.projectManagerName || (req as any).user?.email || 'Unassigned';
    const result = await docsAuto.processDocument(req.params.id, projectManagerName);
    res.json({ success: true, data: result });
  }),
};
