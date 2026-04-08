import { Router } from 'express';
import { commentController } from '../controllers/commentController';

const router = Router();

router.get('/entity/:entityType/:entityId', commentController.getByEntity);
router.get('/entity/:entityType/:entityId/count', commentController.getCount);
router.get('/:id', commentController.getById);
router.post('/', commentController.create);
router.put('/:id', commentController.update);
router.delete('/:id', commentController.delete);

export default router;
