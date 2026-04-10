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
  async getStats(): Promise<DashboardStats> {
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
      query(`SELECT COUNT(*) as count FROM projects`),
      query(`SELECT COUNT(*) as count FROM projects WHERE status = 'ACTIVE'`),
      query(`SELECT COUNT(*) as count FROM projects WHERE status = 'COMPLETED'`),
      query(`SELECT COUNT(*) as count FROM projects WHERE status = 'ON_HOLD'`),
      query(`SELECT COUNT(*) as count FROM projects WHERE delay_status = 'DELAYED'`),
      query(`SELECT COUNT(*) as count FROM projects WHERE delay_status = 'AT_RISK'`),
      query(`SELECT COUNT(*) as count FROM case_studies WHERE status = 'PENDING'`),
      query(`SELECT AVG(delay_days) as avg FROM projects WHERE delay_days > 0`),
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

  async getProjectsByStatus() {
    const result = await query(
      `SELECT status, COUNT(*) as count FROM projects GROUP BY status`
    );
    return result.rows.map((r) => ({
      status: r.status,
      count: parseInt(r.count),
    }));
  }

  async getProjectsByPhase() {
    const result = await query(
      `SELECT phase, COUNT(*) as count FROM projects GROUP BY phase`
    );
    return result.rows.map((r) => ({
      phase: r.phase,
      count: parseInt(r.count),
    }));
  }

  async getProjectsByPlan() {
    const result = await query(
      `SELECT plan_type, COUNT(*) as count FROM projects GROUP BY plan_type`
    );
    return result.rows.map((r) => ({
      planType: r.plan_type,
      count: parseInt(r.count),
    }));
  }

  async getRecentActivity(limit: number = 10) {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const result = await query(
      `SELECT id, name, status, phase, updated_at 
       FROM projects ORDER BY updated_at DESC LIMIT ${safeLimit}`
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

  async getDelaySummary() {
    const [statusResults, topDelayed] = await Promise.all([
      query(
        `SELECT delay_status, COUNT(*) as count, AVG(delay_days) as avg_days 
         FROM projects GROUP BY delay_status`
      ),
      query(
        `SELECT id, name, customer_name, delay_days, delay_status 
         FROM projects WHERE delay_status = 'DELAYED' 
         ORDER BY delay_days DESC LIMIT 5`
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

  async getUpcomingDeadlines(days: number = 14) {
    const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
    const result = await query(
      `SELECT id, name, customer_name, planned_end, phase, delay_status 
       FROM projects 
       WHERE status = 'ACTIVE' AND planned_end >= NOW() AND planned_end <= DATE_ADD(NOW(), INTERVAL ${safeDays} DAY)
       ORDER BY planned_end ASC`
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

  async getMigrationTypeStats() {
    const result = await query(
      `SELECT id, migration_types, status, delay_status, planned_end, created_at FROM projects`
    );

    const allProjects = result.rows;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const migrationTypes = ['CONTENT', 'EMAIL', 'MESSAGING'];

    const stats = migrationTypes.map((type) => {
      const projectsOfType = allProjects.filter((p) =>
        p.migration_types?.toUpperCase().includes(type)
      );

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
