import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { auditService } from './auditService';
import { emailService, brandedEmail } from './emailService';

export interface HygieneScorecardSchedule {
  id: string;
  recipients: string[];
  scheduledAt: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
  createdBy: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

class HygieneScorecardService {
  private _tableReady = false;
  private _scheduleTableReady = false;

  private async ensureTable() {
    if (this._tableReady) return;
    await execute(`
      CREATE TABLE IF NOT EXISTS hygiene_scorecard_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sent_date DATE NOT NULL UNIQUE,
        recipient_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    this._tableReady = true;
  }

  private async ensureScheduleTable() {
    if (this._scheduleTableReady) return;
    await execute(`
      CREATE TABLE IF NOT EXISTS hygiene_scorecard_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipients TEXT[] NOT NULL,
        scheduled_at TIMESTAMPTZ NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        created_by VARCHAR(255),
        error_message TEXT,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    this._scheduleTableReady = true;
  }

  private async alreadySentToday(): Promise<boolean> {
    const result = await query(
      `SELECT id FROM hygiene_scorecard_logs WHERE sent_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date`
    );
    return result.rows.length > 0;
  }

  private async markSent(recipientCount: number): Promise<void> {
    await execute(
      `INSERT INTO hygiene_scorecard_logs (sent_date, recipient_count)
       VALUES ((NOW() AT TIME ZONE 'Asia/Kolkata')::date, $1)
       ON CONFLICT (sent_date) DO UPDATE SET recipient_count = EXCLUDED.recipient_count`,
      [recipientCount]
    );
  }

  private async getRecipients(): Promise<string[]> {
    const result = await query(
      `SELECT email FROM users WHERE role = 'MANAGER' AND is_active = true AND email IS NOT NULL AND email <> ''`
    );
    return result.rows.map((r: any) => r.email);
  }

  async buildScorecardRows(): Promise<any[]> {
    const board = await auditService.getHygieneBoard();
    const snapshot = await auditService.getYesterdayActivitySnapshot();
    return board.map((pm: any) => {
      const y = snapshot.get(pm.projectManager.toLowerCase().trim()) || {
        loggedInYesterday: false, updatedProjectYesterday: false, addedNoteYesterday: false,
      };
      return { ...pm, ...y };
    });
  }

  private scoreColor(score: number): string {
    if (score >= 80) return '#16a34a';
    if (score >= 50) return '#d97706';
    return '#dc2626';
  }

  private scoreCell(score: number): string {
    return `<td style="padding:8px 10px;text-align:center;font-weight:700;color:${this.scoreColor(score)};border-bottom:1px solid #f1f5f9;">${score}</td>`;
  }

  private boolCell(v: boolean): string {
    return `<td style="padding:8px 10px;text-align:center;border-bottom:1px solid #f1f5f9;">${v ? '&#9989;' : '&mdash;'}</td>`;
  }

  buildScorecardHtml(rows: any[]): string {
    const th = (label: string) =>
      `<th style="padding:8px 10px;font-size:12px;color:#64748b;text-align:center;border-bottom:2px solid #e2e8f0;white-space:nowrap;">${label}</th>`;

    const head = `<tr style="background:#f8faff;">
      <th style="padding:8px 10px;font-size:12px;color:#64748b;text-align:left;border-bottom:2px solid #e2e8f0;">Project Manager</th>
      ${th('Hygiene')}${th('Activity')}${th('Quality')}${th('Case Studies')}
      ${th('Delay Accountability')}${th('Date Integrity')}
      ${th('Logged In (Yesterday)')}${th('Updated Project (Yesterday)')}${th('Added Note (Yesterday)')}
    </tr>`;

    const body = rows.map((pm) => `<tr>
      <td style="padding:8px 10px;font-weight:600;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${pm.projectManager}</td>
      ${this.scoreCell(pm.hygieneScore)}
      ${this.scoreCell(pm.activityScore)}
      ${this.scoreCell(pm.qualityScore)}
      ${this.scoreCell(pm.caseStudyScore)}
      ${this.scoreCell(pm.delayScore)}
      ${this.scoreCell(pm.dateIntegrityScore)}
      ${this.boolCell(pm.loggedInYesterday)}
      ${this.boolCell(pm.updatedProjectYesterday)}
      ${this.boolCell(pm.addedNoteYesterday)}
    </tr>`).join('');

    const body_html = `
      <p style="font-size:13px;color:#64748b;margin:0 0 16px;">
        Daily hygiene snapshot — each project manager's activity yesterday, plus current delay-accountability
        and phase-date data-quality flags across their projects.
      </p>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">${head}${body}</table>
      </div>`;

    return brandedEmail('PMO Hygiene & Score Card', body_html);
  }

  /** Builds the current scorecard and emails it to an explicit recipient list. */
  private async sendScorecardTo(recipients: string[]): Promise<void> {
    const rows = await this.buildScorecardRows();
    if (rows.length === 0) {
      throw new Error('No PM hygiene data available');
    }
    const today = new Date().toISOString().slice(0, 10);
    const html = this.buildScorecardHtml(rows);
    await emailService.sendEmail({
      to: recipients,
      subject: `PMO Hygiene & Score Card — ${today}`,
      html,
    });
  }

  async sendDailyScorecard(force = false): Promise<{ sent: boolean; recipientCount: number; skippedReason?: string }> {
    await this.ensureTable();

    if (!force && await this.alreadySentToday()) {
      return { sent: false, recipientCount: 0, skippedReason: 'Already sent today' };
    }

    const recipients = await this.getRecipients();
    if (recipients.length === 0) {
      return { sent: false, recipientCount: 0, skippedReason: 'No manager recipients found' };
    }

    try {
      await this.sendScorecardTo(recipients);
    } catch (err: any) {
      return { sent: false, recipientCount: 0, skippedReason: err.message };
    }

    await this.markSent(recipients.length);
    logger.info(`Hygiene scorecard sent to ${recipients.length} manager(s)`);
    return { sent: true, recipientCount: recipients.length };
  }

  // ── Scheduled / ad-hoc sends ─────────────────────────────────────────

  async createSchedule(recipients: string[], scheduledAt: Date, createdBy: string): Promise<HygieneScorecardSchedule> {
    await this.ensureScheduleTable();
    const result = await execute(
      `INSERT INTO hygiene_scorecard_schedules (recipients, scheduled_at, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [recipients, scheduledAt.toISOString(), createdBy]
    );
    return this.mapScheduleRow(result.rows[0]);
  }

  async listSchedules(): Promise<HygieneScorecardSchedule[]> {
    await this.ensureScheduleTable();
    const result = await query(
      `SELECT * FROM hygiene_scorecard_schedules ORDER BY scheduled_at DESC LIMIT 50`
    );
    return result.rows.map((r: any) => this.mapScheduleRow(r));
  }

  async cancelSchedule(id: string): Promise<HygieneScorecardSchedule | null> {
    await this.ensureScheduleTable();
    const result = await execute(
      `UPDATE hygiene_scorecard_schedules SET status = 'CANCELLED'
       WHERE id = $1 AND status = 'PENDING' RETURNING *`,
      [id]
    );
    return result.rows[0] ? this.mapScheduleRow(result.rows[0]) : null;
  }

  /** Sends every due, still-pending schedule. Called by the cron poller. */
  async processPendingSchedules(): Promise<{ sent: number; failed: number }> {
    await this.ensureScheduleTable();
    const due = await query(
      `SELECT * FROM hygiene_scorecard_schedules WHERE status = 'PENDING' AND scheduled_at <= NOW()`
    );

    let sent = 0;
    let failed = 0;
    for (const row of due.rows) {
      const schedule = this.mapScheduleRow(row);
      try {
        await this.sendScorecardTo(schedule.recipients);
        await execute(
          `UPDATE hygiene_scorecard_schedules SET status = 'SENT', sent_at = NOW() WHERE id = $1`,
          [schedule.id]
        );
        logger.info(`Scheduled hygiene scorecard sent to ${schedule.recipients.length} recipient(s) (schedule ${schedule.id})`);
        sent++;
      } catch (err: any) {
        await execute(
          `UPDATE hygiene_scorecard_schedules SET status = 'FAILED', error_message = $2 WHERE id = $1`,
          [schedule.id, err.message]
        );
        logger.error(`Scheduled hygiene scorecard send failed (schedule ${schedule.id}): ${err.message}`);
        failed++;
      }
    }
    return { sent, failed };
  }

  private mapScheduleRow(row: any): HygieneScorecardSchedule {
    return {
      id: row.id,
      recipients: row.recipients,
      scheduledAt: row.scheduled_at,
      status: row.status,
      createdBy: row.created_by,
      errorMessage: row.error_message,
      sentAt: row.sent_at,
      createdAt: row.created_at,
    };
  }
}

export const hygieneScorecardService = new HygieneScorecardService();
