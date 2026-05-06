import { query, execute } from '../config/database';

export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  inactiveProjects: number;
  completedProjects: number;
  onHoldProjects: number;
  delayedProjects: number;
  atRiskProjects: number;
  pendingCaseStudies: number;
  avgDelayDays: number;
  overagedCount: number;
}

class DashboardService {
  // Build a WHERE clause fragment for manager filtering
  private managerWhere(managerName?: string): { clause: string; params: string[] } {
    if (managerName) {
      return { clause: `WHERE project_manager = $1`, params: [managerName] };
    }
    return { clause: '', params: [] };
  }

  private andManagerWhere(managerName?: string): { clause: string; params: string[] } {
    if (managerName) {
      return { clause: `AND project_manager = $1`, params: [managerName] };
    }
    return { clause: '', params: [] };
  }

  async getStats(managerName?: string): Promise<DashboardStats> {
    const { clause: w, params: p } = this.managerWhere(managerName);
    const { clause: aw, params: ap } = this.andManagerWhere(managerName);

    const [
      totalResult,
      activeResult,
      inactiveResult,
      completedResult,
      onHoldResult,
      delayedResult,
      atRiskResult,
      pendingCaseStudiesResult,
      avgDelayResult,
      overagedResult,
    ] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM projects WHERE status NOT IN ('COMPLETED','CANCELLED') ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM projects WHERE status = 'ACTIVE' ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM projects WHERE status = 'ON_HOLD' ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM projects WHERE status = 'COMPLETED' ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM projects WHERE status = 'ON_HOLD' ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM projects WHERE delay_status = 'DELAYED' ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM projects WHERE delay_status = 'AT_RISK' ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM case_studies cs JOIN projects p ON cs.project_id = p.id WHERE cs.status = 'PENDING' ${aw.replace(/^AND /, 'AND p.')}`, ap),
      query(`SELECT AVG(delay_days) as avg FROM projects WHERE delay_days > 0 ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM projects WHERE is_overaged = 1`, []),
    ]);

    return {
      totalProjects: parseInt(totalResult.rows[0].count || 0),
      activeProjects: parseInt(activeResult.rows[0].count || 0),
      inactiveProjects: parseInt(inactiveResult.rows[0].count || 0),
      completedProjects: parseInt(completedResult.rows[0].count || 0),
      onHoldProjects: parseInt(onHoldResult.rows[0].count || 0),
      delayedProjects: parseInt(delayedResult.rows[0].count || 0),
      atRiskProjects: parseInt(atRiskResult.rows[0].count || 0),
      pendingCaseStudies: parseInt(pendingCaseStudiesResult.rows[0].count || 0),
      avgDelayDays: Math.round(parseFloat(avgDelayResult.rows[0].avg) || 0),
      overagedCount: parseInt(overagedResult.rows[0].count || 0),
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
       AND planned_end <= NOW() + (${safeDays} * INTERVAL '1 day')
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
    const [projectsResult, templatesResult] = await Promise.all([
      query(`SELECT id, migration_types, status, delay_status, planned_end, created_at FROM projects ${w}`, p),
      query(`SELECT id, code, name FROM migration_templates WHERE is_active = 1 ORDER BY name ASC`, []),
    ]);

    const allProjects = projectsResult.rows;
    const templates: { id: string; code: string; name: string }[] = templatesResult.rows;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Normalise a stored migration_types value to a set of UPPERCASE codes.
    // Handles: "CONTENT", "content", "CONTENT,EMAIL", and legacy numeric IDs like "1","2".
    const resolveToCode = (raw: string): string => {
      const up = raw.trim().toUpperCase();
      // Direct code match
      if (templates.some(t => t.code.toUpperCase() === up)) return up;
      // Name match (e.g. stored "Content Migration" → template name "Content Migration" → code "CONTENT")
      // Also handles legacy double-suffix like "Content Migration Migration"
      const cleaned = up.replace(/ MIGRATION$/, '').replace(/ MIGRATION$/, '');
      const byName = templates.find(t =>
        t.name.toUpperCase().replace(/\s+/g, '') === up.replace(/\s+/g, '') ||
        t.name.toUpperCase().replace(/\s+/g, '') === cleaned.replace(/\s+/g, '') ||
        t.code.toUpperCase() === cleaned.trim()
      );
      if (byName) return byName.code.toUpperCase();
      // Legacy numeric index (1-based position in templates list)
      const idx = parseInt(up, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= templates.length) return templates[idx - 1].code.toUpperCase();
      return up; // return as-is, may still match by includes below
    };

    const projectTypeCodes = (migTypes: string): string[] => {
      if (!migTypes) return [];
      return migTypes.split(',').map(s => resolveToCode(s.trim())).filter(Boolean);
    };

    const stats = templates.map((tpl) => {
      const code = tpl.code.toUpperCase();
      const projectsOfType = allProjects.filter((proj) =>
        projectTypeCodes(proj.migration_types || '').includes(code)
      );

      return {
        type: code,
        name: tpl.name,
        total: projectsOfType.length,
        active:       projectsOfType.filter(proj => proj.status === 'ACTIVE').length,
        inactive:     projectsOfType.filter(proj => proj.status === 'ON_HOLD').length,
        completed:    projectsOfType.filter(proj => proj.status === 'COMPLETED').length,
        cancelled:    projectsOfType.filter(proj => proj.status === 'CANCELLED').length,
        newProjects:  projectsOfType.filter(proj => new Date(proj.created_at) >= thirtyDaysAgo).length,
        overaged:     projectsOfType.filter(proj => proj.status === 'ACTIVE' && new Date(proj.planned_end) < now).length,
        delayed:      projectsOfType.filter(proj => proj.delay_status === 'DELAYED').length,
        atRisk:       projectsOfType.filter(proj => proj.delay_status === 'AT_RISK').length,
      };
    });

    return {
      byType: stats,
      totals: {
        total:       allProjects.length,
        active:      allProjects.filter(proj => proj.status === 'ACTIVE').length,
        inactive:    allProjects.filter(proj => proj.status === 'ON_HOLD').length,
        completed:   allProjects.filter(proj => proj.status === 'COMPLETED').length,
        cancelled:   allProjects.filter(proj => proj.status === 'CANCELLED').length,
        newProjects: allProjects.filter(proj => new Date(proj.created_at) >= thirtyDaysAgo).length,
        overaged:    allProjects.filter(proj => proj.status === 'ACTIVE' && new Date(proj.planned_end) < now).length,
        delayed:     allProjects.filter(proj => proj.delay_status === 'DELAYED').length,
        atRisk:      allProjects.filter(proj => proj.delay_status === 'AT_RISK').length,
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

  async getOveragedProjects(managerName?: string) {
    const { clause: aw, params: ap } = this.andManagerWhere(managerName);
    const result = await query(
      `SELECT id, name, customer_name, project_manager, account_manager, status, phase,
              planned_end, delay_days, delay_status, migration_types, is_overaged, overage_amount, overage_notes,
              extended_start_date, extended_end_date
       FROM projects
       WHERE is_overaged = 1 AND status NOT IN ('COMPLETED','CANCELLED') ${aw}
       ORDER BY planned_end ASC`,
      ap
    );
    const now = new Date();
    return result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      customerName: r.customer_name,
      projectManager: r.project_manager,
      accountManager: r.account_manager,
      status: r.status,
      phase: r.phase,
      plannedEnd: r.planned_end,
      daysOverdue: Math.max(0, Math.floor((now.getTime() - new Date(r.planned_end).getTime()) / 86400000)),
      delayDays: r.delay_days,
      migrationTypes: r.migration_types,
      isOveraged: !!r.is_overaged,
      overageAmount: r.overage_amount ?? null,
      overageNotes: r.overage_notes ?? null,
      extendedStartDate: r.extended_start_date ?? null,
      extendedEndDate: r.extended_end_date ?? null,
    }));
  }

  private _escalationHistoryReady = false;
  async ensureEscalationHistoryTable() {
    if (this._escalationHistoryReady) return;
    await execute(`CREATE TABLE IF NOT EXISTS escalation_history (
      id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
      project_id CHAR(36) NOT NULL,
      priority ENUM('LOW','MEDIUM','HIGH') NOT NULL DEFAULT 'MEDIUM',
      escalation_type VARCHAR(100),
      notes TEXT,
      escalated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_date DATETIME NULL,
      INDEX idx_esc_hist_project (project_id)
    )`, []);
    // Add resolved_date to projects table if missing
    try {
      await execute(`ALTER TABLE projects ADD COLUMN resolved_date DATETIME NULL`, []);
    } catch (_) { /* column already exists */ }
    this._escalationHistoryReady = true;
  }

  async getEscalatedProjects(managerName?: string) {
    await this.ensureEscalationHistoryTable();
    const { clause: aw, params: ap } = this.andManagerWhere(managerName);
    const result = await query(
      `SELECT id, name, customer_name, project_manager, account_manager, status, phase,
              planned_end, delay_days, delay_status, migration_types,
              is_escalated, escalation_priority, escalated_at, escalation_notes, resolved_date
       FROM projects
       WHERE is_escalated = 1 AND status NOT IN ('COMPLETED','CANCELLED') ${aw}
       ORDER BY FIELD(escalation_priority,'HIGH','MEDIUM','LOW'), delay_days DESC`,
      ap
    );
    const projects = result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      customerName: r.customer_name,
      projectManager: r.project_manager,
      accountManager: r.account_manager,
      status: r.status,
      phase: r.phase,
      plannedEnd: r.planned_end,
      delayDays: r.delay_days,
      delayStatus: r.delay_status,
      migrationTypes: r.migration_types,
      isEscalated: !!r.is_escalated,
      escalationPriority: r.escalation_priority || (r.delay_days >= 14 ? 'HIGH' : r.delay_days >= 7 ? 'MEDIUM' : 'LOW'),
      escalatedAt: r.escalated_at,
      escalationNotes: r.escalation_notes,
      resolvedDate: r.resolved_date,
      escalationHistory: [] as any[],
    }));
    // Fetch history for all projects
    if (projects.length > 0) {
      const ids = projects.map((p) => p.id);
      const placeholders = ids.map(() => '?').join(',');
      const histResult = await query(
        `SELECT id, project_id, priority, escalation_type, notes, escalated_at, resolved_date
         FROM escalation_history WHERE project_id IN (${placeholders}) ORDER BY escalated_at DESC`,
        ids
      );
      const histMap: Record<string, any[]> = {};
      for (const h of histResult.rows) {
        if (!histMap[h.project_id]) histMap[h.project_id] = [];
        histMap[h.project_id].push({
          id: h.id,
          priority: h.priority,
          escalationType: h.escalation_type,
          notes: h.notes,
          escalatedAt: h.escalated_at,
          resolvedDate: h.resolved_date,
        });
      }
      for (const p of projects) {
        p.escalationHistory = histMap[p.id] || [];
      }
    }
    return projects;
  }

  private _overageHistoryReady = false;
  async ensureOverageHistoryTable() {
    if (this._overageHistoryReady) return;
    await execute(`CREATE TABLE IF NOT EXISTS overage_history (
      id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
      project_id CHAR(36) NOT NULL,
      overage_amount DECIMAL(15,2) NULL,
      notes TEXT NULL,
      extended_start_date DATETIME NULL,
      extended_end_date DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_overage_hist_project (project_id)
    )`, []);
    // Add extended_start_date and extended_end_date columns to projects if missing
    try { await execute(`ALTER TABLE projects ADD COLUMN extended_start_date DATETIME NULL`, []); } catch (_) { /* exists */ }
    try { await execute(`ALTER TABLE projects ADD COLUMN extended_end_date DATETIME NULL`, []); } catch (_) { /* exists */ }
    this._overageHistoryReady = true;
  }

  async markOverageProject(projectId: string, overageAmount?: number, notes?: string, extendedStartDate?: string, extendedEndDate?: string) {
    await this.ensureOverageHistoryTable();
    const updates: string[] = ['is_overaged = 1', 'overage_amount = ?', 'overage_notes = ?'];
    const params: any[] = [overageAmount || null, notes || null];
    if (extendedStartDate) { updates.push('extended_start_date = ?'); params.push(new Date(extendedStartDate)); }
    if (extendedEndDate) {
      updates.push('extended_end_date = ?'); params.push(new Date(extendedEndDate));
      // Sync extended end date into the SOW End Date (planned_end) so project timeline reflects it
      updates.push('planned_end = ?'); params.push(new Date(extendedEndDate));
    }
    params.push(projectId);
    await execute(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`, params);
    // Insert into overage_history so multiple overage events are tracked
    await execute(
      `INSERT INTO overage_history (id, project_id, overage_amount, notes, extended_start_date, extended_end_date, created_at)
       VALUES (UUID(), ?, ?, ?, ?, ?, NOW())`,
      [
        projectId,
        overageAmount || null,
        notes || null,
        extendedStartDate ? new Date(extendedStartDate) : null,
        extendedEndDate ? new Date(extendedEndDate) : null,
      ]
    );
  }

  async unmarkOverageProject(projectId: string) {
    await execute(
      `UPDATE projects SET is_overaged = 0, overage_amount = NULL, overage_notes = NULL WHERE id = ?`,
      [projectId]
    );
  }

  async escalateProject(projectId: string, priority: 'LOW' | 'MEDIUM' | 'HIGH', notes?: string) {
    await this.ensureEscalationHistoryTable();
    // Parse type and notes from combined notes string (format: "Type — user notes")
    let escalationType = 'Others';
    let userNotes = notes || null;
    if (notes && notes.includes(' — ')) {
      const parts = notes.split(' — ');
      escalationType = parts[0];
      userNotes = parts.slice(1).join(' — ') || null;
    } else if (notes) {
      const TYPES = ['Client Issues', 'Tools Issues', 'Process Issues', 'Resource Issues', 'Data Related Issues', 'Others'];
      if (TYPES.includes(notes)) { escalationType = notes; userNotes = null; }
    }
    await execute(
      `UPDATE projects SET is_escalated = 1, escalation_priority = ?, escalated_at = NOW(), escalation_notes = ?, resolved_date = NULL WHERE id = ?`,
      [priority, notes || null, projectId]
    );
    await execute(
      `INSERT INTO escalation_history (project_id, priority, escalation_type, notes, escalated_at) VALUES (?, ?, ?, ?, NOW())`,
      [projectId, priority, escalationType, userNotes]
    );
  }

  async setResolvedDate(projectId: string, resolvedDate: string | null) {
    await this.ensureEscalationHistoryTable();
    const rd = resolvedDate ? new Date(resolvedDate) : null;
    await execute(`UPDATE projects SET resolved_date = ? WHERE id = ?`, [rd, projectId]);
    if (rd) {
      // Mark the most recent open history record as resolved
      await execute(
        `UPDATE escalation_history SET resolved_date = ? WHERE project_id = ? AND resolved_date IS NULL ORDER BY escalated_at DESC LIMIT 1`,
        [rd, projectId]
      );
    } else {
      await execute(
        `UPDATE escalation_history SET resolved_date = NULL WHERE project_id = ? AND resolved_date IS NOT NULL`,
        [projectId]
      );
    }
  }

  async deescalateProject(projectId: string) {
    await this.ensureEscalationHistoryTable();
    await execute(
      `UPDATE escalation_history SET resolved_date = NOW() WHERE project_id = ? AND resolved_date IS NULL`,
      [projectId]
    );
    await execute(
      `UPDATE projects SET is_escalated = 0, escalation_priority = NULL, escalated_at = NULL, escalation_notes = NULL, resolved_date = NOW() WHERE id = ?`,
      [projectId]
    );
  }

  async getProjectsByMigrationType(type: string) {
    const code = type.toUpperCase();

    // Find the 1-based index of this type in the templates table (for legacy numeric IDs)
    const tplResult = await query(
      `SELECT code FROM migration_templates WHERE is_active = 1 ORDER BY name ASC`, []
    );
    const tplCodes: string[] = tplResult.rows.map((r: any) => r.code.toUpperCase());
    const legacyIdx = tplCodes.indexOf(code) + 1; // 1-based; 0 means not found

    let sql = `SELECT id, name, customer_name, project_manager, status, phase, delay_status, delay_days, planned_end, migration_types
               FROM projects
               WHERE migration_types LIKE ?`;
    const params: any[] = [`%${code}%`];

    // Also match legacy numeric ID
    if (legacyIdx > 0) {
      sql += ` OR migration_types = ? OR migration_types LIKE ? OR migration_types LIKE ?`;
      params.push(
        String(legacyIdx),
        `${legacyIdx},%`,
        `%,${legacyIdx}`,
      );
    }

    sql += ` ORDER BY updated_at DESC`;
    const result = await query(sql, params);

    return result.rows.map((r: any) => ({
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
