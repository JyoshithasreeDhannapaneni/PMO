import { Router } from 'express';
import { templateCombinationController } from '../controllers/templateCombinationController';

const router = Router();

// Combinations
router.get('/', templateCombinationController.getCombinations);
router.post('/', templateCombinationController.createCombination);
router.delete('/:id', templateCombinationController.deleteCombination);

// Documents — scoped to a combination
router.get('/:id/documents', templateCombinationController.getDocuments);
router.post('/:id/documents', templateCombinationController.uploadDocument);

// Document-level operations
router.patch('/documents/:docId', templateCombinationController.renameDocument);
router.delete('/documents/:docId', templateCombinationController.deleteDocument);
router.get('/documents/:docId/download', templateCombinationController.downloadDocument);

export default router;
