import { Request, Response, NextFunction } from 'express';
import { automationService } from '../services/automationService';
import { AppError } from '../middleware/errorHandler';

export const automationController = {
  async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const rules = await automationService.listRules();
      res.json({ success: true, data: rules });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, trigger, triggerLabel, action, actionLabel, actionDetail } = req.body;
      if (!name || !trigger || !action) {
        throw new AppError('name, trigger, and action are required', 400);
      }
      const rule = await automationService.createRule({
        name, trigger, triggerLabel: triggerLabel || trigger,
        action, actionLabel: actionLabel || action, actionDetail,
      });
      res.status(201).json({ success: true, data: rule });
    } catch (err) {
      next(err);
    }
  },

  async setEnabled(req: Request, res: Response, next: NextFunction) {
    try {
      const { enabled } = req.body;
      await automationService.setEnabled(req.params.id, !!enabled);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await automationService.deleteRule(req.params.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
};
