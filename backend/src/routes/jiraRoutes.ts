import { Router } from 'express';
import { jiraController } from '../controllers/jiraController';

const router = Router();

router.get('/status', jiraController.getStatus);
router.get('/sla',    jiraController.getSlaForManager);

export default router;
