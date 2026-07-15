import crypto from 'crypto';
import { query } from '../config/db';
import { logger } from '../utils/logger';
import { pmoSettingsService } from './pmoSettingsService';
import { auditService } from './auditService';
import { dashboardService } from './dashboardService';

// Tables exposed to external consumers — auth/credential tables are deliberately excluded.
const EXPORTABLE_TABLES = [
  'projects',
  'project_phases',
  'project_tasks',
  'task_dependencies',
  'project_risks',
  'project_team_members',
  'project_status_reports',
  'project_documents',
  'case_studies',
  'change_requests',
  'comments',
  'activities',
  'notifications',
  'branches',
  'customer_success_entries',
  'escalation_daily_notes',
  'escalation_history',
  'overage_history',
  'manager_goals',
  'manager_gartner_stats',
  'migration_checklists',
  'migration_templates',
  'poc_documents',
  'server_alert_logs',
  'template_combinations',
  'template_combination_documents',
  'template_phases',
  'template_tasks',
  'deployment_requests',
  'deployment_acknowledgments',
  'deployment_infra_logs',
  'deployment_qa_approvals',
  'jobs',
  'pmo_settings',
];

export type ExternalApiScope = 'all' | 'migrationManager' | 'mbr';

const SCOPES: ExternalApiScope[] = ['all', 'migrationManager', 'mbr'];

class ExternalService {
  // Reads the active key for a scope, seeding the legacy "all" key from
  // EXTERNAL_API_KEY on first run so existing deployments keep working
  // until an admin rotates it via the UI. Other scopes are generated fresh.
  async getApiKey(scope: ExternalApiScope): Promise<string> {
    const settings = await pmoSettingsService.get();
    const keys = settings.externalApiKeys ?? {};

    if (keys[scope]) {
      return keys[scope];
    }

    const seeded =
      scope === 'all' && !keys.all && process.env.EXTERNAL_API_KEY
        ? process.env.EXTERNAL_API_KEY
        : crypto.randomBytes(32).toString('hex');

    await pmoSettingsService.patch({ externalApiKeys: { ...keys, [scope]: seeded } });
    return seeded;
  }

  async regenerateApiKey(scope: ExternalApiScope): Promise<string> {
    const settings = await pmoSettingsService.get();
    const keys = settings.externalApiKeys ?? {};
    const newKey = crypto.randomBytes(32).toString('hex');
    await pmoSettingsService.patch({ externalApiKeys: { ...keys, [scope]: newKey } });
    logger.info(`External API key regenerated for scope: ${scope}`);
    return newKey;
  }

  isValidScope(scope: string): scope is ExternalApiScope {
    return SCOPES.includes(scope as ExternalApiScope);
  }

  async getAllData() {
    const data: Record<string, unknown[]> = {};

    for (const table of EXPORTABLE_TABLES) {
      try {
        const result = await query(`SELECT * FROM ${table}`);
        data[table] = result.rows;
      } catch (error) {
        logger.error(`External export failed for table ${table}: ${(error as Error).message}`);
        data[table] = [];
      }
    }

    return data;
  }

  async getMigrationManagerData(startDate?: string, endDate?: string) {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getFullYear(), end.getMonth(), 1);
    return auditService.getUserProjectSummary(start, end);
  }

  async getMbrData(manager?: string, startDate?: string, endDate?: string) {
    return dashboardService.getWeeklyReport(manager, startDate, endDate);
  }
}

export const externalService = new ExternalService();
