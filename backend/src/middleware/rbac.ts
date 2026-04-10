import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

type UserRole = 'ADMIN' | 'MANAGER' | 'VIEWER';

// Define permissions for each role
const rolePermissions: Record<UserRole, string[]> = {
  ADMIN: [
    'users:read', 'users:write', 'users:delete',
    'projects:read', 'projects:write', 'projects:delete',
    'tasks:read', 'tasks:write', 'tasks:delete',
    'risks:read', 'risks:write', 'risks:delete',
    'team:read', 'team:write', 'team:delete',
    'documents:read', 'documents:write', 'documents:delete',
    'reports:read', 'reports:write', 'reports:delete',
    'change-requests:read', 'change-requests:write', 'change-requests:approve',
    'templates:read', 'templates:write', 'templates:delete',
    'settings:read', 'settings:write',
    'audit:read',
    'export:all',
  ],
  MANAGER: [
    'projects:read', 'projects:write',
    'tasks:read', 'tasks:write',
    'risks:read', 'risks:write',
    'team:read', 'team:write',
    'documents:read', 'documents:write',
    'reports:read', 'reports:write',
    'change-requests:read', 'change-requests:write', 'change-requests:approve',
    'templates:read',
    'export:own',
  ],
  VIEWER: [
    'projects:read',
    'tasks:read',
    'risks:read',
    'team:read',
    'documents:read',
    'reports:read',
    'change-requests:read',
    'templates:read',
  ],
};

export function hasPermission(role: UserRole, permission: string): boolean {
  return rolePermissions[role]?.includes(permission) || false;
}

export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    if (!user) {
      throw new AppError('Authentication required', 401);
    }

    const userRole = user.role as UserRole;
    const hasRequired = permissions.some(permission => hasPermission(userRole, permission));

    if (!hasRequired) {
      throw new AppError('Insufficient permissions', 403);
    }

    next();
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    if (!user) {
      throw new AppError('Authentication required', 401);
    }

    if (!roles.includes(user.role)) {
      throw new AppError('Insufficient permissions', 403);
    }

    next();
  };
}

export function isAdmin(req: Request): boolean {
  const user = (req as any).user;
  return user?.role === 'ADMIN';
}

export function isManagerOrAdmin(req: Request): boolean {
  const user = (req as any).user;
  return user?.role === 'ADMIN' || user?.role === 'MANAGER';
}
