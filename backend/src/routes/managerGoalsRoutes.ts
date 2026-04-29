import { Router } from 'express';
import { managerGoalsController } from '../controllers/managerGoalsController';

const router = Router();

router.get('/', managerGoalsController.getAll);
router.get('/with-stats', managerGoalsController.getWithStats);
router.post('/', managerGoalsController.upsert);
router.delete('/:id', managerGoalsController.delete);

export default router;
