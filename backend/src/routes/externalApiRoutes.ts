import { Router } from 'express';
import { externalApiController } from '../controllers/externalApiController';
import { requireExternalApiKey } from '../middleware/auth';

const router = Router();

// The whole /external prefix skips the session gate (middleware/apiAuthGate.ts), so the key
// check is router-wide: a route added here later can't accidentally ship without it.
router.use(requireExternalApiKey);

// Read-only — for other internal apps to pull project data, not for browser/user sessions.
router.get('/projects', externalApiController.getAllProjects);

export default router;
