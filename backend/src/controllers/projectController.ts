import { Request, Response } from 'express';
import { authService } from '../services/authService';
import { projectService, ProjectFilters, PaginationOptions } from '../services/projectService';
import { auditService } from '../services/auditService';
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
      segment: req.query.segment as string,
      excludeStatus: req.query.excludeStatus as string,
      clientName: req.query.clientName as string,
    };
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
    let actingUser: { id: string; name: string; role: string } | null = null;
    if (token) {
      try {
        const user = await authService.getUserFromToken(token);
        actingUser = user;
        if (user && user.role !== 'ADMIN' && user.role !== 'PROJECT_MANAGER' && user.role !== 'PRE_SALES') {
          res.status(403).json({ success: false, error: { message: 'Only Admins and Project Managers can create projects' } });
          return;
        }
        if (user && user.role === 'PROJECT_MANAGER') {
          req.body.projectManager = user.name;
        }
        if (user && user.role === 'PRE_SALES') {
          req.body.projectType = 'POC';
          req.body.projectManager = req.body.projectManager || user.name;
        }
      } catch {}
    }
    const project = await projectService.create(req.body);

    if (actingUser) {
      await auditService.log({
        userId: actingUser.id,
        action: 'CREATE',
        entityType: 'project',
        entityId: project.id,
        entityName: project.customerName || project.projectManager,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

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
    let actingUser: { id: string; name: string; role: string } | null = null;
    let previousStatus: string | undefined;
    if (token) {
      try {
        const user = await authService.getUserFromToken(token);
        actingUser = user;
        if (user && user.role !== 'ADMIN' && user.role !== 'PROJECT_MANAGER') {
          res.status(403).json({ success: false, error: { message: 'Only Admins and Project Managers can edit projects' } });
          return;
        }
        const existing = await projectService.getById(id);
        previousStatus = existing.status;
        if (user && user.role === 'PROJECT_MANAGER' && existing.projectManager !== user.name) {
          res.status(403).json({ success: false, error: { message: 'You can only edit projects assigned to you' } });
          return;
        }
      } catch {}
    }
    const project = await projectService.update(id, req.body);

    if (actingUser) {
      const isStatusChange = req.body.status && req.body.status !== previousStatus;
      await auditService.log({
        userId: actingUser.id,
        action: isStatusChange ? 'STATUS_CHANGE' : 'UPDATE',
        entityType: 'project',
        entityId: project.id,
        entityName: project.customerName || project.projectManager,
        oldValues: isStatusChange ? { status: previousStatus } : undefined,
        newValues: isStatusChange ? { status: req.body.status } : undefined,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

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
    const deleteToken = req.headers.authorization?.replace('Bearer ', '');
    if (deleteToken) {
      try {
        const user = await authService.getUserFromToken(deleteToken);
        if (user && user.role !== 'ADMIN' && user.role !== 'PROJECT_MANAGER') {
          res.status(403).json({ success: false, error: { message: 'Only Admins and Project Managers can delete projects' } });
          return;
        }
        if (user && user.role === 'PROJECT_MANAGER') {
          const existing = await projectService.getById(id);
          if (existing.projectManager !== user.name) {
            res.status(403).json({ success: false, error: { message: 'You can only delete projects assigned to you' } });
            return;
          }
        }
      } catch {}
    }
    await projectService.delete(id);

    res.json({
      success: true,
      message: 'Project deleted successfully',
    });
  }),

  /**
   * DELETE /api/projects/by-client/:clientName
   * Delete all projects for a client (ADMIN) or own projects in that client (PROJECT_MANAGER)
   */
  deleteClient: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { clientName } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ success: false, error: { message: 'Authentication required' } });
      return;
    }
    let user: any;
    try { user = await authService.getUserFromToken(token); } catch {
      res.status(401).json({ success: false, error: { message: 'Invalid token' } });
      return;
    }
    if (user.role !== 'ADMIN' && user.role !== 'PROJECT_MANAGER') {
      res.status(403).json({ success: false, error: { message: 'Only Admins and Project Managers can delete client projects' } });
      return;
    }
    const deleted = await projectService.deleteByClient(decodeURIComponent(clientName), user.name, user.role);
    res.json({ success: true, message: `${deleted} project${deleted !== 1 ? 's' : ''} deleted` });
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

  getClientSummary: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const clientName = req.query.clientName as string;
    if (!clientName) {
      res.status(400).json({ success: false, error: 'clientName query param is required' });
      return;
    }
    const summary = await projectService.getClientSummary(clientName);
    res.json({ success: true, data: summary });
  }),

  uploadRcaDoc: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }
    const fileUrl = `/uploads/rca-docs/${file.filename}`;
    await projectService.update(id, { rcaDocUrl: fileUrl } as any);
    res.json({ success: true, fileUrl, originalName: file.originalname });
  }),
};
