import { Router } from 'express';
import { platformReviewController } from '../controllers/platformReviewController';

const router = Router();

router.get('/', platformReviewController.getAll);
router.get('/platforms', platformReviewController.getPlatforms);
router.get('/manager-options', platformReviewController.getManagerOptions);
router.get('/summary', platformReviewController.getSummary);
router.get('/manager-summary', platformReviewController.getManagerSummary);
router.post('/', platformReviewController.create);
router.delete('/:id', platformReviewController.delete);

export default router;
