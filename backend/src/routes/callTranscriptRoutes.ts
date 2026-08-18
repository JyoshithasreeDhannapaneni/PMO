import { Router } from 'express';
import { callTranscriptController } from '../controllers/callTranscriptController';
import { requireRole } from '../middleware/auth';

const router = Router();

// Grading pulls a raw meeting transcript and scores a named employee's answers —
// restricted to ADMIN given the sensitivity of reading call content per-person.
router.get('/rating', requireRole('ADMIN'), callTranscriptController.getRating);
router.post('/rate', requireRole('ADMIN'), callTranscriptController.rate);

export default router;
