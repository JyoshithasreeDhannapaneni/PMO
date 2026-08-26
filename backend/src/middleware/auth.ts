import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const token = header.slice(7);
  const user = await authService.getUserFromToken(token);
  if (!user) {
    res.status(401).json({ success: false, error: 'Invalid or expired session' });
    return;
  }

  (req as any).user = user;
  next();
}

// Static-key auth for server-to-server integrations (e.g. another internal app pulling
// project data) — deliberately separate from requireAuth's per-user JWT/session model,
// since a machine-to-machine caller has no "logged in user" to attach. Checked against
// EXTERNAL_API_KEY in backend/.env; that var was documented but unused until 2026-08-26.
export function requireExternalApiKey(req: Request, res: Response, next: NextFunction): void {
  const configured = process.env.EXTERNAL_API_KEY;
  if (!configured || configured.startsWith('PASTE_')) {
    res.status(503).json({ success: false, error: 'External API is not configured on this server (EXTERNAL_API_KEY missing).' });
    return;
  }
  const provided = req.headers['x-api-key'];
  if (provided !== configured) {
    res.status(401).json({ success: false, error: 'Invalid or missing API key' });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await requireAuth(req, res, async () => {
      const user = (req as any).user;
      if (!roles.includes(user.role)) {
        res.status(403).json({ success: false, error: 'Insufficient permissions' });
        return;
      }
      next();
    });
  };
}
