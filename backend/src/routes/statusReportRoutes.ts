import { Router } from 'express';
import { statusReportController } from '../controllers/statusReportController';

const router = Router();

// GET /api/reports/project/:projectId - Get all reports for a project
router.get('/project/:projectId', statusReportController.getByProject);

// GET /api/reports/project/:projectId/latest - Get latest report
router.get('/project/:projectId/latest', statusReportController.getLatest);

// POST /api/reports/project/:projectId/generate - Generate weekly report
router.post('/project/:projectId/generate', statusReportController.generateWeekly);

// GET /api/reports/:id - Get single report
router.get('/:id', statusReportController.getById);

// POST /api/reports - Create report
router.post('/', statusReportController.create);

// PUT /api/reports/:id - Update report
router.put('/:id', statusReportController.update);

// DELETE /api/reports/:id - Delete report
router.delete('/:id', statusReportController.delete);

export default router;
