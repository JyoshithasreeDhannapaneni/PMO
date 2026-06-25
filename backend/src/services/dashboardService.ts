import { query, execute } from '../config/db';

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

  private andManagerWhere(managerName?: string, existingParamCount = 0): { clause: string; params: string[] } {
    if (managerName) {
      return { clause: `AND project_manager = $${existingParamCount + 1}`, params: [managerName] };
    }
    return { clause: '', params: [] };
  }

  async getStats(managerName?: string): Promise<DashboardStats> {
    const { clause: aw, params: ap } = this.andManagerWhere(managerName);

    const [
      totalResult,
      activeResult,
      onHoldResult,
      completedResult,
      delayedResult,
      atRiskResult,
      pendingCaseStudiesResult,
      avgDelayResult,
      overagedResult,
      inactiveResult,
    ] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM projects WHERE status != 'CANCELLED' ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM projects WHERE status = 'ACTIVE' ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM projects WHERE status = 'ON_HOLD' ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM projects WHERE status = 'COMPLETED' ${aw}`, ap),
      // Delayed and at-risk are subsets of active — counted separately for display within the Active card
      query(`SELECT COUNT(*) as count FROM projects WHERE status = 'ACTIVE' AND delay_status = 'DELAYED' ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM projects WHERE status = 'ACTIVE' AND delay_status = 'AT_RISK' ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM case_studies cs JOIN projects p ON cs.project_id = p.id WHERE cs.status = 'PENDING' ${aw.replace(/^AND /, 'AND p.')}`, ap),
      query(`SELECT AVG(delay_days) as avg FROM projects WHERE delay_days > 0 ${aw}`, ap),
      query(`SELECT COUNT(*) as count FROM projects WHERE is_overaged = true`, []),
      query(`SELECT COUNT(*) as count FROM projects WHERE status = 'INACTIVE' ${aw}`, ap),
    ]);

    return {
      totalProjects:    parseInt(totalResult.rows[0].count || 0),
      activeProjects:   parseInt(activeResult.rows[0].count || 0),
      inactiveProjects: parseInt(inactiveResult.rows[0].count || 0),
      onHoldProjects:   parseInt(onHoldResult.rows[0].count || 0),
      completedProjects: parseInt(completedResult.rows[0].count || 0),
      // delayedProjects and atRiskProjects are subsets of activeProjects (status=ACTIVE only)
      delayedProjects:  parseInt(delayedResult.rows[0].count || 0),
      atRiskProjects:   parseInt(atRiskResult.rows[0].count || 0),
      pendingCaseStudies: parseInt(pendingCaseStudiesResult.rows[0].count || 0),
      avgDelayDays:     Math.round(parseFloat(avgDelayResult.rows[0].avg) || 0),
      overagedCount:    parseInt(overagedResult.rows[0].count || 0),
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
       AND planned_end <= NOW() + ($${ap.length + 1} * INTERVAL '1 day')
       ${aw}
     ORDER BY planned_end ASC`,
    [...ap, safeDays]
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
  // Determine the top-level category for a migration template code/name.
  // Categories: 'Content Migration', 'Messaging', 'Email'
  private getMigrationCategory(codeOrName: string): string {
    const u = codeOrName.toUpperCase();
    const MESSAGING_KEYWORDS = [
      'SLACK', 'TEAMS', 'CHAT', 'META_CHAT', 'META_VIVA', 'META_TEAMS',
      'ZOOM_PHONE', 'ZOOMPHONE', 'RINGCENTRAL', 'CISCO', 'WEBEX',
      'SKYPE', 'VIVA', 'META',
    ];
    const EMAIL_KEYWORDS = [
      'GMAIL', 'OUTLOOK', 'EXCHANGE', 'OFFICE365', 'GOOGLE_WORKSPACE', 'GOOGLE WORKSPACE',
      'GSUITE', 'G_SUITE', 'LOTUS', 'NOTES', 'NOVELL', 'IMAP', 'POP3', 'ZIMBRA',
      'HOTMAIL', 'YAHOO', 'KERIO', 'GROUPWISE', 'DOMINO',
    ];
    if (MESSAGING_KEYWORDS.some(k => u.includes(k))) return 'Messaging';
    if (EMAIL_KEYWORDS.some(k => u.includes(k))) return 'Email';
    return 'Content Migration';
  }

  async getMigrationTypeStats(managerName?: string) {
    const { clause: w, params: p } = this.managerWhere(managerName);

    const CAT_DEFS = [
      { key: 'Content Migration', icon: '📁', color: 'blue' },
      { key: 'Messaging',         icon: '💬', color: 'green' },
      { key: 'Email',             icon: '📧', color: 'purple' },
    ] as const;

    const makeEmpty = () => ({
      byType: CAT_DEFS.map(({ key, icon, color }) => ({
        type: key, name: key, icon, color,
        total: 0, active: 0, inactive: 0, completed: 0, cancelled: 0,
        newProjects: 0, overaged: 0, delayed: 0, atRisk: 0,
      })),
      totals: { total: 0, active: 0, inactive: 0, completed: 0, cancelled: 0, newProjects: 0, overaged: 0, delayed: 0, atRisk: 0 },
    });

    let allProjects: any[];
    let templates: { id: string; code: string; name: string }[];
    try {
      const [pr, tr] = await Promise.all([
        query(`SELECT id, migration_types, status, delay_status, planned_end, created_at FROM projects ${w}`, p),
        query(`SELECT id, code, name FROM migration_templates WHERE is_active = true ORDER BY name ASC`, []).catch(() => ({ rows: [] as any[] })),
      ]);
      allProjects = pr.rows;
      templates = tr.rows;
    } catch (_) {
      return makeEmpty();
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const resolveToCode = (raw: string): string => {
      const up = raw.trim().toUpperCase();
      if (templates.some((t) => t.code.toUpperCase() === up)) return up;
      const cleaned = up.replace(/ MIGRATION$/, '').replace(/ MIGRATION$/, '');
      const byName = templates.find((t) =>
        t.name.toUpperCase().replace(/\s+/g, '') === up.replace(/\s+/g, '') ||
        t.name.toUpperCase().replace(/\s+/g, '') === cleaned.replace(/\s+/g, '') ||
        t.code.toUpperCase() === cleaned.trim()
      );
      if (byName) return byName.code.toUpperCase();
      const idx = parseInt(up, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= templates.length) return templates[idx - 1]?.code?.toUpperCase() ?? up;
      return up;
    };

    const getProjectCategory = (migTypes: string): string => {
      if (!migTypes) return 'Content Migration';
      const parts = migTypes.split(',').map((s) => s.trim());
      for (const part of parts) {
        const code = resolveToCode(part);
        const tpl = templates.find((t) => t.code.toUpperCase() === code);
        const label = tpl ? `${tpl.code} ${tpl.name}` : part;
        const cat = this.getMigrationCategory(label);
        if (cat !== 'Content Migration') return cat;
      }
      const raw = migTypes.toUpperCase();
      if (raw.includes('MESSAGING') || raw.includes('SLACK') || raw.includes('TEAMS')) return 'Messaging';
      if (raw.includes('EMAIL') || raw.includes('EXCHANGE') || raw.includes('GMAIL')) return 'Email';
      return 'Content Migration';
    };

    const stats = CAT_DEFS.map(({ key, icon, color }) => {
      const ofType = allProjects.filter((r: any) => getProjectCategory(r.migration_types || '') === key);
      return {
        type: key, name: key, icon, color,
        total:       ofType.length,
        active:      ofType.filter((r: any) => r.status === 'ACTIVE').length,
        inactive:    ofType.filter((r: any) => r.status === 'ON_HOLD').length,
        completed:   ofType.filter((r: any) => r.status === 'COMPLETED').length,
        cancelled:   ofType.filter((r: any) => r.status === 'CANCELLED').length,
        newProjects: ofType.filter((r: any) => new Date(r.created_at) >= thirtyDaysAgo).length,
        overaged:    ofType.filter((r: any) => r.status === 'ACTIVE' && new Date(r.planned_end) < now).length,
        delayed:     ofType.filter((r: any) => r.delay_status === 'DELAYED').length,
        atRisk:      ofType.filter((r: any) => r.delay_status === 'AT_RISK').length,
      };
    });

    return {
      byType: stats,
      totals: {
        total:       allProjects.length,
        active:      allProjects.filter((r: any) => r.status === 'ACTIVE').length,
        inactive:    allProjects.filter((r: any) => r.status === 'ON_HOLD').length,
        completed:   allProjects.filter((r: any) => r.status === 'COMPLETED').length,
        cancelled:   allProjects.filter((r: any) => r.status === 'CANCELLED').length,
        newProjects: allProjects.filter((r: any) => new Date(r.created_at) >= thirtyDaysAgo).length,
        overaged:    allProjects.filter((r: any) => r.status === 'ACTIVE' && new Date(r.planned_end) < now).length,
        delayed:     allProjects.filter((r: any) => r.delay_status === 'DELAYED').length,
        atRisk:      allProjects.filter((r: any) => r.delay_status === 'AT_RISK').length,
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
    // Build manager filter with correct param index (date params $1,$2 come first in each query)
    const managerClause = managerName ? `AND project_manager = $3` : '';
    const managerParam = managerName ? [managerName] : [];

    const now = endDate ? new Date(endDate) : new Date();
    const weekStart = startDate ? new Date(startDate) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const periodMs = now.getTime() - weekStart.getTime();
    const prevWeekStart = new Date(weekStart.getTime() - periodMs);

    const wsStr = weekStart.toISOString();
    const pwStr = prevWeekStart.toISOString();
    const nowStr = now.toISOString();

    const [newlyAddedRes, prevNewlyAddedRes, closedRes, prevClosedRes, changedRes, prevChangedRes] =
      await Promise.all([
        // Newly created in period
        query(
          `SELECT id, name, customer_name, project_manager, migration_types, status, created_at
           FROM projects WHERE created_at >= $1 AND created_at <= $2 ${managerClause}
           ORDER BY created_at DESC`,
          [wsStr, nowStr, ...managerParam]
        ),
        query(
          `SELECT COUNT(*) as count FROM projects WHERE created_at >= $1 AND created_at <= $2 ${managerClause}`,
          [pwStr, wsStr, ...managerParam]
        ),
        // Closed/cancelled: status changed to COMPLETED or CANCELLED in period (not newly created this period)
        query(
          `SELECT id, name, customer_name, project_manager, migration_types, status, updated_at
           FROM projects
           WHERE status IN ('COMPLETED','CANCELLED')
             AND updated_at >= $1 AND updated_at <= $2
             AND created_at < $1
             ${managerClause}
           ORDER BY updated_at DESC`,
          [wsStr, nowStr, ...managerParam]
        ),
        query(
          `SELECT COUNT(*) as count FROM projects
           WHERE status IN ('COMPLETED','CANCELLED')
             AND updated_at >= $1 AND updated_at <= $2
             AND created_at < $1
             ${managerClause}`,
          [pwStr, wsStr, ...managerParam]
        ),
        // Changed: updated but not newly created this period and not completed/cancelled
        query(
          `SELECT id, name, customer_name, project_manager, migration_types, status, updated_at, delay_status, phase
           FROM projects
           WHERE updated_at >= $1 AND updated_at <= $2
             AND created_at < $1
             AND status NOT IN ('COMPLETED','CANCELLED')
             ${managerClause}
           ORDER BY updated_at DESC`,
          [wsStr, nowStr, ...managerParam]
        ),
        query(
          `SELECT COUNT(*) as count FROM projects
           WHERE updated_at >= $1 AND updated_at <= $2
             AND created_at < $1
             AND status NOT IN ('COMPLETED','CANCELLED')
             ${managerClause}`,
          [pwStr, wsStr, ...managerParam]
        ),
      ]);

    const newlyAdded = newlyAddedRes.rows;
    const closed = closedRes.rows;
    const changed = changedRes.rows;


    // Build per-manager breakdown
    const managerMap: Record<string, { added: number; closed: number; changed: number }> = {};
    const ensure = (m: string) => { if (!managerMap[m]) managerMap[m] = { added: 0, closed: 0, changed: 0 }; };
    newlyAdded.forEach((r: any) => { const m = r.project_manager || 'Unassigned'; ensure(m); managerMap[m].added++; });
    closed.forEach((r: any) => { const m = r.project_manager || 'Unassigned'; ensure(m); managerMap[m].closed++; });
    changed.forEach((r: any) => { const m = r.project_manager || 'Unassigned'; ensure(m); managerMap[m].changed++; });

    const byManager = Object.entries(managerMap).map(([manager, counts]) => ({ manager, ...counts }))
      .sort((a, b) => (b.added + b.closed + b.changed) - (a.added + a.closed + a.changed));

    const managersWithChanges = new Set([
      ...newlyAdded.map((r: any) => r.project_manager),
      ...closed.map((r: any) => r.project_manager),
      ...changed.map((r: any) => r.project_manager),
    ].filter(Boolean)).size;

    return {
      weekRange: { start: weekStart.toISOString(), end: now.toISOString() },
      summary: {
        newlyAdded: newlyAdded.length,
        newlyAddedVsLastWeek: newlyAdded.length - parseInt(prevNewlyAddedRes.rows[0].count || '0'),
        closedDecommissioned: closed.length,
        closedVsLastWeek: closed.length - parseInt(prevClosedRes.rows[0].count || '0'),
        changedProjects: changed.length,
        changesVsLastWeek: changed.length - parseInt(prevChangedRes.rows[0].count || '0'),
        managersWithChanges,
        byManager,
      },
      newlyAdded: newlyAdded.map((r: any) => ({
        id: r.id,
        name: r.name,
        customerName: r.customer_name,
        projectManager: r.project_manager,
        migrationTypes: r.migration_types,
        status: r.status,
        createdAt: r.created_at,
      })),
      closedThisWeek: closed.map((r: any) => ({
        id: r.id,
        name: r.name,
        customerName: r.customer_name,
        projectManager: r.project_manager,
        migrationTypes: r.migration_types,
        status: r.status,
        updatedAt: r.updated_at,
      })),
      changedThisWeek: changed.map((r: any) => ({
        id: r.id,
        name: r.name,
        customerName: r.customer_name,
        projectManager: r.project_manager,
        migrationTypes: r.migration_types,
        status: r.status,
        delayStatus: r.delay_status,
        phase: r.phase,
        updatedAt: r.updated_at,
      })),
    };
  }

  async getOveragedProjects(managerName?: string) {
    await this.ensureOverageHistoryTable();
    const { clause: aw, params: ap } = this.andManagerWhere(managerName);
    const result = await query(
      `SELECT id, name, customer_name, project_manager, account_manager, status, phase,
              planned_end, delay_days, delay_status, migration_types, is_overaged, overage_amount, overage_notes,
              extended_start_date, extended_end_date
       FROM projects
       WHERE is_overaged = true AND status NOT IN ('COMPLETED','CANCELLED') AND archived_at IS NULL ${aw}
       ORDER BY planned_end ASC`,
      ap
    );
    const now = new Date();
    const projects = result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      customerName: r.customer_name,
      projectManager: r.project_manager,
      accountManager: r.account_manager,
      status: r.status,
      phase: r.phase,
      plannedEnd: r.planned_end,
      daysOverdue: Math.max(0, Math.floor((now.getTime() - new Date(r.extended_end_date || r.planned_end).getTime()) / 86400000)),
      delayDays: r.delay_days,
      migrationTypes: r.migration_types,
      isOveraged: !!r.is_overaged,
      overageAmount: r.overage_amount ?? null,
      overageNotes: r.overage_notes ?? null,
      extendedStartDate: r.extended_start_date ?? null,
      extendedEndDate: r.extended_end_date ?? null,
      overageHistory: [] as any[],
    }));
    if (projects.length > 0) {
      const ids = projects.map((p) => p.id);
      const histResult = await query(
        `SELECT oh.*, p.name as project_name FROM overage_history oh
         JOIN projects p ON p.id = oh.project_id
         WHERE oh.project_id = ANY($1)
         ORDER BY oh.created_at DESC`,
        [ids]
      );
      const histMap: Record<string, any[]> = {};
      for (const oh of histResult.rows) {
        if (!histMap[oh.project_id]) histMap[oh.project_id] = [];
        histMap[oh.project_id].push({
          id: oh.id,
          overageAmount: oh.overage_amount,
          notes: oh.notes,
          extendedStartDate: oh.extended_start_date,
          extendedEndDate: oh.extended_end_date,
          createdAt: oh.created_at,
        });
      }
      for (const p of projects) {
        p.overageHistory = histMap[p.id] || [];
      }
    }
    return projects;
  }

  private _escalationHistoryReady = false;
  async ensureEscalationHistoryTable() {
    if (this._escalationHistoryReady) return;
    await execute(`CREATE TABLE IF NOT EXISTS escalation_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL,
      priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
      escalation_type VARCHAR(100),
      notes TEXT,
      escalated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_date TIMESTAMP NULL
    )`, []);
    try { await execute(`CREATE INDEX IF NOT EXISTS idx_esc_hist_project ON escalation_history(project_id)`, []); } catch (_) {}
    try { await execute(`ALTER TABLE projects ADD COLUMN resolved_date TIMESTAMP NULL`, []); } catch (_) { /* exists */ }
    try { await execute(`ALTER TABLE projects ADD COLUMN escalation_archived BOOLEAN NOT NULL DEFAULT false`, []); } catch (_) { /* exists */ }
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
       WHERE status NOT IN ('COMPLETED','CANCELLED')
             AND archived_at IS NULL
             AND (escalation_archived IS NULL OR escalation_archived = false)
             AND is_escalated = true ${aw}
       ORDER BY CASE WHEN escalation_priority='HIGH' THEN 1 WHEN escalation_priority='MEDIUM' THEN 2 ELSE 3 END, delay_days DESC`,
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
      const histResult = await query(
        `SELECT id, project_id, priority, escalation_type, notes, escalated_at, resolved_date
         FROM escalation_history WHERE project_id = ANY($1) ORDER BY escalated_at DESC`,
        [ids]
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

  async getArchivedEscalations(managerName?: string) {
    await this.ensureEscalationHistoryTable();
    const { clause: aw, params: ap } = this.andManagerWhere(managerName);
    const result = await query(
      `SELECT  p.id, p.name, p.customer_name, p.project_manager, p.account_manager, p.status, p.phase,
              p.planned_end, p.delay_days, p.delay_status, p.migration_types,
              p.is_escalated, p.escalation_priority, p.escalated_at, p.escalation_notes, p.resolved_date,
              COALESCE(p.escalation_archived, false) as escalation_archived,
              COALESCE(p.resolved_date, p.escalated_at) as sort_key
       FROM projects p
       INNER JOIN escalation_history eh ON eh.project_id = p.id
       WHERE (p.status IN ('COMPLETED','CANCELLED') OR p.escalation_archived = true)
       ${aw}
       ORDER BY sort_key DESC`,
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
      escalationPriority: r.escalation_priority || 'MEDIUM',
      escalatedAt: r.escalated_at,
      escalationNotes: r.escalation_notes,
      resolvedDate: r.resolved_date,
      escalationArchived: !!r.escalation_archived,
      escalationHistory: [] as any[],
    }));
    if (projects.length > 0) {
      const ids = projects.map((p) => p.id);
      const histResult = await query(
        `SELECT id, project_id, priority, escalation_type, notes, escalated_at, resolved_date
         FROM escalation_history WHERE project_id = ANY($1) ORDER BY escalated_at DESC`,
        [ids]
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

  async archiveEscalation(projectId: string) {
    await this.ensureEscalationHistoryTable();
    await execute(`UPDATE projects SET escalation_archived = true WHERE id = $1`, [projectId]);
  }

  async unarchiveEscalation(projectId: string) {
    await execute(`UPDATE projects SET escalation_archived = false WHERE id = $1`, [projectId]);
  }

  private _overageHistoryReady = false;
  async ensureOverageHistoryTable() {
    if (this._overageHistoryReady) return;
    await execute(`CREATE TABLE IF NOT EXISTS overage_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL,
      overage_amount DECIMAL(15,2) NULL,
      notes TEXT NULL,
      extended_start_date TIMESTAMP NULL,
      extended_end_date TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`, []);
    try { await execute(`CREATE INDEX IF NOT EXISTS idx_overage_hist_project ON overage_history(project_id)`, []); } catch (_) {}
    try { await execute(`ALTER TABLE projects ADD COLUMN extended_start_date TIMESTAMP NULL`, []); } catch (_) { /* exists */ }
    try { await execute(`ALTER TABLE projects ADD COLUMN extended_end_date TIMESTAMP NULL`, []); } catch (_) { /* exists */ }
    this._overageHistoryReady = true;
  }

  async markOverageProject(projectId: string, overageAmount?: number, notes?: string, extendedStartDate?: string, extendedEndDate?: string) {
    await this.ensureOverageHistoryTable();
    const updates: string[] = [];
    const params: any[] = [];
    updates.push(`is_overaged = true`);
    updates.push(`overage_amount = $${params.length + 1}`); params.push(overageAmount || null);
    updates.push(`overage_notes = $${params.length + 1}`); params.push(notes || null);
    if (extendedStartDate) { updates.push(`extended_start_date = $${params.length + 1}`); params.push(new Date(extendedStartDate)); }
    if (extendedEndDate) {
      updates.push(`extended_end_date = $${params.length + 1}`); params.push(new Date(extendedEndDate));
      updates.push(`planned_end = $${params.length + 1}`); params.push(new Date(extendedEndDate));
    }
    await execute(`UPDATE projects SET ${updates.join(', ')} WHERE id = $${params.length + 1}`, [...params, projectId]);
    // Insert into overage_history so multiple overage events are tracked
    await execute(
      `INSERT INTO overage_history (project_id, overage_amount, notes, extended_start_date, extended_end_date)
       VALUES ($1, $2, $3, $4, $5)`,
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
      `UPDATE projects SET is_overaged = false, overage_amount = NULL, overage_notes = NULL WHERE id = $1`,
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
      `UPDATE projects SET is_escalated = true, escalation_priority = $1, escalated_at = NOW(), escalation_notes = $2, resolved_date = NULL WHERE id = $3`,
      [priority, notes || null, projectId]
    );
    await execute(
      `INSERT INTO escalation_history (project_id, priority, escalation_type, notes, escalated_at) VALUES ($1, $2, $3, $4, NOW())`,
      [projectId, priority, escalationType, userNotes]
    );
  }

  async setResolvedDate(projectId: string, resolvedDate: string | null) {
    await this.ensureEscalationHistoryTable();
    const rd = resolvedDate ? new Date(resolvedDate) : null;
    await execute(`UPDATE projects SET resolved_date = $1 WHERE id = $2`, [rd, projectId]);
    if (rd) {
      // Mark the most recent open history record as resolved
      await execute(
        `UPDATE escalation_history SET resolved_date = $1 WHERE id = (
           SELECT id FROM escalation_history WHERE project_id = $2 AND resolved_date IS NULL ORDER BY escalated_at DESC LIMIT 1
         )`,
        [rd, projectId]
      );
    } else {
      await execute(
        `UPDATE escalation_history SET resolved_date = NULL WHERE project_id = $1 AND resolved_date IS NOT NULL`,
        [projectId]
      );
    }
  }

  async deescalateProject(projectId: string) {
    await this.ensureEscalationHistoryTable();
    await execute(
      `UPDATE escalation_history SET resolved_date = NOW() WHERE project_id = $1 AND resolved_date IS NULL`,
      [projectId]
    );
    await execute(
      `UPDATE projects SET is_escalated = false, escalation_priority = NULL, escalated_at = NULL, escalation_notes = NULL, resolved_date = NOW() WHERE id = $1`,
      [projectId]
    );
  }

  async getProjectsByMigrationType(type: string) {
    const CATEGORIES = ['Content Migration', 'Messaging', 'Email'];
    const isCategory = CATEGORIES.some(c => c.toLowerCase() === type.toLowerCase());

    // Fetch all projects with migration_types populated
    const tplResult = await query(
      `SELECT id, code, name FROM migration_templates WHERE is_active = true ORDER BY name ASC`, []
    );
    const templates: { id: string; code: string; name: string }[] = tplResult.rows;

    const resolveToCode = (raw: string): string => {
      const up = raw.trim().toUpperCase();
      if (templates.some(t => t.code.toUpperCase() === up)) return up;
      const cleaned = up.replace(/ MIGRATION$/, '').replace(/ MIGRATION$/, '');
      const byName = templates.find(t =>
        t.name.toUpperCase().replace(/\s+/g, '') === up.replace(/\s+/g, '') ||
        t.name.toUpperCase().replace(/\s+/g, '') === cleaned.replace(/\s+/g, '') ||
        t.code.toUpperCase() === cleaned.trim()
      );
      if (byName) return byName.code.toUpperCase();
      const idx = parseInt(up, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= templates.length) return templates[idx - 1].code.toUpperCase();
      return up;
    };

    const getProjectCategory = (migTypes: string): string => {
      if (!migTypes) return 'Content Migration';
      const parts = migTypes.split(',').map(s => s.trim());
      for (const part of parts) {
        const code = resolveToCode(part);
        const tpl = templates.find(t => t.code.toUpperCase() === code);
        const label = tpl ? `${tpl.code} ${tpl.name}` : part;
        const cat = this.getMigrationCategory(label);
        if (cat !== 'Content Migration') return cat;
      }
      const raw = migTypes.toUpperCase();
      if (raw.includes('MESSAGING') || raw.includes('SLACK') || raw.includes('TEAMS')) return 'Messaging';
      if (raw.includes('EMAIL') || raw.includes('EXCHANGE') || raw.includes('GMAIL')) return 'Email';
      return 'Content Migration';
    };

    const result = await query(
      `SELECT id, name, customer_name, project_manager, status, phase, delay_status, delay_days, planned_end, migration_types
       FROM projects WHERE migration_types IS NOT NULL AND migration_types <> ''
       ORDER BY updated_at DESC`,
      []
    );

    const rows = isCategory
      ? result.rows.filter((r: any) => getProjectCategory(r.migration_types || '') === type)
      : result.rows.filter((r: any) => {
          const code = type.toUpperCase();
          const codes = (r.migration_types || '').split(',').map((s: string) => resolveToCode(s.trim()));
          return codes.includes(code) || (r.migration_types || '').toUpperCase().includes(code);
        });

    return rows.map((r: any) => ({
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

  private _dailyNotesReady = false;
  private async ensureDailyNotesTable() {
    if (this._dailyNotesReady) return;
    await execute(`CREATE TABLE IF NOT EXISTS escalation_daily_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      note_date DATE NOT NULL DEFAULT CURRENT_DATE,
      author VARCHAR(200),
      note TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`, []);
    try { await execute(`CREATE INDEX IF NOT EXISTS idx_daily_notes_project ON escalation_daily_notes(project_id, note_date DESC)`, []); } catch (_) {}
    this._dailyNotesReady = true;
  }

  async getEscalationDailyNotes(projectId: string) {
    await this.ensureDailyNotesTable();
    const result = await query(
      `SELECT * FROM escalation_daily_notes WHERE project_id = $1 ORDER BY note_date DESC, created_at DESC`,
      [projectId]
    );
    return result.rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      noteDate: r.note_date,
      author: r.author,
      note: r.note,
      createdAt: r.created_at,
    }));
  }

  async addEscalationDailyNote(projectId: string, note: string, author?: string, noteDate?: string) {
    await this.ensureDailyNotesTable();
    const date = noteDate || new Date().toISOString().split('T')[0];
    const result = await query(
      `INSERT INTO escalation_daily_notes (project_id, note_date, author, note)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [projectId, date, author || null, note]
    );
    const r = result.rows[0];
    return { id: r.id, projectId: r.project_id, noteDate: r.note_date, author: r.author, note: r.note, createdAt: r.created_at };
  }

  async deleteEscalationDailyNote(projectId: string, noteId: string) {
    await this.ensureDailyNotesTable();
    await execute(
      `DELETE FROM escalation_daily_notes WHERE id = $1 AND project_id = $2`,
      [noteId, projectId]
    );
  }
}

export const dashboardService = new DashboardService();
