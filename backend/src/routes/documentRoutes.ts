import { Router } from 'express';
import { documentController } from '../controllers/documentController';

const router = Router();

// GET /api/documents/project/:projectId - Get all documents for a project
router.get('/project/:projectId', documentController.getByProject);

// GET /api/documents/project/:projectId/summary - Get document summary
router.get('/project/:projectId/summary', documentController.getSummary);

// GET /api/documents/project/:projectId/category/:category - Get by category
router.get('/project/:projectId/category/:category', documentController.getByCategory);

// GET /api/documents/:id - Get single document
router.get('/:id', documentController.getById);

// POST /api/documents - Create document
router.post('/', documentController.create);

// PUT /api/documents/:id - Update document
router.put('/:id', documentController.update);

// DELETE /api/documents/:id - Delete document
router.delete('/:id', documentController.delete);

export default router;
