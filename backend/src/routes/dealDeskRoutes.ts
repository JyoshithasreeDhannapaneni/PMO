import { Router } from 'express';
import { dealDeskController } from '../controllers/dealDeskController';

const router = Router();

router.get('/config', dealDeskController.checkConfig);
router.get('/test-auth', dealDeskController.testAuth);
router.get('/stats', dealDeskController.getStats);
router.get('/', dealDeskController.getDeals);
router.get('/:id', dealDeskController.getDealById);
router.post('/poll', dealDeskController.triggerPoll);
router.post('/reparse', dealDeskController.reparseDeals);
router.patch('/:id/match', dealDeskController.updateDealMatch);

export default router;
