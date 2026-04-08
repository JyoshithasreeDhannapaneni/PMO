import { Router } from 'express';
import { searchController } from '../controllers/searchController';

const router = Router();

router.get('/', searchController.globalSearch);
router.get('/projects', searchController.searchProjects);

export default router;
