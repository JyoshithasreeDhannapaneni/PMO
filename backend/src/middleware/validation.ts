import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { AppError } from './errorHandler';

export const validate = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        next(new AppError(`Validation failed: ${JSON.stringify(errorMessages)}`, 400));
      } else {
        next(error);
      }
    }
  };
};

// Helper to validate date strings (YYYY-MM-DD or ISO datetime)
const dateString = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: 'Invalid date format',
});

// Project validation schemas
export const createProjectSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Project name is required').max(255),
    customerName: z.string().min(1, 'Customer name is required').max(255),
    projectManager: z.string().min(1, 'Project manager is required').max(255),
    accountManager: z.string().min(1, 'Account manager is required').max(255),
    planType: z.enum(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']).optional(),
    plannedStart: dateString,
    plannedEnd: dateString,
    actualStart: dateString.optional().nullable().or(z.literal('')),
    actualEnd: dateString.optional().nullable().or(z.literal('')),
    sourcePlatform: z.string().max(255).optional().nullable(),
    targetPlatform: z.string().max(255).optional().nullable(),
    estimatedCost: z.number().positive().optional().nullable(),
    actualCost: z.number().positive().optional().nullable(),
    description: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    phase: z.enum(['KICKOFF', 'MIGRATION', 'VALIDATION', 'CLOSURE', 'COMPLETED']).optional(),
    status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
  }),
});

export const updateProjectSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    customerName: z.string().min(1).max(255).optional(),
    projectManager: z.string().min(1).max(255).optional(),
    accountManager: z.string().min(1).max(255).optional(),
    planType: z.enum(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']).optional(),
    plannedStart: dateString.optional(),
    plannedEnd: dateString.optional(),
    actualStart: dateString.optional().nullable().or(z.literal('')),
    actualEnd: dateString.optional().nullable().or(z.literal('')),
    sourcePlatform: z.string().max(255).optional().nullable(),
    targetPlatform: z.string().max(255).optional().nullable(),
    estimatedCost: z.number().positive().optional().nullable(),
    actualCost: z.number().positive().optional().nullable(),
    description: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    phase: z.enum(['KICKOFF', 'MIGRATION', 'VALIDATION', 'CLOSURE', 'COMPLETED']).optional(),
    status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
  }),
});

export const projectIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});
