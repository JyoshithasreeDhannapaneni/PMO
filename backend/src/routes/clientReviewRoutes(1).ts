import { Router } from 'express';
import { clientReviewController } from '../controllers/clientReviewController';

const router = Router();

router.get('/', clientReviewController.getAll);
router.get('/manager-summary', clientReviewController.getManagerSummary);
router.get('/project/:projectId', clientReviewController.getByProject);
router.post('/', clientReviewController.create);
router.put('/:id', clientReviewController.update);
router.delete('/:id', clientReviewController.delete);

export default router;
