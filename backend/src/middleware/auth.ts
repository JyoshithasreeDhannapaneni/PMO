import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import { AppError } from './errorHandler';

export const requireAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    next(new AppError('Authentication required', 401));
    return;
  }

  try {
    const user = await authService.getUserFromToken(token);
    if (!user) {
      next(new AppError('Session expired or invalid — please log in again', 401));
      return;
    }
    (req as any).user = user;
    next();
  } catch (error) {
    next(new AppError('Session expired or invalid — please log in again', 401));
  }
};
