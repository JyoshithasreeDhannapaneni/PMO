import { Router } from 'express';
import { emailHygieneController } from '../controllers/emailHygieneController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, emailHygieneController.getMetrics);
router.get('/export', requireAuth, emailHygieneController.exportExcel);

export default router;
