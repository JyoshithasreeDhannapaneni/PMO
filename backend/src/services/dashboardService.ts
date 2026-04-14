import { query } from '../config/database';

export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  onHoldProjects: number;
  delayedProjects: number;
  atRiskProjects: number;
  pendingCaseStudies: number;
  avgDelayDays: number;
}

class DashboardService {
  // Build a WHERE clause fragment for manager filtering
  private managerWhere(managerName?: string): { clause: string; params: string[] } {
    if (managerName) {
      return { clause: `WHERE project_manager = ?`, params: [managerName] };
    }
    return { clause: '', params: [] };
  }

  private andManagerWhere(managerName?: string): { clause: string; params: string[] } {
    if (managerName) {
      return { clause: `AND project_manager = ?`, params: [managerName] };
    }
    return { clause: '', params: [] };
  }

  async getStats(managerName?: string): Promise<DashboardStats> {
    const { clause: w, params: p } = this.managerWhere(managerName);
    const { clause: aw, params: ap } = this.andManagerWhere(managerName);

    const [
      totalResult,
      activeResult,
      completedResult,
      onHoldResult,
      delayedResult,
      atRiskResult,
      pendingCaseStudiesResult,
      avgDelayResult,
    ] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM projects ${w}`, p),
      query(`SELECT COUNT(*) as count FROM projects WHERE status = 'ACTIVE' ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM projects WHERE status = 'COMPLETED' ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM projects WHERE status = 'ON_HOLD' ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM projects WHERE delay_status = 'DELAYED' ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM projects WHERE delay_status = 'AT_RISK' ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM case_studies cs JOIN projects p ON cs.project_id = p.id WHERE cs.status = 'PENDING' ${aw.replace(/^AND /, 'AND p.')}`, ap),
      query(`SELECT AVG(delay_days) as avg FROM projects WHERE delay_days > 0 ${aw}`, ap),
    ]);

    return {
      totalProjects: parseInt(totalResult.rows[0].count || 0),
      activeProjects: parseInt(activeResult.rows[0].count || 0),
      completedProjects: parseInt(completedResult.rows[0].count || 0),
      onHoldProjects: parseInt(onHoldResult.rows[0].count || 0),
      delayedProjects: parseInt(delayedResult.rows[0].count || 0),
      atRiskProjects: parseInt(atRiskResult.rows[0].count || 0),
      pendingCaseStudies: parseInt(pendingCaseStudiesResult.rows[0].count || 0),
      avgDelayDays: Math.round(parseFloat(avgDelayResult.rows[0].avg) || 0),
    };
  }

  async getProjectsByStatus(managerName?: string) {
    const { clause: w, params: p } = this.managerWhere(managerName);
    const result = await query(
      `SELECT status, COUNT(*) as count FROM projects ${w} GROUP BY status`, p
    );
    return result.rows.map((r) => ({
      status: r.status,
      count: parseInt(r.count),
    }));
  }

  async getProjectsByPhase(managerName?: string) {
    const { clause: w, params: p } = this.managerWhere(managerName);
    const result = await query(
      `SELECT phase, COUNT(*) as count FROM projects ${w} GROUP BY phase`, p
    );
    return result.rows.map((r) => ({
      phase: r.phase,
      count: parseInt(r.count),
    }));
  }

  async getProjectsByPlan(managerName?: string) {
    const { clause: w, params: p } = this.managerWhere(managerName);
    const result = await query(
      `SELECT plan_type, COUNT(*) as count FROM projects ${w} GROUP BY plan_type`, p
    );
    return result.rows.map((r) => ({
      planType: r.plan_type,
      count: parseInt(r.count),
    }));
  }

  async getRecentActivity(limit: number = 10, managerName?: string) {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const { clause: w, params: p } = this.managerWhere(managerName);
    const result = await query(
      `SELECT id, name, status, phase, updated_at
       FROM projects ${w} ORDER BY updated_at DESC LIMIT ${safeLimit}`, p
    );

    return result.rows.map((p) => ({
      id: p.id,
      type: 'project_update',
      message: `Project "${p.name}" updated`,
      projectId: p.id,
      projectName: p.name,
      timestamp: p.updated_at,
    }));
  }

  async getDelaySummary(managerName?: string) {
    const { clause: w, params: p } = this.managerWhere(managerName);
    const { clause: aw, params: ap } = this.andManagerWhere(managerName);
    const [statusResults, topDelayed] = await Promise.all([
      query(
        `SELECT delay_status, COUNT(*) as count, AVG(delay_days) as avg_days
         FROM projects ${w} GROUP BY delay_status`, p
      ),
      query(
        `SELECT id, name, customer_name, delay_days, delay_status
         FROM projects WHERE delay_status = 'DELAYED' ${aw}
         ORDER BY delay_days DESC LIMIT 5`, ap
      ),
    ]);

    return {
      byStatus: statusResults.rows.map((r) => ({
        delayStatus: r.delay_status,
        count: parseInt(r.count),
        avgDays: Math.round(parseFloat(r.avg_days) || 0),
      })),
      topDelayed: topDelayed.rows.map((r) => ({
        id: r.id,
        name: r.name,
        customerName: r.customer_name,
        delayDays: r.delay_days,
        delayStatus: r.delay_status,
      })),
    };
  }

  async getUpcomingDeadlines(days: number = 14, managerName?: string) {
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
  const { clause: aw, params: ap } = this.andManagerWhere(managerName);

  const result = await query(
    `SELECT id, name, customer_name, planned_end, phase, delay_status
     FROM projects
     WHERE status = 'ACTIVE'
       AND planned_end >= NOW()
       AND planned_end <= NOW() + INTERVAL '${safeDays} days'
       ${aw}
     ORDER BY planned_end ASC`,
    ap
  );

  return result.rows.map((p) => ({
    id: p.id,
    name: p.name,
    customerName: p.customer_name,
    deadline: p.planned_end,
    phase: p.phase,
    delayStatus: p.delay_status,
  }));
}
  async getMigrationTypeStats(managerName?: string) {
    const { clause: w, params: p } = this.managerWhere(managerName);
    const result = await query(
      `SELECT id, migration_types, status, delay_status, planned_end, created_at FROM projects ${w}`, p
    );

    const allProjects = result.rows;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const migrationTypes = ['CONTENT', 'EMAIL', 'MESSAGING'];

    const stats = migrationTypes.map((type) => {
      const projectsOfType = allProjects.filter((p) =>
        p.migration_types?.toUpperCase().includes(type)      );

      const active = projectsOfType.filter((p) => p.status === 'ACTIVE').length;
      const inactive = projectsOfType.filter((p) => p.status === 'ON_HOLD').length;
      const completed = projectsOfType.filter((p) => p.status === 'COMPLETED').length;
      const cancelled = projectsOfType.filter((p) => p.status === 'CANCELLED').length;
      const newProjects = projectsOfType.filter((p) => new Date(p.created_at) >= thirtyDaysAgo).length;
      const overaged = projectsOfType.filter((p) =>
        p.status === 'ACTIVE' && new Date(p.planned_end) < now
      ).length;
      const delayed = projectsOfType.filter((p) => p.delay_status === 'DELAYED').length;
      const atRisk = projectsOfType.filter((p) => p.delay_status === 'AT_RISK').length;

      return {
        type,
        total: projectsOfType.length,
        active,
        inactive,
        completed,
        cancelled,
        newProjects,
        overaged,
        delayed,
        atRisk,
      };
    });

    const allActive = allProjects.filter((p) => p.status === 'ACTIVE').length;
    const allInactive = allProjects.filter((p) => p.status === 'ON_HOLD').length;
    const allCompleted = allProjects.filter((p) => p.status === 'COMPLETED').length;
    const allCancelled = allProjects.filter((p) => p.status === 'CANCELLED').length;
    const allNew = allProjects.filter((p) => new Date(p.created_at) >= thirtyDaysAgo).length;
    const allOveraged = allProjects.filter((p) =>
      p.status === 'ACTIVE' && new Date(p.planned_end) < now
    ).length;
    const allDelayed = allProjects.filter((p) => p.delay_status === 'DELAYED').length;
    const allAtRisk = allProjects.filter((p) => p.delay_status === 'AT_RISK').length;

    return {
      byType: stats,
      totals: {
        total: allProjects.length,
        active: allActive,
        inactive: allInactive,
        completed: allCompleted,
        cancelled: allCancelled,
        newProjects: allNew,
        overaged: allOveraged,
        delayed: allDelayed,
        atRisk: allAtRisk,
      },
    };
  }

  async getProjectsByMigrationType(type: string) {
    const result = await query(
      `SELECT id, name, customer_name, project_manager, status, phase, delay_status, delay_days, planned_end, migration_types
       FROM projects 
       WHERE migration_types LIKE ?
       ORDER BY updated_at DESC`,
      [`%${type.toUpperCase()}%`]
    );

    return result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      customerName: r.customer_name,
      projectManager: r.project_manager,
      status: r.status,
      phase: r.phase,
      delayStatus: r.delay_status,
      delayDays: r.delay_days,
      plannedEnd: r.planned_end,
      migrationTypes: r.migration_types,
    }));
  }
}

export const dashboardService = new DashboardService();
