import { describe, it, expect } from '@jest/globals';
import { computeDlStats, computeTeamHygiene, isRemovedFromEmailHygiene, type ExchangeJudgment } from '../../services/emailHygieneService';
import type { TimelineEntry } from '../../services/teamConversationTimeline';

const SINCE = Date.parse('2026-10-01T00:00:00+05:30');
const HOUR = 3_600_000;

function customer(time: number, addressedTo: string[], extra: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    messageId: `c${time}`, conversationId: `conv${time}`, time, kind: 'customer', text: 'Need help',
    subject: 'Migration question', customerEmail: 'it@customer.com', addressedTo, ...extra,
  };
}

function reply(time: number): TimelineEntry {
  return {
    messageId: `t${time}`, conversationId: 'x', time, kind: 'team', text: 'On it',
    subject: 'RE: Migration question', teamMemberEmail: 'someone@cloudfuze.com', teamMemberName: 'Someone',
  };
}

function judged(msg: TimelineEntry, replyAfterHours: number | null): ExchangeJudgment {
  const r = replyAfterHours === null ? null : reply(msg.time + replyAfterHours * HOUR);
  return {
    exchange: { conversationId: msg.conversationId, customerMessage: msg, teamReplies: r ? [r] : [], nextCustomerMessage: null },
    firstResponder: r, substantiveReplier: r, firstResponseHours: replyAfterHours, fullResolutionHours: replyAfterHours, wasReopened: false,
  };
}

const TEAM1_DL = 'cfmigrationsupport_team1@cloudfuze.com';
const TEAM4_DL = 'cfmigrationsupport_team4@cloudfuze.com';

describe('emailHygieneService.computeDlStats', () => {
  it('counts DL emails as answered by any reply, or unanswered against the team', () => {
    const stats = computeDlStats([
      judged(customer(SINCE + 1 * HOUR, [TEAM1_DL]), 2),
      judged(customer(SINCE + 2 * HOUR, [TEAM1_DL, 'other@customer.com']), 10),
      judged(customer(SINCE + 3 * HOUR, [TEAM1_DL]), null),
    ], SINCE);
    const t1 = stats.get('team1')!;
    expect(t1).toMatchObject({ dlEmail: TEAM1_DL, received: 3, answered: 2, unanswered: 1, answeredWithin4h: 1, avgFirstReplyHours: 6 });
    expect(t1.unansweredExamples).toHaveLength(1);
    expect(t1.unansweredExamples[0]).toMatchObject({ subject: 'Migration question', customer: 'it@customer.com' });
    expect(stats.get('team4')!.received).toBe(0);
  });

  it('ignores messages before the window, acknowledgments, and mail not sent to a DL', () => {
    const stats = computeDlStats([
      judged(customer(SINCE - HOUR, [TEAM1_DL]), null),
      judged(customer(SINCE + HOUR, [TEAM1_DL], { isAcknowledgment: true }), null),
      judged(customer(SINCE + HOUR, ['harika.velidi@cloudfuze.com']), null),
      judged(customer(SINCE + HOUR, []), null),
    ], SINCE);
    expect(stats.get('team1')!.received).toBe(0);
  });

  it('credits every DL a message was addressed to', () => {
    const stats = computeDlStats([judged(customer(SINCE + HOUR, [TEAM1_DL, TEAM4_DL]), 1)], SINCE);
    expect(stats.get('team1')!.answered).toBe(1);
    expect(stats.get('team4')!.answered).toBe(1);
  });

  it('keeps at most the 5 newest unanswered examples', () => {
    const stats = computeDlStats(
      Array.from({ length: 7 }, (_, i) => judged(customer(SINCE + i * HOUR, [TEAM1_DL]), null)),
      SINCE,
    );
    const ex = stats.get('team1')!.unansweredExamples;
    expect(ex).toHaveLength(5);
    expect(ex[0].receivedAt).toBe(new Date(SINCE + 6 * HOUR).toISOString());
  });

  it('attaches DL stats to the matching team row', () => {
    const rows = computeTeamHygiene([], computeDlStats([judged(customer(SINCE + HOUR, [TEAM1_DL]), 1)], SINCE));
    expect(rows.find((r) => r.teamId === 'team1')!.dl).toMatchObject({ received: 1, answered: 1 });
    expect(computeTeamHygiene([]).every((r) => r.dl === undefined)).toBe(true);
  });
});

describe('emailHygieneService.isRemovedFromEmailHygiene', () => {
  it('removes Harshith only from periods ending on or after 2026-10-01', () => {
    expect(isRemovedFromEmailHygiene('Harshith.Kaduluri@cloudfuze.com', '2026-09-30')).toBe(false);
    expect(isRemovedFromEmailHygiene('harshith.kaduluri@cloudfuze.com', '2026-10-01')).toBe(true);
    expect(isRemovedFromEmailHygiene('harshith.kaduluri@cloudfuze.com', '2026-11-15')).toBe(true);
  });

  it('keeps the earlier removals for every period and leaves others alone', () => {
    expect(isRemovedFromEmailHygiene('pallavi.kosuvaripalli@cloudfuze.com', '2026-01-31')).toBe(true);
    expect(isRemovedFromEmailHygiene('harika.velidi@cloudfuze.com', '2026-10-31')).toBe(false);
    expect(isRemovedFromEmailHygiene(null, '2026-10-31')).toBe(false);
  });
});
