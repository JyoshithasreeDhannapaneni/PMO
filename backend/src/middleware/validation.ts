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
    projectManager: z.string().max(255).optional().default(''),
    accountManager: z.string().max(255).optional().default(''),
    planType: z.string().max(50).optional().nullable(),
    plannedStart: dateString,
    plannedEnd: dateString,
    actualStart: dateString.optional().nullable().or(z.literal('')),
    actualEnd: dateString.optional().nullable().or(z.literal('')),
    migrationTypes: z.string().max(500).optional().nullable(),
    sourcePlatform: z.string().max(500).optional().nullable(),
    targetPlatform: z.string().max(500).optional().nullable(),
    estimatedCost: z.union([z.number(), z.string().transform(v => v === "" ? null : Number(v))]).optional().nullable(),
    actualCost: z.union([z.number(), z.string().transform(v => v === "" ? null : Number(v))]).optional().nullable(),
    numberOfServers: z.union([z.number(), z.string().transform(v => v === "" ? null : Number(v))]).optional().nullable(),
    projectMemory: z.string().max(100).optional().nullable(),
    description: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    phase: z.string().max(50).optional().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
    isOveraged: z.boolean().optional().nullable(),
    isEscalated: z.boolean().optional().nullable(),
    escalationPriority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().nullable(),
    overageAmount: z.union([z.number(), z.string().transform(v => v === "" ? null : Number(v))]).optional().nullable(),
    // POC-specific fields — passed through to the service
    projectType: z.string().max(20).optional(),
    segment: z.string().max(10).optional().nullable(),
    customerContact: z.string().max(255).optional().nullable(),
    pocDataVolume: z.string().max(255).optional().nullable(),
    pocPreSalesOwner: z.string().max(255).optional().nullable(),
    pocSuccessCriteria: z.string().optional().nullable(),
    pocDeadline: z.string().optional().nullable(),
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
    planType: z.string().max(50).optional().nullable(),
    plannedStart: dateString.optional(),
    plannedEnd: dateString.optional(),
    actualStart: dateString.optional().nullable().or(z.literal('')),
    actualEnd: dateString.optional().nullable().or(z.literal('')),
    migrationTypes: z.string().max(500).optional().nullable(),
    sourcePlatform: z.string().max(500).optional().nullable(),
    targetPlatform: z.string().max(500).optional().nullable(),
    estimatedCost: z.union([z.number(), z.string().transform(v => v === "" ? null : Number(v))]).optional().nullable(),
    actualCost: z.union([z.number(), z.string().transform(v => v === "" ? null : Number(v))]).optional().nullable(),
    numberOfServers: z.union([z.number(), z.string().transform(v => v === "" ? null : Number(v))]).optional().nullable(),
    projectMemory: z.string().max(100).optional().nullable(),
    description: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    phase: z.string().max(50).optional().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
    delayStatus: z.enum(['NOT_DELAYED', 'AT_RISK', 'DELAYED']).optional(),
    delayHappened: z.union([z.enum(['CUSTOMER_DELAY', 'INTERNAL_DELAY']), z.literal('').transform(() => null)]).optional().nullable(),
    isOveraged: z.boolean().optional().nullable(),
    isEscalated: z.boolean().optional().nullable(),
    escalationPriority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().nullable(),
    overageAmount: z.union([z.number(), z.string().transform(v => v === "" ? null : Number(v))]).optional().nullable(),
  }),
});

export const projectIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});
