import { Router } from 'express';
import { pmoSettingsController } from '../controllers/pmoSettingsController';

const router = Router();

router.get('/', pmoSettingsController.get);
router.post('/', pmoSettingsController.save);
router.patch('/', pmoSettingsController.patch);

export default router;
