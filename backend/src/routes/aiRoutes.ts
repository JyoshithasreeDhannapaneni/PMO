import { Router } from 'express';
import { aiChat } from '../controllers/aiController';

const router = Router();

router.post('/chat', aiChat);

export default router;
