import { Router } from 'express';
import { apiKeyController } from '../controllers/apiKeyController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// Admin-only — these keys grant read access to org-wide export data.
router.get('/:scope', requireAuth, requireRole('ADMIN'), apiKeyController.get);
router.post('/:scope/regenerate', requireAuth, requireRole('ADMIN'), apiKeyController.regenerate);

export default router;
