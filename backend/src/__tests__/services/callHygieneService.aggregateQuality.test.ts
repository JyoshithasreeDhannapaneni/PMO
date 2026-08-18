// Unit tests for the pure aggregation MATH in callHygieneService.aggregateQuality().
// This mocks the config/database module boundary — that's different from the "no mocking
// the database" rule in testing-standard.md, which is about INTEGRATION tests replacing a
// real Postgres connection to validate schema/migration correctness. Here we're isolating
// the bucketing/percentage arithmetic itself, a standard unit-test boundary. A real
// Postgres-backed integration test for the full getHygieneMetrics() flow is a larger
// follow-up (no test DB is configured in this repo yet).

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<(...args: any[]) => Promise<{ rows: any[] }>>();
jest.mock('../../config/database', () => ({
  query: (...args: any[]) => mockQuery(...args),
  execute: jest.fn(),
}));

import { aggregateQuality, type HeldCustomerCall } from '../../services/callHygieneService';

function call(overrides: Partial<HeldCustomerCall> = {}): HeldCustomerCall {
  return {
    eventId: 'evt-1',
    subject: 'Weekly sync',
    start: '2026-08-01T10:00:00.000Z',
    organizerEmail: 'pm@cloudfuze.com',
    organizerName: 'PM Person',
    joinUrl: 'https://teams.microsoft.com/l/meetup-join/abc',
    customerAttendees: [{ name: 'Customer Person', email: 'customer@example.com' }],
    ...overrides,
  };
}

describe('callHygieneService.aggregateQuality', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns null score and all-zero coverage when there are no gradable calls at all', async () => {
    const result = await aggregateQuality('pm@cloudfuze.com', []);
    expect(result.qualityScore).toBeNull();
    expect(result.qualityCoverage).toEqual({ graded: 0, noQuestion: 0, excluded: 0, pending: 0, total: 0 });
    expect(mockQuery).not.toHaveBeenCalled(); // no reason to query the DB for zero calls
  });

  it('excludes calls with no joinUrl from the gradable set entirely', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const result = await aggregateQuality('pm@cloudfuze.com', [call({ eventId: 'no-link', joinUrl: null })]);
    expect(result.qualityScore).toBeNull();
    expect(result.qualityCoverage.total).toBe(0);
  });

  it('treats a call with no matching DB row as pending, not a failure', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const result = await aggregateQuality('pm@cloudfuze.com', [call({ eventId: 'evt-1' })]);
    expect(result.qualityCoverage).toEqual({ graded: 0, noQuestion: 0, excluded: 0, pending: 1, total: 1 });
    expect(result.qualityScore).toBeNull();
  });

  it('counts an excluded (externally-organized) call in coverage but not in the score', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ event_id: 'evt-1', status: 'excluded', rating: {} }],
    });
    const result = await aggregateQuality('pm@cloudfuze.com', [call({ eventId: 'evt-1' })]);
    expect(result.qualityCoverage.excluded).toBe(1);
    expect(result.qualityCoverage.graded).toBe(0);
    expect(result.qualityScore).toBeNull();
  });

  it('counts a graded call with qaPairs=[] as no_question, not a failure, and excludes it from the score', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ event_id: 'evt-1', status: 'graded', rating: { qaPairs: [] } }],
    });
    const result = await aggregateQuality('pm@cloudfuze.com', [call({ eventId: 'evt-1' })]);
    expect(result.qualityCoverage.noQuestion).toBe(1);
    expect(result.qualityCoverage.graded).toBe(0);
    expect(result.qualityScore).toBeNull();
  });

  it('computes qualityScore as the percentage of Q&A exchanges bucketed as answered_well', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { event_id: 'evt-1', status: 'graded', rating: { qaPairs: [{ score: 90 }, { score: 20 }] } }, // 1 well, 1 dodged
        { event_id: 'evt-2', status: 'graded', rating: { qaPairs: [{ score: 75 }] } }, // 1 well
      ],
    });
    const calls = [call({ eventId: 'evt-1' }), call({ eventId: 'evt-2' })];
    const result = await aggregateQuality('pm@cloudfuze.com', calls);
    // 2 of 3 total exchanges bucketed as answered_well
    expect(result.qualityScore).toBe(Math.round((2 / 3) * 100));
    expect(result.qualityCoverage).toEqual({ graded: 2, noQuestion: 0, excluded: 0, pending: 0, total: 2 });
  });

  it('mixes pending, excluded, no_question, and graded calls correctly in one aggregation pass', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { event_id: 'evt-excluded', status: 'excluded', rating: {} },
        { event_id: 'evt-noq', status: 'graded', rating: { qaPairs: [] } },
        { event_id: 'evt-graded', status: 'graded', rating: { qaPairs: [{ score: 80 }] } },
        // evt-pending has no row at all
      ],
    });
    const calls = [
      call({ eventId: 'evt-excluded' }),
      call({ eventId: 'evt-noq' }),
      call({ eventId: 'evt-graded' }),
      call({ eventId: 'evt-pending' }),
    ];
    const result = await aggregateQuality('pm@cloudfuze.com', calls);
    expect(result.qualityCoverage).toEqual({ graded: 1, noQuestion: 1, excluded: 1, pending: 1, total: 4 });
    expect(result.qualityScore).toBe(100); // the one graded call's only exchange was answered_well
  });

  it('queries with a single batched call per user, not one query per call', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const calls = [call({ eventId: 'a' }), call({ eventId: 'b' }), call({ eventId: 'c' })];
    await aggregateQuality('pm@cloudfuze.com', calls);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [['a', 'b', 'c'], 'pm@cloudfuze.com']);
  });
});
