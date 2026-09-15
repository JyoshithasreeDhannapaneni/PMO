import { describe, it, expect } from '@jest/globals';
import { buildTeamTimelines, isMeetingMessage, type RawGraphMessage } from '../../services/teamConversationTimeline';

// Minimal fake AxiosInstance -- only .get() is exercised by buildTeamTimelines.
function fakeClient(byUrl: (url: string) => { value: RawGraphMessage[] }) {
  return { get: async (url: string) => ({ data: byUrl(url) }) } as any;
}

const CUSTOMER = 'customer@example.com';
const TEAM_MEMBER = { email: 'pm@cloudfuze.com', name: 'PM' };

function mkMessage(overrides: Partial<RawGraphMessage>): RawGraphMessage {
  return {
    id: 'm1',
    conversationId: 'conv-1',
    subject: 'Migration status',
    body: { contentType: 'text', content: 'Some real content here' },
    ...overrides,
  };
}

describe('isMeetingMessage', () => {
  it('is false for a normal mail message (no meetingMessageType)', () => {
    expect(isMeetingMessage(mkMessage({}))).toBe(false);
  });

  it('is false when meetingMessageType is explicitly "none"', () => {
    expect(isMeetingMessage(mkMessage({ meetingMessageType: 'none' }))).toBe(false);
  });

  it('is true for a meeting request, cancellation, or response', () => {
    for (const t of ['meetingRequest', 'meetingCancelled', 'meetingAccepted', 'meetingTentativelyAccepted', 'meetingDeclined', 'meetingUpdated']) {
      expect(isMeetingMessage(mkMessage({ meetingMessageType: t }))).toBe(true);
    }
  });
});

describe('buildTeamTimelines meeting/calendar invite filtering', () => {
  it('excludes an inbound calendar invite from the customer side of the timeline', async () => {
    const client = fakeClient((url) => {
      if (url.includes('/mailFolders/SentItems/')) return { value: [] };
      return {
        value: [
          mkMessage({
            id: 'invite-1',
            internetMessageId: 'imid-invite-1',
            from: { emailAddress: { address: CUSTOMER } },
            receivedDateTime: '2026-09-01T10:00:00Z',
            meetingMessageType: 'meetingRequest',
          }),
          mkMessage({
            id: 'real-1',
            internetMessageId: 'imid-real-1',
            from: { emailAddress: { address: CUSTOMER } },
            receivedDateTime: '2026-09-01T11:00:00Z',
            body: { contentType: 'text', content: 'Can you help with our migration ETA?' },
          }),
        ],
      };
    });

    const timelines = await buildTeamTimelines(client, [TEAM_MEMBER], '2026-09-01T00:00:00Z');
    const tl = timelines.get('conv-1');
    expect(tl).toBeDefined();
    // Only the real customer message should survive -- the meeting invite must not appear.
    expect(tl!.entries).toHaveLength(1);
    expect(tl!.entries[0].messageId).toBe('real-1');
  });

  it('excludes an outbound meeting response from the team side of the timeline', async () => {
    const client = fakeClient((url) => {
      if (url.includes('/mailFolders/SentItems/')) {
        return {
          value: [
            mkMessage({
              id: 'accept-1',
              sentDateTime: '2026-09-01T09:00:00Z',
              toRecipients: [{ emailAddress: { address: CUSTOMER } }],
              meetingMessageType: 'meetingAccepted',
            }),
          ],
        };
      }
      return { value: [] };
    });

    const timelines = await buildTeamTimelines(client, [TEAM_MEMBER], '2026-09-01T00:00:00Z');
    expect(timelines.get('conv-1')).toBeUndefined();
  });
});
