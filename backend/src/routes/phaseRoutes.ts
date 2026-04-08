import { Router } from 'express';
import { phaseController } from '../controllers/phaseController';

const router = Router();

// GET /api/phases/stats - Get phase statistics
router.get('/stats', phaseController.getStats);

// GET /api/phases/project/:projectId - Get phases for a project
router.get('/project/:projectId', phaseController.getByProjectId);

// PUT /api/phases/:id - Update a phase
router.put('/:id', phaseController.update);

// POST /api/phases/:projectId/complete/:phaseName - Complete a phase
router.post('/:projectId/complete/:phaseName', phaseController.completePhase);

export default router;
