import { Router } from 'express';
import { emailHygieneController } from '../controllers/emailHygieneController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, emailHygieneController.getMetrics);
router.get('/export', requireAuth, emailHygieneController.exportExcel);
router.post('/sync', requireAuth, emailHygieneController.triggerSync);
router.get('/sync-status', requireAuth, emailHygieneController.getSyncStatus);

export default router;
