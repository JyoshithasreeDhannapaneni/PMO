// Value: protects=only an admin or the project's own PM can send the survey, only to an outside customer address, the emailed token is stored only as a hash and never copied to the PM, resends revoke older links and are capped, a Graph refusal falls back to the shared mailbox, and the public form accepts one valid answer per live link without wiping existing C-SAT data;
//   fails_when=role checks, recipient rules, hashing, revocation, the fallback, rollback, the send cap or the token/answer validation regress; why_new=new feature;
//   seam=none
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';

type Row = Record<string, unknown>;
let mockProject: Row | undefined;
let mockLatest: Row[];
let mockTokenRow: Row | undefined;
let mockClaimRowCount: number;
let mockSendsToday: number;
let mockAnsweredInTxn: boolean;
let mockAccountAnswer: Row | undefined;

const mockClientQuery = jest.fn(async (sql: string, _params?: unknown[]) => {
  if (/COUNT\(\*\)/.test(sql)) return { rows: [{ sends: mockSendsToday }], rowCount: 1 };
  if (/UPDATE csat_requests SET revoked_at = NOW\(\)/.test(sql)) return { rows: [{ id: 'old-1' }], rowCount: 1 };
  if (/responded_at IS NOT NULL/.test(sql)) return { rows: mockAnsweredInTxn ? [{ id: 'r0' }] : [], rowCount: mockAnsweredInTxn ? 1 : 0 };
  if (/INSERT INTO csat_requests/.test(sql)) return { rows: [{ id: 'new-1' }], rowCount: 1 };
  if (/UPDATE csat_requests SET responded_at/.test(sql)) return { rows: mockClaimRowCount ? [{ id: 'r1' }] : [], rowCount: mockClaimRowCount };
  if (/FROM projects/.test(sql)) return { rows: [mockProject], rowCount: 1 };
  return { rows: [], rowCount: 1 };
});
const mockQuery = jest.fn(async (sql: string, _params?: unknown[]) => {
  if (/FROM users/.test(sql)) return { rows: [{ email: 'alice@cloudfuze.com' }], rowCount: 1 };
  if (/JOIN projects p ON p.id = r.project_id/.test(sql)) return { rows: mockAccountAnswer ? [mockAccountAnswer] : [], rowCount: mockAccountAnswer ? 1 : 0 };
  if (/WHERE token_hash/.test(sql)) return { rows: mockTokenRow ? [mockTokenRow] : [], rowCount: mockTokenRow ? 1 : 0 };
  if (/FROM csat_requests\s+WHERE project_id/.test(sql)) return { rows: mockLatest, rowCount: mockLatest.length };
  if (/FROM projects/.test(sql)) return { rows: mockProject ? [mockProject] : [], rowCount: mockProject ? 1 : 0 };
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
  return {
    emailService: { sendEmail: mockSendEmail },
    brandedEmail: (_t: string, body: string) => body,
    customerEmail: (_t: string, body: string) => `<img src="cid:cloudfuze-logo">${body}`,
    cloudfuzeLogoImage: () => ({ contentId: 'cloudfuze-logo', name: 'cloudfuze-logo.png', contentType: 'image/png', contentBase64: 'AA==' }),
    CLOUDFUZE_BLUE: '#0129AC',
    defaultFromAddress: () => 'alerts@cloudfuze.com',
    isBlockedRecipient: (email: string) => email === 'admin@company.com',
    GraphSendError,
  };
});
const mockCreateNotification = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../services/notificationService', () => ({ notificationService: { createNotification: mockCreateNotification } }));

import { csatService } from '../../services/csatService';
import { GraphSendError } from '../../services/emailService';

const alice = { id: 'u1', name: 'Alice', email: 'alice@cloudfuze.com', role: 'PROJECT_MANAGER' };
const token = 'a'.repeat(64);
const liveRow = () => ({ id: 'r1', project_id: 'p1', responded_at: null, revoked_at: null, expires_at: new Date(Date.now() + 86_400_000), expired: false });

type SentMail = { to: string; from?: string; cc?: string; replyTo?: string; html: string };
const sends = () => mockSendEmail.mock.calls.map((c) => c[0] as SentMail);
const customerSends = () => sends().filter((m) => m.to !== alice.email);
const rawToken = (html: string) => /\/csat\/([0-9a-f]{64})/.exec(html)?.[1];

async function rejection(p: Promise<unknown>) {
  try { await p; } catch (err) { return err as { statusCode?: number; code?: string; message: string; details?: { csat?: { expired?: boolean } } }; }
  throw new Error('expected the call to be rejected');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProject = { id: 'p1', name: 'Acme migration', customer_name: 'Acme', project_manager: 'Alice' };
  mockLatest = [];
  mockTokenRow = undefined;
  mockClaimRowCount = 1;
  mockSendsToday = 0;
  mockAnsweredInTxn = false;
  mockAccountAnswer = undefined;
});

afterEach(() => {
  delete process.env.CSAT_DELTA_GATE;
});

describe('csatService.sendRequest', () => {
  it('lets only an admin or the project’s own PM send', async () => {
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, { ...alice, role: 'VIEWER' }))).statusCode).toBe(403);
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, { ...alice, name: 'Bob' }))).statusCode).toBe(403);
    await csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice);
    await csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, { ...alice, name: 'Root', role: 'ADMIN' });
    expect(customerSends()).toHaveLength(2);
  });

  it('matches the project’s PM ignoring case and surrounding spaces', async () => {
    mockProject = { ...mockProject, project_manager: ' alice ' };
    await csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice);
    expect(customerSends()).toHaveLength(1);
  });

  it('rejects an invalid, non-string or blocked customer email without sending', async () => {
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'John (IT)' }, alice))).statusCode).toBe(400);
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 42 as never }, alice))).statusCode).toBe(400);
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'admin@company.com' }, alice))).statusCode).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('refuses internal recipients, so the PM cannot answer their own survey', async () => {
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'alice@cloudfuze.com' }, alice))).statusCode).toBe(400);
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'Colleague@CloudFuze.com' }, alice))).statusCode).toBe(400);
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'alice@cloudfuze.com.' }, alice))).statusCode).toBe(400);
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'alice@mail.cloudfuze.com' }, alice))).statusCode).toBe(400);
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'alice@cloudfuze.onmicrosoft.com' }, alice))).statusCode).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
    await csatService.sendRequest('p1', { recipientEmail: 'it@notcloudfuze.com' }, alice);
    await csatService.sendRequest('p1', { recipientEmail: 'admin@acmecorp.onmicrosoft.com' }, alice);
    expect(customerSends()).toHaveLength(2);
  });

  it('lets a code bug in the send path surface instead of reporting a delivery failure', async () => {
    mockSendEmail.mockRejectedValueOnce(new TypeError('cannot read properties of undefined'));
    const err = await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice));
    expect(err.statusCode).toBeUndefined();
    expect(mockExecute.mock.calls.some((c) => /DELETE FROM csat_requests/.test(String(c[0])))).toBe(true);
  });

  it('does not revive replaced links when a newer send exists', async () => {
    mockSendEmail.mockRejectedValueOnce(new GraphSendError('server error', 500));
    await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice));
    const restore = mockExecute.mock.calls.find((c) => /SET revoked_at = NULL/.test(String(c[0])))!;
    expect(String(restore[0])).toMatch(/NOT EXISTS/);
  });

  it('emails the raw token but stores only its sha256, sending as the PM', async () => {
    await csatService.sendRequest('p1', { recipientEmail: 'C@Acme.com', message: '<b>hi</b>' }, alice);
    const insert = mockClientQuery.mock.calls.find((c) => /INSERT INTO csat_requests/.test(String(c[0])))!;
    const storedHash = String((insert[1] as unknown[])[2]);
    const mail = customerSends()[0];
    const raw = rawToken(mail.html)!;
    expect(storedHash).toBe(crypto.createHash('sha256').update(raw).digest('hex'));
    expect(storedHash).not.toBe(raw);
    expect(mail.to).toBe('c@acme.com');
    expect(mail.from).toBe('alice@cloudfuze.com');
    expect(mail.html).not.toContain('<b>hi</b>');
  });

  it('sends the customer a CloudFuze-branded email with the logo attached inline, on both send paths', async () => {
    await csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice);
    mockSendEmail.mockRejectedValueOnce(new GraphSendError('denied', 403));
    await csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice);
    const toCustomer = mockSendEmail.mock.calls.map((c) => c[0] as SentMail & { inlineImages?: { contentId: string }[] }).filter((m) => m.to === 'c@acme.com');
    expect(toCustomer).toHaveLength(3);
    for (const mail of toCustomer) {
      expect(mail.html).toContain('cid:cloudfuze-logo');
      expect(mail.html).toContain('#0129AC');
      expect(mail.inlineImages?.map((i) => i.contentId)).toEqual(['cloudfuze-logo']);
    }
  });

  it('uses the project name the PM edited in the subject and body, and stores it for the survey page', async () => {
    await csatService.sendRequest('p1', { recipientEmail: 'c@acme.com', projectName: ' Acme <Email> Migration ' }, alice);
    const mail = mockSendEmail.mock.calls.map((c) => c[0] as SentMail & { subject: string }).find((m) => m.to === 'c@acme.com')!;
    expect(mail.subject).toContain('Acme <Email> Migration');
    expect(mail.html).toContain('Acme &lt;Email&gt; Migration');
    expect(mail.html).not.toContain('Acme migration');
    const insert = mockClientQuery.mock.calls.find((c) => /INSERT INTO csat_requests/.test(String(c[0])))!;
    expect((insert[1] as unknown[])[6]).toBe('Acme <Email> Migration');
  });

  it('keeps the internal project name, stored as no override, when the PM leaves it unchanged', async () => {
    await csatService.sendRequest('p1', { recipientEmail: 'c@acme.com', projectName: 'Acme migration' }, alice);
    const insert = mockClientQuery.mock.calls.find((c) => /INSERT INTO csat_requests/.test(String(c[0])))!;
    expect((insert[1] as unknown[])[6]).toBeNull();
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com', projectName: 'x'.repeat(151) }, alice))).statusCode).toBe(400);
  });

  it('greets the customer by the name the PM entered and stores it on the request', async () => {
    await csatService.sendRequest('p1', { recipientEmail: 'c@acme.com', customerName: '  Joseph <Vinsky>  ' }, alice);
    const mail = customerSends()[0];
    expect(mail.html).toContain('Hi Joseph &lt;Vinsky&gt;,');
    const insert = mockClientQuery.mock.calls.find((c) => /INSERT INTO csat_requests/.test(String(c[0])))!;
    expect((insert[1] as unknown[])[5]).toBe('Joseph <Vinsky>');
  });

  it('falls back to the project contact name and rejects an over-long name', async () => {
    await csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice);
    expect(customerSends()[0].html).toContain('Hi Acme,');
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com', customerName: 'x'.repeat(101) }, alice))).statusCode).toBe(400);
  });

  it('gives the PM a confirmation that never contains the survey link', async () => {
    await csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice);
    const toPm = sends().filter((m) => m.to === alice.email);
    expect(toPm).toHaveLength(1);
    expect(rawToken(toPm[0].html)).toBeUndefined();
    expect(customerSends().every((m) => m.cc === undefined)).toBe(true);
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

  it('refuses when the customer answered while the resend was being recorded', async () => {
    mockAnsweredInTxn = true;
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice))).statusCode).toBe(409);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('caps sends per project per day', async () => {
    mockSendsToday = 5;
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice))).statusCode).toBe(429);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('falls back to the shared mailbox with the PM only as Reply-To when Graph refuses the PM mailbox', async () => {
    mockSendEmail.mockRejectedValueOnce(new GraphSendError('denied', 403));
    await csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice);
    const fallback = customerSends()[1];
    expect(customerSends()).toHaveLength(2);
    expect(fallback.from).toBeUndefined();
    expect(fallback.cc).toBeUndefined();
    expect(fallback.replyTo).toBe('alice@cloudfuze.com');
    const stored = mockExecute.mock.calls.find((c) => /SET sent_from/.test(String(c[0])))!;
    expect((stored[1] as unknown[])[0]).toBe('alerts@cloudfuze.com');
  });

  it('undoes the request and restores revoked links when the email cannot be sent', async () => {
    mockSendEmail.mockRejectedValueOnce(new GraphSendError('server error', 500));
    const err = await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice));
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('EMAIL_SEND_FAILED');
    const sql = mockExecute.mock.calls.map((c) => String(c[0]));
    expect(sql.some((s) => /DELETE FROM csat_requests/.test(s))).toBe(true);
    expect(sql.some((s) => /SET revoked_at = NULL/.test(s))).toBe(true);
  });

  it('also rolls back when the shared-mailbox fallback fails too', async () => {
    mockSendEmail.mockRejectedValueOnce(new GraphSendError('denied', 403)).mockRejectedValueOnce(new GraphSendError('graph down', 500));
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice))).statusCode).toBe(503);
    expect(mockExecute.mock.calls.some((c) => /DELETE FROM csat_requests/.test(String(c[0])))).toBe(true);
  });

  it('rejects an unknown project and an over-long note', async () => {
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com', message: 'x'.repeat(2001) }, alice))).statusCode).toBe(400);
    mockProject = undefined;
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice))).statusCode).toBe(404);
  });
});

describe('csatService.previewRequest', () => {
  it('renders exactly the email the customer would get, with the logo inlined and no live link', async () => {
    const preview = await csatService.previewRequest('p1', { customerName: 'Joseph', message: 'Thanks <team>' }, alice);
    expect(preview.subject).toContain('Acme migration');
    expect(preview.html).toContain('Hi Joseph,');
    expect(preview.html).toContain('Thanks &lt;team&gt;');
    expect(preview.html).toContain('data:image/png;base64,AA==');
    expect(preview.html).not.toContain('cid:cloudfuze-logo');
    expect(preview.html).not.toMatch(/\/csat\/[0-9a-f]{64}/);
    expect(preview.defaultCustomerName).toBe('Acme');
    expect(preview.defaultProjectName).toBe('Acme migration');
    expect(preview.defaultMessage).toMatch(/finished its one-time migration phase/);
    const untouched = await csatService.previewRequest('p1', {}, alice);
    expect(untouched.html).toContain(untouched.defaultMessage.slice(0, 40));
    const renamed = await csatService.previewRequest('p1', { projectName: 'Email migration' }, alice);
    expect(renamed.subject).toContain('Email migration');
    expect(renamed.html).toContain('Email migration');
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it('is limited to an admin or the project’s own PM', async () => {
    expect((await rejection(csatService.previewRequest('p1', {}, { ...alice, role: 'VIEWER' }))).statusCode).toBe(403);
    expect((await rejection(csatService.previewRequest('p1', {}, { ...alice, name: 'Bob' }))).statusCode).toBe(403);
  });
});

describe('C-SAT answered once per customer account', () => {
  const siblingAnswer = () => ({
    id: 'r9', project_id: 'p-email', recipient_email: 'c@acme.com', sent_from: 'alice@cloudfuze.com', sent_at: new Date(),
    responded_at: new Date(), revoked_at: null, expired: false, via_project_name: 'acme — email migration',
  });

  it('lets every project of the account into Delta once any of its surveys is answered', async () => {
    mockAccountAnswer = siblingAnswer();
    const status = await csatService.getStatus('p1');
    expect(status.state).toBe('responded');
    expect(status.viaProjectId).toBe('p-email');
    expect(status.viaProjectName).toBe('acme — email migration');
    await expect(csatService.assertCanEnterDelta('p1')).resolves.toBeUndefined();
  });

  it('groups by client account (client_name, falling back to project name), not the contact name', async () => {
    await rejection(csatService.assertCanEnterDelta('p1'));
    const sql = String(mockQuery.mock.calls.find((c) => /JOIN projects p ON p.id = r.project_id/.test(String(c[0])))![0]);
    expect(sql).toContain("COALESCE(NULLIF(TRIM(p.client_name), ''), p.name)");
    expect(sql).not.toMatch(/customer_name/);
    expect(sql).toContain('r.responded_at IS NOT NULL AND r.revoked_at IS NULL');
  });

  it('prefers the project’s own answer and does not mark it as coming from another project', async () => {
    mockLatest = [{ ...liveRow(), responded_at: new Date(), recipient_email: 'c@acme.com', sent_at: new Date() }];
    mockAccountAnswer = siblingAnswer();
    expect((await csatService.getStatus('p1')).viaProjectId).toBeNull();
  });

  it('does not send another survey to an account that already answered', async () => {
    mockAccountAnswer = siblingAnswer();
    expect((await rejection(csatService.sendRequest('p1', { recipientEmail: 'c@acme.com' }, alice))).statusCode).toBe(409);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('still blocks when no project of the account has an answer', async () => {
    expect((await rejection(csatService.assertCanEnterDelta('p1'))).code).toBe('CSAT_REQUIRED');
  });
});

describe('csatService.assertCanEnterDelta', () => {
  it('tells the PM when the pending survey link has expired', async () => {
    mockLatest = [{ ...liveRow(), expired: true, recipient_email: 'c@acme.com', sent_at: new Date() }];
    const err = await rejection(csatService.assertCanEnterDelta('p1'));
    expect(err.code).toBe('CSAT_REQUIRED');
    expect(err.details?.csat?.expired).toBe(true);
    expect(err.message).toMatch(/expired/);
  });

  it('can be switched off with CSAT_DELTA_GATE=off (or false/0)', async () => {
    for (const value of ['off', 'FALSE', '0']) {
      process.env.CSAT_DELTA_GATE = value;
      await expect(csatService.assertCanEnterDelta('p1')).resolves.toBeUndefined();
    }
    process.env.CSAT_DELTA_GATE = 'on';
    expect((await rejection(csatService.assertCanEnterDelta('p1'))).code).toBe('CSAT_REQUIRED');
  });

  it('treats an answered link as satisfying the gate even when a newer pending one exists', async () => {
    await rejection(csatService.assertCanEnterDelta('p1'));
    const sql = String(mockQuery.mock.calls.find((c) => /FROM csat_requests\s+WHERE project_id/.test(String(c[0])))![0]);
    expect(sql).toMatch(/ORDER BY \(responded_at IS NOT NULL\) DESC, sent_at DESC/);
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
    mockTokenRow = { ...liveRow(), expires_at: new Date(Date.now() - 1000), expired: true };
    expect((await rejection(csatService.getPublicForm(token))).statusCode).toBe(410);
  });

  it('shows only the project and customer name for a live link', async () => {
    mockTokenRow = liveRow();
    expect(await csatService.getPublicForm(token)).toEqual({ projectName: 'Acme migration', customerName: 'Acme' });
    mockTokenRow = { ...liveRow(), recipient_name: 'Joseph Vinsky' };
    expect((await csatService.getPublicForm(token)).customerName).toBe('Joseph Vinsky');
    mockTokenRow = { ...liveRow(), project_label: 'Acme Email Migration' };
    expect((await csatService.getPublicForm(token)).projectName).toBe('Acme Email Migration');
  });

  it('validates the answers', async () => {
    mockTokenRow = liveRow();
    expect((await rejection(csatService.submitResponse(token, { overall: 11, wentWell: true }))).statusCode).toBe(400);
    expect((await rejection(csatService.submitResponse(token, { overall: 2.5, wentWell: true }))).statusCode).toBe(400);
    expect((await rejection(csatService.submitResponse(token, { overall: 8 } as never))).statusCode).toBe(400);
    expect((await rejection(csatService.submitResponse(token, { overall: 8, wentWell: 'true' } as never))).statusCode).toBe(400);
    expect((await rejection(csatService.submitResponse(token, { overall: 8, wentWell: true, comments: 'x'.repeat(4001) }))).statusCode).toBe(400);
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it('records a valid answer into the C-SAT fields and notifies the PM', async () => {
    mockTokenRow = liveRow();
    await csatService.submitResponse(token, { overall: 9, migrationQuality: 8, support: 10, onboarding: 7, wentWell: true, comments: 'Great' });
    const upsert = mockClientQuery.mock.calls.find((c) => /INSERT INTO customer_success_entries/.test(String(c[0])))!;
    expect(upsert[1]).toEqual(['p1', 'Acme', 9, 8, 10, 7, 'Great']);
    for (let i = 0; i < 5 && mockCreateNotification.mock.calls.length === 0; i++) await new Promise((r) => setImmediate(r));
    expect(mockCreateNotification).toHaveBeenCalledWith('GENERAL', expect.stringContaining('C-SAT received'), expect.any(String), ['alice@cloudfuze.com'], 'p1');
  });

  it('keeps existing C-SAT values the customer skipped, and inherits the customer’s legacy entry', async () => {
    mockTokenRow = liveRow();
    await csatService.submitResponse(token, { overall: 9, wentWell: true });
    const sql = String(mockClientQuery.mock.calls.find((c) => /INSERT INTO customer_success_entries/.test(String(c[0])))![0]);
    expect(sql).toMatch(/csat_migration_quality\s*=\s*COALESCE\(\$4::numeric, customer_success_entries\.csat_migration_quality\)/);
    expect(sql).toMatch(/csat_verbatim\s*=\s*COALESCE\(\$7::text, customer_success_entries\.csat_verbatim\)/);
    expect(sql).toMatch(/project_id IS NULL AND LOWER\(customer_name\) = LOWER\(\$2\)/);
  });

  it('accepts only one answer when two submits race', async () => {
    mockTokenRow = liveRow();
    mockClaimRowCount = 0;
    expect((await rejection(csatService.submitResponse(token, { overall: 9, wentWell: true }))).statusCode).toBe(409);
    expect(mockClientQuery.mock.calls.some((c) => /customer_success_entries/.test(String(c[0])))).toBe(false);
  });
});
