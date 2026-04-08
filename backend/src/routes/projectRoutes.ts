import { Router } from 'express';
import { projectController } from '../controllers/projectController';
import { validate, createProjectSchema, updateProjectSchema, projectIdSchema } from '../middleware/validation';

const router = Router();

// GET /api/projects - Get all projects
router.get('/', projectController.getAll);

// GET /api/projects/delayed - Get delayed projects
router.get('/delayed', projectController.getDelayed);

// GET /api/projects/:id - Get project by ID
router.get('/:id', validate(projectIdSchema), projectController.getById);

// POST /api/projects - Create new project
router.post('/', validate(createProjectSchema), projectController.create);

// PUT /api/projects/:id - Update project
router.put('/:id', validate(updateProjectSchema), projectController.update);

// DELETE /api/projects/:id - Delete project
router.delete('/:id', validate(projectIdSchema), projectController.delete);

export default router;
