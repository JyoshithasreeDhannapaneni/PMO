import { Router } from 'express';
import { smtpController } from '../controllers/smtpController';

const router = Router();

router.get('/', smtpController.get);
router.post('/save', smtpController.save);
router.post('/test', smtpController.test);
router.post('/send-test', smtpController.sendTest);

export default router;
