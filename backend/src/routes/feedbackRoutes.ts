import { Router } from 'express';
import { feedbackController } from '../controllers/feedbackController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// Shared feed — any authenticated user can see and add to it; only ADMIN moves status.
router.get('/', requireAuth, feedbackController.getAll);
router.post('/', requireAuth, feedbackController.create);
router.put('/:id/status', requireRole('ADMIN'), feedbackController.updateStatus);

export default router;
