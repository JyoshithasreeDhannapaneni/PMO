import { Router } from 'express';
import { migrationChecklistController } from '../controllers/migrationChecklistController';

const router = Router();

router.get('/:projectId',                         migrationChecklistController.getForProject);
router.put('/:projectId/:type/:phase',            migrationChecklistController.save);
router.post('/:projectId/:type/:phase/submit',    migrationChecklistController.submit);
router.post('/:projectId/:type/:phase/verify',    migrationChecklistController.verify);
router.post('/:projectId/finalize',               migrationChecklistController.finalize);
router.post('/:projectId/images',                 migrationChecklistController.uploadImage);
router.delete('/images/:filename',                migrationChecklistController.deleteImage);

export default router;
