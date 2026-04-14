import { prisma } from '../config/database';
import { NotificationType, NotificationStatus, Project } from 'pg';
import { logger } from '../utils/logger';
import nodemailer from 'nodemailer';

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

  /**
   * Create and send a notification
   */
  async createNotification(
    type: NotificationType,
    title: string,
    message: string,
    recipients: string[],
    projectId?: string
  ): Promise<void> {
    // Store notification in database
    const notification = await prisma.notification.create({
      data: {
        type,
        title,
        message,
        recipients,
        projectId,
        status: 'PENDING',
      },
    });

    // Attempt to send email
    try {
      await this.sendEmail({
        to: recipients,
        subject: title,
        html: this.formatEmailHtml(type, title, message),
      });

      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'SENT', sentAt: new Date() },
      });

      logger.info(`Notification sent: ${type} - ${title}`);
    } catch (error) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'FAILED' },
      });
      logger.error(`Failed to send notification: ${error}`);
    }
  }

  /**
   * Send delay detected notification
   */
  async notifyDelayDetected(project: Project): Promise<void> {
    const recipients = this.getProjectRecipients(project);
    const title = `⚠️ Project Delay Detected: ${project.name}`;
    const message = `
      Project "${project.name}" is now delayed by ${project.delayDays} days.
      
      Customer: ${project.customerName}
      Project Manager: ${project.projectManager}
      Planned End Date: ${project.plannedEnd.toLocaleDateString()}
      Current Phase: ${project.phase}
      
      Please review and take necessary action.
    `;

    await this.createNotification(
      'DELAY_DETECTED',
      title,
      message,
      recipients,
      project.id
    );
  }

  /**
   * Send project completed notification
   */
  async notifyProjectCompleted(project: Project): Promise<void> {
    const recipients = this.getProjectRecipients(project);
    const title = `✅ Project Completed: ${project.name}`;
    const message = `
      Project "${project.name}" has been marked as completed.
      
      Customer: ${project.customerName}
      Project Manager: ${project.projectManager}
      Completion Date: ${project.actualEnd?.toLocaleDateString() || 'N/A'}
      
      ${project.delayDays > 0 
        ? `Note: Project was completed ${project.delayDays} days behind schedule.`
        : 'Project was completed on time!'
      }
      
      Please ensure a case study is created for this project.
    `;

    await this.createNotification(
      'PROJECT_COMPLETED',
      title,
      message,
      recipients,
      project.id
    );
  }

  /**
   * Send case study reminder notification
   */
  async notifyCaseStudyReminder(project: Project): Promise<void> {
    const recipients = this.getProjectRecipients(project);
    const title = `📝 Case Study Reminder: ${project.name}`;
    const message = `
      Project "${project.name}" was completed but doesn't have a case study yet.
      
      Customer: ${project.customerName}
      Project Manager: ${project.projectManager}
      Completion Date: ${project.actualEnd?.toLocaleDateString() || 'N/A'}
      
      Please create a case study for this successful project.
    `;

    await this.createNotification(
      'CASE_STUDY_REMINDER',
      title,
      message,
      recipients,
      project.id
    );
  }

  /**
   * Get all notifications with pagination
   */
  async getNotifications(
    page: number = 1,
    limit: number = 20,
    projectId?: string
  ): Promise<{ notifications: any[]; total: number }> {
    const where = projectId ? { projectId } : {};

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          project: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.notification.count({ where }),
    ]);

    return { notifications, total };
  }

  /**
   * Mark a notification as read (SENT)
   */
  async markAsRead(id: string): Promise<void> {
    await prisma.notification.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    });
    logger.info(`Notification marked as read: ${id}`);
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<void> {
    await prisma.notification.updateMany({
      where: { status: 'PENDING' },
      data: { status: 'SENT', sentAt: new Date() },
    });
    logger.info('All notifications marked as read');
  }

  /**
   * Send email using configured transporter
   */
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

  /**
   * Format email HTML template
   */
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

  /**
   * Get email recipients for a project
   */
  private getProjectRecipients(project: Project): string[] {
    // In production, these would be actual email addresses from user records
    // For now, return placeholder emails based on names
    return [
      `${project.projectManager.toLowerCase().replace(/\s+/g, '.')}@company.com`,
      `${project.accountManager.toLowerCase().replace(/\s+/g, '.')}@company.com`,
    ];
  }
}

export const notificationService = new NotificationService();
