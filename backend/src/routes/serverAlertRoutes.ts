import { Router } from 'express';
import { serverAlertController } from '../controllers/serverAlertController';
import { requireRole } from '../middleware/auth';

const router = Router();

router.get('/status', serverAlertController.getStatus);
router.get('/logs', serverAlertController.getLogs);
// Both trigger a live customer-facing email send — ADMIN only. See security review.
router.post('/run-now', requireRole('ADMIN'), serverAlertController.runNow);
router.post('/:id/send', requireRole('ADMIN'), serverAlertController.sendManual);

export default router;
