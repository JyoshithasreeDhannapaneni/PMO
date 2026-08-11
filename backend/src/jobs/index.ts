import cron from 'node-cron';
import { logger } from '../utils/logger';
import { projectService } from '../services/projectService';
import { emailHygieneService } from '../services/emailHygieneService';

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

  // PMO Hygiene & Score Card — daily at 6:00 PM IST (explicit timezone, since
  // every other job here runs in implicit server-local time)
  cron.schedule('0 18 * * *', async () => {
    logger.info('Running daily hygiene scorecard job...');
    try {
      const { hygieneScorecardService } = require('../services/hygieneScorecardService');
      const result = await hygieneScorecardService.sendDailyScorecard();
      logger.info(`Hygiene scorecard: sent=${result.sent} recipients=${result.recipientCount} ${result.skippedReason ? `skipped=${result.skippedReason}` : ''}`);
    } catch (error) {
      logger.error('Hygiene scorecard job failed:', error);
    }
  }, { timezone: 'Asia/Kolkata' });

  // PMO Hygiene & Score Card — ad-hoc scheduled sends, polled every minute
  cron.schedule('* * * * *', async () => {
    try {
      const { hygieneScorecardService } = require('../services/hygieneScorecardService');
      const result = await hygieneScorecardService.processPendingSchedules();
      if (result.sent > 0 || result.failed > 0) {
        logger.info(`Hygiene scorecard schedule poll: sent=${result.sent} failed=${result.failed}`);
      }
    } catch (error) {
      logger.error('Hygiene scorecard schedule poll failed:', error);
    }
  });

  // Email hygiene sync — daily at 7:00 AM IST
  cron.schedule('0 7 * * *', async () => {
    logger.info('[EmailHygiene] Starting daily 7 AM IST sync...');
    try {
      if (!emailHygieneService.isConfigured()) {
        logger.info('[EmailHygiene] Graph API not configured — skipping sync');
        return;
      }
      const result = await emailHygieneService.getHygieneMetrics(true);
      logger.info(`[EmailHygiene] Daily sync complete — ${result.metrics.length} users, computed at ${result.computedAt}`);
    } catch (error) {
      logger.error('[EmailHygiene] Daily sync failed:', error);
    }
  }, { timezone: 'Asia/Kolkata' });

  logger.info('Cron jobs scheduled:');
  logger.info('  - Delay check: Daily at 6:00 AM');
  logger.info('  - Server alerts: Daily at 8:00 AM');
  logger.info('  - PMO Hygiene & Score Card email: Daily at 6:00 PM IST');
  logger.info('  - PMO Hygiene & Score Card scheduled-send poll: Every minute');
  logger.info('  - Email hygiene sync: Daily at 7:00 AM IST');
}
