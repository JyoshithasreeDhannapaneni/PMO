import { Router } from 'express';
import { hubspotController } from '../controllers/hubspotController';
import { requireRole } from '../middleware/auth';

// Signed-in users only (apiAuthGate); deal values are visible to every role on the
// Customer Success page (product decision 2026-10-14).
const router = Router();

router.get('/status', hubspotController.getStatus);
router.get('/signals', hubspotController.getSignals);
router.get('/insights', hubspotController.getInsights);
router.post('/sync', requireRole('ADMIN'), hubspotController.triggerSync);

export default router;
