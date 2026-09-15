import { Router } from 'express';
import { slaBreachAlertController } from '../controllers/slaBreachAlertController';
import { requireRole } from '../middleware/auth';

const router = Router();

// Customer email addresses + message content — admin-only, same as call-transcript grading.
router.get('/', requireRole('ADMIN'), slaBreachAlertController.list);
router.get('/people', requireRole('ADMIN'), slaBreachAlertController.listPeople);
router.get('/:id/message', requireRole('ADMIN'), slaBreachAlertController.getMessage);

export default router;
