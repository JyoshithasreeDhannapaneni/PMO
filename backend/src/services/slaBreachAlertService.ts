import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { emailService, brandedEmail } from './emailService';
import { resolveManagerCanonicalName, nameMatches } from '../config/teamRoster';
import {
  isGraphConfigured, getAccessToken, graphClient, buildTeamTimelines, buildExchanges, messageText,
  type Exchange, type RawGraphMessage,
} from './teamConversationTimeline';
import { parseEmailChain, type EmailChainEntry } from './emailChainParser';

// Every value below drawn from the customer's message (subject, body, address) is
// attacker-controlled -- anyone who can email a tracked mailbox controls what lands in
// this HTML email. Escape before interpolating so a subject/body containing "<" or "&"
// can't break the layout or inject markup into the rendered alert.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Cap how much of the customer's message we quote back -- long enough to show real
// context (the "mail chain proof"), short enough that one giant email doesn't blow up
// the alert. Graph's body.content for a reply-in-thread already includes the quoted
// prior messages inline, so even this single message's text usually carries most of the
// visible history.
const MAX_QUOTED_CHARS = 3000;

const SLA_MINUTES = 60;
// How far back to look each run -- generous enough that a message can't slip through
// between cron ticks, small enough to keep the shared-timeline fetch cheap. Once a
// message is alerted on, it's recorded in sla_breach_alerts and skipped on every later
// run even though it stays inside this window.
const LOOKBACK_HOURS = 6;

async function getAdminEmails(): Promise<string[]> {
  const r = await query(`SELECT email FROM users WHERE role = 'ADMIN'`);
  return r.rows.map((row: any) => row.email).filter(Boolean);
}

async function resolveMemberEmail(canonicalName: string): Promise<{ email: string; name: string } | null> {
  const r = await query(`SELECT email, display_name AS name FROM email_hygiene_members WHERE is_active = true`);
  const match = r.rows.find((row: any) => nameMatches(row.name, canonicalName));
  return match ? { email: match.email, name: match.name } : null;
}

interface AlertRow { message_id: string; resolved_at: string | null }
async function getAlertState(dedupKey: string): Promise<AlertRow | null> {
  const r = await query(`SELECT message_id, resolved_at FROM sla_breach_alerts WHERE message_id = $1`, [dedupKey]);
  return r.rows[0] ?? null;
}

// 2026-08-29 team-aware redesign: a shared customer email can land in several tracked
// mailboxes at once (everyone in the To line). Resolve EVERY recipient's manager, dedup
// them, and send ONE combined alert naming all responsible people -- instead of the old
// per-recipient design, which sent up to N separate emails for what is really one
// unresolved message.
async function resolveRecipientsAndManagers(recipients: { email: string; name: string }[]) {
  const adminEmails = await getAdminEmails();
  const managerEmails = new Map<string, { email: string; name: string }>();
  for (const r of recipients) {
    const canonical = resolveManagerCanonicalName(r.name);
    const manager = canonical ? await resolveMemberEmail(canonical) : null;
    if (manager) managerEmails.set(manager.email, manager);
  }
  const realTo = managerEmails.size > 0 ? [...managerEmails.keys()] : adminEmails;
  const realCc = managerEmails.size > 0 ? adminEmails : [];
  return { realTo, realCc };
}

function applyTestOverride(realTo: string[], realCc: string[]): { to: string[]; cc: string[]; testRecipient: string | null } {
  const testRecipient = process.env.SLA_BREACH_ALERT_TEST_RECIPIENT || null;
  if (!testRecipient) return { to: realTo, cc: realCc, testRecipient: null };
  return { to: [testRecipient], cc: [], testRecipient };
}

async function sendBreachAlert(ex: Exchange, recipients: { email: string; name: string }[], overdueMinutes: number): Promise<void> {
  const { realTo, realCc } = await resolveRecipientsAndManagers(recipients);
  const { to, cc, testRecipient } = applyTestOverride(realTo, realCc);
  if (to.length === 0) {
    logger.warn(`[SlaBreachAlert] No manager or admin recipient found for conversation ${ex.conversationId} — alert not sent`);
    return;
  }

  const overdueLabel = overdueMinutes >= 120 ? `${Math.round(overdueMinutes / 60)} hours` : `${overdueMinutes} minutes`;
  const namesList = recipients.map((r) => r.name).join(', ');

  const testModeNote = testRecipient
    ? `<p style="background:#fffbeb;border-left:4px solid #f59e0b;padding:10px 14px;border-radius:4px;font-size:13px;margin:0 0 16px 0;">
         <strong>Test mode:</strong> redirected here instead of the real recipient(s) —
         would normally go to <strong>${escapeHtml(realTo.join(', ') || '(none resolved)')}</strong>${realCc.length ? ` (cc: ${escapeHtml(realCc.join(', '))})` : ''}.
       </p>`
    : '';

  const rawText = ex.customerMessage.text || '';
  const truncated = rawText.length > MAX_QUOTED_CHARS;
  const quotedText = escapeHtml(truncated ? rawText.slice(0, MAX_QUOTED_CHARS) : rawText).replace(/\n/g, '<br>');

  const body = `
    ${testModeNote}
    <p>A customer email has not received a reply from anyone on the team within the 1-hour SLA.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:16px 0;">
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Recipient(s) on this email</td><td style="padding:8px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${escapeHtml(namesList)}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Customer</td><td style="padding:8px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${escapeHtml(ex.customerMessage.customerEmail || 'unknown')}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Subject</td><td style="padding:8px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${escapeHtml(ex.customerMessage.subject || '(no subject)')}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Received</td><td style="padding:8px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${new Date(ex.customerMessage.time).toISOString()}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;">Overdue by</td><td style="padding:8px 12px;font-size:13px;font-weight:700;color:#ef4444;">${overdueLabel}</td></tr>
    </table>
    <p style="font-size:13px;font-weight:600;color:#334155;margin:0 0 6px 0;">What the customer sent:</p>
    <blockquote style="margin:0 0 16px 0;padding:10px 14px;border-left:3px solid #cbd5e1;background:#f8fafc;border-radius:4px;font-size:13px;color:#334155;white-space:pre-wrap;max-height:400px;overflow-y:auto;">${quotedText || '<em style="color:#94a3b8;">(no message text available)</em>'}</blockquote>
    ${truncated ? `<p style="font-size:12px;color:#94a3b8;margin:-10px 0 16px 0;">Message truncated — showing the first ${MAX_QUOTED_CHARS.toLocaleString()} characters.</p>` : ''}
    <p style="font-size:13px;color:#64748b;">This is a real-time 1-hour reply trip-wire, separate from the weekly Email Hygiene score (which grades on a 4-hour SLA). One alert covers everyone this email was sent to — you'll get a follow-up note here once anyone on the team replies.</p>`;

  await emailService.sendEmail({
    to,
    cc,
    subject: `${testRecipient ? '[TEST] ' : ''}SLA Alert: Unreplied customer email (${namesList}) — ${overdueLabel} overdue`,
    html: brandedEmail('1-Hour Reply SLA Breach', body, '#ef4444'),
  });

  await execute(
    `INSERT INTO sla_breach_alerts (message_id, conversation_id, user_email, user_name, customer_email, subject, received_at, overdue_minutes, manager_email, recipients)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (message_id) DO NOTHING`,
    [
      ex.customerMessage.dedupKey, ex.conversationId,
      recipients[0]?.email ?? null, recipients.map((r) => r.name).join(', '),
      ex.customerMessage.customerEmail, ex.customerMessage.subject, new Date(ex.customerMessage.time),
      overdueMinutes, realTo.join(', ') || null, JSON.stringify(recipients),
    ]
  );

  logger.info(`[SlaBreachAlert] Sent for conversation ${ex.conversationId} (${namesList}, ${overdueMinutes}m overdue) → to=${to.join(',')} cc=${cc.join(',')}`);
}

async function sendResolvedFollowUp(ex: Exchange, dedupKey: string): Promise<void> {
  const alertRow = await query(`SELECT recipients FROM sla_breach_alerts WHERE message_id = $1`, [dedupKey]);
  const recipients: { email: string; name: string }[] = alertRow.rows[0]?.recipients ?? [];
  const { realTo, realCc } = await resolveRecipientsAndManagers(recipients);
  const { to, cc, testRecipient } = applyTestOverride(realTo, realCc);
  if (to.length === 0) return;

  const replier = ex.teamReplies[0];
  const body = `
    ${testRecipient ? `<p style="background:#fffbeb;border-left:4px solid #f59e0b;padding:10px 14px;border-radius:4px;font-size:13px;margin:0 0 16px 0;"><strong>Test mode:</strong> redirected here instead of ${escapeHtml(realTo.join(', '))}.</p>` : ''}
    <p>Update: the previously-flagged customer email has now been answered${replier ? ` by <strong>${escapeHtml(replier.teamMemberName || '')}</strong>` : ''}. No further action needed.</p>
    <p style="font-size:13px;color:#64748b;">Customer: ${escapeHtml(ex.customerMessage.customerEmail || 'unknown')} — Subject: ${escapeHtml(ex.customerMessage.subject || '(no subject)')}</p>`;

  await emailService.sendEmail({
    to,
    cc,
    subject: `${testRecipient ? '[TEST] ' : ''}Resolved: ${ex.customerMessage.subject || 'customer email'} — now answered`,
    html: brandedEmail('SLA Alert Resolved', body, '#16a34a'),
  });

  await execute(`UPDATE sla_breach_alerts SET resolved_at = NOW() WHERE message_id = $1`, [dedupKey]);
  logger.info(`[SlaBreachAlert] Sent resolved follow-up for conversation ${ex.conversationId}`);
}

// On-demand recovery of a past alert's original customer message -- the DB only ever
// stored metadata (subject, customer email, times), never the body, so "checking an old
// one" means re-fetching it live from whichever recipient mailbox(es) got it. Only
// fetches when actually asked for (one row at a time), never as a bulk backfill -- with
// ~2,500 historical rows, eagerly re-fetching all of them would mean that many live Graph
// calls for alerts nobody may ever need to look at again.
export interface OriginalMessageLookup {
  found: boolean;
  text?: string;
  // The message split into its individual entries (newest first) when its body turned out
  // to be a quoted reply chain -- each tagged 'customer' or 'cloudfuze' by sender domain, so
  // the UI can show who sent what instead of one undifferentiated blob. Always at least one
  // entry when `found` is true, even for a plain message with no chain to split.
  chain?: EmailChainEntry[];
  subject?: string;
  customerEmail?: string;
  receivedAt?: string;
  mailboxUsed?: string;
  error?: string;
}

async function findMessageInMailbox(
  client: ReturnType<typeof graphClient>,
  mailbox: string,
  messageId: string,
  conversationId: string | null,
  receivedAt: string
): Promise<RawGraphMessage | null> {
  const userPath = encodeURIComponent(mailbox);
  const SELECT = 'id,internetMessageId,conversationId,subject,bodyPreview,body,from,receivedDateTime';

  if (messageId.startsWith('imid:')) {
    // OData string literals escape an embedded single quote by doubling it.
    const imid = messageId.slice('imid:'.length).replace(/'/g, "''");
    const res = await client.get(`/users/${userPath}/messages?$filter=internetMessageId eq '${imid}'&$select=${SELECT}`);
    const match = (res.data.value ?? [])[0];
    return match ?? null;
  }

  if (conversationId) {
    // Pre-internetMessageId dedup key -- fall back to conversationId, then pick whichever
    // message in that thread landed closest to the alert's recorded received_at (a long
    // thread can hold many messages, only one of which is actually this alert).
    const res = await client.get(`/users/${userPath}/messages?$filter=conversationId eq '${conversationId}'&$select=${SELECT}&$top=50`);
    const candidates: RawGraphMessage[] = res.data.value ?? [];
    const targetMs = new Date(receivedAt).getTime();
    const withDelta = candidates
      .map((m) => ({ m, delta: Math.abs(new Date(m.receivedDateTime ?? 0).getTime() - targetMs) }))
      .filter((c) => c.delta < 2 * 60 * 1000)
      .sort((a, b) => a.delta - b.delta);
    return withDelta[0]?.m ?? null;
  }

  return null;
}

async function getOriginalMessage(alertId: string): Promise<OriginalMessageLookup> {
  if (!isGraphConfigured()) return { found: false, error: 'Microsoft Graph is not configured on this server' };

  const row = (await query(
    `SELECT message_id, conversation_id, received_at, recipients FROM sla_breach_alerts WHERE id = $1`,
    [alertId]
  )).rows[0];
  if (!row) return { found: false, error: 'No alert with that id' };

  const mailboxes: string[] = (row.recipients ?? []).map((r: any) => r.email).filter(Boolean);
  if (mailboxes.length === 0) return { found: false, error: 'This alert has no recorded recipient mailbox to search' };

  const token = await getAccessToken();
  const client = graphClient(token);
  const receivedAtIso = new Date(row.received_at).toISOString();

  for (const mailbox of mailboxes) {
    try {
      const match = await findMessageInMailbox(client, mailbox, row.message_id, row.conversation_id, receivedAtIso);
      if (match) {
        const fromAddr = match.from?.emailAddress?.address ?? null;
        const chain = match.body?.content
          ? parseEmailChain(match.body.content, {
              name: match.from?.emailAddress?.name ?? null,
              email: fromAddr,
              timestamp: match.receivedDateTime ?? null,
            })
          : undefined;
        return {
          found: true,
          text: messageText(match),
          chain,
          subject: match.subject,
          customerEmail: fromAddr ?? undefined,
          receivedAt: match.receivedDateTime,
          mailboxUsed: mailbox,
        };
      }
    } catch (err: any) {
      logger.warn(`[SlaBreachAlert] Original-message lookup failed in ${mailbox} for alert ${alertId}: ${err?.response?.status ?? ''} ${err?.message}`);
    }
  }
  return { found: false, error: 'Message no longer found in any recorded recipient mailbox — it may have been deleted or moved since the alert was sent' };
}

interface AlertFilters {
  search?: string;
  responsibleEmail?: string;
  startDate?: string; // 'YYYY-MM-DD', inclusive, matched against received_at
  endDate?: string;   // 'YYYY-MM-DD', inclusive, matched against received_at
}

// Builds a WHERE clause + its own parameter list from scratch (starting at $1) so it can
// be reused verbatim by both a COUNT query and a LIMIT/OFFSET query without the two ever
// getting out of sync on placeholder numbering -- append LIMIT/OFFSET's own params after
// whatever this returns, never renumber these clauses around them.
// "Responsible" = a named recipient on the customer email, stored in the `recipients`
// JSONB array (every tracked mailbox that got a copy) -- NOT the user_name column, which
// is a comma-joined list of all of them and unusable for filtering to one person. Filters
// by email (stable) rather than name (can have spelling/casing variants).
function buildAlertFilter(filters: AlertFilters): { where: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];
  const push = (val: any): string => { params.push(val); return `$${params.length}`; };

  const searchTerm = filters.search?.trim();
  if (searchTerm) {
    const p = push(`%${searchTerm}%`);
    clauses.push(`(customer_email ILIKE ${p} OR subject ILIKE ${p} OR user_name ILIKE ${p})`);
  }
  if (filters.responsibleEmail) {
    const p = push(filters.responsibleEmail);
    clauses.push(`EXISTS (SELECT 1 FROM jsonb_array_elements(recipients) elem WHERE elem->>'email' = ${p})`);
  }
  if (filters.startDate) {
    const p = push(filters.startDate);
    clauses.push(`received_at >= ${p}::date`);
  }
  if (filters.endDate) {
    // Exclusive upper bound (next day) so an end date is inclusive of the whole day,
    // not just its midnight instant.
    const p = push(filters.endDate);
    clauses.push(`received_at < (${p}::date + interval '1 day')`);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

async function listAlerts(opts: { page: number; limit: number } & AlertFilters): Promise<{
  rows: any[];
  total: number;
}> {
  const { page, limit, ...filters } = opts;
  const offset = (page - 1) * limit;
  const { where, params } = buildAlertFilter(filters);

  const [rowsResult, countResult] = await Promise.all([
    query(
      `SELECT id, message_id, conversation_id, user_email, user_name, customer_email, subject,
              received_at, overdue_minutes, manager_email, recipients, alerted_at, resolved_at
       FROM sla_breach_alerts ${where}
       ORDER BY alerted_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM sla_breach_alerts ${where}`, params),
  ]);

  return { rows: rowsResult.rows, total: parseInt(countResult.rows[0].count, 10) };
}

interface ResponsiblePerson { name: string; email: string; total: number; open: number }

// One entry per distinct recipient email across all alerts (optionally scoped to a date
// range), with how many name a given mailbox belongs to and how many are still unresolved
// -- the roster for the "segregated by responsible person" grouping on the frontend.
async function listResponsiblePeople(filters: Pick<AlertFilters, 'startDate' | 'endDate'> = {}): Promise<ResponsiblePerson[]> {
  const { where, params } = buildAlertFilter(filters);
  const combinedWhere = where
    ? `${where} AND elem->>'email' IS NOT NULL`
    : `WHERE elem->>'email' IS NOT NULL`;

  const result = await query(`
    SELECT
      elem->>'email' AS email,
      MAX(elem->>'name') AS name,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE resolved_at IS NULL) AS open
    FROM sla_breach_alerts, jsonb_array_elements(recipients) elem
    ${combinedWhere}
    GROUP BY elem->>'email'
    ORDER BY total DESC
  `, params);
  return result.rows.map((r: any) => ({
    email: r.email,
    name: r.name || r.email,
    total: parseInt(r.total, 10),
    open: parseInt(r.open, 10),
  }));
}

export const slaBreachAlertService = {
  isConfigured: isGraphConfigured,
  listAlerts,
  listResponsiblePeople,
  getOriginalMessage,

  async checkAll(): Promise<{ checked: number; alerted: number; resolved: number }> {
    if (!isGraphConfigured()) return { checked: 0, alerted: 0, resolved: 0 };

    const members = (await query(`SELECT email, display_name AS name FROM email_hygiene_members WHERE is_active = true`)).rows;
    const token = await getAccessToken();
    const client = graphClient(token);
    const since = new Date(Date.now() - LOOKBACK_HOURS * 3600000).toISOString();

    const timelines = await buildTeamTimelines(client, members, since);
    const allExchanges: Exchange[] = [];
    for (const tl of timelines.values()) allExchanges.push(...buildExchanges(tl));

    let alerted = 0;
    let resolved = 0;

    for (const ex of allExchanges) {
      const dedupKey = ex.customerMessage.dedupKey;
      if (!dedupKey) continue;

      // A closing "thanks, all set" never needs a reply -- never alert on it, ever.
      if (ex.customerMessage.isAcknowledgment) continue;

      const hasTeamReply = ex.teamReplies.length > 0;

      if (hasTeamReply) {
        // Someone on the team already answered -- if this was previously flagged and
        // still open, send the "all clear" follow-up once.
        const state = await getAlertState(dedupKey);
        if (state && !state.resolved_at) {
          try { await sendResolvedFollowUp(ex, dedupKey); resolved++; }
          catch (err: any) { logger.error(`[SlaBreachAlert] Failed to send resolved follow-up for ${dedupKey}: ${err?.message}`); }
        }
        continue;
      }

      // Still unanswered by anyone on the team -- check the SLA clock.
      const overdueMinutes = Math.round((Date.now() - ex.customerMessage.time) / 60000);
      if (overdueMinutes < SLA_MINUTES) continue;

      const state = await getAlertState(dedupKey);
      if (state) continue; // already alerted once for this exact message -- idempotent

      const recipients = ex.customerMessage.recipients ?? [];
      if (recipients.length === 0) continue;

      try {
        await sendBreachAlert(ex, recipients, overdueMinutes);
        alerted++;
      } catch (err: any) {
        logger.error(`[SlaBreachAlert] Failed to send/record alert for conversation ${ex.conversationId}: ${err?.message}`);
      }
    }

    return { checked: members.length, alerted, resolved };
  },
};
