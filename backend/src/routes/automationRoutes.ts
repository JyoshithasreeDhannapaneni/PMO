import { Router } from 'express';
import { automationController } from '../controllers/automationController';

const router = Router();

// GET /api/automation-rules - list all rules
router.get('/', automationController.getAll);

// POST /api/automation-rules - create a new rule
router.post('/', automationController.create);

// PUT /api/automation-rules/:id/enabled - enable/disable a rule
router.put('/:id/enabled', automationController.setEnabled);

// DELETE /api/automation-rules/:id - delete a rule
router.delete('/:id', automationController.remove);

export default router;
