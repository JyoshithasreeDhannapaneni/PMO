import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { selfHealController } from '../controllers/selfHealController';

const router = Router();

router.get('/incidents', requireAuth, requireRole('ADMIN'), selfHealController.getIncidents);
router.post('/incidents/:id/resolve', requireAuth, requireRole('ADMIN'), selfHealController.resolveIncident);
router.post('/diagnose', requireAuth, requireRole('ADMIN'), selfHealController.triggerDiagnosis);

export default router;
