import { Request, Response } from 'express';
import { caseStudyService } from '../services/caseStudyService';
import { aiService } from '../services/aiService';
import { projectService } from '../services/projectService';
import { asyncHandler } from '../middleware/errorHandler';

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
   * POST /api/case-studies
   * Create a new case study
   */
  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const caseStudy = await caseStudyService.create(req.body);

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
