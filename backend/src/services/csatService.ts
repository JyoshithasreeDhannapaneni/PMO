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
const MAX_COMMENT_LENGTH = 4000;
const MAX_SENDS_PER_DAY = 5;
const ALREADY_ANSWERED = 'The customer has already answered the C-SAT survey for this project';

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
}

export interface CsatActor {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface CsatAnswers {
  overall: number;
  migrationQuality?: number | null;
  support?: number | null;
  onboarding?: number | null;
  wentWell: boolean;
  comments?: string | null;
}

interface CsatRequestRow {
  id: string;
  project_id: string;
  recipient_email: string;
  recipient_name: string | null;
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
  if (!row) return { state: 'none', sentTo: null, sentFrom: null, sentAt: null, respondedAt: null, expired: false };
  return {
    state: row.responded_at ? 'responded' : 'pending',
    sentTo: row.recipient_email,
    sentFrom: row.sent_from,
    sentAt: new Date(row.sent_at).toISOString(),
    respondedAt: row.responded_at ? new Date(row.responded_at).toISOString() : null,
    expired: !row.responded_at && !!row.expired,
  };
}

function validRating(value: unknown, field: string, required: boolean): number | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new AppError(`${field} is required`, 400);
    return null;
  }
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
}

// One builder for the real email and the PM's preview, so the preview is exactly what is sent.
function buildSurveyEmail(input: SurveyEmailInput): { subject: string; html: string } {
  const greetingName = input.customerName ? escapeHtml(input.customerName) : 'there';
  const intro = input.message
    ? `<p style="margin:0 0 16px 0;">${escapeHtml(input.message).replace(/\n/g, '<br>')}</p>`
    : `<p style="margin:0 0 16px 0;">Your migration has finished its one-time migration phase. Before we move on to the delta phase, we'd love to hear how it went. Your feedback helps us make every CloudFuze migration better.</p>`;
  const body = `
      <p style="margin:0 0 16px 0;">Hi ${greetingName},</p>
      ${intro}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px 0;background:#E8EDFA;border-left:4px solid ${CLOUDFUZE_BLUE};border-radius:6px;">
        <tr><td style="padding:12px 16px;font-size:14px;color:#334155;">
          <span style="display:block;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${CLOUDFUZE_BLUE};">Project</span>
          <strong>${escapeHtml(input.projectName)}</strong>
        </td></tr>
      </table>
      <p style="margin:0;">It takes about a minute: rate the migration from 1 to 10 and tell us if it went well.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:24px auto;">
        <tr><td style="background:${CLOUDFUZE_BLUE};border-radius:8px;">
          <a href="${input.link}" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;">Rate your migration</a>
        </td></tr>
      </table>
      <p style="margin:0 0 20px 0;color:#64748b;font-size:12px;text-align:center;">This link is personal to you and works once. It expires in ${TOKEN_TTL_DAYS} days.</p>
      <p style="margin:0;">Thank you,<br><strong style="color:${CLOUDFUZE_BLUE};">${escapeHtml(input.senderName)}</strong><br>CloudFuze</p>`;
  return {
    subject: `How did your CloudFuze migration go? — ${input.projectName}`,
    html: customerEmail('How did your migration go?', body),
  };
}

function validCustomerName(value: unknown, fallback: string | null): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length > MAX_NAME_LENGTH) throw new AppError(`Customer name must be at most ${MAX_NAME_LENGTH} characters`, 400);
  return name || (fallback || '').trim();
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

  async getStatus(projectId: string): Promise<CsatStatus> {
    return toStatus(await this.latestRequest(projectId));
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
    input: { customerName?: string | null; message?: string | null },
    actor: CsatActor
  ): Promise<{ subject: string; html: string; customerName: string; defaultCustomerName: string | null }> {
    const project = await this.projectForSender(projectId, actor);
    const message = typeof input.message === 'string' ? input.message.trim() : '';
    if (message.length > MAX_MESSAGE_LENGTH) throw new AppError(`Message must be at most ${MAX_MESSAGE_LENGTH} characters`, 400);
    const customerName = validCustomerName(input.customerName, project.customer_name);
    const { subject, html } = buildSurveyEmail({ customerName, projectName: project.name, message, senderName: actor.name, link: '#' });
    const logo = cloudfuzeLogoImage();
    return {
      subject,
      html: html.split(`cid:${logo.contentId}`).join(`data:${logo.contentType};base64,${logo.contentBase64}`),
      customerName,
      defaultCustomerName: project.customer_name ?? null,
    };
  }

  async sendRequest(
    projectId: string,
    input: { recipientEmail: string; customerName?: string | null; message?: string | null },
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

    const current = await this.latestRequest(projectId);
    if (current?.responded_at) throw new AppError(ALREADY_ANSWERED, 409);


    const token = crypto.randomBytes(32).toString('hex');
    const link = `${(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '')}/csat/${token}`;
    const { subject, html } = buildSurveyEmail({ customerName, projectName: project.name, message, senderName: actor.name, link });
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
        `SELECT id FROM csat_requests WHERE project_id = $1 AND responded_at IS NOT NULL AND revoked_at IS NULL LIMIT 1`,
        [projectId]
      );
      if (answered.rows.length > 0) throw new AppError(ALREADY_ANSWERED, 409);
      const inserted = await client.query(
        `INSERT INTO csat_requests (project_id, recipient_email, token_hash, sent_by, expires_at, recipient_name)
         VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::interval, $6) RETURNING id`,
        [projectId, recipientEmail, hashToken(token), actor.id, String(TOKEN_TTL_DAYS), customerName || null]
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
    this.confirmToPm(actor, project.name, recipientEmail, sentFrom).catch((err: Error) =>
      logger.warn(`[CSAT] PM confirmation for project ${projectId} failed: ${err.message}`)
    );
    return this.getStatus(projectId);
  }

  // Link-free receipt for the PM, since the survey email itself is kept out of their mailbox.
  private async confirmToPm(actor: CsatActor, projectName: string, recipientEmail: string, sentFrom: string): Promise<void> {
    if (!actor.email) return;
    const html = brandedEmail(
      'C-SAT survey sent',
      `<p>The C-SAT survey for <strong>${escapeHtml(projectName)}</strong> was sent to <strong>${escapeHtml(recipientEmail)}</strong>
       from ${escapeHtml(sentFrom)}. Customer replies to the email come to you.</p>
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
    return { projectName: project.name, customerName: row.recipient_name || project.customer_name || null };
  }

  async submitResponse(token: string, answers: CsatAnswers): Promise<void> {
    const row = await this.requestForToken(token);
    const overall = validRating(answers.overall, 'Overall rating', true);
    const migrationQuality = validRating(answers.migrationQuality, 'Migration quality rating', false);
    const support = validRating(answers.support, 'Support rating', false);
    const onboarding = validRating(answers.onboarding, 'Onboarding rating', false);
    if (typeof answers.wentWell !== 'boolean') throw new AppError('Please tell us whether the project went well', 400);
    const comments = (answers.comments || '').trim();
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
      // Answers the customer skipped keep this project's values already on file. A first
      // project-keyed row inherits only the legacy (customer_name-keyed) entry's upsell/cross-sell
      // signals, so it does not hide them; old ratings are never presented as this survey's.
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
