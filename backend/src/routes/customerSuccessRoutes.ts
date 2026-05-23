import { Router } from 'express';
import { customerSuccessController } from '../controllers/customerSuccessController';

const router = Router();

router.get('/', customerSuccessController.getView);
router.put('/:customerName', customerSuccessController.updateEntry);

export default router;
