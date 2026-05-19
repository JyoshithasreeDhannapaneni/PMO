import { Request, Response } from 'express';
import { pmoSettingsService } from '../services/pmoSettingsService';
import { asyncHandler } from '../middleware/errorHandler';

export const pmoSettingsController = {
  get: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await pmoSettingsService.get();
    res.json({ success: true, data });
  }),

  save: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const settings = req.body;
    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ success: false, error: { message: 'Settings object is required' } });
      return;
    }
    const data = await pmoSettingsService.save(settings);
    res.json({ success: true, data, message: 'Settings saved successfully' });
  }),

  patch: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const partial = req.body;
    if (!partial || typeof partial !== 'object') {
      res.status(400).json({ success: false, error: { message: 'Partial settings object is required' } });
      return;
    }
    const data = await pmoSettingsService.patch(partial);
    res.json({ success: true, data, message: 'Settings updated successfully' });
  }),
};
