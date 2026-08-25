import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { getIstWeekBounds, istDateStr, weeksInCurrentIstMonth } from '../utils/weekBounds';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'PASSWORD_CHANGE' | 'STATUS_CHANGE' | 'EXPORT';

interface AuditLogInput {
  userId?: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityName?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
}

class AuditService {
  async log(data: AuditLogInput) {
    try {
      const logId = uuidv4();
      await execute(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, entity_name, old_values, new_values, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          logId,
          data.userId,
          data.action,
          data.entityType,
          data.entityId,
          data.entityName,
          data.oldValues ? JSON.stringify(data.oldValues) : null,
          data.newValues ? JSON.stringify(data.newValues) : null,
          data.ipAddress,
          data.userAgent,
        ]
      );
      const result = await query(`SELECT * FROM audit_logs WHERE id = $1`, [logId]);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create audit log:', error);
    }
  }

  async getAll(options: {
    page?: number;
    limit?: number;
    userId?: string;
    entityType?: string;
    entityId?: string;
    action?: AuditAction;
    startDate?: Date;
    endDate?: Date;
  } = {}) {
    const { page = 1, limit = 50, userId, entityType, entityId, action, startDate, endDate } = options;
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const safeOffset = Math.max(0, Math.floor((page - 1) * safeLimit));

    const conditions: string[] = [];
    const params: any[] = [];

    if (userId) { conditions.push(`a.user_id = $${params.length + 1}`); params.push(userId); }
    if (entityType) { conditions.push(`a.entity_type = $${params.length + 1}`); params.push(entityType); }
    if (entityId) { conditions.push(`a.entity_id = $${params.length + 1}`); params.push(entityId); }
    if (action) { conditions.push(`a.action = $${params.length + 1}`); params.push(action); }
    if (startDate) { conditions.push(`a.created_at >= $${params.length + 1}`); params.push(startDate); }
    if (endDate) { conditions.push(`a.created_at <= $${params.length + 1}`); params.push(endDate); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [logsResult, countResult] = await Promise.all([
      query(
        `SELECT a.*, u.id as u_id, u.name as u_name, u.email as u_email
         FROM audit_logs a
         LEFT JOIN users u ON a.user_id = u.id
         ${whereClause}
         ORDER BY a.created_at DESC
         LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      ),
      query(`SELECT COUNT(*) as count FROM audit_logs a ${whereClause}`, params),
    ]);

    return {
      data: logsResult.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        entityName: row.entity_name,
        oldValues: row.old_values ? JSON.parse(row.old_values) : null,
        newValues: row.new_values ? JSON.parse(row.new_values) : null,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        createdAt: row.created_at,
        user: row.u_id ? { id: row.u_id, name: row.u_name, email: row.u_email } : null,
      })),
      pagination: {
        page,
        limit: safeLimit,
        total: parseInt(countResult.rows[0].count || countResult.rows[0]['COUNT(*)'] || 0),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count || countResult.rows[0]['COUNT(*)'] || 0) / safeLimit),
      },
    };
  }

  async getByEntity(entityType: string, entityId: string) {
    const result = await query(
      `SELECT a.*, u.id as u_id, u.name as u_name, u.email as u_email
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.entity_type = $1 AND a.entity_id = $2
       ORDER BY a.created_at DESC`,
      [entityType, entityId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityName: row.entity_name,
      oldValues: row.old_values ? JSON.parse(row.old_values) : null,
      newValues: row.new_values ? JSON.parse(row.new_values) : null,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      user: row.u_id ? { id: row.u_id, name: row.u_name, email: row.u_email } : null,
    }));
  }

  async getByUser(userId: string, limit = 50) {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const result = await query(
      `SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT ${safeLimit}`,
      [userId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityName: row.entity_name,
      oldValues: row.old_values ? JSON.parse(row.old_values) : null,
      newValues: row.new_values ? JSON.parse(row.new_values) : null,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
    }));
  }

  // Week-on-week trend for the Audit Report — segment-level (not per-manager)
  // totals for each of the last `weeks` calendar weeks ending on `endDate`,
  // so ENT vs SMB can be charted side by side over time.
  async getWeeklyTrend(endDate: Date, weeks: number) {
    const safeWeeks = Math.max(1, Math.min(26, Math.floor(weeks)));
    const anchor = new Date(endDate);

    const ranges: { weekStart: Date; weekEnd: Date }[] = [];
    for (let i = safeWeeks - 1; i >= 0; i--) {
      const weekEnd = new Date(anchor);
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      weekEnd.setHours(23, 59, 59, 999);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);
      ranges.push({ weekStart, weekEnd });
    }

    const results = await Promise.all(
      ranges.map(({ weekStart, weekEnd }) =>
        query(
          `SELECT
            segment,
            COUNT(DISTINCT id)::int AS total,
            COUNT(DISTINCT id) FILTER (WHERE status = 'COMPLETED')::int AS completed,
            COUNT(DISTINCT id) FILTER (WHERE is_escalated = true)::int AS escalations,
            COALESCE(SUM(overage_amount) FILTER (WHERE is_overaged = true), 0)::numeric AS overage_amount
          FROM projects
          WHERE segment IN ('SMB', 'ENT')
            AND (created_at >= $1 AND created_at <= $2
              OR  updated_at  >= $1 AND updated_at  <= $2)
          GROUP BY segment`,
          [weekStart, weekEnd]
        )
      )
    );

    return ranges.map(({ weekStart, weekEnd }, i) => {
      const rows = results[i].rows;
      const forSegment = (seg: 'ENT' | 'SMB') => {
        const row = rows.find((r: any) => r.segment === seg);
        const total = row?.total ?? 0;
        const completed = row?.completed ?? 0;
        return {
          total,
          completed,
          escalations: row?.escalations ?? 0,
          overageAmount: parseFloat(row?.overage_amount) || 0,
        };
      };
      return {
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        ENT: forSegment('ENT'),
        SMB: forSegment('SMB'),
      };
    });
  }

  // Manager leaderboard for the Audit Report's weekly snapshot — same
  // project_manager/account_manager name-matching pattern as
  // getUserProjectSummary, but grouped by segment (SMB/ENT) and with
  // escalation/overage figures added per manager.
  async getManagerLeaderboard(startDate: Date, endDate: Date) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const start = new Date(startDate);

    const buildQuery = (managerField: 'project_manager' | 'account_manager') => `
      SELECT
        COALESCE(u.id::text, x.mgr) AS id,
        x.mgr                       AS name,
        COALESCE(u.email, '')       AS email,
        p.segment                   AS segment,
        COUNT(DISTINCT p.id)::int   AS total,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'COMPLETED')::int AS completed,
        COUNT(DISTINCT p.id) FILTER (WHERE p.created_at >= $1 AND p.created_at <= $2)::int AS newly_added,
        COUNT(DISTINCT p.id) FILTER (WHERE p.is_escalated = true)::int AS escalations,
        COUNT(DISTINCT p.id) FILTER (WHERE p.is_overaged = true)::int AS overage_count,
        COALESCE(SUM(p.overage_amount) FILTER (WHERE p.is_overaged = true), 0)::numeric AS overage_amount
      FROM (
        SELECT DISTINCT ${managerField} AS mgr
        FROM projects
        WHERE ${managerField} IS NOT NULL AND TRIM(${managerField}) <> '' AND segment IN ('SMB', 'ENT')
      ) x
      LEFT JOIN users u
        ON LOWER(TRIM(u.name)) = LOWER(TRIM(x.mgr))
      LEFT JOIN projects p
        ON LOWER(TRIM(p.${managerField})) = LOWER(TRIM(x.mgr))
        AND p.segment IN ('SMB', 'ENT')
        AND (p.created_at >= $1 AND p.created_at <= $2
          OR  p.updated_at  >= $1 AND p.updated_at  <= $2)
      GROUP BY x.mgr, u.id, u.email, p.segment
      HAVING p.segment IS NOT NULL
      ORDER BY p.segment, completed DESC
    `;

    const [pmResult, amResult] = await Promise.all([
      query(buildQuery('project_manager'), [start, end]),
      query(buildQuery('account_manager'), [start, end]),
    ]);

    const mapRow = (row: any) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      segment: row.segment,
      total: row.total,
      completed: row.completed,
      completionRate: row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0,
      newlyAdded: row.newly_added,
      escalations: row.escalations,
      overageCount: row.overage_count,
      overageAmount: parseFloat(row.overage_amount) || 0,
    });

    const bySegment = (rows: any[]) => ({
      ENT: rows.filter((r) => r.segment === 'ENT').sort((a, b) => b.completionRate - a.completionRate),
      SMB: rows.filter((r) => r.segment === 'SMB').sort((a, b) => b.completionRate - a.completionRate),
    });

    const pmRows = pmResult.rows.map(mapRow);
    const amRows = amResult.rows.map(mapRow);

    const totalEscalations = [...pmRows, ...amRows].reduce((s, r) => s + r.escalations, 0);
    const totalOverage = [...pmRows, ...amRows].reduce((s, r) => s + r.overageAmount, 0);
    const entProjects = pmRows.filter((r) => r.segment === 'ENT').reduce((s, r) => s + r.total, 0);
    const smbProjects = pmRows.filter((r) => r.segment === 'SMB').reduce((s, r) => s + r.total, 0);

    return {
      projectManagers: bySegment(pmRows),
      accountManagers: bySegment(amRows),
      summary: {
        totalEscalations,
        totalOverageAmount: totalOverage,
        entProjects,
        smbProjects,
      },
    };
  }

  async getUserProjectSummary(startDate: Date, endDate: Date) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const start = new Date(startDate);

    // ── Project Managers ────────────────────────────────────────────────
    // Sourced from users table (role = PROJECT_MANAGER), matched by project_manager name
    const pmResult = await query(
      `SELECT
        u.id, u.name, u.email, 'PROJECT_MANAGER' AS role,
        COUNT(DISTINCT p.id)::int                                                     AS total_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'ACTIVE')::int                AS active_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'COMPLETED')::int             AS completed_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'CANCELLED')::int             AS cancelled_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.delay_status = 'DELAYED')::int         AS delayed_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.delay_status = 'AT_RISK')::int         AS at_risk_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.created_at >= $1)::int                 AS added_in_period,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status IN ('COMPLETED','CANCELLED'))::int AS closed_in_period
      FROM users u
      LEFT JOIN projects p
        ON LOWER(TRIM(p.project_manager)) = LOWER(TRIM(u.name))
        AND (p.created_at >= $1 AND p.created_at <= $2
          OR  p.updated_at  >= $1 AND p.updated_at  <= $2)
      WHERE u.role = 'PROJECT_MANAGER'
      GROUP BY u.id, u.name, u.email
      ORDER BY total_projects DESC`,
      [start, end]
    );

    // ── Account Managers ────────────────────────────────────────────────
    // Sourced directly from projects.account_manager (no user account required).
    // Left-join users only to pick up the email if the AM has a user account.
    const amResult = await query(
      `SELECT
        COALESCE(u.id::text, am.account_manager)      AS id,
        am.account_manager                           AS name,
        COALESCE(u.email, '')                        AS email,
        'ACCOUNT_MANAGER'                            AS role,
        COUNT(DISTINCT p.id)::int                                                     AS total_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'ACTIVE')::int                AS active_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'COMPLETED')::int             AS completed_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'CANCELLED')::int             AS cancelled_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.delay_status = 'DELAYED')::int         AS delayed_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.delay_status = 'AT_RISK')::int         AS at_risk_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.created_at >= $1)::int                 AS added_in_period,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status IN ('COMPLETED','CANCELLED'))::int AS closed_in_period
      FROM (
        SELECT DISTINCT account_manager
        FROM projects
        WHERE account_manager IS NOT NULL AND TRIM(account_manager) <> ''
      ) am
      LEFT JOIN users u
        ON LOWER(TRIM(u.name)) = LOWER(TRIM(am.account_manager))
      LEFT JOIN projects p
        ON LOWER(TRIM(p.account_manager)) = LOWER(TRIM(am.account_manager))
        AND (p.created_at >= $1 AND p.created_at <= $2
          OR  p.updated_at  >= $1 AND p.updated_at  <= $2)
      GROUP BY am.account_manager, u.id, u.email
      ORDER BY total_projects DESC`,
      [start, end]
    );

    // ── Pre-Sales ───────────────────────────────────────────────────────
    // Sourced from projects.poc_pre_sales_owner — the actual pre-sales person assigned to POC projects.
    const psResult = await query(
      `SELECT
        COALESCE(u.id::text, ps.poc_pre_sales_owner)  AS id,
        ps.poc_pre_sales_owner                        AS name,
        COALESCE(u.email, '')                         AS email,
        'PRE_SALES'                                   AS role,
        COUNT(DISTINCT p.id)::int                                                     AS total_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'ACTIVE')::int                AS active_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'COMPLETED')::int             AS completed_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'CANCELLED')::int             AS cancelled_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.delay_status = 'DELAYED')::int         AS delayed_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.delay_status = 'AT_RISK')::int         AS at_risk_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.created_at >= $1)::int                 AS added_in_period,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status IN ('COMPLETED','CANCELLED'))::int AS closed_in_period
      FROM (
        SELECT DISTINCT poc_pre_sales_owner
        FROM projects
        WHERE poc_pre_sales_owner IS NOT NULL AND TRIM(poc_pre_sales_owner) <> ''
      ) ps
      LEFT JOIN users u
        ON LOWER(TRIM(u.name)) = LOWER(TRIM(ps.poc_pre_sales_owner))
      LEFT JOIN projects p
        ON LOWER(TRIM(p.poc_pre_sales_owner)) = LOWER(TRIM(ps.poc_pre_sales_owner))
        AND (p.created_at >= $1 AND p.created_at <= $2
          OR  p.updated_at  >= $1 AND p.updated_at  <= $2)
      GROUP BY ps.poc_pre_sales_owner, u.id, u.email
      ORDER BY total_projects DESC`,
      [start, end]
    );

    const mapRow = (row: any) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      totalProjects: row.total_projects,
      activeProjects: row.active_projects,
      completedProjects: row.completed_projects,
      cancelledProjects: row.cancelled_projects,
      delayedProjects: row.delayed_projects,
      atRiskProjects: row.at_risk_projects,
      addedInPeriod: row.added_in_period,
      closedInPeriod: row.closed_in_period,
    });

    const allUsers = [
      ...pmResult.rows.map(mapRow),
      ...amResult.rows.map(mapRow),
      ...psResult.rows.map(mapRow),
    ];

    const byRole = {
      PROJECT_MANAGER: allUsers.filter((u) => u.role === 'PROJECT_MANAGER'),
      ACCOUNT_MANAGER: allUsers.filter((u) => u.role === 'ACCOUNT_MANAGER'),
      PRE_SALES: allUsers.filter((u) => u.role === 'PRE_SALES'),
    };

    return {
      users: allUsers,
      byRole,
      totals: {
        PROJECT_MANAGER: {
          users: byRole.PROJECT_MANAGER.length,
          totalProjects: byRole.PROJECT_MANAGER.reduce((s, u) => s + u.totalProjects, 0),
          active: byRole.PROJECT_MANAGER.reduce((s, u) => s + u.activeProjects, 0),
          delayed: byRole.PROJECT_MANAGER.reduce((s, u) => s + u.delayedProjects, 0),
          addedInPeriod: byRole.PROJECT_MANAGER.reduce((s, u) => s + u.addedInPeriod, 0),
        },
        ACCOUNT_MANAGER: {
          users: byRole.ACCOUNT_MANAGER.length,
          totalProjects: byRole.ACCOUNT_MANAGER.reduce((s, u) => s + u.totalProjects, 0),
          active: byRole.ACCOUNT_MANAGER.reduce((s, u) => s + u.activeProjects, 0),
          delayed: byRole.ACCOUNT_MANAGER.reduce((s, u) => s + u.delayedProjects, 0),
          addedInPeriod: byRole.ACCOUNT_MANAGER.reduce((s, u) => s + u.addedInPeriod, 0),
        },
        PRE_SALES: {
          users: byRole.PRE_SALES.length,
          totalProjects: byRole.PRE_SALES.reduce((s, u) => s + u.totalProjects, 0),
          active: byRole.PRE_SALES.reduce((s, u) => s + u.activeProjects, 0),
          delayed: byRole.PRE_SALES.reduce((s, u) => s + u.delayedProjects, 0),
          addedInPeriod: byRole.PRE_SALES.reduce((s, u) => s + u.addedInPeriod, 0),
        },
      },
    };
  }

  async getActivitySummary(startDate: Date, endDate: Date) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const result = await query(
      `SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        COUNT(a.id) FILTER (WHERE a.created_at >= $1 AND a.created_at <= $2)::int                                         AS total_actions,
        COUNT(a.id) FILTER (WHERE a.action = 'CREATE'        AND a.created_at >= $1 AND a.created_at <= $2)::int          AS creates,
        COUNT(a.id) FILTER (WHERE a.action = 'UPDATE'        AND a.created_at >= $1 AND a.created_at <= $2)::int          AS updates,
        COUNT(a.id) FILTER (WHERE a.action = 'DELETE'        AND a.created_at >= $1 AND a.created_at <= $2)::int          AS deletes,
        COUNT(a.id) FILTER (WHERE a.action = 'LOGIN'         AND a.created_at >= $1 AND a.created_at <= $2)::int          AS logins,
        COUNT(a.id) FILTER (WHERE a.action = 'STATUS_CHANGE' AND a.created_at >= $1 AND a.created_at <= $2)::int          AS status_changes,
        COUNT(a.id) FILTER (WHERE a.action = 'EXPORT'        AND a.created_at >= $1 AND a.created_at <= $2)::int          AS exports,
        MAX(a.created_at)                                                                                                  AS last_active
      FROM users u
      LEFT JOIN audit_logs a ON u.id = a.user_id
      WHERE u.role IN ('PROJECT_MANAGER', 'ACCOUNT_MANAGER', 'PRE_SALES')
      GROUP BY u.id, u.name, u.email, u.role
      ORDER BY u.role, total_actions DESC`,
      [startDate, end]
    );

    const users = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      totalActions: row.total_actions,
      creates: row.creates,
      updates: row.updates,
      deletes: row.deletes,
      logins: row.logins,
      statusChanges: row.status_changes,
      exports: row.exports,
      lastActive: row.last_active,
    }));

    const byRole = {
      PROJECT_MANAGER: users.filter((u) => u.role === 'PROJECT_MANAGER'),
      ACCOUNT_MANAGER: users.filter((u) => u.role === 'ACCOUNT_MANAGER'),
      PRE_SALES: users.filter((u) => u.role === 'PRE_SALES'),
    };

    return {
      users,
      byRole,
      totals: {
        PROJECT_MANAGER: byRole.PROJECT_MANAGER.reduce((s, u) => s + u.totalActions, 0),
        ACCOUNT_MANAGER: byRole.ACCOUNT_MANAGER.reduce((s, u) => s + u.totalActions, 0),
        PRE_SALES: byRole.PRE_SALES.reduce((s, u) => s + u.totalActions, 0),
      },
    };
  }

  // Activity Score and Case Study Score are range-aware — pass startDate/endDate
  // to score a specific period. Data Quality, Delay Accountability, and
  // Phase-Date Integrity always reflect *current* project state (e.g. "is this
  // field filled in right now"), not events in a window, so they ignore the
  // range and stay consistent regardless of the period picked.
  async getHygieneBoard(startDate?: string, endDate?: string) {
    const rangeEnd   = endDate   ? new Date(endDate)   : new Date();
    const rangeStart = startDate ? new Date(startDate) : new Date(rangeEnd.getTime() - 30 * 86400000);

    // ── 1. Real activity from audit_logs within the selected range ──
    const activityResult = await query(`
      SELECT
        u.id   AS user_id,
        u.name AS pm_name,
        COUNT(a.id) FILTER (WHERE a.action = 'LOGIN')::int                                          AS logins,
        COUNT(a.id) FILTER (WHERE a.action IN ('UPDATE','STATUS_CHANGE','CREATE')
                             AND a.entity_type ILIKE '%project%')::int                              AS project_updates,
        COUNT(a.id) FILTER (WHERE a.action IN ('UPDATE','STATUS_CHANGE','CREATE')
                             AND a.entity_type ILIKE '%case%')::int                                AS case_study_updates,
        MAX(a.created_at) FILTER (WHERE a.action = 'LOGIN')                                        AS last_login_at,
        MAX(a.created_at) FILTER (WHERE a.action IN ('UPDATE','STATUS_CHANGE','CREATE'))           AS last_action_at,
        u.email AS email
      FROM users u
      LEFT JOIN audit_logs a
        ON a.user_id = u.id
       AND a.created_at >= $1
       AND a.created_at <= $2
      WHERE u.role IN ('PROJECT_MANAGER', 'ADMIN')
      GROUP BY u.id, u.name, u.email
    `, [rangeStart.toISOString(), rangeEnd.toISOString()]);

    // Keyed by both display name and email local-part, so a project_manager
    // value of "shruthi" resolves whether it matches the account name or the
    // address prefix. Name wins when both are present.
    const activityByName = new Map<string, any>();
    for (const row of activityResult.rows) {
      const local = String(row.email || '').split('@')[0].toLowerCase().trim();
      if (local && !activityByName.has(local)) activityByName.set(local, row);
    }
    for (const row of activityResult.rows) {
      activityByName.set(String(row.pm_name || '').toLowerCase().trim(), row);
    }

    // ── 2. Projects + case studies per PM ────────────────────────────────
    const projectResult = await query(`
      SELECT
        p.project_manager,
        p.id,
        p.status,
        p.planned_start,
        p.planned_end,
        p.actual_start,
        p.actual_end,
        p.customer_contact,
        p.notes,
        p.project_memory,
        p.estimated_cost,
        p.delay_status,
        p.delay_happened,
        p.cloud_adding_start,
        p.cloud_adding_end,
        p.pilot_migration_start,
        p.pilot_migration_end,
        p.onetime_migration_start,
        p.onetime_migration_end,
        p.final_validation_start,
        p.final_validation_end,
        rca.has_rca,
        cs.id          AS cs_id,
        cs.status      AS cs_status,
        cs.title       AS cs_title,
        cs.content     AS cs_content
      FROM projects p
      LEFT JOIN case_studies cs ON cs.project_id = p.id
      LEFT JOIN (
        SELECT project_id, true AS has_rca
        FROM escalation_daily_notes
        WHERE column_name = 'Delay Happened'
        GROUP BY project_id
      ) rca ON rca.project_id = p.id
      WHERE p.status NOT IN ('CANCELLED','INACTIVE')
        AND p.project_manager IS NOT NULL AND TRIM(p.project_manager) <> ''
      ORDER BY p.project_manager
    `);

    const byPM = new Map<string, any[]>();
    for (const row of projectResult.rows) {
      const key = row.project_manager;
      if (!byPM.has(key)) byPM.set(key, []);
      byPM.get(key)!.push(row);
    }

    const now = new Date();
    const board = [];

    for (const [pm, projects] of byPM) {
      const act = activityByName.get(pm.toLowerCase().trim()) || {
        logins: 0, project_updates: 0, case_study_updates: 0,
        last_login_at: null, last_action_at: null,
      };

      const active    = projects.filter((p) => p.status === 'ACTIVE' || p.status === 'ON_HOLD');
      const completed = projects.filter((p) => p.status === 'COMPLETED' || p.status === 'ARCHIVED');

      // ── Activity metrics (from audit_logs) ────────────────────────────
      const logins30d          = Number(act.logins);
      const projectUpdates30d  = Number(act.project_updates);
      const caseStudyUpdates30d = Number(act.case_study_updates);
      const lastLoginAt        = act.last_login_at ? new Date(act.last_login_at).toISOString() : null;
      const lastActionAt       = act.last_action_at ? new Date(act.last_action_at).toISOString() : null;
      const daysSinceLastAction = lastActionAt
        ? Math.floor((now.getTime() - new Date(lastActionAt).getTime()) / 86400000)
        : 999;

      // ── Data quality metrics ────────────────────────────────────────────
      // Scored population must match qualityScope below (active, falling back to
      // all projects when a PM has none active) — otherwise the displayed counts
      // and the Data Quality Score are computed over different project sets and
      // silently disagree.
      const qualityPopulation = active.length > 0 ? active : projects;
      const missingKickoffDate  = qualityPopulation.filter((p) => !p.actual_start).length;
      const missingPlannedDates = qualityPopulation.filter((p) => !p.planned_start || !p.planned_end).length;
      const missingCustomerEmail = qualityPopulation.filter((p) => !p.customer_contact).length;
      const missingNotes        = qualityPopulation.filter((p) => !p.notes || !String(p.notes).trim()).length;
      // Past planned_end AND not already owned via delay_status — a flagged
      // delay is accounted for in delayScore, so counting it here too would
      // penalise the same slip twice.
      const overdueNotFlagged   = active.filter((p) =>
        p.planned_end && new Date(p.planned_end) < now &&
        p.delay_status !== 'DELAYED' && p.delay_status !== 'AT_RISK'
      ).length;
      const missingProjectSize  = qualityPopulation.filter((p) => !p.project_memory).length;
      const missingBudget       = qualityPopulation.filter((p) => !p.estimated_cost).length;

      // ── Case study metrics ────────────────────────────────────────────
      // Projects finished within the grace window are excluded from scoring —
      // a project completed days ago cannot yet be expected to have a case
      // study. They still surface in the counts below. Grace is measured from
      // the end of the selected range (not real "now"), so viewing a past
      // period doesn't count projects finished after that period as "in grace."
      const CS_GRACE_DAYS = 30;
      const csGraceCutoff = new Date(rangeEnd.getTime() - CS_GRACE_DAYS * 86400000);
      const csScopeCompleted = completed.filter(
        (p) => !p.actual_end || new Date(p.actual_end) <= csGraceCutoff
      );
      const csDone     = completed.filter((p) => p.cs_status === 'COMPLETED' || p.cs_status === 'PUBLISHED').length;
      const csPending  = completed.filter((p) => p.cs_status === 'PENDING' || p.cs_status === 'IN_PROGRESS').length;
      const csMissing  = completed.filter((p) => !p.cs_id).length;
      const csInGrace  = completed.length - csScopeCompleted.length;

      // ── Activity Score (0-100) ────────────────────────────────────────
      // Logins (0-60 pts): 0→0, 1→20, 2-3→40, 4+→60
      const loginPts = logins30d === 0 ? 0 : logins30d === 1 ? 20 : logins30d <= 3 ? 40 : 60;
      // Updates (0-40 pts): expected = max(1, activeProjects × 2) updates/month.
      // Project mutations are not yet written to audit_logs, so this stays 0
      // until they are — hence logins carry the larger share rather than
      // zeroing the whole score.
      const expectedUpdates = Math.max(1, active.length * 2);
      const updatePts = logins30d === 0 ? 0 : Math.min(40, Math.round((projectUpdates30d / expectedUpdates) * 40));
      const activityScore = loginPts + updatePts;

      // ── Data Quality Score (0-100) ────────────────────────────────────
      // Uses qualityPopulation (defined above) so the score and the displayed
      // missing-field counts are always computed over the same project set.
      const qualityScope = qualityPopulation;
      let qualityScore = 100;
      if (qualityScope.length > 0) {
        const earned = qualityScope.reduce((sum, p) => {
          let pts = 0;
          if (p.planned_start)                    pts++;
          if (p.planned_end)                      pts++;
          if (p.actual_start)                     pts++;
          if (p.customer_contact)                 pts++;
          if (p.notes && String(p.notes).trim())  pts++;
          if (p.project_memory)                   pts++;
          if (p.estimated_cost)                   pts++;
          return sum + pts;
        }, 0);
        const base = Math.round((earned / (qualityScope.length * 7)) * 100);
        qualityScore = Math.max(0, base - Math.min(overdueNotFlagged * 5, 20));
      }

      // ── Case Study Score (0-100) ──────────────────────────────────────
      let caseStudyScore = 100;
      if (csScopeCompleted.length > 0) {
        const scopedDone    = csScopeCompleted.filter((p) => p.cs_status === 'COMPLETED' || p.cs_status === 'PUBLISHED').length;
        const scopedPending = csScopeCompleted.filter((p) => p.cs_status === 'PENDING' || p.cs_status === 'IN_PROGRESS').length;
        const scopedMissing = csScopeCompleted.filter((p) => !p.cs_id).length;
        const base = Math.round((scopedDone / csScopeCompleted.length) * 100);
        caseStudyScore = Math.max(0, base - Math.min(scopedPending * 5, 15) - Math.min(scopedMissing * 10, 30));
      }

      // ── Delay Accountability Score (0-100, over active/on-hold projects) ─
      // Attribution penalty by delay_happened, plus a separate penalty when
      // a delayed project has no RCA note (escalation_daily_notes, column_name
      // 'Delay Happened') — setting the dropdown isn't enough, the root-cause
      // note is required too.
      let delayScore = 100;
      let delayedProjectsCount = 0;
      let missingRcaCount = 0;
      for (const p of active) {
        if (p.delay_status !== 'AT_RISK' && p.delay_status !== 'DELAYED') continue;
        delayedProjectsCount++;
        // Leaving delay_happened blank must cost more than any honest
        // attribution, otherwise reporting an internal delay scores worse than
        // reporting nothing at all.
        if (p.delay_happened === 'CUSTOMER_DELAY')      delayScore -= 5;
        else if (p.delay_happened === 'INTERNAL_DELAY') delayScore -= 10;
        else if (p.delay_happened === 'BOTH')           delayScore -= 12;
        else                                             delayScore -= 15; // not attributed
        if (!p.has_rca) { delayScore -= 10; missingRcaCount++; }
      }
      delayScore = Math.max(0, delayScore);

      // ── Phase-Date Integrity Score (0-100, over ALL projects) ──────────
      // Flags identical start/end dates for phases that realistically can't
      // be completed in a single day. Kickoff→Cloud Adding same-day and
      // Delta Migration's own start=end are intentionally NOT penalized.
      const sameDay = (a: any, b: any) => !!a && !!b && new Date(a).toDateString() === new Date(b).toDateString();
      let dateIntegrityScore = 100;
      let dateViolationsCount = 0;
      for (const p of projects) {
        const violations = [
          sameDay(p.planned_start, p.planned_end),
          sameDay(p.cloud_adding_start, p.cloud_adding_end),
          sameDay(p.pilot_migration_start, p.pilot_migration_end),
          sameDay(p.onetime_migration_start, p.onetime_migration_end),
          sameDay(p.final_validation_start, p.final_validation_end),
        ].filter(Boolean).length;
        dateViolationsCount += violations;
        dateIntegrityScore -= violations * 8;
      }
      dateIntegrityScore = Math.max(0, dateIntegrityScore);

      // ── Overall Hygiene Score ─────────────────────────────────────────
      const hygieneScore = Math.round(
        activityScore * 0.25 + qualityScore * 0.25 + caseStudyScore * 0.15 +
        delayScore * 0.20 + dateIntegrityScore * 0.15
      );

      board.push({
        projectManager: pm,
        totalProjects: projects.length,
        activeProjects: active.length,
        completedProjects: completed.length,
        // Activity
        logins30d,
        projectUpdates30d,
        caseStudyUpdates30d,
        lastLoginAt,
        lastActionAt,
        daysSinceLastAction: daysSinceLastAction === 999 ? null : daysSinceLastAction,
        // Data quality
        missingKickoffDate,
        missingPlannedDates,
        missingCustomerEmail,
        missingNotes,
        overdueNotFlagged,
        missingProjectSize,
        missingBudget,
        // Case studies
        csDone,
        csPending,
        csMissing,
        csInGrace,
        // Delay accountability
        delayedProjectsCount,
        missingRcaCount,
        // Phase-date integrity
        dateViolationsCount,
        // Scores
        activityScore,
        qualityScore,
        caseStudyScore,
        delayScore,
        dateIntegrityScore,
        hygieneScore,
      });
    }

    return board.sort((a, b) => b.hygieneScore - a.hygieneScore);
  }

  // Locks in a permanent snapshot of getHygieneBoard() for the most recently completed
  // Mon-Sun (IST) week — called by the Monday 7AM IST cron. Idempotent (UNIQUE on
  // week_start). Worth remembering: only the Activity and Case Study components of this
  // score are genuinely computed over the week's events — Data Quality, Delay
  // Accountability, and Phase-Date Integrity always reflect *current* project state (see
  // the comment on getHygieneBoard above), so for those three, "this week's snapshot" only
  // ever means "what the board looked like at finalize time," not an aggregate of the week.
  async finalizeWeek(weeksAgo = 1): Promise<{ finalized: boolean; weekStartDate: string }> {
    const { weekStart, weekEnd } = getIstWeekBounds(weeksAgo);
    const weekStartDate = istDateStr(weekStart);

    const existing = await query(`SELECT id FROM pmo_hygiene_weekly WHERE week_start = $1`, [weekStartDate]);
    if (existing.rows.length > 0) return { finalized: false, weekStartDate };

    const board = await this.getHygieneBoard(weekStart.toISOString(), weekEnd.toISOString());
    await execute(
      `INSERT INTO pmo_hygiene_weekly (week_start, week_end, metrics) VALUES ($1, $2, $3)
       ON CONFLICT (week_start) DO NOTHING`,
      [weekStartDate, istDateStr(weekEnd), JSON.stringify(board)]
    );
    logger.info(`[PmoHygiene] Finalized week of ${weekStartDate} — ${board.length} PMs`);
    return { finalized: true, weekStartDate };
  }

  // One slot per week-of-month, in order, even if it was never finalized (e.g. it passed
  // before this feature existed), plus the current in-progress week computed live
  // (isCurrent: true, never persisted). Named distinctly from the existing
  // getWeeklyTrend(endDate, weeks) above, which is an unrelated segment-level Audit Report
  // trend with a different signature/purpose.
  async getPmoHygieneWeeklyTrend(): Promise<{
    weeks: Array<{ weekStart: string; weekEnd: string; isCurrent: boolean; hasData: boolean; metrics: any[] }>;
  }> {
    const monthWeeks = weeksInCurrentIstMonth();
    const { weekStart: currentWeekStart, weekEnd: currentWeekEnd } = getIstWeekBounds(0);
    const currentWeekStartDate = istDateStr(currentWeekStart);
    const finalizedWeekDates = monthWeeks.filter(d => d !== currentWeekStartDate);

    const finalizedRows = finalizedWeekDates.length
      ? (await query(
          `SELECT week_start, week_end, metrics FROM pmo_hygiene_weekly WHERE week_start = ANY($1)`,
          [finalizedWeekDates]
        )).rows
      : [];
    const byWeekStart = new Map(finalizedRows.map((r: any) => [istDateStr(new Date(r.week_start)), r]));

    const weeks = finalizedWeekDates.map((weekStartDate) => {
      const r: any = byWeekStart.get(weekStartDate);
      if (!r) {
        const d = new Date(weekStartDate);
        const weekEnd = new Date(d.getTime() + 6 * 86400000);
        return { weekStart: weekStartDate, weekEnd: istDateStr(weekEnd), isCurrent: false, hasData: false, metrics: [] };
      }
      return {
        weekStart: istDateStr(new Date(r.week_start)),
        weekEnd: istDateStr(new Date(r.week_end)),
        isCurrent: false,
        hasData: true,
        metrics: r.metrics as any[],
      };
    });

    try {
      const currentBoard = await this.getHygieneBoard(currentWeekStart.toISOString(), new Date().toISOString());
      weeks.push({ weekStart: currentWeekStartDate, weekEnd: istDateStr(currentWeekEnd), isCurrent: true, hasData: true, metrics: currentBoard });
    } catch (err) {
      logger.error('[PmoHygiene] Current-week trend fetch failed:', err);
      weeks.push({ weekStart: currentWeekStartDate, weekEnd: istDateStr(currentWeekEnd), isCurrent: true, hasData: false, metrics: [] });
    }

    return { weeks };
  }

  /**
   * Per-PM activity snapshot for "yesterday" specifically (IST calendar day),
   * used by the daily hygiene scorecard email — distinct from the 30-day
   * rolling window getHygieneBoard() uses for the dashboard.
   */
  async getYesterdayActivitySnapshot() {
    const loginResult = await query(`
      SELECT u.name AS pm_name, COUNT(*)::int AS logins_yesterday
      FROM audit_logs a
      JOIN users u ON u.id = a.user_id
      WHERE a.action = 'LOGIN'
        AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::date =
            ((NOW() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '1 day')
      GROUP BY u.name
    `);

    const projectTouchResult = await query(`
      SELECT u.name AS pm_name, COUNT(*)::int AS project_updates_yesterday
      FROM audit_logs a
      JOIN users u ON u.id = a.user_id
      WHERE a.action IN ('UPDATE','CREATE','STATUS_CHANGE')
        AND a.entity_type ILIKE '%project%'
        AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::date =
            ((NOW() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '1 day')
      GROUP BY u.name
    `);

    const notesResult = await query(`
      SELECT author, COUNT(*)::int AS notes_yesterday
      FROM escalation_daily_notes
      WHERE author IS NOT NULL AND TRIM(author) <> ''
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date =
            ((NOW() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '1 day')
      GROUP BY author
    `);

    const snapshot = new Map<string, { loggedInYesterday: boolean; updatedProjectYesterday: boolean; addedNoteYesterday: boolean }>();
    const ensure = (name: string) => {
      const key = name.toLowerCase().trim();
      if (!snapshot.has(key)) {
        snapshot.set(key, { loggedInYesterday: false, updatedProjectYesterday: false, addedNoteYesterday: false });
      }
      return snapshot.get(key)!;
    };

    for (const row of loginResult.rows) ensure(row.pm_name).loggedInYesterday = Number(row.logins_yesterday) > 0;
    for (const row of projectTouchResult.rows) ensure(row.pm_name).updatedProjectYesterday = Number(row.project_updates_yesterday) > 0;
    for (const row of notesResult.rows) ensure(row.author).addedNoteYesterday = Number(row.notes_yesterday) > 0;

    return snapshot;
  }

  async getRecentActivity(limit = 20) {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const result = await query(
      `SELECT a.*, u.id as u_id, u.name as u_name, u.email as u_email
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC
       LIMIT ${safeLimit}`
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityName: row.entity_name,
      oldValues: row.old_values ? JSON.parse(row.old_values) : null,
      newValues: row.new_values ? JSON.parse(row.new_values) : null,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      user: row.u_id ? { id: row.u_id, name: row.u_name, email: row.u_email } : null,
    }));
  }
}

export const auditService = new AuditService();
