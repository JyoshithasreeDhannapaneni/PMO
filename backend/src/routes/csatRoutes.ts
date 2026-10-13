import { Router } from 'express';
import { csatController } from '../controllers/csatController';

// Public customer survey endpoints. No session: the emailed link token is the credential.
// Listed in middleware/apiAuthGate.ts (GET/POST under /csat/ only).
const router = Router();

router.get('/:token', csatController.getForm);
router.post('/:token', csatController.submit);

export default router;
