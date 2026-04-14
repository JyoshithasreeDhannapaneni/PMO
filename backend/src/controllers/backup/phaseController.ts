import { Request, Response } from 'express';
import { phaseService } from '../services/phaseService';
import { asyncHandler } from '../middleware/errorHandler';

export const phaseController = {
  /**
   * GET /api/phases/project/:projectId
   * Get all phases for a project
   */
  getByProjectId: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const phases = await phaseService.getByProjectId(projectId);

    res.json({
      success: true,
      data: phases,
    });
  }),

  /**
   * PUT /api/phases/:id
   * Update a phase record
   */
  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const phase = await phaseService.update(id, req.body);

    res.json({
      success: true,
      data: phase,
      message: 'Phase updated successfully',
    });
  }),

  /**
   * POST /api/phases/:projectId/complete/:phaseName
   * Complete a phase and move to next
   */
  completePhase: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId, phaseName } = req.params;
    await phaseService.completePhase(projectId, phaseName as any);

    res.json({
      success: true,
      message: `Phase ${phaseName} completed successfully`,
    });
  }),

  /**
   * GET /api/phases/stats
   * Get phase statistics
   */
  getStats: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const stats = await phaseService.getPhaseStats();

    res.json({
      success: true,
      data: stats,
    });
  }),
};
