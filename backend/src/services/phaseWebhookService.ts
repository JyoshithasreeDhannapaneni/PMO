import axios from 'axios';
import { logger } from '../utils/logger';
import { externalApiService } from './externalApiService';

function webhookUrl(): string | null {
  const url = process.env.EXTERNAL_PHASE_WEBHOOK_URL;
  return url && !url.startsWith('PASTE_') ? url : null;
}

export const phaseWebhookService = {
  // Fired when a project's phase newly transitions into DELTA (not on every edit,
  // and not if it was already DELTA). Silently no-ops until the other internal
  // application's webhook URL is configured -- see EXTERNAL_PHASE_WEBHOOK_URL in
  // CLAUDE.md's Environment Variables section.
  async notifyDeltaPhase(projectId: string): Promise<void> {
    const url = webhookUrl();
    if (!url) {
      logger.info(`Delta-phase webhook skipped for project ${projectId}: EXTERNAL_PHASE_WEBHOOK_URL not configured`);
      return;
    }

    const project = await externalApiService.getProjectById(projectId);
    if (!project) return;

    const recentDeltaProjects = await externalApiService.getRecentDeltaProjects(projectId);

    try {
      await axios.post(
        url,
        { event: 'PROJECT_PHASE_MOVED_TO_DELTA', project, recentDeltaProjects },
        { headers: { 'X-API-Key': process.env.EXTERNAL_API_KEY || '' }, timeout: 10_000 }
      );
      logger.info(`Delta-phase webhook sent for project ${projectId} (${recentDeltaProjects.length} other recent Delta project(s) included)`);
    } catch (err: any) {
      logger.warn(`Delta-phase webhook failed for project ${projectId}: ${err?.message}`);
    }
  },
};
