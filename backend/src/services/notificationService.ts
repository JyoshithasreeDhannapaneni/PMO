import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';

type NotificationType = 'DELAY_DETECTED' | 'PROJECT_COMPLETED' | 'CASE_STUDY_REMINDER' | 'PHASE_COMPLETED' | 'GENERAL';

interface Project {
  id: string;
  name: string;
  customerName: string;
  projectManager: string;
  accountManager: string;
  delayDays: number;
  plannedEnd: Date;
  actualEnd: Date | null;
  phase: string;
}

interface EmailOptions {
  to: string[];
  subject: string;
  html: string;
}

class NotificationService {
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
      logger.warn('Email configuration not found - notifications will be logged only');
    }
  }

  async createNotification(
    type: NotificationType,
    title: string,
    message: string,
    recipients: string[],
    projectId?: string
  ): Promise<void> {
    const notificationId = uuidv4();
    await execute(
      `INSERT INTO notifications (id, type, title, message, recipients, project_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
      [notificationId, type, title, message, JSON.stringify(recipients), projectId]
    );

    try {
      await this.sendEmail({
        to: recipients,
        subject: title,
        html: this.formatEmailHtml(type, title, message),
      });

      await query(
        `UPDATE notifications SET status = 'SENT', sent_at = NOW() WHERE id = $1`,
        [notificationId]
      );

      logger.info(`Notification sent: ${type} - ${title}`);
    } catch (error) {
      await query(
        `UPDATE notifications SET status = 'FAILED' WHERE id = $1`,
        [notificationId]
      );
      logger.error(`Failed to send notification: ${error}`);
    }
  }

  async notifyDelayDetected(project: Project): Promise<void> {
    const recipients = this.getProjectRecipients(project);
    const title = `⚠️ Project Delay Detected: ${project.name}`;
    const message = `
      Project "${project.name}" is now delayed by ${project.delayDays} days.
      
      Customer: ${project.customerName}
      Project Manager: ${project.projectManager}
      Planned End Date: ${new Date(project.plannedEnd).toLocaleDateString()}
      Current Phase: ${project.phase}
      
      Please review and take necessary action.
    `;

    await this.createNotification('DELAY_DETECTED', title, message, recipients, project.id);
  }

  async notifyProjectCompleted(project: Project): Promise<void> {
    const recipients = this.getProjectRecipients(project);
    const title = `✅ Project Completed: ${project.name}`;
    const message = `
      Project "${project.name}" has been marked as completed.
      
      Customer: ${project.customerName}
      Project Manager: ${project.projectManager}
      Completion Date: ${project.actualEnd ? new Date(project.actualEnd).toLocaleDateString() : 'N/A'}
      
      ${project.delayDays > 0
        ? `Note: Project was completed ${project.delayDays} days behind schedule.`
        : 'Project was completed on time!'
      }
      
      Please ensure a case study is created for this project.
    `;

    await this.createNotification('PROJECT_COMPLETED', title, message, recipients, project.id);
  }

  async notifyCaseStudyReminder(project: Project): Promise<void> {
    const recipients = this.getProjectRecipients(project);
    const title = `📝 Case Study Reminder: ${project.name}`;
    const message = `
      Project "${project.name}" was completed but doesn't have a case study yet.
      
      Customer: ${project.customerName}
      Project Manager: ${project.projectManager}
      Completion Date: ${project.actualEnd ? new Date(project.actualEnd).toLocaleDateString() : 'N/A'}
      
      Please create a case study for this successful project.
    `;

    await this.createNotification('CASE_STUDY_REMINDER', title, message, recipients, project.id);
  }

  async getNotifications(
    page: number = 1,
    limit: number = 20,
    projectId?: string
  ): Promise<{ notifications: any[]; total: number }> {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const safeOffset = Math.max(0, Math.floor((page - 1) * safeLimit));
    
    let queryStr = `
      SELECT n.*, p.id as p_id, p.name as p_name 
      FROM notifications n
      LEFT JOIN projects p ON n.project_id = p.id
    `;
    const params: any[] = [];

    if (projectId) {
      queryStr += ` WHERE n.project_id = ?`;
      params.push(projectId);
    }

    queryStr += ` ORDER BY n.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const [notificationsResult, countResult] = await Promise.all([
      query(queryStr, params),
      query(
        projectId
          ? `SELECT COUNT(*) as count FROM notifications WHERE project_id = ?`
          : `SELECT COUNT(*) as count FROM notifications`,
        projectId ? [projectId] : []
      ),
    ]);

    return {
      notifications: notificationsResult.rows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        type: row.type,
        title: row.title,
        message: row.message,
        recipients: JSON.parse(row.recipients || '[]'),
        status: row.status,
        sentAt: row.sent_at,
        createdAt: row.created_at,
        project: row.p_id ? { id: row.p_id, name: row.p_name } : null,
      })),
      total: parseInt(countResult.rows[0].count || countResult.rows[0]['COUNT(*)'] || 0),
    };
  }

  async markAsRead(id: string): Promise<void> {
    await query(
      `UPDATE notifications SET status = 'SENT', sent_at = NOW() WHERE id = $1`,
      [id]
    );
    logger.info(`Notification marked as read: ${id}`);
  }

  async markAllAsRead(): Promise<void> {
    await query(
      `UPDATE notifications SET status = 'SENT', sent_at = NOW() WHERE status = 'PENDING'`
    );
    logger.info('All notifications marked as read');
  }

  private async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.transporter) {
      logger.info(`[MOCK EMAIL] To: ${options.to.join(', ')}`);
      logger.info(`[MOCK EMAIL] Subject: ${options.subject}`);
      logger.info(`[MOCK EMAIL] Body: ${options.html.substring(0, 200)}...`);
      return;
    }

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@pmo-tracker.com',
      to: options.to.join(', '),
      subject: options.subject,
      html: options.html,
    });
  }

  private formatEmailHtml(type: NotificationType, title: string, message: string): string {
    const typeColors: Record<NotificationType, string> = {
      DELAY_DETECTED: '#ef4444',
      PROJECT_COMPLETED: '#22c55e',
      CASE_STUDY_REMINDER: '#3b82f6',
      PHASE_COMPLETED: '#8b5cf6',
      GENERAL: '#6b7280',
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${typeColors[type]}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin: 0;">${title}</h2>
            </div>
            <div class="content">
              <pre style="white-space: pre-wrap; font-family: inherit;">${message}</pre>
            </div>
            <div class="footer">
              <p>PMO Tracker - Project Migration Tracking System</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private getProjectRecipients(project: Project): string[] {
    return [
      `${project.projectManager.toLowerCase().replace(/\s+/g, '.')}@company.com`,
      `${project.accountManager.toLowerCase().replace(/\s+/g, '.')}@company.com`,
    ];
  }
}

export const notificationService = new NotificationService();
