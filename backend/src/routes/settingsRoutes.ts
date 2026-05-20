import { Router, Request, Response } from 'express';
import { query, execute } from '../config/db';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.get('/', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await query(`SELECT settings FROM app_settings WHERE id = 1`);
  res.json({ success: true, data: result.rows[0]?.settings || {} });
}));

router.post('/', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const settings = req.body;
  await execute(
    `INSERT INTO app_settings (id, settings, updated_at) VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET settings = $1, updated_at = NOW()`,
    [JSON.stringify(settings)]
  );
  res.json({ success: true, data: settings });
}));

export default router;
