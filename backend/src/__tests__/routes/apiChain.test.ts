import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

// Real gate, real requireAuth/requireRole, real viewerReadOnly and the real settings router —
// only the session lookup and the DB are faked. Guards the mount order in index.ts:
// viewerReadOnly only works when it runs after the gate has set req.user.
const USERS: Record<string, { id: string; name: string; email: string; role: string }> = {
  'admin-token': { id: '1', name: 'Ada', email: 'a@x', role: 'ADMIN' },
  'pm-token': { id: '2', name: 'Pat', email: 'p@x', role: 'PROJECT_MANAGER' },
  'viewer-token': { id: '3', name: 'Vic', email: 'v@x', role: 'VIEWER' },
};
jest.mock('../../services/authService', () => ({
  authService: {
    getUserFromToken: jest.fn(async (token: string) => {
      if (token === 'db-down-token') throw new Error('Connection terminated unexpectedly');
      return USERS[token] ?? null;
    }),
  },
}));
jest.mock('../../controllers/pmoSettingsController', () => ({
  pmoSettingsController: {
    get: (_req: unknown, res: { json: (b: unknown) => void }) => res.json({ success: true, reached: 'get' }),
    save: (_req: unknown, res: { json: (b: unknown) => void }) => res.json({ success: true, reached: 'save' }),
    patch: (_req: unknown, res: { json: (b: unknown) => void }) => res.json({ success: true, reached: 'patch' }),
  },
}));
const mockQuery = jest.fn(async () => ({ rows: [{ settings: { smtpSettings: { host: 'smtp.x', password: 'smtp-secret' } } }], rowCount: 1 }));
const mockExecute = jest.fn(async () => ({ rows: [], rowCount: 1 }));
jest.mock('../../config/db', () => ({ query: mockQuery, execute: mockExecute }));
jest.mock('../../services/selfHealService', () => ({ selfHealService: { captureIncident: jest.fn(async () => undefined) } }));
jest.mock('../../utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

import { apiAuthGate } from '../../middleware/apiAuthGate';
import { viewerReadOnly } from '../../middleware/viewerReadOnly';
import settingsRoutes from '../../routes/settingsRoutes';
import pmoSettingsRoutes from '../../routes/pmoSettingsRoutes';
import { errorHandler } from '../../middleware/errorHandler';

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', apiAuthGate);
  app.use('/api', viewerReadOnly);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/pmo-settings', pmoSettingsRoutes);
  app.post('/api/auth/login', (_req, res) => { res.json({ success: true, reached: 'login' }); });
  app.delete('/api/projects/:id', (_req, res) => { res.json({ success: true, reached: 'delete' }); });
  app.post('/api/feedback', (_req, res) => { res.json({ success: true, reached: 'feedback' }); });
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const req = (method: string, path: string, token?: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('/api auth chain', () => {
  it('rejects data routes without a session or with an unknown token', async () => {
    expect((await req('DELETE', '/api/projects/1')).status).toBe(401);
    expect((await req('DELETE', '/api/projects/1', 'forged')).status).toBe(401);
    expect((await req('GET', '/api/settings')).status).toBe(401);
  });

  it('keeps login reachable without a session', async () => {
    const res = await req('POST', '/api/auth/login', undefined, {});
    expect(res.status).toBe(200);
  });

  it('blocks VIEWER writes but allows their self-service feedback', async () => {
    expect((await req('DELETE', '/api/projects/1', 'viewer-token')).status).toBe(403);
    expect((await req('POST', '/api/feedback', 'viewer-token', {})).status).toBe(200);
    expect((await req('DELETE', '/api/projects/1', 'pm-token')).status).toBe(200);
  });

  it('hides the SMTP password from non-admins but not from admins', async () => {
    const pmBody = (await (await req('GET', '/api/settings', 'pm-token')).json()) as { data: { smtpSettings: Record<string, unknown> } };
    expect(pmBody.data.smtpSettings).toEqual({ host: 'smtp.x' });
    const adminBody = (await (await req('GET', '/api/settings', 'admin-token')).json()) as { data: { smtpSettings: Record<string, unknown> } };
    expect(adminBody.data.smtpSettings.password).toBe('smtp-secret');
  });

  it('answers 500 instead of hanging when the session lookup itself fails', async () => {
    const res = await req('GET', '/api/settings', 'db-down-token');
    expect(res.status).toBe(500);
  });

  it('lets everyone signed in read plan types/phases but only admins change them', async () => {
    expect((await req('GET', '/api/pmo-settings', 'pm-token')).status).toBe(200);
    expect((await req('POST', '/api/pmo-settings', 'pm-token', {})).status).toBe(403);
    expect((await req('PATCH', '/api/pmo-settings', 'pm-token', {})).status).toBe(403);
    expect((await req('POST', '/api/pmo-settings', 'admin-token', {})).status).toBe(200);
  });

  it('only lets admins save settings', async () => {
    expect((await req('POST', '/api/settings', 'pm-token', { a: 1 })).status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
    expect((await req('POST', '/api/settings', 'admin-token', { a: 1 })).status).toBe(200);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});
