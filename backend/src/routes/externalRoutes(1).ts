import { Router } from 'express';
import { requireApiKey } from '../middleware/apiKeyAuth';
import { asyncHandler } from '../middleware/errorHandler';
import { externalController } from '../controllers/externalController';

const router = Router();

router.get('/all-data', asyncHandler(requireApiKey('all')), externalController.getAllData);
router.get('/migration-manager', asyncHandler(requireApiKey('migrationManager')), externalController.getMigrationManagerData);
router.get('/mbr', asyncHandler(requireApiKey('mbr')), externalController.getMbrData);

export default router;
