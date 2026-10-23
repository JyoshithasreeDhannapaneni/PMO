// Value: protects=the weekly case study digest sends ONE email per PM/AM listing all their completed projects without a
//   case study, never re-sends to someone emailed this week, skips people with no user email, and records each send;
//   fails_when=it regresses to one email per project, double-sends after a restart, or emails unknown people;
//   no_claim=the cron schedule itself and real email delivery; database, caseStudyService and emailService are mocked.
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

let mockAwaiting: Record<string, unknown>[];
let mockRecentFor: Set<string>;
const mockQuery = jest.fn(async (sql: string, params?: unknown[]) => {
  if (/FROM users/.test(sql)) {
    const wanted = (params?.[0] as string[]) ?? [];
    const users = [{ name: 'Alice', email: 'alice@cloudfuze.com' }, { name: 'Bob', email: 'bob@cloudfuze.com' }];
    return { rows: users.filter((u) => wanted.includes(u.name.toLowerCase())), rowCount: 1 };
  }
  if (/FROM notifications/.test(sql)) {
    const like = String(params?.[0] ?? '');
    const hit = [...mockRecentFor].some((e) => like.includes(e));
    return { rows: hit ? [{ id: 'n1' }] : [], rowCount: hit ? 1 : 0 };
  }
  return { rows: [], rowCount: 0 };
});
const mockExecute = jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 1 }));
jest.mock('../../config/database', () => ({ query: mockQuery, execute: mockExecute }));
jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../services/caseStudyService', () => ({ caseStudyService: { getAwaiting: jest.fn(async () => mockAwaiting) } }));
const mockSendEmail = jest.fn(async (_opts: Record<string, unknown>) => undefined);
jest.mock('../../services/emailService', () => ({
  emailService: { sendEmail: mockSendEmail },
  brandedEmail: (_t: string, body: string) => body,
}));

import { caseStudyReminderJob } from '../../jobs/caseStudyReminderJob';

const project = (id: string, pm: string | null, am: string | null) =>
  ({ id, name: `proj-${id}`, clientName: `Acct ${id}`, customerName: null, projectManager: pm, accountManager: am, actualEnd: '2026-10-01', archivedAt: null });

describe('caseStudyReminderJob (weekly digest)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecentFor = new Set();
    mockAwaiting = [project('1', 'Alice', 'Bob'), project('2', 'Alice', null), project('3', 'Carol', 'Bob')];
  });

  it('sends one digest per person listing all of their projects, and records it', async () => {
    const result = await caseStudyReminderJob.run();
    const mails = mockSendEmail.mock.calls.map((c) => c[0] as { to: string; subject: string; html: string });
    expect(mails.map((m) => m.to).sort()).toEqual(['alice@cloudfuze.com', 'bob@cloudfuze.com']);
    const alice = mails.find((m) => m.to === 'alice@cloudfuze.com')!;
    expect(alice.subject).toBe('2 case studies waiting for you');
    expect(alice.html).toContain('proj-1');
    expect(alice.html).toContain('proj-2');
    expect(alice.html).not.toContain('proj-3');
    expect(alice.html).toContain('/case-studies/new?projectId=1');
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(result).toEqual(expect.objectContaining({ people: 3, sent: 2, skippedNoEmail: ['Carol'], failed: 0 }));
  });

  it('does not email someone who already got this week’s digest', async () => {
    mockRecentFor = new Set(['alice@cloudfuze.com']);
    const result = await caseStudyReminderJob.run();
    expect(mockSendEmail.mock.calls.map((c) => (c[0] as { to: string }).to)).toEqual(['bob@cloudfuze.com']);
    expect(result.skippedRecent).toBe(1);
  });

  it('sends nothing when no project is waiting', async () => {
    mockAwaiting = [];
    expect((await caseStudyReminderJob.run()).sent).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('keeps going when one send fails', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('mailbox unavailable'));
    const result = await caseStudyReminderJob.run();
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(1);
  });
});
