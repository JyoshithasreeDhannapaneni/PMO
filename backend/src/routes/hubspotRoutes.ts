import { Router } from 'express';
import { hubspotController } from '../controllers/hubspotController';

const router = Router();

router.get('/status', hubspotController.getStatus);
router.get('/signals', hubspotController.getSignals);

export default router;
