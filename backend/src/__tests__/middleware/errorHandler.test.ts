import { describe, it, expect, jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';

jest.mock('../../services/selfHealService', () => ({ selfHealService: { captureIncident: jest.fn(async () => undefined) } }));
jest.mock('../../utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

import { errorHandler, AppError } from '../../middleware/errorHandler';

function messageFor(err: Error): { status: number; message: string } {
  const json = jest.fn();
  const status = jest.fn((_code: number) => ({ json }));
  errorHandler(err, { method: 'GET', path: '/api/projects' } as Request, { status } as unknown as Response, jest.fn() as unknown as NextFunction);
  const body = json.mock.calls[0][0] as { error: { message: string } };
  return { status: status.mock.calls[0][0] as number, message: body.error.message };
}

describe('errorHandler', () => {
  it('never returns raw Postgres error text (it echoes query values)', () => {
    const pgError = Object.assign(new Error('invalid input syntax for type integer: "6f1c2e…session-token"'), {
      code: '22P02',
      severity: 'ERROR',
    });
    expect(messageFor(pgError)).toEqual({ status: 500, message: 'Internal Server Error' });
  });

  it('still passes through messages written for users', () => {
    expect(messageFor(new Error('SharePoint site or list not found')).message).toBe('SharePoint site or list not found');
  });

  it('keeps AppError status and message', () => {
    expect(messageFor(new AppError('Project not found', 404))).toEqual({ status: 404, message: 'Project not found' });
  });
});
