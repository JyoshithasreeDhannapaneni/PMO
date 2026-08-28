import { query } from '../config/database';

// Deliberately a small, stable, curated shape — NOT the full internal project row (which
// includes cost/financial fields, internal notes, and escalation detail). This is for
// external/other-internal-app consumption, so it stays intentionally minimal and shouldn't
// change shape just because the internal projects table grows new columns.
export interface ExternalProject {
  id: string;
  name: string;
  customerName: string;
  projectManager: string | null;
  accountManager: string | null;
  status: string;
  phase: string | null;
  phaseCompletionPct: number;
  phaseChangedAt: string | null;
  planType: string | null;
  migrationTypes: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  delayStatus: string | null;
  delayDays: number | null;
  updatedAt: string | null;
}

const SELECT_COLUMNS = `
  id, name, customer_name, project_manager, account_manager, status, phase,
  phase_completion_pct, phase_changed_at, plan_type, migration_types, planned_start,
  planned_end, actual_start, actual_end, delay_status, delay_days, updated_at
`;

function mapRow(r: any): ExternalProject {
  return {
    id: r.id,
    name: r.name,
    customerName: r.customer_name,
    projectManager: r.project_manager,
    accountManager: r.account_manager,
    status: r.status,
    phase: r.phase,
    phaseCompletionPct: r.phase_completion_pct ?? 0,
    phaseChangedAt: r.phase_changed_at,
    planType: r.plan_type,
    migrationTypes: r.migration_types,
    plannedStart: r.planned_start,
    plannedEnd: r.planned_end,
    actualStart: r.actual_start,
    actualEnd: r.actual_end,
    delayStatus: r.delay_status,
    delayDays: r.delay_days,
    updatedAt: r.updated_at,
  };
}

export const externalApiService = {
  async getAllProjects(): Promise<ExternalProject[]> {
    const result = await query(`SELECT ${SELECT_COLUMNS} FROM projects ORDER BY name ASC`);
    return result.rows.map(mapRow);
  },

  async getProjectById(id: string): Promise<ExternalProject | null> {
    const result = await query(`SELECT ${SELECT_COLUMNS} FROM projects WHERE id = $1`, [id]);
    return result.rows.length > 0 ? mapRow(result.rows[0]) : null;
  },

  // Other projects (besides the one that just triggered the webhook) that moved into
  // DELTA phase within the last `days` days -- gives the receiving app context beyond
  // the single project that changed just now.
  async getRecentDeltaProjects(excludeId: string, days = 7): Promise<ExternalProject[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await query(
      `SELECT ${SELECT_COLUMNS} FROM projects
       WHERE phase = 'DELTA' AND phase_changed_at >= $1 AND id != $2
       ORDER BY phase_changed_at DESC`,
      [since, excludeId]
    );
    return result.rows.map(mapRow);
  },
};
