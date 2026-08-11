import { Request, Response, NextFunction } from 'express';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function viewerReadOnly(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (user?.role === 'VIEWER' && WRITE_METHODS.has(req.method)) {
    res.status(403).json({ success: false, error: 'Viewer accounts are read-only' });
    return;
  }
  next();
}
