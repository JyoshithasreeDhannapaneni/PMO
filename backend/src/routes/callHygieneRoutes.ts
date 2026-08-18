import { Router } from 'express';
import { callHygieneController } from '../controllers/callHygieneController';
import { requireRole } from '../middleware/auth';

const router = Router();

// Quality is HR-adjacent content — ADMIN sees everyone, PROJECT_MANAGER sees only their
// own row (enforced in the controller). Other roles get a 403, not an empty table.
router.get('/', requireRole('ADMIN', 'PROJECT_MANAGER'), callHygieneController.getMetrics);
router.get('/export', requireRole('ADMIN', 'PROJECT_MANAGER'), callHygieneController.exportExcel);

export default router;
