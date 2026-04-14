import { Request, Response } from 'express';
import { changeRequestService } from '../services/changeRequestService';
import { asyncHandler, AppError } from '../middleware/errorHandler';

export const changeRequestController = {
  getByProject: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const requests = await changeRequestService.getByProject(projectId);
    res.json({ success: true, data: requests });
  }),

  getById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const request = await changeRequestService.getById(id);
    if (!request) throw new AppError('Change request not found', 404);
    res.json({ success: true, data: request });
  }),

  getPending: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const requests = await changeRequestService.getPending();
    res.json({ success: true, data: requests });
  }),

  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const request = await changeRequestService.create(req.body);
    res.status(201).json({ success: true, data: request });
  }),

  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const request = await changeRequestService.update(id, req.body);
    res.json({ success: true, data: request });
  }),

  review: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { reviewedBy } = req.body;
    if (!reviewedBy) throw new AppError('Reviewer name required', 400);
    const request = await changeRequestService.review(id, reviewedBy);
    res.json({ success: true, data: request });
  }),

  approve: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { approvedBy } = req.body;
    if (!approvedBy) throw new AppError('Approver name required', 400);
    const request = await changeRequestService.approve(id, approvedBy);
    res.json({ success: true, data: request });
  }),

  reject: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { reviewedBy } = req.body;
    if (!reviewedBy) throw new AppError('Reviewer name required', 400);
    const request = await changeRequestService.reject(id, reviewedBy);
    res.json({ success: true, data: request });
  }),

  implement: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const request = await changeRequestService.implement(id);
    res.json({ success: true, data: request });
  }),

  delete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await changeRequestService.delete(id);
    res.json({ success: true, message: 'Change request deleted' });
  }),

  getSummary: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const summary = await changeRequestService.getSummary(projectId);
    res.json({ success: true, data: summary });
  }),
};
