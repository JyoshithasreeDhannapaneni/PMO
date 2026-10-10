import { describe, it, expect, jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { viewerReadOnly } from '../../middleware/viewerReadOnly';

function run(role: string | undefined, method: string, path: string) {
  const json = jest.fn();
  const status = jest.fn((_code: number) => ({ json }));
  const next = jest.fn();
  const req = { method, path, user: role ? { role } : undefined } as unknown as Request;
  viewerReadOnly(req, { status } as unknown as Response, next as unknown as NextFunction);
  return { next, status };
}

describe('viewerReadOnly', () => {
  it('blocks VIEWER writes', () => {
    const { next, status } = run('VIEWER', 'DELETE', '/projects/123');
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it('lets VIEWER read', () => {
    expect(run('VIEWER', 'GET', '/projects').next).toHaveBeenCalled();
  });

  it('allows VIEWER self-service writes', () => {
    expect(run('VIEWER', 'POST', '/auth/logout').next).toHaveBeenCalled();
    expect(run('VIEWER', 'POST', '/auth/change-password').next).toHaveBeenCalled();
    expect(run('VIEWER', 'POST', '/feedback').next).toHaveBeenCalled();
    expect(run('VIEWER', 'POST', '/feedback/').next).toHaveBeenCalled();
  });

  it('blocks VIEWERs from changing shared notification read-state', () => {
    expect(run('VIEWER', 'PUT', '/notifications/abc/read').status).toHaveBeenCalledWith(403);
    expect(run('VIEWER', 'PUT', '/notifications/mark-all-read').status).toHaveBeenCalledWith(403);
  });

  it('does not let the self-service allowlist match neighbouring paths or methods', () => {
    expect(run('VIEWER', 'DELETE', '/auth/logout').status).toHaveBeenCalledWith(403);
    expect(run('VIEWER', 'POST', '/feedback/1/status').status).toHaveBeenCalledWith(403);
    expect(run('VIEWER', 'PATCH', '/projects/1').status).toHaveBeenCalledWith(403);
  });

  it('leaves requests without a resolved user to the auth gate', () => {
    expect(run(undefined, 'DELETE', '/projects/1').next).toHaveBeenCalled();
  });

  it('does not restrict other roles', () => {
    expect(run('PROJECT_MANAGER', 'DELETE', '/projects/123').next).toHaveBeenCalled();
    expect(run('ADMIN', 'POST', '/settings').next).toHaveBeenCalled();
  });
});
