import { Router } from 'express';
import { externalController } from '../controllers/externalController';

const router = Router();

router.get('/:scope', externalController.getApiKey);
router.post('/:scope/regenerate', externalController.regenerateApiKey);

export default router;
