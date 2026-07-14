import { Router } from 'express';
import { psEngagementsController } from '../controllers/psEngagementsController';

const router = Router();

router.get('/',      psEngagementsController.getAll);
router.post('/',     psEngagementsController.create);
router.put('/:id',   psEngagementsController.update);
router.delete('/:id', psEngagementsController.remove);

export default router;
