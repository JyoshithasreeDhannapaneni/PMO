import { Router } from 'express';
import { changeRequestController } from '../controllers/changeRequestController';
import { requireAuth } from '../middleware/auth';

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
router.post('/', requireAuth, changeRequestController.create);

// PUT /api/change-requests/:id - Update change request
router.put('/:id', requireAuth, changeRequestController.update);

// POST /api/change-requests/:id/review - Start review
router.post('/:id/review', requireAuth, changeRequestController.review);

// POST /api/change-requests/:id/approve - Approve change request
router.post('/:id/approve', requireAuth, changeRequestController.approve);

// POST /api/change-requests/:id/reject - Reject change request
router.post('/:id/reject', requireAuth, changeRequestController.reject);

// POST /api/change-requests/:id/implement - Mark as implemented
router.post('/:id/implement', requireAuth, changeRequestController.implement);

// DELETE /api/change-requests/:id - Delete change request
router.delete('/:id', requireAuth, changeRequestController.delete);

export default router;
