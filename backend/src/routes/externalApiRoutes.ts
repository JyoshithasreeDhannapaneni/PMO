import { Router } from 'express';
import { externalApiController } from '../controllers/externalApiController';
import { requireExternalApiKey } from '../middleware/auth';

const router = Router();

// Read-only, static-API-key-gated — for other internal apps to pull project data, not for
// browser/user sessions. See requireExternalApiKey in middleware/auth.ts.
router.get('/projects', requireExternalApiKey, externalApiController.getAllProjects);

export default router;
