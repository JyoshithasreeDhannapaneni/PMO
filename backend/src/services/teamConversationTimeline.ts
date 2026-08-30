// Shared conversation-analysis core for email hygiene + the 1-hour SLA alert.
//
// 2026-08-29 redesign: both consumers used to analyze each of the 33 tracked mailboxes
// in complete isolation -- "did I personally reply" instead of "did the team reply,"
// "how long since the very first message" instead of "how long since the message
// actually being answered." In a real multi-person thread (customer emails 5 people;
// only one of them replies) that produced several concrete wrong answers:
//   - a teammate's reply gave the other recipients neither credit nor protection --
//     their copy of the thread stayed invisible/"unresolved" in their own stats forever
//   - speed was always measured from message #1, so a fast reply to message #3 in a
//     live thread looked like a multi-hour delay
//   - "solved in one reply" only checked reply COUNT, so a content-free "we're on it"
//     placeholder could score a perfect Resolution as long as nothing further arrived
//     in THAT SAME mailbox -- even when a colleague, not the placeholder's author,
//     did the real work
//   - the AI reopening classifier only ever saw one person's own reply as "our
//     answer," so it couldn't tell a colleague had already resolved a follow-up
//   - the SLA checker paged every recipient on a shared email independently, with no
//     idea a teammate already answered it, and no way to signal "actually, never mind"
//     once someone did
//   - a customer's closing "thanks, all set" got treated like any other unanswered
//     message and could itself trigger a false SLA breach
//
// The fix: build ONE merged timeline per customer conversation across the WHOLE
// tracked roster (not per-mailbox), correctly dedup the customer's own messages
// (Exchange delivers a separate copy into every recipient's mailbox, so the same
// email would otherwise be double/triple/n-counted), and segment it into "exchanges"
// -- customer message -> whichever team reply(s) actually follow it, from ANYONE on
// the roster, before the customer's next message. All resolution/speed/quality
// judgments are made against that shared, correct picture; who gets credited is a
// separate, later attribution step.

import axios, { type AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const CF_DOMAIN = 'cloudfuze.com';

// Domains that send real mail but are never "a customer" -- Microsoft/Teams/SharePoint
// system notifications, and neutara.com (CloudFuze's own internal check-in/attendance
// tool, added 2026-08-28 after it was caught polluting real customer thread counts).
const SYSTEM_SENDER_DOMAINS = new Set([
  'microsoft.com', 'microsoftonline.com', 'teams.microsoft.com', 'sharepointonline.com',
  'outlook.com', 'onmicrosoft.com', 'azurecomm.net', 'mimecast.com', 'neutara.com',
]);

export function isExternal(email: string): boolean {
  const lower = email.toLowerCase();
  if (lower.endsWith(`@${CF_DOMAIN}`)) return false;
  const domain = lower.split('@')[1] ?? '';
  if (SYSTEM_SENDER_DOMAINS.has(domain)) return false;
  if (domain.endsWith('.microsoft.com') || domain.endsWith('.microsoftonline.com')) return false;
  if (lower.startsWith('noreply@') || lower.startsWith('no-reply@') || lower.startsWith('donotreply@')) return false;
  return true;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Free, zero-cost pre-filters -- a follow-up only needs the paid AI classification if it
// clears both of these. Also reused (2026-08-29) to decide whether a customer message
// needs an SLA-tracked reply at all: a closing "thanks, all set" shouldn't page anyone.
const ACK_PHRASES = [
  'thanks', 'thank you', 'thanks so much', 'thank you so much', 'thanks a lot', 'thx', 'ty',
  'got it', 'noted', 'sounds good', 'perfect', 'great, thanks', 'great thanks', 'awesome',
  'much appreciated', 'appreciate it', 'appreciated', 'will do', 'understood', 'makes sense',
  'ok thanks', 'okay thanks', 'cool thanks', 'perfect thank you', 'all good', 'looks good',
  'lgtm', 'great work', 'nice work', 'thanks again', 'many thanks',
  'i have fully understood', 'fully understood', 'all set', 'no further questions',
];
export function isLikelyAcknowledgment(rawText: string): boolean {
  const text = stripHtml(rawText).trim().toLowerCase().replace(/[!.,]+$/, '');
  if (!text || text.length > 120) return false;
  const firstLine = text.split('\n')[0].trim();
  return ACK_PHRASES.some((p) => firstLine === p || firstLine.startsWith(p + ' ') || firstLine.startsWith(p + ','));
}

const NEW_TOPIC_GAP_DAYS = 5;
export function isLikelyNewTopicByGap(replyTimeMs: number, followUpTimeMs: number): boolean {
  return (followUpTimeMs - replyTimeMs) / 86400000 >= NEW_TOPIC_GAP_DAYS;
}

export function isGraphConfigured(): boolean {
  const { MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET } = process.env;
  return !!(
    MS_GRAPH_TENANT_ID && MS_GRAPH_CLIENT_ID && MS_GRAPH_CLIENT_SECRET &&
    !MS_GRAPH_TENANT_ID.startsWith('PASTE_') && !MS_GRAPH_CLIENT_ID.startsWith('PASTE_') && !MS_GRAPH_CLIENT_SECRET.startsWith('PASTE_')
  );
}

export async function getAccessToken(): Promise<string> {
  const { MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET } = process.env;
  const res = await axios.post(
    `https://login.microsoftonline.com/${MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({ client_id: MS_GRAPH_CLIENT_ID!, client_secret: MS_GRAPH_CLIENT_SECRET!, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );
  return res.data.access_token as string;
}

export function graphClient(token: string): AxiosInstance {
  return axios.create({ baseURL: GRAPH_BASE, headers: { Authorization: `Bearer ${token}` }, timeout: 30000 });
}

interface RawGraphMessage {
  id: string;
  internetMessageId?: string;
  conversationId: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  from?: { emailAddress?: { name?: string; address: string } };
  toRecipients?: { emailAddress: { name?: string; address: string } }[];
  receivedDateTime?: string;
  sentDateTime?: string;
}

async function fetchAll(client: AxiosInstance, url: string, cap = 200): Promise<RawGraphMessage[]> {
  const msgs: RawGraphMessage[] = [];
  let next: string | null = url;
  while (next && msgs.length < cap) {
    const res: any = await client.get(next);
    msgs.push(...(res.data.value ?? []));
    next = res.data['@odata.nextLink'] ?? null;
  }
  return msgs;
}

const SELECT_FIELDS = 'id,internetMessageId,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime,sentDateTime';

export interface TimelineEntry {
  messageId: string;
  // kind === 'customer' only -- the dedup key (internetMessageId when available, else a
  // same-conversation+subject+minute heuristic) used to merge that message's copies
  // across every recipient's mailbox. STABLE across separate buildTeamTimelines() runs,
  // unlike `messageId` (which is just whichever recipient's own copy happened to be
  // processed first and can vary run-to-run) -- use this, not messageId, for anything
  // that needs to recognize "the same customer message" across polling cycles (e.g. the
  // SLA breach alert's idempotency check).
  dedupKey?: string;
  conversationId: string;
  time: number; // epoch ms
  kind: 'customer' | 'team';
  text: string;
  subject: string;
  customerEmail?: string;     // kind === 'customer'
  recipients?: { email: string; name: string }[]; // kind === 'customer' -- every tracked member who got a copy
  teamMemberEmail?: string;   // kind === 'team'
  teamMemberName?: string;    // kind === 'team'
  isAcknowledgment?: boolean; // kind === 'customer' -- precomputed, free heuristic only
}

export interface ConversationTimeline {
  conversationId: string;
  entries: TimelineEntry[]; // sorted by time ascending
}

// One customer message -> whichever team reply(es) actually answer it (from ANYONE on
// the roster) before the customer's next message (or "now" for the last exchange).
export interface Exchange {
  conversationId: string;
  customerMessage: TimelineEntry;
  teamReplies: TimelineEntry[]; // sorted by time; empty if still unanswered
  nextCustomerMessage: TimelineEntry | null; // null if this is the last customer message so far
}

function messageText(m: RawGraphMessage): string {
  return m.body?.content ? stripHtml(m.body.content) : (m.bodyPreview ?? '');
}

/**
 * Fetches every tracked member's external sent + received mail in [since, until] and
 * merges it into one timeline per conversationId, deduping the customer's own message
 * across however many of the roster it landed in (Exchange delivers a separate copy to
 * every recipient's mailbox, so a single 5-recipient customer email would otherwise be
 * counted up to 5 times). Dedup key: internetMessageId when Graph provides it (stable
 * across all recipients' copies of the same email), else a same-second heuristic key.
 */
export async function buildTeamTimelines(
  client: AxiosInstance,
  members: { email: string; name: string }[],
  since: string,
  until?: string,
  batchSize = 3
): Promise<Map<string, ConversationTimeline>> {
  const untilSent = until ? ` and sentDateTime le ${until}` : '';
  const untilRecv = until ? ` and receivedDateTime le ${until}` : '';

  const seenCustomerKeys = new Map<string, TimelineEntry>(); // dedup key -> the entry already kept
  const timelines = new Map<string, ConversationTimeline>();

  function addEntry(entry: TimelineEntry) {
    let tl = timelines.get(entry.conversationId);
    if (!tl) { tl = { conversationId: entry.conversationId, entries: [] }; timelines.set(entry.conversationId, tl); }
    tl.entries.push(entry);
  }

  for (let i = 0; i < members.length; i += batchSize) {
    const batch = members.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(async (m) => {
      const userPath = encodeURIComponent(m.email);
      const [sentRaw, recvRaw] = await Promise.all([
        fetchAll(client, `/users/${userPath}/mailFolders/SentItems/messages?$filter=sentDateTime ge ${since}${untilSent}&$select=${SELECT_FIELDS}&$top=100`),
        fetchAll(client, `/users/${userPath}/messages?$filter=receivedDateTime ge ${since}${untilRecv}&$select=${SELECT_FIELDS}&$top=100`),
      ]);
      return { member: m, sentRaw, recvRaw };
    }));

    for (const r of settled) {
      if (r.status === 'rejected') { logger.warn(`[TeamTimeline] Skipped a member: ${r.reason?.message}`); continue; }
      const { member, sentRaw, recvRaw } = r.value;

      for (const m of sentRaw) {
        if (!m.toRecipients?.some((rec) => isExternal(rec.emailAddress.address)) || !m.sentDateTime) continue;
        addEntry({
          messageId: m.id,
          conversationId: m.conversationId,
          time: new Date(m.sentDateTime).getTime(),
          kind: 'team',
          text: messageText(m),
          subject: m.subject ?? '',
          teamMemberEmail: member.email,
          teamMemberName: member.name,
        });
      }

      for (const m of recvRaw) {
        const fromAddr = m.from?.emailAddress?.address;
        if (!fromAddr || !isExternal(fromAddr) || !m.receivedDateTime) continue;
        const time = new Date(m.receivedDateTime).getTime();
        // Dedup: same internetMessageId (or, if missing, same conversation+subject+minute)
        // means this is another recipient's copy of a message already recorded -- merge
        // this member into its recipient list instead of creating a second entry.
        const dedupKey = m.internetMessageId
          ? `imid:${m.internetMessageId}`
          : `heur:${m.conversationId}:${m.subject ?? ''}:${Math.round(time / 60000)}`;
        const existing = seenCustomerKeys.get(dedupKey);
        if (existing) {
          if (!existing.recipients!.some((r) => r.email === member.email)) {
            existing.recipients!.push({ email: member.email, name: member.name });
          }
          continue;
        }

        const text = messageText(m);
        const entry: TimelineEntry = {
          messageId: m.id,
          dedupKey,
          conversationId: m.conversationId,
          time,
          kind: 'customer',
          text,
          subject: m.subject ?? '',
          customerEmail: fromAddr,
          recipients: [{ email: member.email, name: member.name }],
          isAcknowledgment: isLikelyAcknowledgment(text),
        };
        seenCustomerKeys.set(dedupKey, entry);
        addEntry(entry);
      }
    }
  }

  for (const tl of timelines.values()) tl.entries.sort((a, b) => a.time - b.time);
  return timelines;
}

/** Segments a timeline into customer-message -> team-reply(ies) exchanges. */
export function buildExchanges(timeline: ConversationTimeline): Exchange[] {
  const customerMsgs = timeline.entries.filter((e) => e.kind === 'customer');
  const exchanges: Exchange[] = [];
  for (let i = 0; i < customerMsgs.length; i++) {
    const customerMessage = customerMsgs[i];
    const nextCustomerMessage = customerMsgs[i + 1] ?? null;
    const windowEnd = nextCustomerMessage ? nextCustomerMessage.time : Infinity;
    const teamReplies = timeline.entries.filter(
      (e) => e.kind === 'team' && e.time > customerMessage.time && e.time < windowEnd
    );
    exchanges.push({ conversationId: timeline.conversationId, customerMessage, teamReplies, nextCustomerMessage });
  }
  return exchanges;
}
