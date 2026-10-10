import { Request, Response, NextFunction } from 'express';
import { requireAuth } from './auth';

// Mounted once on /api in index.ts, before every router, so a route file that forgets
// requireAuth is still protected. Before 2026-10-10 most routers had no auth at all and
// anonymous callers could create, edit and delete data.
//
// Only these endpoints run without a session. Keep the list short and explicit: each one
// either establishes the session or carries its own credential.
const PUBLIC_ROUTES: { method: string; path: string }[] = [
  { method: 'POST', path: '/auth/login' },
  { method: 'POST', path: '/auth/forgot-password' },
  { method: 'POST', path: '/auth/reset-password' },
  // Microsoft SSO: browser navigations, no bearer header possible
  { method: 'GET', path: '/auth/microsoft' },
  { method: 'GET', path: '/auth/microsoft/callback' },
  // Atlassian redirects the admin's browser here after consent
  { method: 'GET', path: '/jira/oauth/callback' },
];

// Server-to-server integrations authenticate with X-API-Key (requireExternalApiKey).
const PUBLIC_PREFIXES = ['/external/'];

export function isPublicApiRoute(method: string, path: string): boolean {
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path;
  if (PUBLIC_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  return PUBLIC_ROUTES.some((r) => r.method === method && r.path === normalized);
}

export async function apiAuthGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.method === 'OPTIONS' || isPublicApiRoute(req.method, req.path)) {
    next();
    return;
  }
  await requireAuth(req, res, next);
}
