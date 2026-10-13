import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { selfHealService } from '../services/selfHealService';
import { redactSecrets } from '../utils/redact';

// Expected operational failures that are not code bugs: no self-heal incident or fix PR.
const NON_INCIDENT_CODES = new Set(['EMAIL_SEND_FAILED']);

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  // Optional machine-readable code + payload for clients that branch on a specific error
  // (e.g. CSAT_REQUIRED opens the C-SAT popup instead of a generic "update failed").
  code?: string;
  details?: Record<string, unknown>;

  constructor(message: string, statusCode: number, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    this.details = details;

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
  const path = redactSecrets(req.path || '');
  logger.error(`${req.method} ${path} — ${err.message || err}`, { stack: err.stack });

  // Only genuinely unexpected errors (500s) go into the self-heal incident log — a
  // deliberate AppError(4xx) (validation, not found, etc.) is expected, routine traffic,
  // not something worth an AI diagnosis pass over. Fire-and-forget: never let capturing
  // the incident delay or fail the actual error response.
  const nonIncident = err instanceof AppError && !!err.code && NON_INCIDENT_CODES.has(err.code);
  if (statusCode >= 500 && !nonIncident) {
    void selfHealService.captureIncident({
      source: 'http_5xx',
      message: err.message || 'Internal Server Error',
      stack: err.stack,
      context: { method: req.method, path, statusCode },
    });
  }

  // Raw Postgres errors echo query fragments and values back ("column ... does not exist",
  // "invalid input syntax for type integer: <subquery result>"), which turns any injectable
  // spot into a data-leak channel. Keep them in the log only; other thrown messages are
  // written for users (e.g. SharePoint "site or list not found") and still pass through.
  const pgCode = (err as { code?: unknown }).code;
  const isDatabaseError = typeof pgCode === 'string' && /^[0-9A-Z]{5}$/.test(pgCode) && 'severity' in err;

  res.status(statusCode).json({
    success: false,
    error: {
      message: err instanceof AppError ? message : isDatabaseError ? message : err.message || message,
      ...(err instanceof AppError && err.code ? { code: err.code, details: err.details } : {}),
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
