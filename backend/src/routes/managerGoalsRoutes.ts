import { Router } from 'express';
import { managerGoalsController } from '../controllers/managerGoalsController';

const router = Router();

router.get('/', managerGoalsController.getAll);
router.get('/with-stats', managerGoalsController.getWithStats);
router.get('/gartner-stats', managerGoalsController.getGartnerStats);
router.get('/gartner-stats/:managerName', managerGoalsController.getGartnerStats);
router.put('/gartner-stats/:managerName', managerGoalsController.updateGartnerStats);
router.delete('/gartner-stats/:managerName', managerGoalsController.deleteGartnerStats);
router.post('/', managerGoalsController.upsert);
router.delete('/:id', managerGoalsController.delete);

export default router;
