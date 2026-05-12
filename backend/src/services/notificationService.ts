import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { emailService } from './emailService';
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

/** Look up real email addresses for the project managers/account managers by name. */
async function resolveRecipients(project: Project): Promise<string[]> {
  try {
    const names = [project.projectManager, project.accountManager].filter(Boolean);
    if (names.length === 0) return [];

    const placeholders = names.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query(
      `SELECT email FROM users WHERE name = ANY(ARRAY[${placeholders}]) AND email IS NOT NULL`,
      names
    );
    const emails = result.rows.map((r: any) => r.email).filter(Boolean);

    if (emails.length === 0) {
      logger.warn(`No user emails found for project managers: ${names.join(', ')}`);
    }
    return emails;
  } catch (err) {
    logger.error(`Failed to resolve recipients: ${err}`);
    return [];
  }
}

class NotificationService {
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
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')`,
      [notificationId, type, title, message, JSON.stringify(recipients), projectId ?? null]
    );

    if (recipients.length === 0) {
      logger.warn(`Notification ${type} created with no recipients — skipping email send`);
      return;
    }

    try {
      await emailService.sendEmail({
        to: recipients,
        subject: title,
        html: message, // callers already pass branded HTML
      });

      await execute(
        `UPDATE notifications SET status = 'SENT', sent_at = NOW() WHERE id = $1`,
        [notificationId]
      );
      logger.info(`Notification sent: ${type} — ${title}`);
    } catch (error) {
      await execute(
        `UPDATE notifications SET status = 'FAILED' WHERE id = $1`,
        [notificationId]
      );
      logger.error(`Failed to send notification: ${error}`);
    }
  }

  async notifyDelayDetected(project: Project): Promise<void> {
    const recipients = await resolveRecipients(project);
    const title = `⚠️ Project Delay Detected: ${project.name}`;
    const projectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/projects/${project.id}`;

    await emailService.sendNotification({
      to: recipients,
      type: 'DELAY_DETECTED',
      title,
      rows: [
        { label: 'Project', value: project.name },
        { label: 'Customer', value: project.customerName },
        { label: 'Project Manager', value: project.projectManager },
        { label: 'Planned End', value: new Date(project.plannedEnd).toLocaleDateString() },
        { label: 'Delay', value: `${project.delayDays} day(s)` },
        { label: 'Phase', value: project.phase },
      ],
      note: `This project is <strong>${project.delayDays} day(s) past its planned end date</strong>. Please review and take necessary action.`,
      projectUrl,
    });

    // Also store in notifications table
    const notificationId = uuidv4();
    await execute(
      `INSERT INTO notifications (id, type, title, message, recipients, project_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'SENT')`,
      [notificationId, 'DELAY_DETECTED', title,
       `Project "${project.name}" is delayed by ${project.delayDays} day(s). Customer: ${project.customerName}`,
       JSON.stringify(recipients), project.id]
    );
  }

  async notifyProjectCompleted(project: Project): Promise<void> {
    const recipients = await resolveRecipients(project);
    const title = `✅ Project Completed: ${project.name}`;
    const projectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/projects/${project.id}`;

    await emailService.sendNotification({
      to: recipients,
      type: 'PROJECT_COMPLETED',
      title,
      rows: [
        { label: 'Project', value: project.name },
        { label: 'Customer', value: project.customerName },
        { label: 'Project Manager', value: project.projectManager },
        { label: 'Completion Date', value: project.actualEnd ? new Date(project.actualEnd).toLocaleDateString() : 'N/A' },
      ],
      note: project.delayDays > 0
        ? `Project was completed <strong>${project.delayDays} day(s) behind schedule</strong>. Please create a case study.`
        : `Project was completed <strong>on time</strong>! Please create a case study to document the success.`,
      projectUrl,
    });

    const notificationId = uuidv4();
    await execute(
      `INSERT INTO notifications (id, type, title, message, recipients, project_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'SENT')`,
      [notificationId, 'PROJECT_COMPLETED', title,
       `Project "${project.name}" has been completed. Please create a case study.`,
       JSON.stringify(recipients), project.id]
    );
  }

  async notifyCaseStudyReminder(project: Project): Promise<void> {
    const recipients = await resolveRecipients(project);
    const title = `📝 Case Study Reminder: ${project.name}`;
    const projectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/projects/${project.id}`;

    await emailService.sendNotification({
      to: recipients,
      type: 'CASE_STUDY_REMINDER',
      title,
      rows: [
        { label: 'Project', value: project.name },
        { label: 'Customer', value: project.customerName },
        { label: 'Project Manager', value: project.projectManager },
        { label: 'Completion Date', value: project.actualEnd ? new Date(project.actualEnd).toLocaleDateString() : 'N/A' },
      ],
      note: 'This completed project does not have a case study yet. Please document it to share learnings with the team.',
      projectUrl,
    });

    const notificationId = uuidv4();
    await execute(
      `INSERT INTO notifications (id, type, title, message, recipients, project_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'SENT')`,
      [notificationId, 'CASE_STUDY_REMINDER', title,
       `Project "${project.name}" is missing a case study.`,
       JSON.stringify(recipients), project.id]
    );
  }

  async getNotifications(
    page: number = 1,
    limit: number = 20,
    projectId?: string
  ): Promise<{ notifications: any[]; total: number }> {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const safeOffset = Math.max(0, Math.floor((page - 1) * safeLimit));

    const whereClause = projectId ? `WHERE n.project_id = $1` : '';
    const params: any[] = projectId ? [projectId] : [];

    const [notificationsResult, countResult] = await Promise.all([
      query(
        `SELECT n.*, p.id as p_id, p.name as p_name
         FROM notifications n
         LEFT JOIN projects p ON n.project_id = p.id
         ${whereClause}
         ORDER BY n.created_at DESC
         LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      ),
      query(
        `SELECT COUNT(*) as count FROM notifications n ${whereClause}`,
        params
      ),
    ]);

    return {
      notifications: notificationsResult.rows.map((row: any) => ({
        id: row.id,
        projectId: row.project_id,
        type: row.type,
        title: row.title,
        message: row.message,
        recipients: (() => { try { return JSON.parse(row.recipients || '[]'); } catch { return []; } })(),
        status: row.status,
        sentAt: row.sent_at,
        createdAt: row.created_at,
        project: row.p_id ? { id: row.p_id, name: row.p_name } : null,
      })),
      total: parseInt(countResult.rows[0].count || 0),
    };
  }

  async markAsRead(id: string): Promise<void> {
    await execute(
      `UPDATE notifications SET status = 'SENT', sent_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  async markAllAsRead(): Promise<void> {
    await execute(
      `UPDATE notifications SET status = 'SENT', sent_at = NOW() WHERE status = 'PENDING'`
    );
  }
}

export const notificationService = new NotificationService();
