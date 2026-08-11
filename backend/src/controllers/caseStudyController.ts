import { Request, Response } from 'express';
import { caseStudyService } from '../services/caseStudyService';
import { aiService } from '../services/aiService';
import { projectService } from '../services/projectService';
import { authService } from '../services/authService';
import { auditService } from '../services/auditService';
import { asyncHandler } from '../middleware/errorHandler';

// These routes don't run requireAuth, so req.user isn't populated — decode the
// bearer token directly (best-effort; logging is skipped if it's missing/invalid).
async function getActingUser(req: Request): Promise<{ id: string; name: string } | null> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  try {
    return await authService.getUserFromToken(token);
  } catch {
    return null;
  }
}

export const caseStudyController = {
  /**
   * GET /api/case-studies
   * Get all case studies
   */
  getAll: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const status = req.query.status as any;
    const caseStudies = await caseStudyService.getAll(status);

    res.json({
      success: true,
      data: caseStudies,
    });
  }),

  /**
   * GET /api/case-studies/:id
   * Get a case study by ID
   */
  getById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const caseStudy = await caseStudyService.getById(id);

    res.json({
      success: true,
      data: caseStudy,
    });
  }),

  /**
   * GET /api/case-studies/project/:projectId
   * Get case study by project ID
   */
  getByProjectId: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const caseStudy = await caseStudyService.getByProjectId(projectId);

    res.json({
      success: true,
      data: caseStudy,
    });
  }),

  /**
   * GET /api/case-studies/awaiting
   * Projects with phase=COMPLETED but no case study yet
   */
  getAwaiting: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const projectManager = req.query.projectManager as string | undefined;
    const projects = await caseStudyService.getAwaiting(projectManager);
    res.json({ success: true, data: projects });
  }),

  /**
   * POST /api/case-studies
   * Create a new case study
   */
  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const caseStudy = await caseStudyService.create(req.body);

    const actingUser = await getActingUser(req);
    if (actingUser) {
      await auditService.log({
        userId: actingUser.id,
        action: 'CREATE',
        entityType: 'case_study',
        entityId: caseStudy.id,
        entityName: caseStudy.title,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    res.status(201).json({
      success: true,
      data: caseStudy,
      message: 'Case study created successfully',
    });
  }),

  /**
   * PUT /api/case-studies/:id
   * Update a case study
   */
  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const caseStudy = await caseStudyService.update(id, req.body);

    const actingUser = await getActingUser(req);
    if (actingUser) {
      await auditService.log({
        userId: actingUser.id,
        action: req.body.status ? 'STATUS_CHANGE' : 'UPDATE',
        entityType: 'case_study',
        entityId: caseStudy.id,
        entityName: caseStudy.title,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    res.json({
      success: true,
      data: caseStudy,
      message: 'Case study updated successfully',
    });
  }),

  /**
   * DELETE /api/case-studies/:id
   * Delete a case study
   */
  delete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await caseStudyService.delete(id);

    res.json({
      success: true,
      message: 'Case study deleted successfully',
    });
  }),

  /**
   * POST /api/case-studies/generate/:projectId
   * Generate a case study using AI
   */
  generate: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const project = await projectService.getById(projectId);
    
    const generatedContent = await aiService.generateCaseStudy(project);

    // Create the case study with generated content
    const caseStudy = await caseStudyService.create({
      projectId,
      title: generatedContent.title,
      content: JSON.stringify(generatedContent),
      status: 'IN_PROGRESS',
    });

    const actingUser = await getActingUser(req);
    if (actingUser) {
      await auditService.log({
        userId: actingUser.id,
        action: 'CREATE',
        entityType: 'case_study',
        entityId: caseStudy.id,
        entityName: caseStudy.title,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    res.status(201).json({
      success: true,
      data: {
        caseStudy,
        generatedContent,
      },
      message: 'Case study generated successfully',
    });
  }),
};
