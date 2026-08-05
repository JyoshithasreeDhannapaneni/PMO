import { Router } from 'express';
import { ticketingController } from '../controllers/ticketingController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/config',           ticketingController.checkConfig);
router.post('/config',          requireAuth, ticketingController.setEnabled);
router.get('/sync',             ticketingController.getSyncStatus);
router.post('/sync',            ticketingController.triggerSync);
router.get('/stats',            ticketingController.getStats);
router.get('/spaces',           ticketingController.getSpaces);
router.get('/issues',           ticketingController.getIssues);
router.get('/search',           ticketingController.searchTickets);
router.get('/trends',           ticketingController.getTrends);
router.get('/assignees',        ticketingController.getAssignees);
router.get('/reporters',        ticketingController.getReporters);
router.get('/project-managers', ticketingController.getProjectManagers);
router.get('/departments',      ticketingController.getDepartments);
router.get('/by-customers',     ticketingController.getCustomerTickets);

export default router;
