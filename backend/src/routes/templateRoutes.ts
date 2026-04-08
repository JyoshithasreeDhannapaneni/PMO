import { Router } from 'express';
import { templateController } from '../controllers/templateController';

const router = Router();

// GET /api/templates - Get all templates
router.get('/', templateController.getAll);

// POST /api/templates/seed - Seed default templates
router.post('/seed', templateController.seedDefaults);

// GET /api/templates/code/:code - Get template by code
router.get('/code/:code', templateController.getByCode);

// GET /api/templates/:id - Get template by ID
router.get('/:id', templateController.getById);

// POST /api/templates - Create new template
router.post('/', templateController.create);

// PUT /api/templates/:id - Update template
router.put('/:id', templateController.update);

// DELETE /api/templates/:id - Delete template
router.delete('/:id', templateController.delete);

// Phase routes
// POST /api/templates/:id/phases - Add phase to template
router.post('/:id/phases', templateController.addPhase);

// PUT /api/templates/phases/:phaseId - Update phase
router.put('/phases/:phaseId', templateController.updatePhase);

// DELETE /api/templates/phases/:phaseId - Delete phase
router.delete('/phases/:phaseId', templateController.deletePhase);

// Task routes
// POST /api/templates/phases/:phaseId/tasks - Add task to phase
router.post('/phases/:phaseId/tasks', templateController.addTask);

// PUT /api/templates/tasks/:taskId - Update task
router.put('/tasks/:taskId', templateController.updateTask);

// DELETE /api/templates/tasks/:taskId - Delete task
router.delete('/tasks/:taskId', templateController.deleteTask);

export default router;
