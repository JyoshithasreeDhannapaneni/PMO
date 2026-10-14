// Value: protects=a colleague's reply sent from their own mailbox is matched to the customer email it answers, even though Graph gives each mailbox's copy of the thread a different conversationId;
//   fails_when=timelines are keyed by a single mailbox's conversationId again (every cross-mailbox reply becomes an "unanswered" exchange plus an orphan, and Speed/Resolution fall back to defaults for everyone); why_new=no test covered multi-mailbox threads; seam=none
import { describe, it, expect } from '@jest/globals';
import { buildTeamTimelines, buildExchanges, findOrphanTeamMessages, type RawGraphMessage } from '../../services/teamConversationTimeline';

function fakeClient(byUrl: (url: string) => RawGraphMessage[]) {
  return { get: async (url: string) => ({ data: { value: byUrl(url) } }) } as any;
}

const A = { email: 'alice@cloudfuze.com', name: 'Alice' };
const B = { email: 'bob@cloudfuze.com', name: 'Bob' };
const customerAt = '2026-10-06T09:00:00Z';
const replyAt = '2026-10-06T10:30:00Z';

const customerCopy = (conversationId: string, id: string): RawGraphMessage => ({
  id, conversationId, internetMessageId: '<cust-1@example.com>', subject: 'Migration question',
  body: { contentType: 'text', content: 'When will the delta start?' },
  from: { emailAddress: { address: 'customer@example.com', name: 'Customer' } },
  receivedDateTime: customerAt,
});

describe('buildTeamTimelines across mailboxes', () => {
  it('joins a reply from another mailbox to the customer email it answers', async () => {
    const client = fakeClient((url) => {
      const isSent = url.includes('/SentItems/');
      if (url.includes(encodeURIComponent(A.email))) return isSent ? [] : [customerCopy('conv-A', 'a1')];
      if (url.includes(encodeURIComponent(B.email))) {
        return isSent
          ? [{
              id: 'b-sent', conversationId: 'conv-B', subject: 'RE: Migration question',
              body: { contentType: 'text', content: 'Hi, the delta starts tomorrow. Thanks' },
              toRecipients: [{ emailAddress: { address: 'customer@example.com', name: 'Customer' } }],
              sentDateTime: replyAt,
            }]
          : [customerCopy('conv-B', 'b1')];
      }
      return [];
    });

    const timelines = await buildTeamTimelines(client, [A, B], '2026-10-05T00:00:00Z', '2026-10-12T00:00:00Z', 2);
    expect(timelines.size).toBe(1);
    const [tl] = [...timelines.values()];
    const exchanges = buildExchanges(tl);
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0].teamReplies.map((r) => r.teamMemberEmail)).toEqual([B.email]);
    expect(exchanges[0].customerMessage.recipients?.map((r) => r.email).sort()).toEqual([A.email, B.email]);
    expect(findOrphanTeamMessages(tl)).toHaveLength(0);
  });

  it('sees this week’s customer email in a busy mailbox, past the first 200 internal messages', async () => {
    const internal: RawGraphMessage[] = Array.from({ length: 450 }, (_, i) => ({
      id: `int-${i}`, conversationId: `int-conv-${i}`, subject: 'Internal',
      from: { emailAddress: { address: 'colleague@cloudfuze.com' } },
      receivedDateTime: new Date(Date.parse('2026-09-26T00:00:00Z') + i * 60000).toISOString(),
    }));
    const listedCustomer = { ...customerCopy('conv-A', 'a-cust') };
    delete listedCustomer.body; // listing never carries bodies; they are fetched in a batch
    const pages = [...internal, listedCustomer];
    const batches: string[][] = [];
    const client = {
      get: async (url: string) => {
        if (url.includes('/SentItems/')) return { data: { value: [] } };
        const start = Number(new URL(`https://x${url.startsWith('/') ? url : `/${url}`}`).searchParams.get('$skip') ?? '0');
        const value = pages.slice(start, start + 100);
        return { data: { value, ...(start + 100 < pages.length ? { '@odata.nextLink': `/users/x/messages?$skip=${start + 100}` } : {}) } };
      },
      post: async (_url: string, body: { requests: { id: string; url: string }[] }) => {
        batches.push(body.requests.map((r) => r.url));
        return { data: { responses: body.requests.map((r) => ({ id: r.id, status: 200, body: { body: { contentType: 'text', content: 'When will the delta start?' } } })) } };
      },
    } as any;

    const timelines = await buildTeamTimelines(client, [A], '2026-10-05T00:00:00Z', '2026-10-12T00:00:00Z', 1, 10 * 86400000);
    const customer = [...timelines.values()].flatMap((t) => t.entries).filter((e) => e.kind === 'customer');
    expect(customer).toHaveLength(1);
    expect(customer[0].text).toContain('When will the delta start?');
    expect(batches.flat()).toHaveLength(1); // body fetched only for the customer email, not the 450 internal ones
  });

  it('retries bodies Graph throttles inside a batch instead of falling back to the preview', async () => {
    const listed = { ...customerCopy('conv-A', 'a-cust'), bodyPreview: 'When will the' };
    delete listed.body;
    let posts = 0;
    const client = {
      get: async (url: string) => ({ data: { value: url.includes('/SentItems/') ? [] : [listed] } }),
      post: async (_url: string, body: { requests: { id: string }[] }) => {
        posts++;
        return {
          data: {
            responses: body.requests.map((r) => posts === 1
              ? { id: r.id, status: 429, headers: { 'Retry-After': '0' } }
              : { id: r.id, status: 200, body: { body: { contentType: 'text', content: 'When will the delta start?' } } }),
          },
        };
      },
    } as any;
    const timelines = await buildTeamTimelines(client, [A], '2026-10-05T00:00:00Z', '2026-10-12T00:00:00Z', 1);
    const [entry] = [...timelines.values()].flatMap((t) => t.entries);
    expect(posts).toBe(2);
    expect(entry.text).toBe('When will the delta start?');
  });

  it('keeps unrelated threads separate', async () => {
    const client = fakeClient((url) => {
      if (url.includes('/SentItems/')) return [];
      if (url.includes(encodeURIComponent(A.email))) return [customerCopy('conv-A', 'a1')];
      if (url.includes(encodeURIComponent(B.email))) return [{ ...customerCopy('conv-B', 'b1'), internetMessageId: '<other@example.com>', subject: 'Other' }];
      return [];
    });
    const timelines = await buildTeamTimelines(client, [A, B], '2026-10-05T00:00:00Z', '2026-10-12T00:00:00Z', 2);
    expect(timelines.size).toBe(2);
  });
});
