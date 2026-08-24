import { Router } from 'express';
import { psEngagementsController } from '../controllers/psEngagementsController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/',      requireAuth, psEngagementsController.getAll);
router.post('/',     requireAuth, psEngagementsController.create);
router.put('/:id',   requireAuth, psEngagementsController.update);
router.delete('/:id', requireAuth, psEngagementsController.remove);

export default router;
