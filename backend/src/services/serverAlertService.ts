import { query, execute } from '../config/database';
import { logger } from '../utils/logger';

interface AlertProject {
  id: string;
  name: string;
  customerName: string;
  customerContact: string;
  accountManager: string;
  plannedStart: Date;
  plannedEnd: Date;
  status: string;
}

type AlertType = 'active' | 'warning' | 'overdue';

class ServerAlertService {
  async ensureTable() {
    await execute(`
      CREATE TABLE IF NOT EXISTS server_alert_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL,
        alert_type VARCHAR(20) NOT NULL,
        sent_to VARCHAR(500) NOT NULL,
        days_remaining INTEGER,
        days_overdue INTEGER,
        success BOOLEAN DEFAULT true,
        error_message TEXT,
        sent_at TIMESTAMP DEFAULT NOW()
      )
    `);
    try { await execute(`CREATE INDEX IF NOT EXISTS idx_alert_logs_project ON server_alert_logs(project_id)`); } catch {}
    try { await execute(`CREATE INDEX IF NOT EXISTS idx_alert_logs_sent_at ON server_alert_logs(sent_at)`); } catch {}
  }

  private daysBetween(from: Date, to: Date): number {
    const a = new Date(from); a.setHours(0,0,0,0);
    const b = new Date(to);   b.setHours(0,0,0,0);
    return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  }

  private async alreadySentToday(projectId: string, alertType: AlertType): Promise<boolean> {
    const result = await query(
      `SELECT id FROM server_alert_logs
       WHERE project_id = $1 AND alert_type = $2
         AND DATE(sent_at) = CURRENT_DATE AND success = true`,
      [projectId, alertType]
    );
    return result.rows.length > 0;
  }

  getAlertType(plannedStart: Date, plannedEnd: Date): { type: AlertType | null; daysRemaining: number; daysFromKickoff: number } {
    const today = new Date();
    const daysRemaining = this.daysBetween(today, plannedEnd);
    const daysFromKickoff = this.daysBetween(plannedStart, today);

    let type: AlertType | null = null;
    if (daysRemaining < 0) {
      type = 'overdue';
    } else if (daysRemaining <= 7) {
      type = 'warning';
    } else if (daysFromKickoff >= 0 && daysFromKickoff % 7 === 0) {
      type = 'active';
    }
    return { type, daysRemaining, daysFromKickoff };
  }

  private fmt(d: Date) {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  private row(label: string, value: string) {
    return `<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#64748b;font-size:13px;">${label}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;font-size:13px;">${value}</td></tr>`;
  }

  private buildEmail(type: AlertType, p: AlertProject, daysRemaining: number): { subject: string; html: string } {
    const start = this.fmt(p.plannedStart);
    const end = this.fmt(p.plannedEnd);
    const daysElapsed = this.daysBetween(p.plannedStart, new Date());
    const daysOverdue = Math.abs(daysRemaining);
    const am = p.accountManager || 'Account Manager';

    if (type === 'active') {
      return {
        subject: `Active — ${p.name} — Server usage update: ${daysRemaining} days remaining in your SOW`,
        html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#fff;">
  <div style="background:#2563eb;padding:24px 32px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:20px;">Server Usage Update</h2>
    <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px;">${p.name}</p>
  </div>
  <div style="padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="color:#1e293b;margin:0 0 20px;">Hi ${p.customerName},</p>
    <p style="color:#475569;margin:0 0 24px;">This is your daily usage update for the ongoing migration project under your Statement of Work (SOW).</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      ${this.row('Project name', p.name)}
      ${this.row('SOW start date', start)}
      ${this.row('SOW end date', end)}
      ${this.row('Days elapsed', `${daysElapsed} days`)}
      ${this.row('Days remaining', `${daysRemaining} days`)}
      ${this.row('Status', '<span style="color:#16a34a;font-weight:700;">On track</span>')}
    </table>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="color:#15803d;margin:0;font-size:13px;">Your server usage is currently within the agreed SOW period. Please ensure your migration activities are progressing as planned to avoid overage charges once the SOW window closes.</p>
    </div>
    <p style="color:#475569;font-size:13px;">If you anticipate needing additional time or server capacity beyond <strong>${end}</strong>, please reach out to your account manager at the earliest to explore extension options.</p>
    <p style="color:#475569;margin:24px 0 0;font-size:13px;">Best regards,<br><strong>${am}</strong><br>CloudFuze Customer Success | <a href="mailto:migrations@cloudfuze.com" style="color:#2563eb;">migrations@cloudfuze.com</a></p>
  </div>
</div>`,
      };
    }

    if (type === 'warning') {
      return {
        subject: `Action needed — ${p.name} — Only ${daysRemaining} days left before overages apply`,
        html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#fff;">
  <div style="background:#d97706;padding:24px 32px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:20px;">&#9888;&#65039; Urgent — SOW Expiring Soon</h2>
    <p style="color:#fef3c7;margin:4px 0 0;font-size:13px;">${p.name}</p>
  </div>
  <div style="padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="color:#1e293b;margin:0 0 20px;">Hi ${p.customerName},</p>
    <p style="color:#475569;margin:0 0 24px;">This is an urgent daily reminder that your SOW window is approaching its end date. Server usage beyond <strong>${end}</strong> will incur overage charges.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      ${this.row('Project name', p.name)}
      ${this.row('SOW end date', end)}
      ${this.row('Days remaining', `<span style="color:#d97706;font-weight:700;">${daysRemaining} days</span>`)}
      ${this.row('Status', '<span style="color:#d97706;font-weight:700;">Expiring soon</span>')}
    </table>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="color:#92400e;margin:0 0 12px;font-weight:600;">We strongly recommend:</p>
      <ol style="color:#92400e;margin:0;padding-left:20px;font-size:13px;line-height:1.8;">
        <li>Reviewing your current migration progress and identifying any blockers.</li>
        <li>Contacting your account manager to discuss an SOW extension if needed.</li>
        <li>Prioritising critical data migrations within the remaining window.</li>
      </ol>
    </div>
    <p style="color:#475569;font-size:13px;">Please take immediate action to avoid unexpected costs. Our team is available to assist you.</p>
    <p style="color:#475569;margin:24px 0 0;font-size:13px;">Best regards,<br><strong>${am}</strong><br>CloudFuze Customer Success | <a href="mailto:migrations@cloudfuze.com" style="color:#2563eb;">migrations@cloudfuze.com</a></p>
  </div>
</div>`,
      };
    }

    return {
      subject: `Overdue — ${p.name} — SOW expired ${daysOverdue} days ago — overages are being applied`,
      html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#fff;">
  <div style="background:#dc2626;padding:24px 32px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:20px;">&#128680; SOW Expired — Overages Active</h2>
    <p style="color:#fecaca;margin:4px 0 0;font-size:13px;">${p.name}</p>
  </div>
  <div style="padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="color:#1e293b;margin:0 0 20px;">Hi ${p.customerName},</p>
    <p style="color:#475569;margin:0 0 24px;">Your Statement of Work (SOW) for this project has passed its agreed end date. As per the terms of your agreement, overage charges are now being applied for continued server usage.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      ${this.row('Project name', p.name)}
      ${this.row('SOW end date', end)}
      ${this.row('Days overdue', `<span style="color:#dc2626;font-weight:700;">${daysOverdue} days</span>`)}
      ${this.row('Status', '<span style="color:#dc2626;font-weight:700;">Overdue — charges active</span>')}
    </table>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="color:#991b1b;margin:0 0 12px;font-weight:600;">To stop overage charges, please take one of the following actions at the earliest:</p>
      <ol style="color:#991b1b;margin:0;padding-left:20px;font-size:13px;line-height:1.8;">
        <li>Complete the migration and decommission server usage, or</li>
        <li>Sign an SOW extension with your account manager to formalise the additional usage period.</li>
      </ol>
    </div>
    <p style="color:#475569;font-size:13px;">If you have already taken action or believe this notification is in error, please contact your account manager or reply to this email immediately.</p>
    <p style="color:#475569;font-size:13px;margin-top:12px;">We value your partnership and want to resolve this quickly — our team is available to assist at any time.</p>
    <p style="color:#475569;margin:24px 0 0;font-size:13px;">Best regards,<br><strong>${am}</strong><br>CloudFuze Customer Success | <a href="mailto:migrations@cloudfuze.com" style="color:#2563eb;">migrations@cloudfuze.com</a></p>
  </div>
</div>`,
    };
  }

  private async resolveTenantId(): Promise<string> {
    const configured = process.env.MICROSOFT_TENANT_ID;
    if (configured && configured !== 'common') return configured;
    // Auto-discover from email domain
    try {
      const fromEmail = process.env.ALERT_FROM_EMAIL || 'Bharath.Tummaganti@cloudfuze.com';
      const domain = fromEmail.split('@')[1];
      const res = await fetch(`https://login.microsoftonline.com/${domain}/.well-known/openid-configuration`);
      const data = await res.json() as any;
      const match = (data.token_endpoint as string)?.match(/\/([a-f0-9-]{36})\//);
      if (match?.[1]) return match[1];
    } catch {}
    return 'common';
  }

  private async sendViaGraph(to: string, subject: string, html: string): Promise<void> {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const fromEmail = process.env.ALERT_FROM_EMAIL || 'Bharath.Tummaganti@cloudfuze.com';

    if (!clientId || !clientSecret) throw new Error('MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be set in .env');

    const tenantId = await this.resolveTenantId();

    // Get access token via client credentials
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }).toString(),
    });

    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) {
      throw new Error(`Failed to get Microsoft token: ${tokenData.error_description || tokenData.error}`);
    }

    // Send email via Graph API
    const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${fromEmail}/sendMail`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: false,
      }),
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      throw new Error(`Graph API error (${sendRes.status}): ${errText}`);
    }
  }

  async sendAlert(project: AlertProject, type: AlertType, daysRemaining: number): Promise<{ success: boolean; error?: string }> {
    try {
      const { subject, html } = this.buildEmail(type, project, daysRemaining);
      await this.sendViaGraph(project.customerContact, subject, html);

      await execute(
        `INSERT INTO server_alert_logs (project_id, alert_type, sent_to, days_remaining, days_overdue, success)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [project.id, type, project.customerContact, Math.max(0, daysRemaining), Math.max(0, -daysRemaining)]
      );
      return { success: true };
    } catch (err: any) {
      await execute(
        `INSERT INTO server_alert_logs (project_id, alert_type, sent_to, days_remaining, days_overdue, success, error_message)
         VALUES ($1, $2, $3, $4, $5, false, $6)`,
        [project.id, type, project.customerContact, Math.max(0, daysRemaining), Math.max(0, -daysRemaining), err.message]
      ).catch(() => {});
      return { success: false, error: err.message };
    }
  }

  async runDailyAlerts(): Promise<{ sent: number; skipped: number; failed: number }> {
    await this.ensureTable();
    const res = await query(
      `SELECT id, name, customer_name, customer_contact, account_manager, actual_start, actual_end, status
       FROM projects
       WHERE status NOT IN ('CANCELLED','CLOSED','DECOMMISSIONED')
         AND archived_at IS NULL
         AND customer_contact IS NOT NULL AND customer_contact LIKE '%@%'
         AND actual_start IS NOT NULL AND actual_end IS NOT NULL`
    );
    let sent = 0, skipped = 0, failed = 0;
    for (const row of res.rows) {
      const project: AlertProject = {
        id: row.id, name: row.name, customerName: row.customer_name,
        customerContact: row.customer_contact, accountManager: row.account_manager,
        plannedStart: row.actual_start, plannedEnd: row.actual_end, status: row.status,
      };
      const { type, daysRemaining } = this.getAlertType(project.plannedStart, project.plannedEnd);
      if (!type) { skipped++; continue; }
      if (await this.alreadySentToday(project.id, type)) { skipped++; continue; }
      const r = await this.sendAlert(project, type, daysRemaining);
      if (r.success) { sent++; logger.info(`Alert sent: ${type} → ${project.name}`); }
      else { failed++; logger.warn(`Alert failed for ${project.name}: ${r.error}`); }
    }
    return { sent, skipped, failed };
  }

  async getAlertStatus() {
    await this.ensureTable();
    const res = await query(
      `SELECT p.id, p.name, p.customer_name, p.customer_contact, p.account_manager,
              p.actual_start, p.actual_end, p.status, p.phase,
              l.alert_type as last_alert_type, l.sent_at as last_sent_at, l.success as last_success
       FROM projects p
       LEFT JOIN LATERAL (
         SELECT alert_type, sent_at, success FROM server_alert_logs
         WHERE project_id = p.id ORDER BY sent_at DESC LIMIT 1
       ) l ON true
       WHERE p.status NOT IN ('CANCELLED','CLOSED','DECOMMISSIONED')
         AND p.archived_at IS NULL
         AND p.actual_start IS NOT NULL AND p.actual_end IS NOT NULL
       ORDER BY p.actual_end ASC`
    );
    return res.rows.map((row: any) => {
      const { type, daysRemaining, daysFromKickoff } = this.getAlertType(row.actual_start, row.actual_end);
      return {
        id: row.id, name: row.name, customerName: row.customer_name,
        customerContact: row.customer_contact, accountManager: row.account_manager,
        plannedStart: row.actual_start, plannedEnd: row.actual_end,
        status: row.status, phase: row.phase,
        alertType: type, daysRemaining, daysFromKickoff,
        hasEmail: !!(row.customer_contact?.includes('@')),
        lastAlertType: row.last_alert_type, lastSentAt: row.last_sent_at, lastSuccess: row.last_success,
        nextAlertIn: type === 'active' ? (7 - (daysFromKickoff % 7)) % 7 : 0,
      };
    });
  }

  async getLogs(limit = 100) {
    await this.ensureTable();
    const res = await query(
      `SELECT l.*, p.name as project_name, p.customer_name
       FROM server_alert_logs l
       JOIN projects p ON l.project_id = p.id
       ORDER BY l.sent_at DESC LIMIT $1`,
      [limit]
    );
    return res.rows;
  }

  async sendManual(projectId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureTable();
    const res = await query(
      `SELECT id, name, customer_name, customer_contact, account_manager, actual_start, actual_end, status
       FROM projects WHERE id = $1`, [projectId]
    );
    if (!res.rows[0]) return { success: false, error: 'Project not found' };
    const row = res.rows[0];
    if (!row.customer_contact?.includes('@')) return { success: false, error: 'No valid email on project' };
    if (!row.actual_start || !row.actual_end) return { success: false, error: 'Kickoff start or project end date missing' };
    const project: AlertProject = {
      id: row.id, name: row.name, customerName: row.customer_name,
      customerContact: row.customer_contact, accountManager: row.account_manager,
      plannedStart: row.actual_start, plannedEnd: row.actual_end, status: row.status,
    };
    const { type, daysRemaining } = this.getAlertType(project.plannedStart, project.plannedEnd);
    return this.sendAlert(project, type || 'active', daysRemaining);
  }
}

export const serverAlertService = new ServerAlertService();
