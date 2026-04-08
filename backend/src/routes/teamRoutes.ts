import { Router } from 'express';
import { teamController } from '../controllers/teamController';

const router = Router();

// GET /api/team/project/:projectId - Get all team members for a project
router.get('/project/:projectId', teamController.getByProject);

// GET /api/team/project/:projectId/summary - Get team summary
router.get('/project/:projectId/summary', teamController.getSummary);

// GET /api/team/:id - Get single team member
router.get('/:id', teamController.getById);

// POST /api/team - Add team member
router.post('/', teamController.create);

// PUT /api/team/:id - Update team member
router.put('/:id', teamController.update);

// DELETE /api/team/:id - Remove team member
router.delete('/:id', teamController.delete);

export default router;
