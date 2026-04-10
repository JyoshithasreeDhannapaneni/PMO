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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      const result = await query(`SELECT * FROM audit_logs WHERE id = ?`, [logId]);
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

    if (userId) { conditions.push(`a.user_id = ?`); params.push(userId); }
    if (entityType) { conditions.push(`a.entity_type = ?`); params.push(entityType); }
    if (entityId) { conditions.push(`a.entity_id = ?`); params.push(entityId); }
    if (action) { conditions.push(`a.action = ?`); params.push(action); }
    if (startDate) { conditions.push(`a.created_at >= ?`); params.push(startDate); }
    if (endDate) { conditions.push(`a.created_at <= ?`); params.push(endDate); }

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
