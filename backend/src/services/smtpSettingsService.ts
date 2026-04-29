import { query, execute } from '../config/database';
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
        id INT PRIMARY KEY DEFAULT 1,
        host VARCHAR(255) NOT NULL DEFAULT '',
        port INT NOT NULL DEFAULT 587,
        email VARCHAR(255) NOT NULL DEFAULT '',
        password VARCHAR(255) NOT NULL DEFAULT '',
        security VARCHAR(10) NOT NULL DEFAULT 'TLS',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    // Ensure a default row exists
    await execute(`
      INSERT IGNORE INTO smtp_settings (id, host, port, email, password, security)
      VALUES (1, '', 587, '', '', 'TLS')
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
      `UPDATE smtp_settings SET host = ?, port = ?, email = ?, password = ?, security = ? WHERE id = 1`,
      [settings.host, settings.port, settings.email, settings.password, settings.security]
    );
    return this.get();
  }

  async testConnection(settings: Omit<SmtpSettings, 'id' | 'updatedAt'>): Promise<{ success: boolean; message: string }> {
    try {
      const secure = settings.security === 'SSL';
      const transporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure,
        auth: { user: settings.email, pass: settings.password },
        tls: settings.security === 'TLS' ? { rejectUnauthorized: false } : undefined,
      } as any);
      await transporter.verify();
      return { success: true, message: 'Connection successful!' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }
}

export const smtpSettingsService = new SmtpSettingsService();
