import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { selfHealService } from '../services/selfHealService';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Internal Server Error';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Log error
  logger.error(`${req.method} ${req.path} — ${err.message || err}`, { stack: err.stack });

  // Only genuinely unexpected errors (500s) go into the self-heal incident log — a
  // deliberate AppError(4xx) (validation, not found, etc.) is expected, routine traffic,
  // not something worth an AI diagnosis pass over. Fire-and-forget: never let capturing
  // the incident delay or fail the actual error response.
  if (statusCode >= 500) {
    void selfHealService.captureIncident({
      source: 'http_5xx',
      message: err.message || 'Internal Server Error',
      stack: err.stack,
      context: { method: req.method, path: req.path, statusCode },
    });
  }

  // Send response
  res.status(statusCode).json({
    success: false,
    error: {
      message: err instanceof AppError ? message : err.message || message,
    },
  });
};

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
