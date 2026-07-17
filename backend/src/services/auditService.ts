import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

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
        COUNT(a.id)::int                                                        AS total_actions,
        COUNT(CASE WHEN a.action = 'CREATE'        THEN 1 END)::int             AS creates,
        COUNT(CASE WHEN a.action = 'UPDATE'        THEN 1 END)::int             AS updates,
        COUNT(CASE WHEN a.action = 'DELETE'        THEN 1 END)::int             AS deletes,
        COUNT(CASE WHEN a.action = 'LOGIN'         THEN 1 END)::int             AS logins,
        COUNT(CASE WHEN a.action = 'STATUS_CHANGE' THEN 1 END)::int             AS status_changes,
        COUNT(CASE WHEN a.action = 'EXPORT'        THEN 1 END)::int             AS exports,
        MAX(a.created_at)                                                       AS last_active
      FROM users u
      LEFT JOIN audit_logs a
        ON u.id = a.user_id
        AND a.created_at >= $1
        AND a.created_at <= $2
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
