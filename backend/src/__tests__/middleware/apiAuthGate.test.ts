import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';

const mockRequireAuth = jest.fn(async (_req: Request, _res: Response, _next: NextFunction) => {});
jest.mock('../../middleware/auth', () => ({ requireAuth: mockRequireAuth }));

import { apiAuthGate, isPublicApiRoute } from '../../middleware/apiAuthGate';

describe('apiAuthGate', () => {
  describe('isPublicApiRoute', () => {
    it('allows only the session-establishing auth endpoints', () => {
      expect(isPublicApiRoute('POST', '/auth/login')).toBe(true);
      expect(isPublicApiRoute('POST', '/auth/forgot-password')).toBe(true);
      expect(isPublicApiRoute('POST', '/auth/reset-password')).toBe(true);
      expect(isPublicApiRoute('GET', '/auth/microsoft')).toBe(true);
      expect(isPublicApiRoute('GET', '/auth/microsoft/callback')).toBe(true);
    });

    it('keeps public self-registration closed', () => {
      expect(isPublicApiRoute('POST', '/auth/register')).toBe(false);
    });

    it('matches method as well as path', () => {
      expect(isPublicApiRoute('GET', '/auth/login')).toBe(false);
      expect(isPublicApiRoute('DELETE', '/auth/microsoft/callback')).toBe(false);
    });

    it('allows the Jira OAuth callback but not connect or disconnect', () => {
      expect(isPublicApiRoute('GET', '/jira/oauth/callback')).toBe(true);
      expect(isPublicApiRoute('GET', '/jira/oauth/connect-url')).toBe(false);
      expect(isPublicApiRoute('POST', '/jira/oauth/disconnect')).toBe(false);
    });

    it('lets /external/* through to its own API-key check', () => {
      expect(isPublicApiRoute('GET', '/external/projects')).toBe(true);
      expect(isPublicApiRoute('GET', '/externalish')).toBe(false);
    });

    it('protects data routes that used to be open', () => {
      expect(isPublicApiRoute('DELETE', '/projects/123')).toBe(false);
      expect(isPublicApiRoute('GET', '/settings')).toBe(false);
      expect(isPublicApiRoute('POST', '/jira/excel/upload')).toBe(false);
    });

    it('opens only GET and POST of a well-formed customer C-SAT link', () => {
      const t = 'f'.repeat(64);
      expect(isPublicApiRoute('GET', `/csat/${t}`)).toBe(true);
      expect(isPublicApiRoute('POST', `/csat/${t}`)).toBe(true);
      expect(isPublicApiRoute('PUT', `/csat/${t}`)).toBe(false);
      expect(isPublicApiRoute('GET', '/csat/abc')).toBe(false);
      expect(isPublicApiRoute('GET', `/csat/${t}/extra`)).toBe(false);
      expect(isPublicApiRoute('POST', '/projects/p1/csat-requests')).toBe(false);
    });

    it('ignores a trailing slash', () => {
      expect(isPublicApiRoute('POST', '/auth/login/')).toBe(true);
      expect(isPublicApiRoute('GET', '/settings/')).toBe(false);
    });
  });

  describe('apiAuthGate', () => {
    beforeEach(() => { mockRequireAuth.mockClear(); });

    const run = async (method: string, path: string) => {
      const next = jest.fn();
      await apiAuthGate({ method, path } as Request, {} as Response, next as unknown as NextFunction);
      return next;
    };

    it('passes public routes straight through without a session check', async () => {
      const next = await run('POST', '/auth/login');
      expect(next).toHaveBeenCalled();
      expect(mockRequireAuth).not.toHaveBeenCalled();
    });

    it('lets CORS preflight through', async () => {
      const next = await run('OPTIONS', '/projects');
      expect(next).toHaveBeenCalled();
      expect(mockRequireAuth).not.toHaveBeenCalled();
    });

    it('sends every other route through requireAuth', async () => {
      await run('DELETE', '/projects/123');
      expect(mockRequireAuth).toHaveBeenCalledTimes(1);
    });
  });
});
