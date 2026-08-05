import { Router } from 'express';
import { callHygieneController } from '../controllers/callHygieneController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, callHygieneController.getMetrics);
router.get('/export', requireAuth, callHygieneController.exportExcel);

export default router;
