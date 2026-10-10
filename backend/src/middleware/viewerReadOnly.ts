import { Request, Response, NextFunction } from 'express';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Self-service writes a VIEWER still needs: ending their own session, changing their own
// password, clearing their own notifications and sending feedback. Paths are relative to /api.
const VIEWER_ALLOWED_WRITES: { method: string; pattern: RegExp }[] = [
  { method: 'POST', pattern: /^\/auth\/logout$/ },
  { method: 'POST', pattern: /^\/auth\/change-password$/ },
  { method: 'PUT', pattern: /^\/notifications\/[^/]+\/read$/ },
  { method: 'PUT', pattern: /^\/notifications\/mark-all-read$/ },
  { method: 'POST', pattern: /^\/feedback$/ },
];

// Must run after apiAuthGate: req.user only exists once the session is resolved. It was
// mounted before any auth until 2026-10-10, so it never blocked anything.
export function viewerReadOnly(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (user?.role === 'VIEWER' && WRITE_METHODS.has(req.method)) {
    const path = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
    const allowed = VIEWER_ALLOWED_WRITES.some((w) => w.method === req.method && w.pattern.test(path));
    if (!allowed) {
      res.status(403).json({ success: false, error: 'Viewer accounts are read-only' });
      return;
    }
  }
  next();
}
