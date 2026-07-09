import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { externalService, ExternalApiScope } from '../services/externalService';

export const requireApiKey = (scope: ExternalApiScope) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const providedKey = req.header('x-api-key');
    const expectedKey = await externalService.getApiKey(scope);

    if (!providedKey || providedKey !== expectedKey) {
      throw new AppError('Invalid or missing API key', 401);
    }

    next();
  };
