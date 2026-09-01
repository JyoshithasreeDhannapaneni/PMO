import { Router } from 'express';
import multer from 'multer';
import { ticketingController } from '../controllers/ticketingController';
import { requireAuth } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20 MB max

router.use(requireAuth);

// Excel/CSV upload — see ntaExcelService.ts for why this is the data source instead of
// a live Neutara Ticketing API sync.
router.get('/excel/status',    ticketingController.excelStatus);
router.post('/excel/upload',   upload.single('file'), ticketingController.uploadExcel);
router.delete('/excel/clear',  ticketingController.clearExcel);

router.get('/sync',            ticketingController.getSyncStatus);
router.post('/sync',           ticketingController.triggerSync);
router.get('/config',          ticketingController.getConfig);
router.post('/config',         ticketingController.setConfig);

router.get('/stats',             ticketingController.getStats);
router.get('/spaces',            ticketingController.getSpaces);
router.get('/assignees',         ticketingController.getAssignees);
router.get('/reporters',         ticketingController.getReporters);
router.get('/project-managers',  ticketingController.getProjectManagers);
router.get('/departments',       ticketingController.getDepartments);
router.get('/issues',            ticketingController.getIssues);
router.get('/search',            ticketingController.search);
router.get('/trends',            ticketingController.getTrends);
router.get('/by-customers',      ticketingController.getByCustomers);

export default router;
