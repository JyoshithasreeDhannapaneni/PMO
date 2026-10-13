import { Router, Request, Response } from 'express';
import { query, execute } from '../config/db';
import { asyncHandler } from '../middleware/errorHandler';
import { requireRole } from '../middleware/auth';

const router = Router();

// Every signed-in user loads these settings (auth/callback caches them), but the blob also
// holds the SMTP password the settings page saves — only admins get that back.
router.get('/', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await query(`SELECT settings FROM app_settings WHERE id = 1`);
  const settings = result.rows[0]?.settings || {};
  const isAdmin = (req as any).user?.role === 'ADMIN';
  if (!isAdmin && settings.smtpSettings) {
    const { password: _password, ...smtpWithoutPassword } = settings.smtpSettings;
    settings.smtpSettings = smtpWithoutPassword;
  }
  res.json({ success: true, data: settings });
}));

router.post('/', requireRole('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const settings = req.body;
  await execute(
    `INSERT INTO app_settings (id, settings, updated_at) VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET settings = $1, updated_at = NOW()`,
    [JSON.stringify(settings)]
  );
  res.json({ success: true, data: settings });
}));

export default router;
