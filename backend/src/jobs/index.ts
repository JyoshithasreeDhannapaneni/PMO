import cron from 'node-cron';
import { logger } from '../utils/logger';
import { projectService } from '../services/projectService';

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

  // Daily server alerts — runs at 8:00 AM every day
  cron.schedule('0 8 * * *', async () => {
    logger.info('Running daily server alert job...');
    try {
      const { serverAlertService } = require('../services/serverAlertService');
      const result = await serverAlertService.runDailyAlerts();
      logger.info(`Server alerts: sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`);
    } catch (error) {
      logger.error('Server alert job failed:', error);
    }
  });

  logger.info('Cron jobs scheduled:');
  logger.info('  - Delay check: Daily at 6:00 AM');
  logger.info('  - Server alerts: Daily at 8:00 AM');
}
