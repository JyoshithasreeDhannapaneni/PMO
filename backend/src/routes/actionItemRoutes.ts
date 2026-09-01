import { Router } from 'express';
import { actionItemController } from '../controllers/actionItemController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// GET /api/action-items - Get all action items
router.get('/', actionItemController.getAll);

// POST /api/action-items - Create an action item
router.post('/', requireRole('ADMIN', 'PROJECT_MANAGER'), actionItemController.create);

// PUT /api/action-items/:id - Update an action item
router.put('/:id', requireRole('ADMIN', 'PROJECT_MANAGER'), actionItemController.update);

// DELETE /api/action-items/:id - Delete an action item
router.delete('/:id', requireRole('ADMIN', 'PROJECT_MANAGER'), actionItemController.remove);

export default router;
