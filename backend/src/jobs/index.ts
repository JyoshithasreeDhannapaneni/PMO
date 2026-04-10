import cron from 'node-cron';
import { logger } from '../utils/logger';
import { projectService } from '../services/projectService';
import { taskService } from '../services/taskService';
import { query } from '../config/database';

/**
 * Initialize all cron jobs
 * Jobs run on a schedule to automate system maintenance tasks
 */
export function initializeCronJobs(): void {
  // Daily delay check - runs at 6:00 AM every day
  cron.schedule('0 6 * * *', async () => {
    logger.info('Running daily delay check job...');
    try {
      const updated = await projectService.updateAllDelays();
      logger.info(`Delay check completed. Updated ${updated} projects.`);
    } catch (error) {
      logger.error('Delay check job failed:', error);
    }
  });

  // Hourly task status auto-update - runs every hour
  cron.schedule('0 * * * *', async () => {
    logger.info('Running hourly task status auto-update job...');
    try {
      const projectsResult = await query(
        `SELECT id FROM projects WHERE status = 'ACTIVE'`
      );
      
      let totalUpdated = 0;
      for (const project of projectsResult.rows) {
        const updated = await taskService.autoUpdateTaskStatuses(project.id);
        totalUpdated += updated;
      }
      
      logger.info(`Task status auto-update completed. Updated phases in ${totalUpdated} projects.`);
    } catch (error) {
      logger.error('Task status auto-update job failed:', error);
    }
  });

  logger.info('Cron jobs scheduled:');
  logger.info('  - Delay check: Daily at 6:00 AM');
  logger.info('  - Task status auto-update: Every hour');
}
