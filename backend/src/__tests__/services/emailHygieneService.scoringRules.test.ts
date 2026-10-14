// Value: protects=October-onward replies are scored on what the person newly wrote (not the quoted chain), follow-ups in an active thread need no greeting, and anything sent before 1 Oct 2026 IST scores exactly as before;
//   fails_when=quoted history is scored again, the effective date stops gating the new rules, or follow-ups lose greeting credit; why_new=new scoring rules; seam=none
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { ConversationTimeline, TimelineEntry } from '../../services/teamConversationTimeline';

let mockTimelines: Map<string, ConversationTimeline>;
jest.mock('../../services/teamConversationTimeline', () => {
  const actual = jest.requireActual('../../services/teamConversationTimeline') as Record<string, unknown>;
  return {
    ...actual,
    getAccessToken: async () => 'token',
    graphClient: () => ({ get: async () => ({ data: { value: [] } }) }),
    buildTeamTimelines: async () => mockTimelines,
  };
});
jest.mock('../../config/database', () => ({
  query: jest.fn(async () => ({ rows: [{ email: 'alice@cloudfuze.com', name: 'Alice' }], rowCount: 1 })),
  execute: jest.fn(async () => ({ rows: [], rowCount: 0 })),
}));
jest.mock('../../services/emailThreadClassifierService', () => ({ emailThreadClassifierService: { classify: async () => new Map() } }));
jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { compareScoringRules, SCORING_RULES_EFFECTIVE_FROM } from '../../services/emailHygieneService';

const QUOTED = ' From: Customer Sent: Monday To: Alice Subject: RE: delta Hi Alice, thanks so much, we really appreciate it. Please let us know. I understand the concern. Best regards, Customer.';

function thread(base: number, replies: { at: number; newText: string }[]): ConversationTimeline {
  const customer: TimelineEntry = {
    messageId: `c-${base}`, dedupKey: `k-${base}`, conversationId: `conv-${base}`, time: base, kind: 'customer',
    text: 'When does the delta start?', newText: 'When does the delta start?', subject: 'delta',
    customerEmail: 'c@acme.com', recipients: [{ email: 'alice@cloudfuze.com', name: 'Alice' }],
  };
  const team: TimelineEntry[] = replies.map((r, i) => ({
    messageId: `t-${base}-${i}`, conversationId: `conv-${base}`, time: r.at, kind: 'team',
    text: r.newText + QUOTED, newText: r.newText, subject: 'RE: delta',
    teamMemberEmail: 'alice@cloudfuze.com', teamMemberName: 'Alice',
  }));
  return { conversationId: `conv-${base}`, entries: [customer, ...team] };
}

async function scores(tl: ConversationTimeline) {
  mockTimelines = new Map([[tl.conversationId, tl]]);
  const { current, proposed } = await compareScoringRules(new Date(tl.entries[0].time - 3600e3), new Date(tl.entries[0].time + 7 * 86400e3));
  return { before: current[0], after: proposed[0] };
}

const OCT = SCORING_RULES_EFFECTIVE_FROM + 5 * 86400e3;
const SEP = SCORING_RULES_EFFECTIVE_FROM - 10 * 86400e3;

beforeEach(() => { jest.clearAllMocks(); });

describe('email hygiene scoring rules from October 2026', () => {
  it('scores only the newly written text of an October reply, not the quoted chain', async () => {
    const { before, after } = await scores(thread(OCT, [{ at: OCT + 3600e3, newText: 'ok' }]));
    expect(after.toneScore).toBeLessThan(before.toneScore);
    expect(after.qualityScore).toBeLessThan(before.qualityScore);
  });

  it('leaves replies sent before 1 Oct 2026 IST exactly as they were scored', async () => {
    const { before, after } = await scores(thread(SEP, [{ at: SEP + 3600e3, newText: 'ok' }]));
    expect(after.emailHygieneScore).toBe(before.emailHygieneScore);
    expect(after.toneScore).toBe(before.toneScore);
  });

  it('does not expect a greeting on a follow-up in an active thread', async () => {
    const opener = 'Hi Joseph, thanks for the update. We will start the delta tomorrow morning. Best regards, Alice.';
    const followUp = 'The delta has started and is running fine. We will share the report tomorrow. Thanks, Alice.';
    const withRule = await scores(thread(OCT, [{ at: OCT + 3600e3, newText: opener }, { at: OCT + 7200e3, newText: followUp }]));
    const withGreeting = await scores(thread(OCT, [{ at: OCT + 3600e3, newText: opener }, { at: OCT + 7200e3, newText: `Hi Joseph, ${followUp}` }]));
    expect(withRule.after.toneScore).toBe(withGreeting.after.toneScore);
  });
});
