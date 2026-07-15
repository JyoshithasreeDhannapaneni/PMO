import { Router } from 'express';
import { ticketingController } from '../controllers/ticketingController';

const router = Router();

router.get('/config', ticketingController.checkConfig);
router.get('/stats', ticketingController.getStats);
router.get('/spaces', ticketingController.getSpaces);
router.get('/issues', ticketingController.getIssues);
router.get('/search', ticketingController.searchTickets);
router.get('/by-customers', ticketingController.getCustomerTickets);

export default router;
