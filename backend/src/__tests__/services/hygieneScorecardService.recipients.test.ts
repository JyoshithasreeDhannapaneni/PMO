// Value: protects=the daily 6 PM scorecard reaches only the HYGIENE_SCORECARD_RECIPIENTS addresses and never the PM/admin list, and sends nothing when unset;
//   fails_when=the daily job queries users for recipients, falls back to managers when the setting is empty, or ignores the configured list; why_new=scorecard mailed every manager once Graph sending started working;
//   seam=none
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockQuery = jest.fn(async (sql: string, _params?: unknown[]) => {
  if (/FROM users/.test(sql)) {
    return { rows: [{ email: 'pm1@cloudfuze.com' }, { email: 'admin@cloudfuze.com' }], rowCount: 2 };
  }
  return { rows: [], rowCount: 0 };
});
const mockExecute = jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 1 }));
jest.mock('../../config/database', () => ({ query: mockQuery, execute: mockExecute, transaction: jest.fn() }));
jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../services/auditService', () => ({
  auditService: {
    getHygieneBoard: jest.fn(async () => [{
      projectManager: 'Alice', hygieneScore: 90, activityScore: 80, qualityScore: 70,
      caseStudyScore: 100, delayScore: 100, dateIntegrityScore: 100,
    }]),
    getYesterdayActivitySnapshot: jest.fn(async () => new Map()),
  },
}));
const mockSendEmail = jest.fn(async (_opts: { to: string[]; subject: string }) => undefined);
jest.mock('../../services/emailService', () => ({
  emailService: { sendEmail: mockSendEmail },
  brandedEmail: (_title: string, body: string) => body,
}));

import { hygieneScorecardService } from '../../services/hygieneScorecardService';

describe('hygieneScorecardService.sendDailyScorecard recipients', () => {
  const saved = process.env.HYGIENE_SCORECARD_RECIPIENTS;

  beforeEach(() => {
    mockSendEmail.mockClear();
    mockQuery.mockClear();
    delete process.env.HYGIENE_SCORECARD_RECIPIENTS;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.HYGIENE_SCORECARD_RECIPIENTS;
    else process.env.HYGIENE_SCORECARD_RECIPIENTS = saved;
  });

  it('sends only to the configured address', async () => {
    process.env.HYGIENE_SCORECARD_RECIPIENTS = ' me@cloudfuze.com ';
    const result = await hygieneScorecardService.sendDailyScorecard();

    expect(result).toEqual({ sent: true, recipientCount: 1 });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const opts = mockSendEmail.mock.calls[0][0];
    expect(opts.to).toEqual(['me@cloudfuze.com']);
    expect(opts.subject.startsWith('PMO Hygiene & Score Card')).toBe(true);
  });

  it('accepts a comma-separated list', async () => {
    process.env.HYGIENE_SCORECARD_RECIPIENTS = 'me@cloudfuze.com, other@cloudfuze.com,';
    await hygieneScorecardService.sendDailyScorecard();

    expect(mockSendEmail.mock.calls[0][0].to).toEqual(['me@cloudfuze.com', 'other@cloudfuze.com']);
  });

  it('sends nothing, and never looks up managers, when no recipient is configured', async () => {
    const result = await hygieneScorecardService.sendDailyScorecard();

    expect(result.sent).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls.some(([sql]) => /FROM users/.test(sql))).toBe(false);
  });
});
