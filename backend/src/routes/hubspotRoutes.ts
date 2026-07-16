import { Router } from 'express';
import { hubspotController } from '../controllers/hubspotController';

const router = Router();

router.get('/status', hubspotController.getStatus);
router.get('/signals', hubspotController.getSignals);
router.get('/insights', hubspotController.getInsights);
router.get('/test', hubspotController.testConnection);
router.get('/debug-keys', hubspotController.debugKeys);

export default router;
