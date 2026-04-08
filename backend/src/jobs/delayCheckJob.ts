import { projectService } from '../services/projectService';
import { logger } from '../utils/logger';

/**
 * Daily job to check and update project delays
 * 
 * Business Logic:
 * - Checks all active/on-hold projects
 * - Recalculates delay_days based on current date vs planned_end
 * - Updates delay_status (DELAYED / AT_RISK / NOT_DELAYED)
 */
class DelayCheckJob {
  async run(): Promise<void> {
    const startTime = Date.now();
    logger.info('Starting delay check job...');

    try {
      const updatedCount = await projectService.updateAllDelays();

      const duration = Date.now() - startTime;
      logger.info(`Delay check job completed in ${duration}ms`);
      logger.info(`  - Projects updated: ${updatedCount}`);

    } catch (error) {
      logger.error('Delay check job failed:', error);
      throw error;
    }
  }
}

export const delayCheckJob = new DelayCheckJob();
