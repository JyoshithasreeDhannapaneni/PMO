import { Request, Response } from 'express';
import { feedbackService, type FeedbackStatus, type FeedbackType } from '../services/feedbackService';
import { asyncHandler, AppError } from '../middleware/errorHandler';

const VALID_TYPES: FeedbackType[] = ['ISSUE', 'SUGGESTION'];
const VALID_STATUSES: FeedbackStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE'];

export const feedbackController = {
  getAll: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const items = await feedbackService.getAll();
    res.json({ success: true, data: items });
  }),

  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { type, message } = req.body;
    if (!message || !String(message).trim()) {
      throw new AppError('Message is required', 400);
    }
    if (!VALID_TYPES.includes(type)) {
      throw new AppError(`type must be one of: ${VALID_TYPES.join(', ')}`, 400);
    }
    const user = (req as any).user;
    const item = await feedbackService.create({
      type,
      message: String(message).trim(),
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
    });
    res.status(201).json({ success: true, data: item });
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      throw new AppError(`status must be one of: ${VALID_STATUSES.join(', ')}`, 400);
    }
    const item = await feedbackService.updateStatus(id, status);
    if (!item) {
      throw new AppError('Feedback item not found', 404);
    }
    res.json({ success: true, data: item });
  }),
};
