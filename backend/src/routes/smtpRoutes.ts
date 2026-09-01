import { Router } from 'express';
import { smtpController } from '../controllers/smtpController';
import { requireRole } from '../middleware/auth';

const router = Router();

// SMTP config (host/credentials-adjacent) — ADMIN only, including the GET,
// since the config itself is the sensitive part here. Was previously
// unauthenticated end to end. See security review.
router.use(requireRole('ADMIN'));

router.get('/', smtpController.get);
router.post('/save', smtpController.save);
router.post('/test', smtpController.test);
router.post('/send-test', smtpController.sendTest);

export default router;
