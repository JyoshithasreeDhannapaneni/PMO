import { Router } from 'express';
import { accountManagerController } from '../controllers/accountManagerController';
import { requireRole } from '../middleware/auth';

const router = Router();

// Full HubSpot deal values and CSAT scores for every account — restricted to
// ADMIN and ACCOUNT_MANAGER. Was previously unauthenticated. See security review.
router.get('/view', requireRole('ADMIN', 'ACCOUNT_MANAGER'), accountManagerController.getView);

export default router;
