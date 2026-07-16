import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Viewers are meant to be read-only across the entire application, but most
// routes/controllers never check role at all (see the access audit) — so
// this runs before every route and blocks any mutating request from a
// VIEWER token, regardless of whether the individual endpoint enforces it
// itself. /api/auth is exempt since login/logout/change-password are
// self-service session actions every role needs, not data mutations.
export const viewerReadOnly = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (SAFE_METHODS.has(req.method) || req.path.startsWith('/api/auth')) {
    next();
    return;
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    next();
    return;
  }

  try {
    const user = await authService.getUserFromToken(token);
    if (user && user.role === 'VIEWER') {
      res.status(403).json({ success: false, error: { message: 'Viewers have read-only access' } });
      return;
    }
  } catch {
    // invalid/expired token — leave it to the route's own auth handling, if any
  }
  next();
};
