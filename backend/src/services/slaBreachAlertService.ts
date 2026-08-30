import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { emailService, brandedEmail } from './emailService';
import { resolveManagerCanonicalName, nameMatches } from '../config/teamRoster';
import {
  isGraphConfigured, getAccessToken, graphClient, buildTeamTimelines, buildExchanges, type Exchange,
} from './teamConversationTimeline';

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
         would normally go to <strong>${realTo.join(', ') || '(none resolved)'}</strong>${realCc.length ? ` (cc: ${realCc.join(', ')})` : ''}.
       </p>`
    : '';

  const body = `
    ${testModeNote}
    <p>A customer email has not received a reply from anyone on the team within the 1-hour SLA.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:16px 0;">
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Recipient(s) on this email</td><td style="padding:8px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${namesList}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Customer</td><td style="padding:8px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${ex.customerMessage.customerEmail}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Subject</td><td style="padding:8px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${ex.customerMessage.subject || '(no subject)'}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Received</td><td style="padding:8px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${new Date(ex.customerMessage.time).toISOString()}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;">Overdue by</td><td style="padding:8px 12px;font-size:13px;font-weight:700;color:#ef4444;">${overdueLabel}</td></tr>
    </table>
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
    ${testRecipient ? `<p style="background:#fffbeb;border-left:4px solid #f59e0b;padding:10px 14px;border-radius:4px;font-size:13px;margin:0 0 16px 0;"><strong>Test mode:</strong> redirected here instead of ${realTo.join(', ')}.</p>` : ''}
    <p>Update: the previously-flagged customer email has now been answered${replier ? ` by <strong>${replier.teamMemberName}</strong>` : ''}. No further action needed.</p>
    <p style="font-size:13px;color:#64748b;">Customer: ${ex.customerMessage.customerEmail} — Subject: ${ex.customerMessage.subject || '(no subject)'}</p>`;

  await emailService.sendEmail({
    to,
    cc,
    subject: `${testRecipient ? '[TEST] ' : ''}Resolved: ${ex.customerMessage.subject || 'customer email'} — now answered`,
    html: brandedEmail('SLA Alert Resolved', body, '#16a34a'),
  });

  await execute(`UPDATE sla_breach_alerts SET resolved_at = NOW() WHERE message_id = $1`, [dedupKey]);
  logger.info(`[SlaBreachAlert] Sent resolved follow-up for conversation ${ex.conversationId}`);
}

export const slaBreachAlertService = {
  isConfigured: isGraphConfigured,

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
