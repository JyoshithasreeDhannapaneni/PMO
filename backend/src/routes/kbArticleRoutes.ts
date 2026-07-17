import { Router } from 'express';
import { kbArticleController } from '../controllers/kbArticleController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', kbArticleController.getAll);
router.get('/:id', kbArticleController.getById);
router.post('/bulk', kbArticleController.bulkSave);
router.post('/extract/:caseStudyId', kbArticleController.extractFromCaseStudy);
router.put('/:id', kbArticleController.update);
router.delete('/:id', kbArticleController.delete);

export default router;
