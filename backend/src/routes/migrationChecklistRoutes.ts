import { Router } from 'express';
import { migrationChecklistController } from '../controllers/migrationChecklistController';

const router = Router();

router.get('/:projectId',                         migrationChecklistController.getForProject);
router.put('/:projectId/:type/:phase',            migrationChecklistController.save);
router.post('/:projectId/:type/:phase/submit',    migrationChecklistController.submit);
router.post('/:projectId/:type/:phase/verify',    migrationChecklistController.verify);
router.post('/:projectId/finalize',               migrationChecklistController.finalize);

export default router;
