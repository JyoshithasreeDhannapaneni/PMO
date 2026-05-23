import { Router } from 'express';
import { accountManagerController } from '../controllers/accountManagerController';

const router = Router();

router.get('/view', accountManagerController.getView);

export default router;
