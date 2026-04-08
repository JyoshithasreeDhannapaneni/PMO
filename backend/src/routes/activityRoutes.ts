import { Router } from 'express';
import { activityController } from '../controllers/activityController';

const router = Router();

router.get('/', activityController.getAll);
router.get('/recent', activityController.getRecent);
router.get('/entity/:entityType/:entityId', activityController.getByEntity);
router.get('/user/:userId', activityController.getByUser);

export default router;
