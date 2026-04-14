import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      logger.info('Email transporter initialized');
    } else {
      logger.warn('Email configuration not found - emails will be logged only');
    }
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;

    if (!this.transporter) {
      logger.info(`[MOCK EMAIL] To: ${recipients}`);
      logger.info(`[MOCK EMAIL] Subject: ${options.subject}`);
      logger.info(`[MOCK EMAIL] Body: ${options.html.substring(0, 200)}...`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@pmo-tracker.com',
        to: recipients,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      logger.info(`Email sent to: ${recipients}`);
    } catch (error) {
      logger.error(`Failed to send email: ${error}`);
      throw error;
    }
  }

  async sendWelcomeEmail(name: string, email: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Welcome to PMO Tracker',
      html: `
        <h2>Welcome to PMO Tracker!</h2>
        <p>Hello ${name},</p>
        <p>Your account has been created successfully.</p>
        <p>You can now log in and start tracking your projects.</p>
        <p>Best regards,<br>PMO Tracker Team</p>
      `,
    });
  }

  async sendPasswordChangedEmail(name: string, email: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Password Changed - PMO Tracker',
      html: `
        <h2>Password Changed</h2>
        <p>Hello ${name},</p>
        <p>Your password has been changed successfully.</p>
        <p>If you did not make this change, please contact support immediately.</p>
        <p>Best regards,<br>PMO Tracker Team</p>
      `,
    });
  }
}

export const emailService = new EmailService();
