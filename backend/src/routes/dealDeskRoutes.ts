import { Router } from 'express';
import multer from 'multer';
import { dealDeskController } from '../controllers/dealDeskController';

const router = Router();

// Public — no auth. Called by SendGrid Inbound Parse with multipart/form-data.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
router.post('/inbound', upload.any(), dealDeskController.inboundWebhook);

router.get('/config', dealDeskController.checkConfig);
router.get('/test-auth', dealDeskController.testAuth);
router.get('/stats', dealDeskController.getStats);
router.get('/', dealDeskController.getDeals);
router.get('/:id', dealDeskController.getDealById);
router.post('/poll', dealDeskController.triggerPoll);
router.post('/reparse', dealDeskController.reparseDeals);
router.post('/import-history', dealDeskController.importHistory);
router.patch('/:id/match', dealDeskController.updateDealMatch);

export default router;
