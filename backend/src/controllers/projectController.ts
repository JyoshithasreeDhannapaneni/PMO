import { Request, Response } from 'express';
import { authService } from '../services/authService';
import { projectService, ProjectFilters, PaginationOptions } from '../services/projectService';
import { asyncHandler } from '../middleware/errorHandler';

export const projectController = {
  /**
   * GET /api/projects
   * Get all projects with filtering and pagination
   */
getAll: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const filters: ProjectFilters = {
      status: req.query.status as any,
      phase: req.query.phase as any,
      planType: req.query.planType as any,
      delayStatus: req.query.delayStatus as string,
      search: req.query.search as string,
      projectManager: req.query.projectManager as string,
      accountManager: req.query.accountManager as string,
      migrationType: req.query.migrationType as string,
      projectType: req.query.projectType as string,
    };
    // Auto-filter by project manager for MANAGER role
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const user = await authService.getUserFromToken(token);
        if (user && user.role === 'MANAGER') {
          // Try exact match first, then partial match
          filters.projectManager = user.name;
        }
      } catch {}
    }
    const pagination: PaginationOptions = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      sortBy: (req.query.sortBy as string) || 'createdAt',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };
    const result = await projectService.getAll(filters, pagination);
    res.json({
      success: true,
      data: result.projects,
      pagination: {
        page: result.page,
        totalPages: result.totalPages,
        total: result.total,
      },
    });
  }),
  /**
   * GET /api/projects/:id
   * Get a single project by ID
   */
  getById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const project = await projectService.getById(id);

    res.json({
      success: true,
      data: project,
    });
  }),

  /**
   * POST /api/projects
   * Create a new project
   */
  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const user = await authService.getUserFromToken(token);
        if (user && user.role === 'MANAGER') {
          req.body.projectManager = user.name;
        }
        if (user && user.role === 'PRE_SALES') {
          req.body.projectType = 'POC';
          req.body.projectManager = req.body.projectManager || user.name;
        }
      } catch {}
    }
    const project = await projectService.create(req.body);

    res.status(201).json({
      success: true,
      data: project,
      message: 'Project created successfully',
    });
  }),

  /**
   * PUT /api/projects/:id
   * Update a project
   */
  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const user = await authService.getUserFromToken(token);
        if (user && user.role === 'MANAGER') {
          req.body.projectManager = user.name;
        }
        if (user && user.role === 'PRE_SALES') {
          // PRE_SALES can only update POC phase fields
          const allowedPocFields = [
            'pocQualificationStatus','pocEnvSetupStatus','pocTrialStatus',
            'pocValidationStatus','pocOutcomeStatus',
            'pocQualificationNotes','pocEnvSetupNotes','pocTrialNotes',
            'pocValidationNotes','pocOutcomeNotes',
            'pocDeadline','pocOutcome','pocHandoffTo','pocHandoffDate',
            'pocMigrationSpeed','pocErrorRate','customerContact',
          ];
          const restricted: Record<string, any> = {};
          for (const field of allowedPocFields) {
            if (req.body[field] !== undefined) restricted[field] = req.body[field];
          }
          req.body = restricted;
        }
      } catch {}
    }
    const project = await projectService.update(id, req.body);

    res.json({
      success: true,
      data: project,
      message: 'Project updated successfully',
    });
  }),

  /**
   * DELETE /api/projects/:id
   * Delete a project
   */
  delete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await projectService.delete(id);

    res.json({
      success: true,
      message: 'Project deleted successfully',
    });
  }),

  /**
   * GET /api/projects/delayed
   * Get all delayed projects
   */
  getDelayed: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const projects = await projectService.getDelayedProjects();

    res.json({
      success: true,
      data: projects,
    });
  }),
};
