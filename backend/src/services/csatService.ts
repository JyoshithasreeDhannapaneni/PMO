import crypto from 'crypto';
import { query, execute, transaction } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { emailService, brandedEmail, GraphSendError } from './emailService';
import { notificationService } from './notificationService';

// A project may enter DELTA only after the customer has answered the C-SAT survey sent by its
// PM (2026-10-13 product decision). The survey link is the only credential the customer gets,
// so only its sha256 is stored; the raw token exists solely in the email.
const TOKEN_TTL_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_COMMENT_LENGTH = 4000;

export type CsatState = 'none' | 'pending' | 'responded';

export interface CsatStatus {
  state: CsatState;
  sentTo: string | null;
  sentFrom: string | null;
  sentAt: string | null;
  respondedAt: string | null;
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
  sent_from: string | null;
  sent_at: Date;
  expires_at: Date;
  responded_at: Date | null;
  revoked_at: Date | null;
}

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Phase codes are settings-driven and stored upper-cased; only DELTA is gated, from any other phase.
export function isEnteringDelta(fromPhase: string | null | undefined, toPhase: string | null | undefined): boolean {
  return (toPhase || '').toUpperCase() === 'DELTA' && (fromPhase || '').toUpperCase() !== 'DELTA';
}

function toStatus(row: CsatRequestRow | undefined): CsatStatus {
  if (!row) return { state: 'none', sentTo: null, sentFrom: null, sentAt: null, respondedAt: null };
  return {
    state: row.responded_at ? 'responded' : 'pending',
    sentTo: row.recipient_email,
    sentFrom: row.sent_from,
    sentAt: new Date(row.sent_at).toISOString(),
    respondedAt: row.responded_at ? new Date(row.responded_at).toISOString() : null,
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

class CsatService {
  private async latestRequest(projectId: string): Promise<CsatRequestRow | undefined> {
    const result = await query(
      `SELECT * FROM csat_requests WHERE project_id = $1 AND revoked_at IS NULL ORDER BY sent_at DESC LIMIT 1`,
      [projectId]
    );
    return result.rows[0] as CsatRequestRow | undefined;
  }

  async getStatus(projectId: string): Promise<CsatStatus> {
    return toStatus(await this.latestRequest(projectId));
  }

  // The one gate for every path into DELTA (project edit and phase auto-advance).
  async assertCanEnterDelta(projectId: string): Promise<void> {
    const status = await this.getStatus(projectId);
    if (status.state === 'responded') return;
    throw new AppError(
      status.state === 'pending'
        ? `Waiting for the customer to answer the C-SAT survey sent to ${status.sentTo}. The project can move to Delta once they respond.`
        : 'Send the customer a C-SAT survey first. The project can move to Delta once they respond.',
      409,
      'CSAT_REQUIRED',
      { csat: status }
    );
  }

  async sendRequest(
    projectId: string,
    input: { recipientEmail: string; message?: string | null },
    actor: CsatActor
  ): Promise<CsatStatus> {
    const projectResult = await query(
      `SELECT id, name, customer_name, project_manager FROM projects WHERE id = $1`,
      [projectId]
    );
    const project = projectResult.rows[0];
    if (!project) throw new AppError('Project not found', 404);

    const isOwnPm = actor.role === 'PROJECT_MANAGER' && project.project_manager === actor.name;
    if (actor.role !== 'ADMIN' && !isOwnPm) {
      throw new AppError('Only an admin or the project manager of this project can send its C-SAT survey', 403);
    }

    const recipientEmail = (input.recipientEmail || '').trim().toLowerCase();
    if (!EMAIL_RE.test(recipientEmail)) throw new AppError('Enter a valid customer email address', 400);
    const message = (input.message || '').trim();
    if (message.length > MAX_MESSAGE_LENGTH) throw new AppError(`Message must be at most ${MAX_MESSAGE_LENGTH} characters`, 400);

    const current = await this.latestRequest(projectId);
    if (current?.responded_at) throw new AppError('The customer has already answered the C-SAT survey for this project', 409);

    const token = crypto.randomBytes(32).toString('hex');
    const link = `${(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '')}/csat/${token}`;
    const customer = escapeHtml(project.customer_name || 'there');
    const body = `
      <p>Hi ${customer},</p>
      ${message ? `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>` : `<p>Your migration project <strong>${escapeHtml(project.name)}</strong> has finished its one-time migration. Before we move on to the delta phase, we'd love to hear how it went.</p>`}
      <p>It takes about a minute:</p>
      <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600">Rate your migration</a></p>
      <p style="color:#6b7280;font-size:12px">This link is personal to you and works once. It expires in ${TOKEN_TTL_DAYS} days.</p>
      <p>Thank you,<br>${escapeHtml(actor.name)}<br>CloudFuze</p>`;
    const html = brandedEmail('How did your migration go?', body);
    const subject = `How did your CloudFuze migration go? — ${project.name}`;

    // Record first (revoking earlier unanswered links), then send; undo if the send fails so a
    // project never shows "waiting" for a survey the customer never received.
    const newId = await transaction(async (client) => {
      const revoked = await client.query(
        `UPDATE csat_requests SET revoked_at = NOW()
         WHERE project_id = $1 AND revoked_at IS NULL AND responded_at IS NULL RETURNING id`,
        [projectId]
      );
      const inserted = await client.query(
        `INSERT INTO csat_requests (project_id, recipient_email, token_hash, sent_by, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::interval) RETURNING id`,
        [projectId, recipientEmail, hashToken(token), actor.id, String(TOKEN_TTL_DAYS)]
      );
      return { id: inserted.rows[0].id as string, revokedIds: revoked.rows.map((r: { id: string }) => r.id) };
    });

    let sentFrom: string;
    try {
      try {
        await emailService.sendEmail({ to: recipientEmail, subject, html, from: actor.email });
        sentFrom = actor.email;
      } catch (err) {
        // Graph can be restricted to specific mailboxes (Azure application access policy).
        if (!(err instanceof GraphSendError) || (err.status !== 403 && err.status !== 404)) throw err;
        logger.warn(`[CSAT] Graph refused to send as ${actor.email} (${err.status}); falling back to the shared mailbox`);
        await emailService.sendEmail({ to: recipientEmail, cc: actor.email, replyTo: actor.email, subject, html });
        sentFrom = process.env.ALERT_FROM_EMAIL || 'shared mailbox';
      }
    } catch (err) {
      await execute(`DELETE FROM csat_requests WHERE id = $1`, [newId.id]);
      if (newId.revokedIds.length > 0) {
        await execute(`UPDATE csat_requests SET revoked_at = NULL WHERE id = ANY($1::uuid[])`, [newId.revokedIds]);
      }
      logger.error(`[CSAT] Survey email for project ${projectId} failed: ${(err as Error).message}`);
      throw new AppError('The C-SAT email could not be sent. Please try again.', 502);
    }

    await execute(`UPDATE csat_requests SET sent_from = $1 WHERE id = $2`, [sentFrom, newId.id]);
    logger.info(`[CSAT] Survey sent for project ${projectId} to ${recipientEmail} from ${sentFrom}`);
    return this.getStatus(projectId);
  }

  private async requestForToken(token: string): Promise<CsatRequestRow> {
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
      throw new AppError('This survey link is not valid.', 404);
    }
    const result = await query(`SELECT * FROM csat_requests WHERE token_hash = $1`, [hashToken(token)]);
    const row = result.rows[0] as CsatRequestRow | undefined;
    if (!row) throw new AppError('This survey link is not valid.', 404);
    if (row.responded_at) throw new AppError('Thank you, this survey has already been answered.', 409);
    if (row.revoked_at) throw new AppError('This survey link has been replaced by a newer one. Please use the latest email from your project manager.', 410);
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw new AppError('This survey link has expired. Please ask your project manager for a new one.', 410);
    }
    return row;
  }

  async getPublicForm(token: string): Promise<{ projectName: string; customerName: string | null }> {
    const row = await this.requestForToken(token);
    const result = await query(`SELECT name, customer_name FROM projects WHERE id = $1`, [row.project_id]);
    const project = result.rows[0];
    if (!project) throw new AppError('This survey link is not valid.', 404);
    return { projectName: project.name, customerName: project.customer_name ?? null };
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
      await client.query(
        `INSERT INTO customer_success_entries
           (project_id, customer_name, csat_score, csat_migration_quality, csat_support_experience,
            csat_onboarding, csat_verbatim, csat_date, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, NOW())
         ON CONFLICT (project_id) DO UPDATE SET
           csat_score              = EXCLUDED.csat_score,
           csat_migration_quality  = EXCLUDED.csat_migration_quality,
           csat_support_experience = EXCLUDED.csat_support_experience,
           csat_onboarding         = EXCLUDED.csat_onboarding,
           csat_verbatim           = EXCLUDED.csat_verbatim,
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
