import cron from 'node-cron';
import { logger } from '../utils/logger';
import { projectService } from '../services/projectService';
import { ntaSyncService, isNtaConfigured } from '../services/ntaSyncService';

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

  // Deal Desk email poll — every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { dealDeskService } = require('../services/dealDeskService');
      if (!dealDeskService.isConfigured()) return;
      logger.info('Deal Desk: polling for new emails...');
      const result = await dealDeskService.processNewEmails();
      if (result.processed > 0 || result.errors > 0) {
        logger.info(`Deal Desk: processed=${result.processed} skipped=${result.skipped} errors=${result.errors}`);
      }
    } catch (error) {
      logger.error('Deal Desk email poll failed:', error);
    }
  });

  // NTA ticket sync — every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    if (!isNtaConfigured()) return;
    try {
      const result = await ntaSyncService.syncFromNta();
      logger.info(`NTA sync: ${result.synced} upserted, ${result.total} total`);
    } catch {
      // already logged inside ntaSyncService.syncFromNta()
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

  logger.info('Cron jobs scheduled:');
  logger.info('  - Delay check: Daily at 6:00 AM');
  logger.info('  - Server alerts: Daily at 8:00 AM');
  logger.info('  - Deal Desk email poll: Every 15 minutes');
  logger.info('  - NTA ticket sync: Every 5 minutes');
  logger.info('  - PMO Hygiene & Score Card email: Daily at 6:00 PM IST');
}
