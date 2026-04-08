import { Router } from 'express';
import { riskController } from '../controllers/riskController';

const router = Router();

// GET /api/risks/project/:projectId - Get all risks for a project
router.get('/project/:projectId', riskController.getByProject);

// GET /api/risks/project/:projectId/matrix - Get risk matrix
router.get('/project/:projectId/matrix', riskController.getRiskMatrix);

// GET /api/risks/project/:projectId/summary - Get risk summary
router.get('/project/:projectId/summary', riskController.getSummary);

// GET /api/risks/:id - Get single risk
router.get('/:id', riskController.getById);

// POST /api/risks - Create risk
router.post('/', riskController.create);

// PUT /api/risks/:id - Update risk
router.put('/:id', riskController.update);

// DELETE /api/risks/:id - Delete risk
router.delete('/:id', riskController.delete);

export default router;
