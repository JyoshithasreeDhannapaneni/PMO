import { Router } from 'express';
import { customerSuccessController } from '../controllers/customerSuccessController';
import accountTrackerRoutes from './accountTrackerRoutes';

const router = Router();

router.use('/accounts', accountTrackerRoutes);
router.get('/', customerSuccessController.getView);
router.put('/:projectId', customerSuccessController.updateEntry);

export default router;
