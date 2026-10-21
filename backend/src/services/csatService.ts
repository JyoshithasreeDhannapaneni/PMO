import crypto from 'crypto';
import { query, execute, transaction } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import {
  emailService, brandedEmail, cloudfuzeLogoImage, CLOUDFUZE_BLUE, customerEmail, defaultFromAddress, GraphSendError, isBlockedRecipient,
} from './emailService';
import { notificationService } from './notificationService';

// A project may enter DELTA only after the customer has answered the C-SAT survey sent by its
// PM (2026-10-13 product decision). The survey link is the only credential the customer gets,
// so only its sha256 is stored; the raw token exists solely in the email.
const TOKEN_TTL_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_NAME_LENGTH = 100;
const MAX_PROJECT_LABEL_LENGTH = 150;
const DEFAULT_INTRO =
  'We are pleased to inform you that the one-time migration phase of your project has been completed. Before we proceed with the delta migration, we would be grateful if you could take a few minutes to share your feedback on your experience so far. Your input is valuable to us and helps us maintain the standard of service you expect from CloudFuze.';
const MAX_COMMENT_LENGTH = 4000;
const MAX_SENDS_PER_DAY = 5;
const MAX_CC = 10;
const ALREADY_ANSWERED = 'The customer has already answered the C-SAT survey for this account';

// Recipients on these domains (or their subdomains) are colleagues, not customers.
// Only CloudFuze's own M365 routing domain is internal; customers often use their own
// <tenant>.onmicrosoft.com addresses. CSAT_INTERNAL_DOMAINS adds to the defaults.
function isInternalRecipient(email: string, actorEmail: string | undefined): boolean {
  const clean = (d: string) => d.trim().toLowerCase().replace(/\.+$/, '');
  const domains = ['cloudfuze.com', 'cloudfuze.onmicrosoft.com', ...(process.env.CSAT_INTERNAL_DOMAINS || '').split(',')];
  const own = (actorEmail || '').split('@')[1];
  if (own) domains.push(own);
  const domain = clean(email.split('@')[1] || '');
  return domains.map(clean).filter(Boolean).some((d) => domain === d || domain.endsWith(`.${d}`));
}

const GATE_OFF_VALUES = new Set(['off', 'false', '0', 'disabled', 'no']);

// Only delivery problems become a 503 (no self-heal incident); anything else is a code bug.
function isDeliveryFailure(err: unknown): boolean {
  if (err instanceof GraphSendError) return true;
  const name = (err as { name?: string })?.name;
  const message = (err as { message?: string })?.message || '';
  return name === 'TimeoutError' || name === 'AbortError' || /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|Microsoft token request failed/i.test(message);
}

export type CsatState = 'none' | 'pending' | 'responded';

export interface CsatStatus {
  state: CsatState;
  sentTo: string | null;
  sentFrom: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  // The latest unanswered link has passed its expiry: the customer can no longer answer it.
  expired: boolean;
  // Set when the answer that satisfies the gate came from another project of the same account.
  viaProjectId: string | null;
  viaProjectName: string | null;
}

export interface CsatActor {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface CsatAnswers {
  overall: number;
  migrationQuality: number;
  support: number;
  onboarding: number;
  wentWell: boolean;
  comments: string;
}

interface CsatRequestRow {
  id: string;
  project_id: string;
  recipient_email: string;
  recipient_name: string | null;
  project_label: string | null;
  sent_from: string | null;
  sent_at: Date;
  expires_at: Date;
  responded_at: Date | null;
  revoked_at: Date | null;
  // Computed in SQL against the DB clock (expires_at is TIMESTAMP without time zone).
  expired: boolean;
}

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Phase codes are settings-driven and stored upper-cased; only DELTA is gated, from any other phase.
export function isEnteringDelta(fromPhase: string | null | undefined, toPhase: string | null | undefined): boolean {
  return (toPhase || '').toUpperCase() === 'DELTA' && (fromPhase || '').toUpperCase() !== 'DELTA';
}

function toStatus(row: CsatRequestRow | undefined): CsatStatus {
  if (!row) return { state: 'none', sentTo: null, sentFrom: null, sentAt: null, respondedAt: null, expired: false, viaProjectId: null, viaProjectName: null };
  return {
    state: row.responded_at ? 'responded' : 'pending',
    sentTo: row.recipient_email,
    sentFrom: row.sent_from,
    sentAt: new Date(row.sent_at).toISOString(),
    respondedAt: row.responded_at ? new Date(row.responded_at).toISOString() : null,
    expired: !row.responded_at && !!row.expired,
    viaProjectId: null,
    viaProjectName: null,
  };
}

// A customer account is projects.client_name, falling back to the project name (the same key
// All Projects groups by); customer_name is usually a contact person. One answered survey covers
// every project of the account (e.g. its content, email and messaging migrations).
const ACCOUNT_KEY = `LOWER(TRIM(COALESCE(NULLIF(TRIM(p.client_name), ''), p.name)))`;
const ACCOUNT_ANSWER_SQL = `
  SELECT r.*, FALSE AS expired, p.name AS via_project_name
  FROM csat_requests r JOIN projects p ON p.id = r.project_id
  WHERE r.responded_at IS NOT NULL AND r.revoked_at IS NULL
    AND ${ACCOUNT_KEY} = (SELECT ${ACCOUNT_KEY} FROM projects p WHERE p.id = $1)
  ORDER BY r.responded_at DESC LIMIT 1`;

function validRating(value: unknown, field: string): number {
  if (value === undefined || value === null || value === '') throw new AppError(`${field} is required`, 400);
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new AppError(`${field} must be a whole number from 1 to 10`, 400);
  return n;
}

interface SurveyEmailInput {
  customerName: string;
  projectName: string;
  message: string;
  senderName: string;
  link: string;
  // Set for the copy CC'd colleagues get: the customer's address, and no live link in the email.
  internalCopyFor?: string;
}

// One builder for the real email, the PM's preview and the internal copy, so all three match.
function buildSurveyEmail(input: SurveyEmailInput): { subject: string; html: string } {
  const greeting = input.customerName ? `Dear ${escapeHtml(input.customerName)},` : 'Hello,';
  const internal = input.internalCopyFor;
  const banner = internal
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;background:#FEF3C7;border-left:4px solid #D97706;border-radius:6px;">
        <tr><td style="padding:12px 16px;font-size:13px;color:#78350F;">
          <strong>Internal copy.</strong> This survey was sent to <strong>${escapeHtml(internal)}</strong> by ${escapeHtml(input.senderName)}.
          The survey link has been removed from this copy: only the customer can answer.
        </td></tr>
      </table>`
    : '';
  const action = internal
    ? `<p style="margin:24px 0;padding:14px;border:1px dashed #cbd5e1;border-radius:8px;color:#64748b;font-size:13px;text-align:center;">The customer's &ldquo;Share your feedback&rdquo; button appears here.</p>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:24px auto;">
        <tr><td style="background:${CLOUDFUZE_BLUE};border-radius:8px;">
          <a href="${input.link}" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;">Share your feedback</a>
        </td></tr>
      </table>
      <p style="margin:0 0 20px 0;color:#64748b;font-size:12px;text-align:center;">This link is unique to you and can be used once. It expires in ${TOKEN_TTL_DAYS} days.</p>`;
  const intro = `<p style="margin:0 0 16px 0;">${escapeHtml(input.message || DEFAULT_INTRO).replace(/\n/g, '<br>')}</p>`;
  const body = `
      ${banner}
      <p style="margin:0 0 16px 0;">${greeting}</p>
      ${intro}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px 0;background:#E8EDFA;border-left:4px solid ${CLOUDFUZE_BLUE};border-radius:6px;">
        <tr><td style="padding:12px 16px;font-size:14px;color:#334155;">
          <span style="display:block;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${CLOUDFUZE_BLUE};">Project</span>
          <strong>${escapeHtml(input.projectName)}</strong>
        </td></tr>
      </table>
      <p style="margin:0 0 8px 0;">The survey takes approximately two minutes and covers the following:</p>
      <ul style="margin:0 0 4px 0;padding-left:20px;">
        <li>Your overall satisfaction with the migration</li>
        <li>The quality of the migrated data</li>
        <li>Support and communication from our team</li>
        <li>The onboarding and kickoff experience</li>
        <li>A short comment on your experience</li>
      </ul>
      ${action}
      <p style="margin:0 0 16px 0;">Thank you for your time and for your continued trust in CloudFuze. We look forward to completing your migration successfully.</p>
      <p style="margin:0;">Kind regards,<br><strong style="color:${CLOUDFUZE_BLUE};">${escapeHtml(input.senderName)}</strong><br>CloudFuze</p>`;
  return {
    subject: `${internal ? '[Internal copy] ' : ''}Your feedback on ${input.projectName} | CloudFuze`,
    html: customerEmail('We value your feedback', body),
  };
}

// CC is for colleagues only: they get a copy without the link (see buildSurveyEmail), and an
// external address must not receive the customer's survey email at all.
function validCcList(value: unknown, recipientEmail: string, actorEmail: string | undefined): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new AppError('CC must be a list of email addresses', 400);
  const cc = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'string') throw new AppError('CC must be a list of email addresses', 400);
    const addr = raw.trim().toLowerCase();
    if (!addr || addr === recipientEmail) continue;
    if (!EMAIL_RE.test(addr)) throw new AppError(`CC address "${addr}" is not a valid email address`, 400);
    if (isBlockedRecipient(addr)) throw new AppError(`CC address ${addr} cannot receive emails from the tracker`, 400);
    if (!isInternalRecipient(addr, actorEmail)) throw new AppError(`CC is for internal CloudFuze people only: ${addr}`, 400);
    cc.add(addr);
  }
  if (cc.size > MAX_CC) throw new AppError(`CC at most ${MAX_CC} people`, 400);
  return [...cc];
}

function validCustomerName(value: unknown, fallback: string | null): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length > MAX_NAME_LENGTH) throw new AppError(`Customer name must be at most ${MAX_NAME_LENGTH} characters`, 400);
  return name || (fallback || '').trim();
}

// How the project is named to the customer; internal project names are often codes.
function validProjectLabel(value: unknown, fallback: string): string {
  const label = typeof value === 'string' ? value.trim() : '';
  if (label.length > MAX_PROJECT_LABEL_LENGTH) throw new AppError(`Project name must be at most ${MAX_PROJECT_LABEL_LENGTH} characters`, 400);
  return label || fallback;
}

class CsatService {
  private async latestRequest(projectId: string): Promise<CsatRequestRow | undefined> {
    const result = await query(
      // An answered request wins over any newer pending one: once the customer has answered
      // any live link, the gate is satisfied.
      `SELECT *, expires_at <= NOW() AS expired FROM csat_requests
       WHERE project_id = $1 AND revoked_at IS NULL
       ORDER BY (responded_at IS NOT NULL) DESC, sent_at DESC LIMIT 1`,
      [projectId]
    );
    return result.rows[0] as CsatRequestRow | undefined;
  }

  private async accountAnswer(projectId: string): Promise<(CsatRequestRow & { via_project_name: string }) | undefined> {
    const result = await query(ACCOUNT_ANSWER_SQL, [projectId]);
    const row = result.rows[0] as (CsatRequestRow & { via_project_name: string }) | undefined;
    return row?.responded_at ? row : undefined;
  }

  async getStatus(projectId: string): Promise<CsatStatus> {
    const own = await this.latestRequest(projectId);
    if (own?.responded_at) return toStatus(own);
    const answered = await this.accountAnswer(projectId);
    if (answered) {
      return { ...toStatus(answered), viaProjectId: answered.project_id, viaProjectName: answered.via_project_name };
    }
    return toStatus(own);
  }

  // The one gate for every path into DELTA (project edit and phase auto-advance).
  async assertCanEnterDelta(projectId: string): Promise<void> {
    // Rollout kill switch: lets PMs move stuck projects without a redeploy.
    if (GATE_OFF_VALUES.has((process.env.CSAT_DELTA_GATE || '').trim().toLowerCase())) return;
    const status = await this.getStatus(projectId);
    if (status.state === 'responded') return;
    throw new AppError(
      status.state === 'pending' && status.expired
        ? `The C-SAT survey sent to ${status.sentTo} has expired. Resend it; the project can move to Delta once the customer responds.`
        : status.state === 'pending'
        ? `Waiting for the customer to answer the C-SAT survey sent to ${status.sentTo}. The project can move to Delta once they respond.`
        : 'Send the customer a C-SAT survey first. The project can move to Delta once they respond.',
      409,
      'CSAT_REQUIRED',
      { csat: status }
    );
  }

  private async projectForSender(projectId: string, actor: CsatActor): Promise<{ id: string; name: string; customer_name: string | null; project_manager: string | null }> {
    const projectResult = await query(
      `SELECT id, name, customer_name, project_manager FROM projects WHERE id = $1`,
      [projectId]
    );
    const project = projectResult.rows[0];
    if (!project) throw new AppError('Project not found', 404);

    const sameName = (a: unknown, b: unknown) =>
      typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();
    const isOwnPm = actor.role === 'PROJECT_MANAGER' && sameName(project.project_manager, actor.name);
    if (actor.role !== 'ADMIN' && !isOwnPm) {
      throw new AppError('Only an admin or the project manager of this project can send its C-SAT survey', 403);
    }
    return project;
  }

  // What the customer will receive, for the PM to check before sending. The logo is inlined as a
  // data URI and the button goes nowhere: no token exists until the survey is actually sent.
  async previewRequest(
    projectId: string,
    input: { customerName?: string | null; projectName?: string | null; message?: string | null },
    actor: CsatActor
  ): Promise<{
    subject: string; html: string; customerName: string; projectName: string;
    defaultCustomerName: string | null; defaultProjectName: string; defaultMessage: string;
  }> {
    const project = await this.projectForSender(projectId, actor);
    const message = typeof input.message === 'string' ? input.message.trim() : '';
    if (message.length > MAX_MESSAGE_LENGTH) throw new AppError(`Message must be at most ${MAX_MESSAGE_LENGTH} characters`, 400);
    const customerName = validCustomerName(input.customerName, project.customer_name);
    const projectName = validProjectLabel(input.projectName, project.name);
    const { subject, html } = buildSurveyEmail({ customerName, projectName, message, senderName: actor.name, link: '#' });
    const logo = cloudfuzeLogoImage();
    return {
      subject,
      html: html.split(`cid:${logo.contentId}`).join(`data:${logo.contentType};base64,${logo.contentBase64}`),
      customerName,
      projectName,
      defaultCustomerName: project.customer_name ?? null,
      defaultProjectName: project.name,
      defaultMessage: DEFAULT_INTRO,
    };
  }

  async sendRequest(
    projectId: string,
    input: { recipientEmail: string; customerName?: string | null; projectName?: string | null; message?: string | null; cc?: unknown },
    actor: CsatActor
  ): Promise<CsatStatus> {
    const project = await this.projectForSender(projectId, actor);

    const recipientEmail = typeof input.recipientEmail === 'string' ? input.recipientEmail.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(recipientEmail)) throw new AppError('Enter a valid customer email address', 400);
    // emailService skips blocked addresses without an error, which would record a survey nobody received.
    if (isBlockedRecipient(recipientEmail)) throw new AppError('This address cannot receive emails from the tracker', 400);
    // The gate must prove the customer answered: a colleague's (or the PM's own) mailbox defeats it.
    if (isInternalRecipient(recipientEmail, actor.email)) {
      throw new AppError('Send the survey to the customer, not to an internal CloudFuze address', 400);
    }
    const message = typeof input.message === 'string' ? input.message.trim() : '';
    if (message.length > MAX_MESSAGE_LENGTH) throw new AppError(`Message must be at most ${MAX_MESSAGE_LENGTH} characters`, 400);
    const customerName = validCustomerName(input.customerName, project.customer_name);
    const projectName = validProjectLabel(input.projectName, project.name);
    const cc = validCcList(input.cc, recipientEmail, actor.email);

    const current = await this.getStatus(projectId);
    if (current.state === 'responded') throw new AppError(ALREADY_ANSWERED, 409);


    const token = crypto.randomBytes(32).toString('hex');
    const link = `${(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '')}/csat/${token}`;
    const { subject, html } = buildSurveyEmail({ customerName, projectName, message, senderName: actor.name, link });
    const inlineImages = [cloudfuzeLogoImage()];

    // Record first (revoking earlier unanswered links), then send; undo if the send fails so a
    // project never shows "waiting" for a survey the customer never received.
    const newId = await transaction(async (client) => {
      // One send per project at a time, so revocations, the daily cap and the answered
      // re-check below all see every earlier send.
      await client.query(`SELECT id FROM projects WHERE id = $1 FOR UPDATE`, [projectId]);
      const sendsToday = await client.query(
        `SELECT COUNT(*)::int AS sends FROM csat_requests WHERE project_id = $1 AND sent_at > NOW() - INTERVAL '1 day'`,
        [projectId]
      );
      if (Number(sendsToday.rows[0]?.sends ?? 0) >= MAX_SENDS_PER_DAY) {
        throw new AppError(`The survey was already sent ${MAX_SENDS_PER_DAY} times today for this project. Please try again tomorrow.`, 429);
      }
      const revoked = await client.query(
        `UPDATE csat_requests SET revoked_at = NOW()
         WHERE project_id = $1 AND revoked_at IS NULL AND responded_at IS NULL RETURNING id`,
        [projectId]
      );
      // Re-checked after the revoke has locked the unanswered rows: a customer answer that
      // committed since the check above must not be buried under a new pending request.
      const answered = await client.query(
        ACCOUNT_ANSWER_SQL,
        [projectId]
      );
      if (answered.rows.length > 0) throw new AppError(ALREADY_ANSWERED, 409);
      const inserted = await client.query(
        `INSERT INTO csat_requests (project_id, recipient_email, token_hash, sent_by, expires_at, recipient_name, project_label)
         VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::interval, $6, $7) RETURNING id`,
        [projectId, recipientEmail, hashToken(token), actor.id, String(TOKEN_TTL_DAYS), customerName || null,
         projectName !== project.name ? projectName : null]
      );
      return { id: inserted.rows[0].id as string, revokedIds: revoked.rows.map((r: { id: string }) => r.id) };
    });

    let sentFrom: string;
    try {
      try {
        await emailService.sendEmail({ to: recipientEmail, subject, html, from: actor.email, inlineImages });
        sentFrom = actor.email;
      } catch (err) {
        // Graph can be restricted to specific mailboxes (Azure application access policy).
        if (!(err instanceof GraphSendError) || (err.status !== 403 && err.status !== 404)) throw err;
        logger.warn(`[CSAT] Graph refused to send as ${actor.email} (${err.status}); falling back to the shared mailbox`);
        // No CC: the PM must never hold a copy of the customer's link.
        await emailService.sendEmail({ to: recipientEmail, replyTo: actor.email, subject, html, inlineImages });
        sentFrom = defaultFromAddress();
      }
    } catch (err) {
      await execute(`DELETE FROM csat_requests WHERE id = $1`, [newId.id]);
      if (newId.revokedIds.length > 0) {
        // Skip the restore when a newer send already replaced these links.
        await execute(
          `UPDATE csat_requests SET revoked_at = NULL
           WHERE id = ANY($1::uuid[])
             AND NOT EXISTS (SELECT 1 FROM csat_requests n WHERE n.project_id = $2 AND n.revoked_at IS NULL AND n.id <> ALL($1::uuid[]))`,
          [newId.revokedIds, projectId]
        );
      }
      logger.error(`[CSAT] Survey email for project ${projectId} failed: ${(err as Error).message}`);
      if (!isDeliveryFailure(err)) throw err;
      throw new AppError('The C-SAT email could not be sent. Please try again.', 503, 'EMAIL_SEND_FAILED');
    }

    await execute(`UPDATE csat_requests SET sent_from = $1 WHERE id = $2`, [sentFrom, newId.id]);
    logger.info(`[CSAT] Survey sent for project ${projectId} to ${recipientEmail} from ${sentFrom}`);

    // A separate email, so CC'd colleagues never hold the customer's one-time link. The survey
    // already went out, so a failure here is reported to the PM rather than undoing the send.
    let ccSent = false;
    if (cc.length > 0) {
      try {
        const copy = buildSurveyEmail({ customerName, projectName, message, senderName: actor.name, link: '#', internalCopyFor: recipientEmail });
        await emailService.sendEmail({
          to: cc[0], cc: cc.slice(1), subject: copy.subject, html: copy.html, inlineImages,
          ...(sentFrom === actor.email ? { from: actor.email } : { replyTo: actor.email }),
        });
        ccSent = true;
        logger.info(`[CSAT] Internal copy for project ${projectId} sent to ${cc.join(', ')}`);
      } catch (err) {
        logger.warn(`[CSAT] Internal copy for project ${projectId} failed: ${(err as Error).message}`);
      }
    }

    this.confirmToPm(actor, project.name, recipientEmail, sentFrom, cc, ccSent).catch((err: Error) =>
      logger.warn(`[CSAT] PM confirmation for project ${projectId} failed: ${err.message}`)
    );
    return this.getStatus(projectId);
  }

  // Link-free receipt for the PM, since the survey email itself is kept out of their mailbox.
  private async confirmToPm(
    actor: CsatActor, projectName: string, recipientEmail: string, sentFrom: string, cc: string[], ccSent: boolean
  ): Promise<void> {
    if (!actor.email) return;
    const ccList = cc.map(escapeHtml).join(', ');
    const ccLine = cc.length === 0 ? ''
      : ccSent
      ? `<p>An internal copy without the survey link was sent to ${ccList}.</p>`
      : `<p>The internal copy to ${ccList} could not be sent. The customer's survey was not affected.</p>`;
    const html = brandedEmail(
      'C-SAT survey sent',
      `<p>The C-SAT survey for <strong>${escapeHtml(projectName)}</strong> was sent to <strong>${escapeHtml(recipientEmail)}</strong>
       from ${escapeHtml(sentFrom)}. Customer replies to the email come to you.</p>
       ${ccLine}
       <p>You will be notified when the customer answers; the project can then move to Delta.</p>`
    );
    await emailService.sendEmail({ to: actor.email, subject: `C-SAT survey sent: ${projectName}`, html });
  }

  private async requestForToken(token: string): Promise<CsatRequestRow> {
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
      throw new AppError('This survey link is not valid.', 404);
    }
    const result = await query(`SELECT *, expires_at <= NOW() AS expired FROM csat_requests WHERE token_hash = $1`, [hashToken(token)]);
    const row = result.rows[0] as CsatRequestRow | undefined;
    if (!row) throw new AppError('This survey link is not valid.', 404);
    if (row.responded_at) throw new AppError('Thank you, this survey has already been answered.', 409);
    if (row.revoked_at) throw new AppError('This survey link has been replaced by a newer one. Please use the latest email from your project manager.', 410);
    if (row.expired) {
      throw new AppError('This survey link has expired. Please ask your project manager for a new one.', 410);
    }
    return row;
  }

  async getPublicForm(token: string): Promise<{ projectName: string; customerName: string | null }> {
    const row = await this.requestForToken(token);
    const result = await query(`SELECT name, customer_name FROM projects WHERE id = $1`, [row.project_id]);
    const project = result.rows[0];
    if (!project) throw new AppError('This survey link is not valid.', 404);
    return { projectName: row.project_label || project.name, customerName: row.recipient_name || project.customer_name || null };
  }

  async submitResponse(token: string, answers: CsatAnswers): Promise<void> {
    const row = await this.requestForToken(token);
    const overall = validRating(answers.overall, 'Overall rating');
    const migrationQuality = validRating(answers.migrationQuality, 'Migration quality rating');
    const support = validRating(answers.support, 'Support rating');
    const onboarding = validRating(answers.onboarding, 'Onboarding rating');
    if (typeof answers.wentWell !== 'boolean') throw new AppError('Please tell us whether the project went well', 400);
    const comments = typeof answers.comments === 'string' ? answers.comments.trim() : '';
    if (!comments) throw new AppError('Please share your feedback in the comments', 400);
    if (comments.length > MAX_COMMENT_LENGTH) throw new AppError(`Comments must be at most ${MAX_COMMENT_LENGTH} characters`, 400);

    const projectName = await transaction(async (client) => {
      // Guarded update: a concurrent second submit or a resend in between loses the race here.
      const claimed = await client.query(
        `UPDATE csat_requests SET responded_at = NOW(), went_well = $2
         WHERE id = $1 AND responded_at IS NULL AND revoked_at IS NULL RETURNING id`,
        [row.id, answers.wentWell]
      );
      if (claimed.rowCount === 0) throw new AppError('Thank you, this survey has already been answered.', 409);

      const project = (await client.query(`SELECT name, customer_name FROM projects WHERE id = $1`, [row.project_id])).rows[0];
      // Every answer is required since 2026-10-21, so the COALESCEs below only matter for a null
      // that cannot occur today. A first project-keyed row inherits only the legacy
      // (customer_name-keyed) entry's upsell/cross-sell signals, so it does not hide them; old
      // ratings are never presented as this survey's.
      await client.query(
        `INSERT INTO customer_success_entries
           (project_id, customer_name, csat_score, csat_migration_quality, csat_support_experience,
            csat_onboarding, csat_verbatim, csat_date,
            cf_migrate_signal, cf_migrate_signal_reason, cf_manage_signal, cf_manage_signal_reason,
            cf_ps_signal, cf_ps_signal_reason, cf_ms_signal, cf_ms_signal_reason, updated_at)
         SELECT $1, $2, $3, $4::numeric, $5::numeric, $6::numeric, $7::text, CURRENT_DATE,
                COALESCE(legacy.cf_migrate_signal, 'none'), legacy.cf_migrate_signal_reason,
                COALESCE(legacy.cf_manage_signal, 'none'), legacy.cf_manage_signal_reason,
                COALESCE(legacy.cf_ps_signal, 'none'), legacy.cf_ps_signal_reason,
                COALESCE(legacy.cf_ms_signal, 'none'), legacy.cf_ms_signal_reason,
                NOW()
         FROM (SELECT 1) AS one
         LEFT JOIN LATERAL (
           SELECT * FROM customer_success_entries
           WHERE project_id IS NULL AND LOWER(customer_name) = LOWER($2)
           ORDER BY updated_at DESC NULLS LAST LIMIT 1
         ) AS legacy ON TRUE
         ON CONFLICT (project_id) DO UPDATE SET
           csat_score              = EXCLUDED.csat_score,
           csat_migration_quality  = COALESCE($4::numeric, customer_success_entries.csat_migration_quality),
           csat_support_experience = COALESCE($5::numeric, customer_success_entries.csat_support_experience),
           csat_onboarding         = COALESCE($6::numeric, customer_success_entries.csat_onboarding),
           csat_verbatim           = COALESCE($7::text, customer_success_entries.csat_verbatim),
           csat_date               = EXCLUDED.csat_date,
           updated_at              = NOW()`,
        [row.project_id, project?.customer_name ?? null, overall, migrationQuality, support, onboarding, comments || null]
      );
      return (project?.name as string) || 'the project';
    });

    logger.info(`[CSAT] Customer responded for project ${row.project_id} (overall ${overall}/10)`);
    this.notifyPm(row.project_id, projectName, overall, answers.wentWell).catch((err: Error) =>
      logger.warn(`[CSAT] PM notification failed for project ${row.project_id}: ${err.message}`)
    );
  }

  private async notifyPm(projectId: string, projectName: string, overall: number | null, wentWell: boolean): Promise<void> {
    const result = await query(
      `SELECT DISTINCT u.email FROM users u
       WHERE u.email IS NOT NULL AND (
         u.id IN (SELECT sent_by FROM csat_requests WHERE project_id = $1 AND sent_by IS NOT NULL)
         OR LOWER(u.name) = (SELECT LOWER(project_manager) FROM projects WHERE id = $1)
       )`,
      [projectId]
    );
    const recipients = result.rows.map((r: { email: string }) => r.email);
    const html = brandedEmail(
      'Customer answered the C-SAT survey',
      `<p>The customer answered the C-SAT survey for <strong>${escapeHtml(projectName)}</strong>:
       overall <strong>${overall}/10</strong>, project went well: <strong>${wentWell ? 'Yes' : 'No'}</strong>.</p>
       <p>You can now move the project to the Delta phase.</p>`
    );
    await notificationService.createNotification('GENERAL', `C-SAT received: ${projectName}`, html, recipients, projectId);
  }
}

export const csatService = new CsatService();
