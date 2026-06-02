import { Router } from 'express';
import { serverAlertController } from '../controllers/serverAlertController';

const router = Router();

router.get('/status', serverAlertController.getStatus);
router.get('/logs', serverAlertController.getLogs);
router.post('/run-now', serverAlertController.runNow);
router.post('/:id/send', serverAlertController.sendManual);

export default router;
