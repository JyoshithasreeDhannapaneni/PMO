import { NextFunction, Request, Response, Router } from 'express';
import { accountTrackerController as c } from '../controllers/accountTrackerController';
import { requireAuth, requireRole } from '../middleware/auth';
import { ensureSchema } from '../services/accountTrackerStore';

// Mounted by customerSuccessRoutes at /api/customer-success/accounts.
const router = Router();

router.use(requireAuth);
router.use((_req: Request, _res: Response, next: NextFunction) => {
  ensureSchema().then(() => next(), next);
});

router.get('/me', c.me);
router.get('/status', c.status);
router.post('/sync', c.sync);
router.get('/metrics', c.metrics);
router.get('/stats/:key', c.stat);
router.get('/companies', c.companies);
router.get('/companies/filter-options', c.filterOptions);
router.get('/companies/priority', c.priority);
router.get('/companies/lookup', c.lookup);
router.get('/companies/:id', c.company);
router.get('/companies/:id/activity', c.activity);
router.get('/contacts', c.contacts);
router.get('/deals', c.deals);
router.get('/top20', c.top20);
router.get('/insights', c.insights);

router.get('/owners', requireRole('ADMIN'), c.owners);
router.get('/links', requireRole('ADMIN'), c.links);
router.put('/links/:userId', requireRole('ADMIN'), c.setLink);

export default router;
