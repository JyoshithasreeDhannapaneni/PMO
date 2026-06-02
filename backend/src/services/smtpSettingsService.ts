import { query, execute } from '../config/db';
import nodemailer from 'nodemailer';

export interface SmtpSettings {
  id?: string;
  host: string;
  port: number;
  email: string;
  password: string;
  security: 'TLS' | 'SSL' | 'NONE';
  updatedAt?: string;
}

class SmtpSettingsService {
  async ensureTable() {
    await execute(`
      CREATE TABLE IF NOT EXISTS smtp_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        host VARCHAR(255) NOT NULL DEFAULT '',
        port INTEGER NOT NULL DEFAULT 587,
        email VARCHAR(255) NOT NULL DEFAULT '',
        password VARCHAR(255) NOT NULL DEFAULT '',
        security VARCHAR(10) NOT NULL DEFAULT 'TLS',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await execute(`
      INSERT INTO smtp_settings (id, host, port, email, password, security)
      VALUES (1, '', 587, '', '', 'TLS')
      ON CONFLICT (id) DO NOTHING
    `);
  }

  async get(): Promise<SmtpSettings> {
    await this.ensureTable();
    const result = await query(`SELECT * FROM smtp_settings WHERE id = 1`);
    const r = result.rows[0];
    return {
      id: String(r.id),
      host: r.host,
      port: r.port,
      email: r.email,
      password: r.password ? '***' : '',
      security: r.security,
      updatedAt: r.updated_at,
    };
  }

  async save(settings: Omit<SmtpSettings, 'id' | 'updatedAt'>): Promise<SmtpSettings> {
    await this.ensureTable();
    await execute(
      `UPDATE smtp_settings
       SET host = $1, port = $2, email = $3, password = $4, security = $5, updated_at = NOW()
       WHERE id = 1`,
      [settings.host, settings.port, settings.email, settings.password, settings.security]
    );
    return this.get();
  }

  async getRaw(): Promise<SmtpSettings | null> {
    try {
      await this.ensureTable();
      const result = await query(`SELECT * FROM smtp_settings WHERE id = 1`);
      const r = result.rows[0];
      if (!r || !r.host) return null;
      return { id: String(r.id), host: r.host, port: r.port, email: r.email, password: r.password, security: r.security };
    } catch { return null; }
  }

  async testConnection(
    settings: Omit<SmtpSettings, 'id' | 'updatedAt'>
  ): Promise<{ success: boolean; message: string }> {
    try {
      const secure = settings.security === 'SSL';
      const transporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure,
        auth: { user: settings.email, pass: settings.password },
        tls: { rejectUnauthorized: false },
      } as any);
      await transporter.verify();
      return { success: true, message: 'SMTP connection verified successfully!' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  /** Send a real test email to verify end-to-end delivery. */
  async sendTestEmail(
    settings: Omit<SmtpSettings, 'id' | 'updatedAt'>,
    recipientEmail: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const secure = settings.security === 'SSL';
      const transporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure,
        auth: { user: settings.email, pass: settings.password },
        tls: { rejectUnauthorized: false },
      } as any);

      await transporter.sendMail({
        from: `"CloudFuze PMO" <${settings.email}>`,
        to: recipientEmail,
        subject: '✅ SMTP Test — CloudFuze PMO Tracker',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;background:#f8faff;border-radius:12px;border:1px solid #bfdbfe;">
            <h2 style="color:#2563eb;margin:0 0 16px 0;">SMTP Test Successful</h2>
            <p>Your CloudFuze PMO Tracker email settings are working correctly.</p>
            <table style="width:100%;font-size:13px;border-collapse:collapse;">
              <tr><td style="padding:6px;color:#64748b;">Host</td><td style="padding:6px;font-weight:600;">${settings.host}</td></tr>
              <tr><td style="padding:6px;color:#64748b;">Port</td><td style="padding:6px;font-weight:600;">${settings.port}</td></tr>
              <tr><td style="padding:6px;color:#64748b;">Security</td><td style="padding:6px;font-weight:600;">${settings.security}</td></tr>
              <tr><td style="padding:6px;color:#64748b;">From</td><td style="padding:6px;font-weight:600;">${settings.email}</td></tr>
            </table>
          </div>`,
      });
      return { success: true, message: `Test email sent to ${recipientEmail}` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to send test email' };
    }
  }
}

export const smtpSettingsService = new SmtpSettingsService();
