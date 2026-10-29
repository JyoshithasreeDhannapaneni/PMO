import { Router } from 'express';
import { caseStudyController } from '../controllers/caseStudyController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// GET /api/case-studies - Get all case studies
router.get('/', caseStudyController.getAll);

// GET /api/case-studies/awaiting - Completed migration projects (archived included) with no case study yet
router.get('/awaiting', caseStudyController.getAwaiting);

// GET /api/case-studies/not-needed - Completed projects an admin marked as not needing a case study
router.get('/not-needed', requireAuth, caseStudyController.getNotNeeded);

// POST /api/case-studies/not-needed - Mark projects as not needing a case study (ADMIN) { projectIds, reason? }
router.post('/not-needed', requireRole('ADMIN'), caseStudyController.markNotNeeded);

// POST /api/case-studies/not-needed/restore - Put projects back on the "needs a case study" list (ADMIN) { projectIds }
router.post('/not-needed/restore', requireRole('ADMIN'), caseStudyController.restoreNeeded);

// POST /api/case-studies/reminders/run-now - Send this week's case study digest now (ADMIN)
router.post('/reminders/run-now', requireRole('ADMIN'), caseStudyController.runDigestNow);

// GET /api/case-studies/:id - Get case study by ID
router.get('/:id', caseStudyController.getById);

// GET /api/case-studies/project/:projectId - Get case study by project ID
router.get('/project/:projectId', caseStudyController.getByProjectId);

// POST /api/case-studies - Create case study
router.post('/', caseStudyController.create);

// POST /api/case-studies/generate/:projectId - Generate case study with AI
router.post('/generate/:projectId', caseStudyController.generate);

// PUT /api/case-studies/:id - Update case study
router.put('/:id', caseStudyController.update);

// DELETE /api/case-studies/:id - Delete case study
router.delete('/:id', caseStudyController.delete);

export default router;
