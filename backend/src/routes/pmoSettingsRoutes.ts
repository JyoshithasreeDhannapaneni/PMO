import { Router } from 'express';
import { pmoSettingsController } from '../controllers/pmoSettingsController';
import { requireRole } from '../middleware/auth';

const router = Router();

// Org-wide plan types, phases and migration types: everyone reads them, only admins change them.
router.get('/', pmoSettingsController.get);
router.post('/', requireRole('ADMIN'), pmoSettingsController.save);
router.patch('/', requireRole('ADMIN'), pmoSettingsController.patch);

export default router;
