import { Router } from 'express';
import multer from 'multer';
import { jiraController } from '../controllers/jiraController';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20 MB max

router.get('/status',             jiraController.getStatus);
router.get('/fields',             jiraController.getFields);
router.get('/projects',           jiraController.listProjects);
router.get('/sample',             jiraController.sampleTickets);
router.get('/sla',                jiraController.getSlaForManager);
router.get('/engineers',          jiraController.getEngineerStats);
router.get('/board',              jiraController.getBoardTickets);

// Excel upload
router.get('/excel/status',       jiraController.excelStatus);
router.post('/excel/upload',      upload.single('file'), jiraController.uploadExcel);
router.delete('/excel/clear',     jiraController.clearExcel);

// OAuth 2.0
router.get('/oauth/status',       jiraController.oauthStatus);
router.get('/oauth/connect',      jiraController.oauthConnect);
router.get('/oauth/callback',     jiraController.oauthCallback);
router.post('/oauth/disconnect',  jiraController.oauthDisconnect);

export default router;
