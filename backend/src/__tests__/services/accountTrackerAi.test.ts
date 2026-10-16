// Value: protects=the Account Tracker AI only spends model calls on inputs it has not analysed yet (fingerprints, daily cap,
//   failure back-off) and computes connect probability from real replies instead of guessing;
//   fails_when=an unchanged company is re-sent to the model, activity results regenerate more than daily, a failure is
//   retried in a loop, or the reply-rate thresholds drift; why_new=new module; seam=none
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../config/database', () => ({ query: jest.fn(), execute: jest.fn(), transaction: jest.fn() }));
jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import {
  applyDomainRecords, connectStats, researchPriority, costUsd, monthlyBudget, planBook, readDomainRecords, secondPageLink, uniqueTools, withoutSources, withPlaceholderCaller,
  withPlaceholderSignature,
} from '../../services/accountTrackerAi';
import type { ActivityItem } from '../../services/accountTrackerHubspot';
import type { Analysis } from '../../services/accountTrackerAi';
import type { AiRecord, CompanyRecord, DealRecord } from '../../services/accountTrackerStore';

const company = (over: Partial<CompanyRecord> = {}): CompanyRecord => ({
  ownerKey: 'o1', hubspotId: 'c1', company: 'Acme', domain: 'acme.com', website: null, hubspotLink: null,
  industryGroup: null, industry: 'Software', city: null, state: null, country: 'India', employees: 120,
  employeeSizeTier: 'Mid', annualRevenue: null, annualRevenueValue: null, foundedYear: null, phone: null, linkedin: null,
  lifecycleStage: 'Customer', openDeals: 0, associatedDeals: 0, timesReachedOut: 4, reachedOut: 'Yes',
  outreachStage: null, mspFlag: null, customProbability: null, primaryContactName: null, primaryContactTitle: null,
  primaryContactEmail: null, orgOverview: 'Builds payroll software', lastContactDate: '2026-10-01', callsCount: 2,
  emailsCount: 7, meetingsCount: 1, notesCount: 1, hubspotModifiedAt: null, lastSeenAt: null, ...over,
});

const item = (type: ActivityItem['type'], direction: string | null, outcome: string | null = null): ActivityItem => ({
  type, id: Math.random().toString(), timestamp: null, title: null, body: null, ownerId: null, ownerName: null,
  direction, outcome, durationSeconds: null, priority: null,
});

/** Stores what planBook decided, as if the AI had just produced it at `at`. */
function storedFrom(plan: ReturnType<typeof planBook>, at = new Date()): AiRecord[] {
  return plan.todo.map((w) => ({
    subject: w.c.hubspotId, kind: 'account' as const, fingerprint: w.fingerprint, content: {}, model: 'm',
    generatedAt: at, error: null, attemptedAt: at,
  }));
}

describe('accountTrackerAi', () => {
  it('analyses a new company once and then leaves it alone while nothing changes', () => {
    const first = planBook('o1', [company()], [], []);
    expect(first.todo).toHaveLength(1);
    expect(planBook('o1', [company()], [], storedFrom(first)).todo).toHaveLength(0);
  });

  it('redoes the brief at once when the HubSpot company record changes', () => {
    const stored = storedFrom(planBook('o1', [company()], [], []));
    expect(planBook('o1', [company({ orgOverview: 'Now a managed IT provider' })], [], stored).todo).toHaveLength(1);
  });

  it('caps activity-driven updates at once a day and ignores single new emails', () => {
    const recent = storedFrom(planBook('o1', [company()], [], []), new Date(Date.now() - 2 * 3600 * 1000));
    expect(planBook('o1', [company({ emailsCount: 8 })], [], recent).todo).toHaveLength(0);
    expect(planBook('o1', [company({ callsCount: 3 })], [], recent).todo).toHaveLength(0);
    const dayOld = storedFrom(planBook('o1', [company()], [], []), new Date(Date.now() - 25 * 3600 * 1000));
    expect(planBook('o1', [company({ callsCount: 3 })], [], dayOld).todo).toHaveLength(1);
    expect(planBook('o1', [company({ emailsCount: 10 })], [], dayOld).todo).toHaveLength(1);
  });

  it('waits before retrying a failed brief', () => {
    const failed: AiRecord[] = [
      { subject: 'c1', kind: 'account', fingerprint: null, content: null, model: null, generatedAt: null, error: 'boom', attemptedAt: new Date() },
    ];
    expect(planBook('o1', [company()], [], failed).todo).toHaveLength(0);
  });

  it('plans deal insights only when there are deals', () => {
    const deal = { hubspotId: 'd1', status: 'OPEN', stageLabel: 'Proposal', amount: 100, closeDate: null, nextStep: null } as DealRecord;
    expect(planBook('o1', [], [], []).dealsDue).toBe(false);
    expect(planBook('o1', [], [deal], []).dealsDue).toBe(true);
  });

  it('measures connect probability from replies, not guesses', () => {
    expect(connectStats([item('email', 'Sent'), item('email', 'Received')]).level).toBeNull();
    const high = connectStats([item('email', 'Sent'), item('email', 'Sent'), item('email', 'Received'), item('meeting', null, 'Completed')]);
    expect(high).toMatchObject({ attempts: 2, responses: 2, level: 'High' });
    const low = connectStats([...Array(10)].map(() => item('call', 'Outbound', 'No answer')));
    expect(low).toMatchObject({ attempts: 10, responses: 0, level: 'Low' });
    // 6 emails sent + 1 connected outbound call = 7 attempts, 1 reply (14%)
    const medium = connectStats([...Array(6)].map(() => item('email', 'Sent')).concat([item('call', 'Outbound', 'Connected')]));
    expect(medium).toMatchObject({ attempts: 7, responses: 1, level: 'Medium' });
  });

  it("always signs emails with a placeholder, never a colleague's name", () => {
    const signed = 'Hi David,\n\nCould we talk on Tuesday?\n\nBest regards,\n[Your name]';
    expect(withPlaceholderSignature('Hi David,\n\nCould we talk on Tuesday?\n\nBest regards,\nAnthony Raymond.')).toBe(signed);
    expect(withPlaceholderSignature('Hi David,\n\nCould we talk on Tuesday?')).toBe(signed);
    expect(withPlaceholderSignature('Hi David,\n\nCould we talk on Tuesday?\n\nThanks,\nAJ')).toBe(signed);
  });

  it('reads the productivity suite and verified tools from DNS records', () => {
    const m365 = readDomainRecords(['acme-com.mail.protection.outlook.com'], ['v=spf1 include:spf.protection.outlook.com -all', 'slack-domain-verification=abc', 'box-domain-verification=x']);
    expect(m365).toEqual({ suite: 'Microsoft 365', mail: 'Microsoft 365', tools: ['Slack', 'Box'] });
    const both = readDomainRecords(['aspmx.l.google.com.'], ['MS=ms12345678', 'dropbox-domain-verification=y']);
    expect(both).toMatchObject({ suite: 'Both', mail: 'Google Workspace', tools: ['Dropbox'] });
    // "dropbox-domain-verification" must not also count as Box; Search Console verification is not Google Workspace
    expect(readDomainRecords(['mx.mimecast.com'], ['google-site-verification=z']).suite).toBeNull();
    expect(readDomainRecords([], []).mail).toBeNull();
  });

  it("introduces the caller as [Your name], never a colleague", () => {
    expect(withPlaceholderCaller("Hi David, this is AJ from CloudFuze. I'm calling about Teams."))
      .toBe("Hi David, this is [Your name] from CloudFuze. I'm calling about Teams.");
    expect(withPlaceholderCaller('Hi David, this is [Your name] from CloudFuze.')).toBe('Hi David, this is [Your name] from CloudFuze.');
  });

  it('prefers a services page, then an about page, on the same site only', () => {
    const base = new URL('https://www.acme.com/');
    expect(secondPageLink('<a href="/about-us">About</a><a href="/services/">Services</a>', base)).toBe('https://www.acme.com/services/');
    expect(secondPageLink('<a href="https://other.com/services">x</a><a href="/about">About</a>', base)).toBe('https://www.acme.com/about');
    expect(secondPageLink('<a href="/blog">Blog</a>', base)).toBeNull();
  });

  it('prices calls and keeps a monthly budget of $0.01 per company', () => {
    expect(costUsd('gpt-6-luna', { input: 1_000_000, output: 1_000_000 })).toBeCloseTo(0.6);
    expect(costUsd('gpt-6-luna', { input: 1_000_000, output: 1_000_000, flex: true })).toBeCloseTo(0.3); // Flex is half price
    expect(costUsd('gpt-6-luna', { input: 1_000_000, cached: 1_000_000, output: 0 })).toBeCloseTo(0.01); // cached input is a tenth
    expect(costUsd('gpt-6-luna', { input: 0, output: 0, searches: 2, flex: true })).toBeCloseTo(0.02); // search fees are not discounted
    expect(costUsd('some-unknown-model', { input: 1_000_000, output: 0 })).toBeGreaterThan(1); // unknown models are priced high
    expect(monthlyBudget(500)).toBeCloseTo(5);
    expect(monthlyBudget(10)).toBeCloseTo(0.5);
  });

  it('keeps source tags out of customer-facing text and dedupes tools', () => {
    expect(withoutSources('You moved to SharePoint on March 6 (HubSpot record). You use Box (DNS records; email, 2026-09-20).'))
      .toBe('You moved to SharePoint on March 6. You use Box.');
    expect(withoutSources('Teams (and Slack) are both in use.')).toBe('Teams (and Slack) are both in use.');
    expect(uniqueTools(['Box (DNS records)', 'Box', 'Slack', 'slack'])).toEqual(['Box', 'Slack']);
  });

  it('researches possible MSPs first, then active accounts', () => {
    expect(researchPriority(company({ industry: 'Information Technology and Services' }))).toBe(2);
    expect(researchPriority(company({ industry: null }))).toBe(2);
    expect(researchPriority(company({ industry: 'Retail', lastContactDate: '2026-10-01' }), '2026-10-16')).toBe(1);
    expect(researchPriority(company({ industry: 'Retail', lastContactDate: '2025-01-01', openDeals: 0 }), '2026-10-16')).toBe(0);
  });

  it('queues already-analysed companies for research until it has been tried once', () => {
    const plan = planBook('o1', [company()], [], []);
    const done = storedFrom(plan);
    expect(planBook('o1', [company()], [], done).researchDue).toHaveLength(1);
    done[0].content = { research: { key: 'other', text: null } };
    expect(planBook('o1', [company()], [], done).researchDue).toHaveLength(1);
  });

  it('writes tech-stack evidence from DNS facts', () => {
    const profile = { techStack: { productivitySuite: 'Unknown', tools: ['SharePoint', 'Box (DNS records)'], confidence: 'low', evidence: 'x' } } as Analysis;
    applyDomainRecords(profile, { suite: 'Both', mail: 'Google Workspace', tools: ['Box', 'Slack'] });
    expect(profile.techStack).toEqual({
      productivitySuite: 'Both', confidence: 'high', tools: ['SharePoint', 'Box', 'Slack'],
      evidence: 'Email runs on Google Workspace; Microsoft 365 is also set up on the domain; verified services: Box, Slack (public DNS records). Named in the website, research, deals or activity: SharePoint.',
    });
    const empty = { techStack: { productivitySuite: 'Unknown', tools: [], confidence: 'low', evidence: 'No platform named in the input.' } } as unknown as Analysis;
    applyDomainRecords(empty, null);
    expect(empty.techStack.evidence).toMatch(/^No platforms found/);
  });
});
