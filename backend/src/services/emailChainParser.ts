// Splits one Graph message body into its individual messages when it's actually an Outlook/
// Gmail-style reply chain (the new content on top, followed by quoted older messages each
// introduced by a "From:/Sent:/To:/Subject:" block or a "On <date>, <name> wrote:" line). The
// SLA Breach Alerts UI shows exactly one Graph message per alert, but that message's body is
// often the whole visible thread -- without this, the customer's actual new content and every
// previous reply (CloudFuze's included) render as one undifferentiated wall of text.
import { decodeHtmlEntities } from './teamConversationTimeline';

export type EmailChainSender = 'customer' | 'cloudfuze' | 'unknown';

export interface EmailChainEntry {
  sender: EmailChainSender;
  name: string | null;
  email: string | null;
  // Verbatim as written in the header (e.g. "Monday, 31 August 2026 08:19:55") -- these come
  // from mixed timezones/formats across senders, so no attempt is made to parse/normalize it.
  timestamp: string | null;
  body: string;
}

// Converts to text the same way stripHtml() does, except block-level boundaries become real
// newlines instead of being collapsed into spaces -- required to recognize that "From:",
// "Sent:", "To:" etc. are each on their own line, which is how Outlook/Gmail actually render
// a quoted header block.
export function htmlToReadableText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  const decoded = decodeHtmlEntities(withBreaks);
  return decoded
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const HEADER_FIELD_RE = /^(From|Sent|Date|To|Cc|Subject):\s*(.*)$/i;
// "On Sat, Aug 29, 2026 at 8:39 AM Chaitanya Gupta <Chaitanya.Gupta@cloudfuze.com> wrote:"
// -- requires the AM/PM time right before the name so the date/name boundary is unambiguous.
const WROTE_LINE_RE = /^On\s+(.+?\d{1,2}:\d{2}\s*(?:AM|PM))\s+(.+?)\s*<([^<>@\s]+@[^<>\s]+)>\s*wrote:\s*$/i;
const NAME_EMAIL_RE = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/;

function parseNameEmail(raw: string): { name: string | null; email: string | null } {
  const trimmed = raw.trim();
  const m = trimmed.match(NAME_EMAIL_RE);
  if (m) {
    const name = m[1].trim().replace(/,$/, '');
    return { name: name || null, email: m[2].trim() };
  }
  if (/^[^\s<>]+@[^\s<>]+$/.test(trimmed)) return { name: null, email: trimmed };
  return { name: trimmed || null, email: null };
}

export function classifySender(email: string | null): EmailChainSender {
  if (!email) return 'unknown';
  return email.toLowerCase().endsWith('@cloudfuze.com') ? 'cloudfuze' : 'customer';
}

interface OpenEntry { name: string | null; email: string | null; timestamp: string | null; bodyLines: string[] }

function finalize(cur: OpenEntry): EmailChainEntry {
  return {
    sender: classifySender(cur.email),
    name: cur.name,
    email: cur.email,
    timestamp: cur.timestamp,
    body: cur.bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
  };
}

// Consumes a "From: ... [Sent|Date:] ... To: ... [Cc: ...] Subject: ..." block starting at
// `startIdx` (which must already be a From: line). Looks ahead (bounded) for the Subject:
// line that ends the block -- a wrapped Cc: recipient list can otherwise span several plain
// lines with no field prefix of their own, so "the next non-header line" is not a safe
// end-of-block signal on its own.
function consumeHeaderBlock(lines: string[], startIdx: number): { name: string | null; email: string | null; timestamp: string | null; nextIdx: number } | null {
  const fromMatch = lines[startIdx].match(HEADER_FIELD_RE);
  if (!fromMatch || fromMatch[1].toLowerCase() !== 'from') return null;
  const { name, email } = parseNameEmail(fromMatch[2]);
  let timestamp: string | null = null;
  let subjectIdx = -1;
  const cap = Math.min(lines.length, startIdx + 20);
  for (let j = startIdx + 1; j < cap; j++) {
    const hm = lines[j].match(HEADER_FIELD_RE);
    if (!hm) continue;
    const field = hm[1].toLowerCase();
    if ((field === 'sent' || field === 'date') && !timestamp) timestamp = hm[2].trim();
    if (field === 'subject') { subjectIdx = j; break; }
  }
  return { name, email, timestamp, nextIdx: subjectIdx >= 0 ? subjectIdx + 1 : startIdx + 1 };
}

/**
 * Splits a Graph message body into its constituent messages, newest first. `topLevel`
 * describes the outer message itself (its own From/receivedDateTime from Graph, which never
 * appears as a quoted header inside its own body) and becomes entry [0]'s metadata.
 */
export function parseEmailChain(
  rawHtml: string,
  topLevel: { name: string | null; email: string | null; timestamp: string | null }
): EmailChainEntry[] {
  const lines = htmlToReadableText(rawHtml).split('\n');
  const entries: EmailChainEntry[] = [];
  let current: OpenEntry = { ...topLevel, bodyLines: [] };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const wrote = line.match(WROTE_LINE_RE);
    if (wrote) {
      entries.push(finalize(current));
      const { name, email } = parseNameEmail(`${wrote[2]} <${wrote[3]}>`);
      current = { name, email, timestamp: wrote[1], bodyLines: [] };
      i++;
      continue;
    }

    const header = consumeHeaderBlock(lines, i);
    if (header) {
      entries.push(finalize(current));
      current = { name: header.name, email: header.email, timestamp: header.timestamp, bodyLines: [] };
      i = header.nextIdx;
      continue;
    }

    current.bodyLines.push(line);
    i++;
  }
  entries.push(finalize(current));

  // Drop empty quoted-boundary artifacts (e.g. a header block with nothing but signature
  // cruft before the next one) -- but always keep entry 0, even if its body is blank, since
  // that's what the outer Graph message actually is.
  return entries.filter((e, idx) => idx === 0 || e.body.length > 0);
}
