import axios, { AxiosInstance } from 'axios';
import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { emailService, brandedEmail } from './emailService';
import { resolveManagerCanonicalName, nameMatches } from '../config/teamRoster';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SLA_MINUTES = 60;
// How far back to look each run -- generous enough that a message can't slip through
// between cron ticks, small enough to keep each mailbox query cheap. Once a message is
// alerted on, it's recorded in sla_breach_alerts and skipped on every later run even
// though it stays inside this window.
const LOOKBACK_HOURS = 6;

const CF_DOMAIN = 'cloudfuze.com';
const SYSTEM_SENDER_DOMAINS = new Set([
  'microsoft.com', 'microsoftonline.com', 'teams.microsoft.com', 'sharepointonline.com',
  'outlook.com', 'onmicrosoft.com', 'azurecomm.net', 'mimecast.com', 'neutara.com',
]);

function isExternal(email: string): boolean {
  const lower = email.toLowerCase();
  if (lower.endsWith(`@${CF_DOMAIN}`)) return false;
  const domain = lower.split('@')[1] ?? '';
  if (SYSTEM_SENDER_DOMAINS.has(domain)) return false;
  if (lower.startsWith('noreply@') || lower.startsWith('no-reply@') || lower.startsWith('donotreply@')) return false;
  return true;
}

function isGraphConfigured(): boolean {
  const { MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET } = process.env;
  return !!(
    MS_GRAPH_TENANT_ID && MS_GRAPH_CLIENT_ID && MS_GRAPH_CLIENT_SECRET &&
    !MS_GRAPH_TENANT_ID.startsWith('PASTE_') && !MS_GRAPH_CLIENT_ID.startsWith('PASTE_') && !MS_GRAPH_CLIENT_SECRET.startsWith('PASTE_')
  );
}

async function getAccessToken(): Promise<string> {
  const { MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET } = process.env;
  const res = await axios.post(
    `https://login.microsoftonline.com/${MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({ client_id: MS_GRAPH_CLIENT_ID!, client_secret: MS_GRAPH_CLIENT_SECRET!, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );
  return res.data.access_token as string;
}

function graphClient(token: string): AxiosInstance {
  return axios.create({ baseURL: GRAPH_BASE, headers: { Authorization: `Bearer ${token}` }, timeout: 30000 });
}

interface GraphMsg {
  id: string;
  conversationId: string;
  subject?: string;
  from?: { emailAddress?: { address: string; name?: string } };
  toRecipients?: { emailAddress: { address: string } }[];
  receivedDateTime?: string;
  sentDateTime?: string;
}

async function fetchAll(client: AxiosInstance, url: string, cap = 100): Promise<GraphMsg[]> {
  const msgs: GraphMsg[] = [];
  let next: string | null = url;
  while (next && msgs.length < cap) {
    const res: any = await client.get(next);
    msgs.push(...(res.data.value ?? []));
    next = res.data['@odata.nextLink'] ?? null;
  }
  return msgs;
}

async function alreadyAlerted(messageId: string): Promise<boolean> {
  const r = await query(`SELECT 1 FROM sla_breach_alerts WHERE message_id = $1`, [messageId]);
  return r.rows.length > 0;
}

async function getAdminEmails(): Promise<string[]> {
  const r = await query(`SELECT email FROM users WHERE role = 'ADMIN'`);
  return r.rows.map((row: any) => row.email).filter(Boolean);
}

async function resolveMemberEmail(canonicalName: string): Promise<{ email: string; name: string } | null> {
  const r = await query(`SELECT email, display_name AS name FROM email_hygiene_members WHERE is_active = true`);
  const match = r.rows.find((row: any) => nameMatches(row.name, canonicalName));
  return match ? { email: match.email, name: match.name } : null;
}

async function sendBreachAlert(breach: {
  messageId: string;
  conversationId: string;
  userEmail: string;
  userName: string;
  customerEmail: string;
  subject: string;
  receivedAt: Date;
  overdueMinutes: number;
}): Promise<void> {
  const managerCanonical = resolveManagerCanonicalName(breach.userName);
  const manager = managerCanonical ? await resolveMemberEmail(managerCanonical) : null;
  const adminEmails = await getAdminEmails();

  // Falls back to sending straight to admins (rather than dropping the alert) when no
  // manager is found -- e.g. a top-level lead like Abhishek/Ajay Singh has no one above
  // them in this roster, or the person's name doesn't match any known engineer/manager.
  const realTo = manager ? [manager.email] : adminEmails;
  const realCc = manager ? adminEmails : [];

  // 2026-08-29: temporary test mode -- while set, every alert is redirected to this one
  // address instead of the real manager/admins, so alerts can be watched safely before
  // going live to real people. The email body below still shows who it WOULD have gone
  // to, so the manager-resolution logic stays verifiable during testing. Unset this env
  // var (or remove it) to switch back to real manager+admin delivery -- no code change.
  const testRecipient = process.env.SLA_BREACH_ALERT_TEST_RECIPIENT;
  const to = testRecipient ? [testRecipient] : realTo;
  const cc = testRecipient ? [] : realCc;

  if (to.length === 0) {
    logger.warn(`[SlaBreachAlert] No manager or admin recipient found for ${breach.userName} — alert not sent`);
    return;
  }

  const overdueLabel = breach.overdueMinutes >= 120
    ? `${Math.round(breach.overdueMinutes / 60)} hours`
    : `${breach.overdueMinutes} minutes`;

  const testModeNote = testRecipient
    ? `<p style="background:#fffbeb;border-left:4px solid #f59e0b;padding:10px 14px;border-radius:4px;font-size:13px;margin:0 0 16px 0;">
         <strong>Test mode:</strong> redirected here instead of the real recipient(s) —
         would normally go to <strong>${realTo.join(', ') || '(none resolved)'}</strong>${realCc.length ? ` (cc: ${realCc.join(', ')})` : ''}.
       </p>`
    : '';

  const body = `
    ${testModeNote}
    <p>A customer email has not received a reply within the 1-hour SLA.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:16px 0;">
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Responsible</td><td style="padding:8px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${breach.userName} (${breach.userEmail})</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Customer</td><td style="padding:8px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${breach.customerEmail}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Subject</td><td style="padding:8px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${breach.subject || '(no subject)'}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Received</td><td style="padding:8px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${breach.receivedAt.toISOString()}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;">Overdue by</td><td style="padding:8px 12px;font-size:13px;font-weight:700;color:#ef4444;">${overdueLabel}</td></tr>
    </table>
    <p style="font-size:13px;color:#64748b;">This is a real-time 1-hour reply trip-wire, separate from the weekly Email Hygiene score (which grades on a 4-hour SLA).</p>`;

  await emailService.sendEmail({
    to,
    cc,
    subject: `${testRecipient ? '[TEST] ' : ''}SLA Alert: Unreplied customer email — ${breach.userName} (${overdueLabel} overdue)`,
    html: brandedEmail('1-Hour Reply SLA Breach', body, '#ef4444'),
  });

  await execute(
    `INSERT INTO sla_breach_alerts (message_id, conversation_id, user_email, user_name, customer_email, subject, received_at, overdue_minutes, manager_email)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (message_id) DO NOTHING`,
    [breach.messageId, breach.conversationId, breach.userEmail, breach.userName, breach.customerEmail, breach.subject, breach.receivedAt, breach.overdueMinutes, manager?.email ?? null]
  );

  logger.info(`[SlaBreachAlert] Sent for ${breach.userName} (${breach.overdueMinutes}m overdue) → to=${to.join(',')} cc=${cc.join(',')}`);
}

async function checkMember(client: AxiosInstance, userEmail: string, userName: string): Promise<number> {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600000).toISOString();
  const userPath = encodeURIComponent(userEmail);

  const [recvRaw, sentRaw] = await Promise.all([
    fetchAll(client, `/users/${userPath}/messages?$filter=receivedDateTime ge ${since}&$select=id,conversationId,subject,from,receivedDateTime&$top=100`),
    fetchAll(client, `/users/${userPath}/mailFolders/SentItems/messages?$filter=sentDateTime ge ${since}&$select=id,conversationId,toRecipients,sentDateTime&$top=100`),
  ]);

  const externalRecv = recvRaw.filter((m) => m.from?.emailAddress?.address && isExternal(m.from.emailAddress.address));
  const externalSent = sentRaw.filter((m) => m.toRecipients?.some((r) => isExternal(r.emailAddress.address)));

  const sentByConv = new Map<string, GraphMsg[]>();
  for (const m of externalSent) {
    if (!sentByConv.has(m.conversationId)) sentByConv.set(m.conversationId, []);
    sentByConv.get(m.conversationId)!.push(m);
  }

  let alerted = 0;
  for (const msg of externalRecv) {
    const receivedAt = new Date(msg.receivedDateTime!);
    const overdueMinutes = Math.round((Date.now() - receivedAt.getTime()) / 60000);
    if (overdueMinutes < SLA_MINUTES) continue;

    const replies = sentByConv.get(msg.conversationId) ?? [];
    const hasReply = replies.some((r) => new Date(r.sentDateTime!).getTime() > receivedAt.getTime());
    if (hasReply) continue;

    if (await alreadyAlerted(msg.id)) continue;

    try {
      await sendBreachAlert({
        messageId: msg.id,
        conversationId: msg.conversationId,
        userEmail,
        userName,
        customerEmail: msg.from?.emailAddress?.address ?? 'unknown',
        subject: msg.subject ?? '',
        receivedAt,
        overdueMinutes,
      });
      alerted++;
    } catch (err: any) {
      logger.error(`[SlaBreachAlert] Failed to send/record alert for ${userEmail} message ${msg.id}: ${err?.message}`);
    }
  }
  return alerted;
}

export const slaBreachAlertService = {
  isConfigured: isGraphConfigured,

  async checkAll(): Promise<{ checked: number; alerted: number }> {
    if (!isGraphConfigured()) return { checked: 0, alerted: 0 };

    const members = await query(`SELECT email, display_name AS name FROM email_hygiene_members WHERE is_active = true`);
    const token = await getAccessToken();
    const client = graphClient(token);

    let alerted = 0;
    for (const m of members.rows) {
      try {
        alerted += await checkMember(client, m.email, m.name);
      } catch (err: any) {
        logger.warn(`[SlaBreachAlert] Skipped ${m.email}: ${err?.message}`);
      }
    }
    return { checked: members.rows.length, alerted };
  },
};
