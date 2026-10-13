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

describe('errorHandler error codes and incident hygiene', () => {
  type Mocked = { mock: { calls: unknown[][] }; mockClear: () => void };
  const { selfHealService } = jest.requireMock('../../services/selfHealService') as { selfHealService: { captureIncident: Mocked } };
  const { logger } = jest.requireMock('../../utils/logger') as { logger: { error: Mocked } };

  function respond(err: Error, path = '/api/projects/p1') {
    const json = jest.fn();
    const status = jest.fn((_code: number) => ({ json }));
    errorHandler(err, { method: 'PUT', path } as Request, { status } as unknown as Response, jest.fn() as unknown as NextFunction);
    return json.mock.calls[0][0] as { success: boolean; error: Record<string, unknown> };
  }

  it('serializes an AppError code and details for clients that branch on them', () => {
    const body = respond(new AppError('need csat', 409, 'CSAT_REQUIRED', { csat: { state: 'none' } }));
    expect(body).toEqual({ success: false, error: { message: 'need csat', code: 'CSAT_REQUIRED', details: { csat: { state: 'none' } } } });
  });

  it('omits code and details when the AppError has none', () => {
    expect(respond(new AppError('nope', 404)).error).not.toHaveProperty('code');
  });

  it('does not open a self-heal incident for a failed outbound email', () => {
    selfHealService.captureIncident.mockClear();
    respond(new AppError('email down', 503, 'EMAIL_SEND_FAILED'));
    expect(selfHealService.captureIncident.mock.calls).toHaveLength(0);
  });

  it('never writes a survey token into the log or a self-heal incident', () => {
    selfHealService.captureIncident.mockClear();
    logger.error.mockClear();
    respond(new Error('boom'), `/api/csat/${'b'.repeat(64)}`);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('b'.repeat(64));
    expect(selfHealService.captureIncident.mock.calls).toHaveLength(1);
    expect(JSON.stringify(selfHealService.captureIncident.mock.calls)).not.toContain('b'.repeat(64));
  });
});
