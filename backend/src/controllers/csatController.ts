import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { csatService, CsatActor } from '../services/csatService';

export const csatController = {
  getStatus: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: await csatService.getStatus(req.params.id) });
  }),

  send: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const actor = (req as any).user as CsatActor;
    const { recipientEmail, message } = req.body ?? {};
    const data = await csatService.sendRequest(req.params.id, { recipientEmail, message }, actor);
    res.status(201).json({ success: true, data, message: 'C-SAT survey sent' });
  }),

  // GET /api/csat/:token — public: what the customer's form shows.
  getForm: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: await csatService.getPublicForm(req.params.token) });
  }),

  // POST /api/csat/:token — public: the customer's answers.
  submit: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const b = req.body ?? {};
    await csatService.submitResponse(req.params.token, {
      overall: b.overall,
      migrationQuality: b.migrationQuality,
      support: b.support,
      onboarding: b.onboarding,
      wentWell: b.wentWell,
      comments: b.comments,
    });
    res.json({ success: true, message: 'Thank you for your feedback' });
  }),
};
