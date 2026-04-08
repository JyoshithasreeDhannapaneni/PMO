import { Router } from 'express';
import { changeRequestController } from '../controllers/changeRequestController';

const router = Router();

// GET /api/change-requests/pending - Get all pending change requests
router.get('/pending', changeRequestController.getPending);

// GET /api/change-requests/project/:projectId - Get all change requests for a project
router.get('/project/:projectId', changeRequestController.getByProject);

// GET /api/change-requests/project/:projectId/summary - Get change request summary
router.get('/project/:projectId/summary', changeRequestController.getSummary);

// GET /api/change-requests/:id - Get single change request
router.get('/:id', changeRequestController.getById);

// POST /api/change-requests - Create change request
router.post('/', changeRequestController.create);

// PUT /api/change-requests/:id - Update change request
router.put('/:id', changeRequestController.update);

// POST /api/change-requests/:id/review - Start review
router.post('/:id/review', changeRequestController.review);

// POST /api/change-requests/:id/approve - Approve change request
router.post('/:id/approve', changeRequestController.approve);

// POST /api/change-requests/:id/reject - Reject change request
router.post('/:id/reject', changeRequestController.reject);

// POST /api/change-requests/:id/implement - Mark as implemented
router.post('/:id/implement', changeRequestController.implement);

// DELETE /api/change-requests/:id - Delete change request
router.delete('/:id', changeRequestController.delete);

export default router;
