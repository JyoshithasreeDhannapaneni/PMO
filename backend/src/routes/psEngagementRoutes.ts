import { Router } from 'express';
import { psEngagementController } from '../controllers/psEngagementController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// GET /api/ps-engagements - Get all PS engagements
router.get('/', psEngagementController.getAll);

// GET /api/ps-engagements/:id - Get a PS engagement by ID
router.get('/:id', psEngagementController.getById);

// POST /api/ps-engagements - Create a PS engagement
router.post('/', psEngagementController.create);

// PUT /api/ps-engagements/:id - Update a PS engagement
router.put('/:id', psEngagementController.update);

// DELETE /api/ps-engagements/:id - Delete a PS engagement
router.delete('/:id', psEngagementController.remove);

export default router;
