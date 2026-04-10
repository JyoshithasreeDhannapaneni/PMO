import { query } from '../config/database';
import { notificationService } from '../services/notificationService';
import { logger } from '../utils/logger';

class CaseStudyReminderJob {
  async run(): Promise<void> {
    const startTime = Date.now();
    logger.info('Starting case study reminder job...');

    try {
      const projectsWithoutCaseStudy = await query(
        `SELECT p.* FROM projects p
         LEFT JOIN case_studies cs ON p.id = cs.project_id
         WHERE p.status = 'COMPLETED' AND cs.id IS NULL`
      );

      const projectsWithPendingCaseStudy = await query(
        `SELECT p.* FROM projects p
         JOIN case_studies cs ON p.id = cs.project_id
         WHERE p.status = 'COMPLETED' AND cs.status = 'PENDING'`
      );

      const allProjectsNeedingReminder = [
        ...projectsWithoutCaseStudy.rows,
        ...projectsWithPendingCaseStudy.rows,
      ];

      let remindersSent = 0;

      for (const project of allProjectsNeedingReminder) {
        const recentReminder = await query(
          `SELECT id FROM notifications 
           WHERE project_id = $1 AND type = 'CASE_STUDY_REMINDER' 
           AND created_at >= NOW() - INTERVAL '7 days'
           LIMIT 1`,
          [project.id]
        );

        if (recentReminder.rows.length === 0) {
          await notificationService.notifyCaseStudyReminder({
            id: project.id,
            name: project.name,
            customerName: project.customer_name,
            projectManager: project.project_manager,
            accountManager: project.account_manager,
            delayDays: project.delay_days,
            plannedEnd: project.planned_end,
            actualEnd: project.actual_end,
            phase: project.phase,
          });
          remindersSent++;
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`Case study reminder job completed in ${duration}ms`);
      logger.info(`  - Projects needing case studies: ${allProjectsNeedingReminder.length}`);
      logger.info(`  - Reminders sent: ${remindersSent}`);

    } catch (error) {
      logger.error('Case study reminder job failed:', error);
      throw error;
    }
  }
}

export const caseStudyReminderJob = new CaseStudyReminderJob();
