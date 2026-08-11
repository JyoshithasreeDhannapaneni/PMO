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
