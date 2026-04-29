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
       AND planned_end <= DATE_ADD(NOW(), INTERVAL ${safeDays} DAY)
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

  async getManagerStats(managerName?: string) {
    const { clause: w, params: p } = this.managerWhere(managerName);
    const result = await query(
      `SELECT project_manager, status, delay_status FROM projects ${w}`, p
    );
    const rows = result.rows;
    const managerMap: Record<string, { total: number; completed: number; delayed: number; active: number }> = {};
    rows.forEach((r) => {
      const m = r.project_manager || 'Unassigned';
      if (!managerMap[m]) managerMap[m] = { total: 0, completed: 0, delayed: 0, active: 0 };
      managerMap[m].total++;
      if (r.status === 'COMPLETED') managerMap[m].completed++;
      if (r.status === 'ACTIVE') managerMap[m].active++;
      if (r.delay_status === 'DELAYED') managerMap[m].delayed++;
    });
    return Object.entries(managerMap).map(([manager, s]) => ({
      manager,
      total: s.total,
      active: s.active,
      completed: s.completed,
      delayed: s.delayed,
      achievedPct: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
      goalPct: 80,
    }));
  }

  async getWeeklyReport(managerName?: string, startDate?: string, endDate?: string) {
    const { clause: w, params: p } = this.managerWhere(managerName);
    const { clause: aw, params: ap } = this.andManagerWhere(managerName);

    const now = endDate ? new Date(endDate) : new Date();
    const weekStart = startDate ? new Date(startDate) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const periodMs = now.getTime() - weekStart.getTime();
    const prevWeekStart = new Date(weekStart.getTime() - periodMs);

    const wsStr = weekStart.toISOString();
    const pwStr = prevWeekStart.toISOString();
    const nowStr = now.toISOString();

    const [newlyAdded, prevNewlyAdded, closedThisWeek, prevClosed, changedThisWeek, prevChanged] =
      await Promise.all([
        query(
          `SELECT id, name, customer_name, project_manager, migration_types, created_at
           FROM projects WHERE created_at >= ? AND created_at < ? ${aw}`,
          [wsStr, nowStr, ...ap]
        ),
        query(
          `SELECT COUNT(*) as count FROM projects WHERE created_at >= ? AND created_at < ? ${aw}`,
          [pwStr, wsStr, ...ap]
        ),
        query(
          `SELECT id, name, customer_name, project_manager, migration_types, status, updated_at
           FROM projects WHERE status IN ('COMPLETED','CANCELLED') AND updated_at >= ? AND updated_at < ? ${aw}`,
          [wsStr, nowStr, ...ap]
        ),
        query(
          `SELECT COUNT(*) as count FROM projects WHERE status IN ('COMPLETED','CANCELLED') AND updated_at >= ? AND updated_at < ? ${aw}`,
          [pwStr, wsStr, ...ap]
        ),
        query(
          `SELECT id, name, customer_name, project_manager, migration_types, updated_at
           FROM projects WHERE updated_at >= ? AND updated_at < ? AND status = 'ACTIVE' ${aw}`,
          [wsStr, nowStr, ...ap]
        ),
        query(
          `SELECT COUNT(*) as count FROM projects WHERE updated_at >= ? AND updated_at < ? AND status = 'ACTIVE' ${aw}`,
          [pwStr, wsStr, ...ap]
        ),
      ]);

    const newlyAddedRows = newlyAdded.rows;
    const closedRows = closedThisWeek.rows;
    const changedRows = changedThisWeek.rows;

    // Change types breakdown from migration_types across all changed projects
    const allChanged = [...newlyAddedRows, ...closedRows, ...changedRows];
    const uniqueProjectIds = new Set(allChanged.map((r) => r.id));
    const managersInvolved = new Set(allChanged.map((r) => r.project_manager).filter(Boolean));

    const changeTypeCounts: Record<string, number> = { Configuration: 0, Content: 0, Access: 0, Others: 0 };
    changedRows.forEach((r) => {
      const mt = (r.migration_types || '').toUpperCase();
      if (mt.includes('EMAIL')) changeTypeCounts['Configuration']++;
      else if (mt.includes('CONTENT')) changeTypeCounts['Content']++;
      else if (mt.includes('MESSAGING')) changeTypeCounts['Access']++;
      else changeTypeCounts['Others']++;
    });

    // Group changes by manager
    const changesByManager: Record<string, number> = {};
    changedRows.forEach((r) => {
      const mgr = r.project_manager || 'Unassigned';
      changesByManager[mgr] = (changesByManager[mgr] || 0) + 1;
    });

    return {
      weekRange: {
        start: weekStart.toISOString(),
        end: now.toISOString(),
      },
      summary: {
        newlyAdded: newlyAddedRows.length,
        newlyAddedVsLastWeek: newlyAddedRows.length - parseInt(prevNewlyAdded.rows[0].count || 0),
        closedDecommissioned: closedRows.length,
        closedVsLastWeek: closedRows.length - parseInt(prevClosed.rows[0].count || 0),
        changesByManagers: changedRows.length,
        changesVsLastWeek: changedRows.length - parseInt(prevChanged.rows[0].count || 0),
        totalProjectsImpacted: uniqueProjectIds.size,
        managersInvolved: managersInvolved.size,
        applicationsModified: uniqueProjectIds.size,
      },
      changeTypes: Object.entries(changeTypeCounts)
        .filter(([, v]) => v > 0)
        .map(([label, count]) => ({ label, count })),
      changesByManager: Object.entries(changesByManager).map(([manager, count]) => ({ manager, count })),
      newlyAddedProjects: newlyAddedRows.map((r) => ({
        id: r.id,
        name: r.name,
        customerName: r.customer_name,
        projectManager: r.project_manager,
        migrationTypes: r.migration_types,
        createdAt: r.created_at,
      })),
      closedProjects: closedRows.map((r) => ({
        id: r.id,
        name: r.name,
        customerName: r.customer_name,
        projectManager: r.project_manager,
        migrationTypes: r.migration_types,
        status: r.status,
        updatedAt: r.updated_at,
      })),
      changedProjects: changedRows.map((r) => ({
        id: r.id,
        name: r.name,
        customerName: r.customer_name,
        projectManager: r.project_manager,
        migrationTypes: r.migration_types,
        updatedAt: r.updated_at,
      })),
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
