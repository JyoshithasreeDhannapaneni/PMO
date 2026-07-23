import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { docsController } from '../controllers/docsController';

const router = Router();

router.use(requireAuth);

router.get('/documents',              docsController.listDocuments);
router.get('/documents/:id/download', docsController.downloadDocument);
router.get('/documents/:id',          docsController.getDocument);
router.get('/quotes',                 docsController.listQuotes);
router.post('/documents/:id/process', docsController.processDocument);

export default router;
