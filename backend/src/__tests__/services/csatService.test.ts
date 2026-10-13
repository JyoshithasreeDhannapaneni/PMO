// Value: protects=only an admin or the project's own PM can send the survey, the emailed token is stored only as a hash, resends revoke older links, a Graph refusal falls back to the shared mailbox, and the public form accepts one valid answer per live link;
//   fails_when=role checks, hashing, revocation, the fallback or the token/answer validation regress; why_new=new feature;
//   seam=none
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import crypto from 'crypto';

type Row = Record<string, unknown>;
let mockProject: Row | undefined;
let mockLatest: Row[];
let mockTokenRow: Row | undefined;
let mockClaimRowCount: number;

const mockClientQuery = jest.fn(async (sql: string, _params?: unknown[]) => {
  if (/UPDATE csat_requests SET revoked_at = NOW\(\)/.test(sql)) return { rows: [{ id: 'old-1' }], rowCount: 1 };
  if (/INSERT INTO csat_requests/.test(sql)) return { rows: [{ id: 'new-1' }], rowCount: 1 };
  if (/UPDATE csat_requests SET responded_at/.test(sql)) return { rows: mockClaimRowCount ? [{ id: 'r1' }] : [], rowCount: mockClaimRowCount };
  if (/FROM projects/.test(sql)) return { rows: [mockProject], rowCount: 1 };
  return { rows: [], rowCount: 1 };
});
const mockQuery = jest.fn(async (sql: string, _params?: unknown[]) => {
  if (/FROM users/.test(sql)) return { rows: [{ email: 'alice@cloudfuze.com' }], rowCount: 1 };
  if (/WHERE token_hash/.test(sql)) return { rows: mockTokenRow ? [mockTokenRow] : [], rowCount: mockTokenRow ? 1 : 0 };
  if (/FROM csat_requests WHERE project_id/.test(sql)) return { rows: mockLatest, rowCount: mockLatest.length };
  if (/FROM projects/.test(sql)) return { rows: mockProject ? [mockProject] : [], rowCount: mockProject ? 1 : 0 };
  if (/FROM users/.test(sql)) return { rows: [{ email: 'alice@cloudfuze.com' }], rowCount: 1 };
  return { rows: [], rowCount: 0 };
});
const mockExecute = jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 1 }));
jest.mock('../../config/database', () => ({
  query: mockQuery,
  execute: mockExecute,
  transaction: async (cb: (client: { query: typeof mockClientQuery }) => Promise<unknown>) => cb({ query: mockClientQuery }),
}));
jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const mockSendEmail = jest.fn(async (_opts: Record<string, unknown>) => undefined);
jest.mock('../../services/emailService', () => {
  class GraphSendError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  return { emailService: { sendEmail: mockSendEmail }, brandedEmail: (_t: string, body: string) => body, GraphSendError };
});
const mockCreateNotification = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../services/notificationService', () => ({ notificationService: { createNotification: mockCreateNotification } }));

import { csatService } from '../../services/csatService';
import { GraphSendError } from '../../services/emailService';

const alice = { id: 'u1', name: 'Alice', email: 'alice@cloudfuze.com', role: 'PROJECT_MANAGER' };
const token = 'a'.repeat(64);
const liveRow = () => ({ id: 'r1', project_id: 'p1', responded_at: null, revoked_at: null, expires_at: new Date(Date.now() + 86_400_000) });

async function rejection(p: Promise<unknown>) {
  try { await p; } catch (err) { return err as { statusCode?: number; message: string }; }
  throw new Error('expected the call to be rejected');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProject = { id: 'p1', name: 'Acme migration', customer_name: 'Acme', project_manager: 'Alice' };
  mockLatest = [];
  mockTokenRow = undefined;
  mockClaimRowCount = 1;
});

describe('csatService.sendRequest', () => {
  it('lets only an admin or the project’s own PM send', async () => {
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, { ...alice, role: 'VIEWER' }))).statusCode).toBe(403);
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, { ...alice, name: 'Bob' }))).statusCode).toBe(403);
    await csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice);
    await csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, { ...alice, name: 'Root', role: 'ADMIN' });
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid customer email without sending', async () => {
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'John (IT)' }, alice))).statusCode).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('emails the raw token but stores only its sha256, sending as the PM', async () => {
    await csatService.sendRequest('p1', { recipientEmail: 'C@Acme.com', message: '<b>hi</b>' }, alice);
    const insert = mockClientQuery.mock.calls.find((c) => /INSERT INTO csat_requests/.test(String(c[0])))!;
    const storedHash = String((insert[1] as unknown[])[2]);
    const opts = mockSendEmail.mock.calls[0][0] as { to: string; from?: string; html: string };
    const raw = /\/csat\/([0-9a-f]{64})/.exec(opts.html)![1];
    expect(storedHash).toBe(crypto.createHash('sha256').update(raw).digest('hex'));
    expect(storedHash).not.toBe(raw);
    expect(opts.to).toBe('c@acme.com');
    expect(opts.from).toBe('alice@cloudfuze.com');
    expect(opts.html).not.toContain('<b>hi</b>');
  });

  it('revokes earlier unanswered links when resending', async () => {
    mockLatest = [{ ...liveRow(), recipient_email: 'old@acme.com', sent_at: new Date() }];
    await csatService.sendRequest('p1', { recipientEmail: 'new@acme.com' }, alice);
    expect(mockClientQuery.mock.calls.some((c) => /SET revoked_at = NOW\(\)/.test(String(c[0])))).toBe(true);
  });

  it('refuses to resend after the customer already answered', async () => {
    mockLatest = [{ ...liveRow(), responded_at: new Date(), recipient_email: 'c@acme.com', sent_at: new Date() }];
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice))).statusCode).toBe(409);
  });

  it('falls back to the shared mailbox with the PM as CC and Reply-To when Graph refuses the PM mailbox', async () => {
    mockSendEmail.mockRejectedValueOnce(new GraphSendError('denied', 403));
    await csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const fallback = mockSendEmail.mock.calls[1][0] as { from?: string; cc?: string; replyTo?: string };
    expect(fallback.from).toBeUndefined();
    expect(fallback.cc).toBe('alice@cloudfuze.com');
    expect(fallback.replyTo).toBe('alice@cloudfuze.com');
  });

  it('undoes the request and restores revoked links when the email cannot be sent', async () => {
    mockSendEmail.mockRejectedValueOnce(new GraphSendError('server error', 500));
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice))).statusCode).toBe(502);
    const sql = mockExecute.mock.calls.map((c) => String(c[0]));
    expect(sql.some((s) => /DELETE FROM csat_requests/.test(s))).toBe(true);
    expect(sql.some((s) => /SET revoked_at = NULL/.test(s))).toBe(true);
  });
});

describe('csatService public form', () => {
  it('rejects malformed, unknown, answered, replaced and expired links', async () => {
    expect((await rejection(csatService.getPublicForm('not-a-token'))).statusCode).toBe(404);
    expect((await rejection(csatService.getPublicForm(token))).statusCode).toBe(404);
    mockTokenRow = { ...liveRow(), responded_at: new Date() };
    expect((await rejection(csatService.getPublicForm(token))).statusCode).toBe(409);
    mockTokenRow = { ...liveRow(), revoked_at: new Date() };
    expect((await rejection(csatService.getPublicForm(token))).statusCode).toBe(410);
    mockTokenRow = { ...liveRow(), expires_at: new Date(Date.now() - 1000) };
    expect((await rejection(csatService.getPublicForm(token))).statusCode).toBe(410);
  });

  it('shows only the project and customer name for a live link', async () => {
    mockTokenRow = liveRow();
    expect(await csatService.getPublicForm(token)).toEqual({ projectName: 'Acme migration', customerName: 'Acme' });
  });

  it('validates the answers', async () => {
    mockTokenRow = liveRow();
    expect((await rejection(csatService.submitResponse(token, { overall: 11, wentWell: true }))).statusCode).toBe(400);
    expect((await rejection(csatService.submitResponse(token, { overall: 2.5, wentWell: true }))).statusCode).toBe(400);
    expect((await rejection(csatService.submitResponse(token, { overall: 8 } as never))).statusCode).toBe(400);
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it('records a valid answer into the C-SAT fields and notifies the PM', async () => {
    mockTokenRow = liveRow();
    await csatService.submitResponse(token, { overall: 9, migrationQuality: 8, support: 10, onboarding: 7, wentWell: true, comments: 'Great' });
    const upsert = mockClientQuery.mock.calls.find((c) => /INSERT INTO customer_success_entries/.test(String(c[0])))!;
    expect(upsert[1]).toEqual(['p1', 'Acme', 9, 8, 10, 7, 'Great']);
    await new Promise((r) => setImmediate(r));
    expect(mockCreateNotification).toHaveBeenCalledWith('GENERAL', expect.stringContaining('C-SAT received'), expect.any(String), ['alice@cloudfuze.com'], 'p1');
  });

  it('accepts only one answer when two submits race', async () => {
    mockTokenRow = liveRow();
    mockClaimRowCount = 0;
    expect((await rejection(csatService.submitResponse(token, { overall: 9, wentWell: true }))).statusCode).toBe(409);
    expect(mockClientQuery.mock.calls.some((c) => /customer_success_entries/.test(String(c[0])))).toBe(false);
  });
});
