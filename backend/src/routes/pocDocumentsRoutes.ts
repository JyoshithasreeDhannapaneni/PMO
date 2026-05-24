import { Router } from 'express';
import { pocDocumentsController } from '../controllers/pocDocumentsController';

const router = Router();
router.get('/:projectId', pocDocumentsController.getAll);
router.post('/:projectId', pocDocumentsController.upload);
router.delete('/:projectId/:documentId', pocDocumentsController.delete);
export default router;
