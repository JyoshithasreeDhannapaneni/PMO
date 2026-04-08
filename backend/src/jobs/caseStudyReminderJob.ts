import { prisma } from '../config/database';
import { notificationService } from '../services/notificationService';
import { logger } from '../utils/logger';

/**
 * Weekly job to send reminders for missing case studies
 * 
 * Business Logic:
 * - Finds all completed projects without case studies
 * - Sends reminder notifications to project managers
 * - Helps ensure successful projects are documented
 */
class CaseStudyReminderJob {
  async run(): Promise<void> {
    const startTime = Date.now();
    logger.info('Starting case study reminder job...');

    try {
      // Find completed projects without case studies
      const projectsWithoutCaseStudy = await prisma.project.findMany({
        where: {
          status: 'COMPLETED',
          caseStudy: null,
        },
        include: {
          caseStudy: true,
        },
      });

      // Also find projects with pending case studies
      const projectsWithPendingCaseStudy = await prisma.project.findMany({
        where: {
          status: 'COMPLETED',
          caseStudy: {
            status: 'PENDING',
          },
        },
        include: {
          caseStudy: true,
        },
      });

      const allProjectsNeedingReminder = [
        ...projectsWithoutCaseStudy,
        ...projectsWithPendingCaseStudy,
      ];

      let remindersSent = 0;

      for (const project of allProjectsNeedingReminder) {
        // Check if we've already sent a reminder recently (within 7 days)
        const recentReminder = await prisma.notification.findFirst({
          where: {
            projectId: project.id,
            type: 'CASE_STUDY_REMINDER',
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        });

        if (!recentReminder) {
          await notificationService.notifyCaseStudyReminder(project);
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
