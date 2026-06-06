import { query, execute } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export const ARCHIVE_STATUSES = ['COMPLETED', 'CANCELLED', 'CLOSED', 'DECOMMISSIONED'];

class ArchiveService {
  private _ready = false;

  async ensureColumns() {
    if (this._ready) return;
    const cols = [
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL`,
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS archive_reason VARCHAR(50) NULL`,
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_by VARCHAR(100) NULL`,
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS restore_count INT NOT NULL DEFAULT 0`,
    ];
    for (const sql of cols) {
      try { await execute(sql, []); } catch (_) { /* already exists */ }
    }
    this._ready = true;
  }

  async autoArchive(projectId: string, newStatus: string, archivedBy?: string) {
    await this.ensureColumns();
    if (ARCHIVE_STATUSES.includes(newStatus.toUpperCase())) {
      await execute(
        `UPDATE projects SET archived_at = NOW(), archive_reason = ?, archived_by = ? WHERE id = ? AND archived_at IS NULL`,
        [newStatus.toUpperCase(), archivedBy || 'system', projectId]
      );
    }
  }

  async archiveByPhase(projectId: string, phase: string, archivedBy?: string) {
    await this.ensureColumns();
    await execute(
      `UPDATE projects SET archived_at = NOW(), archive_reason = ?, archived_by = ? WHERE id = ? AND archived_at IS NULL`,
      [phase.toUpperCase(), archivedBy || 'system', projectId]
    );
  }

  async getArchivedProjects(filters: {
    search?: string;
    status?: string;
    migrationType?: string;
    projectManager?: string;
    yearFrom?: string;
    yearTo?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    await this.ensureColumns();
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;
    const sortBy = filters.sortBy || 'archived_at';
    const sortOrder = filters.sortOrder || 'desc';

    const conditions: string[] = [
      `archived_at IS NOT NULL`,
      `status IN ('COMPLETED','CANCELLED','CLOSED','DECOMMISSIONED')`,
    ];
    const params: any[] = [];

    if (filters.search) {
      conditions.push(`(name LIKE ? OR customer_name LIKE ? OR project_manager LIKE ?)`);
      const q = `%${filters.search}%`;
      params.push(q, q, q);
    }
    if (filters.status) {
      conditions.push(`status = ?`);
      params.push(filters.status.toUpperCase());
    }
    if (filters.migrationType) {
      conditions.push(`migration_types LIKE ?`);
      params.push(`%${filters.migrationType}%`);
    }
    if (filters.projectManager) {
      conditions.push(`project_manager = ?`);
      params.push(filters.projectManager);
    }
    if (filters.yearFrom) {
      conditions.push(`EXTRACT(YEAR FROM COALESCE(archived_at, planned_end)) >= ?`);
      params.push(parseInt(filters.yearFrom));
    }
    if (filters.yearTo) {
      conditions.push(`EXTRACT(YEAR FROM COALESCE(archived_at, planned_end)) <= ?`);
      params.push(parseInt(filters.yearTo));
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const allowedSort: Record<string, string> = {
      archived_at: 'archived_at', name: 'name', status: 'status',
      planned_end: 'planned_end', project_manager: 'project_manager',
    };
    const safeSort = allowedSort[sortBy] || 'archived_at';
    const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countResult = await query(`SELECT COUNT(*) as total FROM projects ${where}`, params);
    const total = parseInt(countResult.rows[0]?.total || '0');

    const dataResult = await query(
      `SELECT id, name, customer_name, project_manager, account_manager, status, phase,
              planned_start, planned_end, actual_start, actual_end, migration_types,
              source_platform, target_platform, plan_type, description, notes,
              estimated_cost, actual_cost, delay_days, delay_status,
              is_escalated, is_overaged, overage_amount,
              archived_at, archive_reason, archived_by, restore_count,
              created_at, updated_at
       FROM projects ${where}
       ORDER BY ${safeSort} ${safeOrder}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      projects: dataResult.rows.map((r: any) => this.mapRow(r)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getArchiveStats() {
    await this.ensureColumns();
    const ARCH_WHERE = `archived_at IS NOT NULL AND status IN ('COMPLETED','CANCELLED','CLOSED','DECOMMISSIONED')`;
    const [byStatus, byMigration, byYear, totals] = await Promise.all([
      query(
        `SELECT status, COUNT(*) as count FROM projects
         WHERE ${ARCH_WHERE}
         GROUP BY status`,
        []
      ),
      query(
        `SELECT migration_types, COUNT(*) as count FROM projects
         WHERE ${ARCH_WHERE} AND migration_types IS NOT NULL
         GROUP BY migration_types ORDER BY count DESC LIMIT 10`,
        []
      ),
      query(
        `SELECT EXTRACT(YEAR FROM COALESCE(archived_at, planned_end)) as year, COUNT(*) as count
         FROM projects
         WHERE ${ARCH_WHERE}
         GROUP BY year ORDER BY year DESC LIMIT 5`,
        []
      ),
      query(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status='CANCELLED' THEN 1 ELSE 0 END) as cancelled,
                SUM(CASE WHEN status='CLOSED' THEN 1 ELSE 0 END) as closed,
                SUM(CASE WHEN status='DECOMMISSIONED' THEN 1 ELSE 0 END) as decommissioned,
                AVG(delay_days) as avgDelayDays,
                SUM(actual_cost) as totalActualCost
         FROM projects
         WHERE ${ARCH_WHERE}`,
        []
      ),
    ]);

    return {
      totals: {
        total: parseInt(totals.rows[0]?.total || '0'),
        completed: parseInt(totals.rows[0]?.completed || '0'),
        cancelled: parseInt(totals.rows[0]?.cancelled || '0'),
        closed: parseInt(totals.rows[0]?.closed || '0'),
        decommissioned: parseInt(totals.rows[0]?.decommissioned || '0'),
        avgDelayDays: parseFloat(totals.rows[0]?.avgDelayDays || '0').toFixed(1),
        totalActualCost: parseFloat(totals.rows[0]?.totalActualCost || '0'),
      },
      byStatus: byStatus.rows.map((r: any) => ({ status: r.status, count: parseInt(r.count) })),
      byMigration: byMigration.rows.map((r: any) => ({ type: r.migration_types, count: parseInt(r.count) })),
      byYear: byYear.rows.map((r: any) => ({ year: r.year, count: parseInt(r.count) })),
    };
  }

  async getProjectFullData(projectId: string) {
    await this.ensureColumns();

    const [projResult, escalationResult, overageResult] = await Promise.all([
      query(`SELECT * FROM projects WHERE id = ?`, [projectId]),
      query(
        `SELECT * FROM escalation_history WHERE project_id = ? ORDER BY escalated_at DESC`,
        [projectId]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT * FROM overage_history WHERE project_id = ? ORDER BY created_at DESC`,
        [projectId]
      ).catch(() => ({ rows: [] })),
    ]);

    if (!projResult.rows[0]) return null;
    const proj = projResult.rows[0];

    const [phasesResult, tasksResult] = await Promise.all([
      query(
        `SELECT id, phase_name, status, progress, planned_start, planned_end FROM project_phases WHERE project_id = ? ORDER BY order_index ASC`,
        [projectId]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT id, phase_record_id, name, status, planned_start, planned_end, assignee, progress, priority FROM project_tasks WHERE project_id = ? ORDER BY order_index ASC`,
        [projectId]
      ).catch(() => ({ rows: [] })),
    ]);

    const tasksByPhase: Record<string, any[]> = {};
    for (const t of tasksResult.rows) {
      if (!tasksByPhase[t.phase_record_id]) tasksByPhase[t.phase_record_id] = [];
      tasksByPhase[t.phase_record_id].push({
        id: t.id, name: t.name, status: t.status,
        plannedStart: t.planned_start, plannedEnd: t.planned_end,
        assignee: t.assignee, progress: t.progress, priority: t.priority,
      });
    }

    return {
      project: this.mapRow(proj),
      phases: phasesResult.rows.map((ph: any) => ({
        id: ph.id, phaseName: ph.phase_name, status: ph.status, progress: ph.progress,
        plannedStart: ph.planned_start, plannedEnd: ph.planned_end,
        tasks: tasksByPhase[ph.id] || [],
      })),
      escalationHistory: escalationResult.rows,
      overageHistory: overageResult.rows,
      exportedAt: new Date().toISOString(),
    };
  }

  async restoreProject(projectId: string, restoredBy?: string) {
    await this.ensureColumns();
    await execute(
      `UPDATE projects SET status = 'ACTIVE', archived_at = NULL, archive_reason = NULL,
       restore_count = restore_count + 1 WHERE id = ?`,
      [projectId]
    );
  }

  private mapRow(r: any) {
    return {
      id: r.id, name: r.name, customerName: r.customer_name,
      projectManager: r.project_manager, accountManager: r.account_manager,
      status: r.status, phase: r.phase,
      plannedStart: r.planned_start, plannedEnd: r.planned_end,
      actualStart: r.actual_start, actualEnd: r.actual_end,
      migrationTypes: r.migration_types, sourcePlatform: r.source_platform,
      targetPlatform: r.target_platform, planType: r.plan_type,
      description: r.description, notes: r.notes,
      estimatedCost: r.estimated_cost, actualCost: r.actual_cost,
      delayDays: r.delay_days, delayStatus: r.delay_status,
      isEscalated: !!r.is_escalated, isOveraged: !!r.is_overaged,
      overageAmount: r.overage_amount,
      archivedAt: r.archived_at, archiveReason: r.archive_reason,
      archivedBy: r.archived_by, restoreCount: r.restore_count || 0,
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }
}

export const archiveService = new ArchiveService();
