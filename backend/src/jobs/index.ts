import cron from 'node-cron';
import { logger } from '../utils/logger';
import { projectService } from '../services/projectService';
import { emailHygieneService } from '../services/emailHygieneService';
import { auditService } from '../services/auditService';
import { execute } from '../config/database';

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

  // Email hygiene sync — hourly, on the hour (IST). Was daily at 7 AM until 2026-08-31;
  // that made sense for the old rolling-30-day metric, but the score now reflects "the
  // current week, to date" (2026-08-25 redesign), so a once-a-day sync left it showing a
  // stale, near-empty snapshot from early that morning for most of the day. See the
  // matching CACHE_TTL_MS comment in emailHygieneService.ts.
  cron.schedule('0 * * * *', async () => {
    logger.info('[EmailHygiene] Starting hourly sync...');
    try {
      if (!emailHygieneService.isConfigured()) {
        logger.info('[EmailHygiene] Graph API not configured — skipping sync');
        return;
      }
      const result = await emailHygieneService.getHygieneMetrics(true);
      logger.info(`[EmailHygiene] Hourly sync complete — ${result.metrics.length} users, computed at ${result.computedAt}`);
    } catch (error) {
      logger.error('[EmailHygiene] Hourly sync failed:', error);
    }
  }, { timezone: 'Asia/Kolkata' });

  // Call hygiene refresh — daily at 5:00 AM IST. Call Hygiene's Quality score used to
  // inherit staleness only from whoever last opened the dashboard (no cron of its own);
  // this closes that gap and also gives the grading job below a fresh held-call list to
  // work from every cycle instead of depending on someone visiting the page first.
  cron.schedule('0 5 * * *', async () => {
    logger.info('[CallHygiene] Starting daily 5 AM IST refresh...');
    try {
      const { callHygieneService } = require('../services/callHygieneService');
      if (!callHygieneService.isConfigured()) {
        logger.info('[CallHygiene] Graph API not configured — skipping refresh');
        return;
      }
      const result = await callHygieneService.getHygieneMetrics(true);
      logger.info(`[CallHygiene] Daily refresh complete — ${result.metrics.length} users, computed at ${result.computedAt}`);
    } catch (error) {
      logger.error('[CallHygiene] Daily refresh failed:', error);
    }
  }, { timezone: 'Asia/Kolkata' });

  // Call transcript grading — daily at 5:30 AM IST, after the refresh above has populated
  // call_hygiene_cache with this cycle's held-call list.
  cron.schedule('30 5 * * *', async () => {
    logger.info('[CallGrading] Starting daily 5:30 AM IST grading job...');
    try {
      const { callGradingJob } = require('./callGradingJob');
      await callGradingJob.run();
    } catch (error) {
      logger.error('[CallGrading] Daily grading job failed:', error);
    }
  }, { timezone: 'Asia/Kolkata' });

  // Global logout — every active session is cleared at 6:00 AM IST daily, forcing
  // everyone back to the login screen regardless of where they left off. Sessions are
  // server-side (see `sessions` table / authService.getUserFromToken) — deleting the row
  // is a real logout, not just a client-side gesture: the next API call from any open tab
  // gets a 401, and the frontend's response interceptor (services/api.ts) already clears
  // localStorage and redirects to /login on that, so no frontend change was needed.
  cron.schedule('0 6 * * *', async () => {
    logger.info('[GlobalLogout] Running daily 6 AM IST session clear...');
    try {
      const result = await execute(`DELETE FROM sessions`);
      logger.info(`[GlobalLogout] Cleared ${result.rowCount ?? 0} active session(s)`);
    } catch (error) {
      logger.error('[GlobalLogout] Daily session clear failed:', error);
    }
  }, { timezone: 'Asia/Kolkata' });

  // 1-hour reply-SLA breach alerts — polled every 15 minutes. Separate from the daily
  // Email Hygiene sync (which grades on a 4-hour SLA weekly); this is a real-time
  // trip-wire that emails the responsible manager(s) (cc: all admins) the moment a
  // customer email has gone unreplied by ANYONE on the team for 60+ minutes. Team-aware
  // redesign (2026-08-29): one alert covers every tracked recipient of a shared email
  // (not one per recipient), a teammate's reply anywhere protects everyone else on that
  // thread, a closing "thanks" is never treated as needing a reply, and a previously
  // flagged message that later gets answered triggers one quiet "resolved" follow-up.
  // See slaBreachAlertService.ts / teamConversationTimeline.ts for the full design.
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { slaBreachAlertService } = require('../services/slaBreachAlertService');
      if (!slaBreachAlertService.isConfigured()) return;
      const result = await slaBreachAlertService.checkAll();
      if (result.alerted > 0 || result.resolved > 0) {
        logger.info(`[SlaBreachAlert] Checked ${result.checked} mailboxes, sent ${result.alerted} new alert(s), ${result.resolved} resolved follow-up(s)`);
      }
    } catch (error) {
      logger.error('[SlaBreachAlert] Poll failed:', error);
    }
  });

  // Weekly hygiene finalize — every Monday at 7:00 AM IST, locks in a permanent snapshot
  // of the Mon-Sun (IST) week that just ended for all three hygiene systems (2026-08-24
  // weekly-trend feature). Agentic by design: no one has to click anything for last week's
  // numbers to become part of the trend history — see finalizeWeek() on each service for
  // the per-system idempotency/coverage-caveat details. Runs after the existing daily
  // refreshes (5/7 AM) so email/call hygiene have already synced today's data once before
  // this reads off whatever's cached; it does its own fresh Graph fetch for the exact week
  // window regardless, so it doesn't depend on those crons' cache state.
  cron.schedule('0 7 * * 1', async () => {
    logger.info('[WeeklyHygiene] Starting Monday 7 AM IST weekly finalize...');
    const { callHygieneService } = require('../services/callHygieneService');
    const results = await Promise.allSettled([
      auditService.finalizeWeek(),
      emailHygieneService.finalizeWeek(),
      callHygieneService.finalizeWeek(),
    ]);
    const labels = ['PmoHygiene', 'EmailHygiene', 'CallHygiene'];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') logger.info(`[WeeklyHygiene] ${labels[i]}: ${JSON.stringify(r.value)}`);
      else logger.error(`[WeeklyHygiene] ${labels[i]} finalize failed:`, r.reason);
    });
  }, { timezone: 'Asia/Kolkata' });

  logger.info('Cron jobs scheduled:');
  logger.info('  - Delay check: Daily at 6:00 AM');
  logger.info('  - Server alerts: Daily at 8:00 AM');
  logger.info('  - PMO Hygiene & Score Card email: Daily at 6:00 PM IST');
  logger.info('  - PMO Hygiene & Score Card scheduled-send poll: Every minute');
  logger.info('  - Email hygiene sync: Hourly, on the hour (IST)');
  logger.info('  - Call hygiene refresh: Daily at 5:00 AM IST');
  logger.info('  - Call transcript grading: Daily at 5:30 AM IST');
  logger.info('  - 1-hour reply-SLA breach alerts: Every 15 minutes');
  logger.info('  - Global logout (clear all sessions): Daily at 6:00 AM IST');
  logger.info('  - Weekly hygiene finalize (PMO/Email/Call): Every Monday at 7:00 AM IST');
}
