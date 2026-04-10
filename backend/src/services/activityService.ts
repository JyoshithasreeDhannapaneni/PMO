import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

type ActivityType = 'PROJECT_CREATED' | 'PROJECT_UPDATED' | 'PROJECT_COMPLETED' | 'TASK_CREATED' | 'TASK_COMPLETED' | 'TASK_ASSIGNED' | 'COMMENT_ADDED' | 'DOCUMENT_UPLOADED' | 'RISK_IDENTIFIED' | 'RISK_RESOLVED' | 'TEAM_MEMBER_ADDED' | 'STATUS_REPORT_GENERATED' | 'CHANGE_REQUEST_SUBMITTED' | 'CHANGE_REQUEST_APPROVED' | 'MILESTONE_REACHED';

interface CreateActivityInput {
  userId?: string;
  type: ActivityType;
  entityType: string;
  entityId: string;
  entityName?: string;
  description: string;
  metadata?: any;
}

class ActivityService {
  async create(data: CreateActivityInput) {
    try {
      const activityId = uuidv4();
      await execute(
        `INSERT INTO activities (id, user_id, type, entity_type, entity_id, entity_name, description, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          activityId,
          data.userId,
          data.type,
          data.entityType,
          data.entityId,
          data.entityName,
          data.description,
          data.metadata ? JSON.stringify(data.metadata) : null,
        ]
      );

      const result = await query(`SELECT * FROM activities WHERE id = ?`, [activityId]);
      const row = result.rows[0];

      if (data.userId) {
        const userResult = await query(
          `SELECT id, name, email, avatar FROM users WHERE id = $1`,
          [data.userId]
        );

        return {
          id: row.id,
          userId: row.user_id,
          type: row.type,
          entityType: row.entity_type,
          entityId: row.entity_id,
          entityName: row.entity_name,
          description: row.description,
          metadata: row.metadata ? JSON.parse(row.metadata) : null,
          createdAt: row.created_at,
          user: userResult.rows[0] || null,
        };
      }

      return {
        id: row.id,
        userId: row.user_id,
        type: row.type,
        entityType: row.entity_type,
        entityId: row.entity_id,
        entityName: row.entity_name,
        description: row.description,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
        createdAt: row.created_at,
        user: null,
      };
    } catch (error) {
      logger.error('Failed to create activity:', error);
    }
  }

  async getAll(options: { page?: number; limit?: number; entityType?: string; entityId?: string } = {}) {
    const { page = 1, limit = 50, entityType, entityId } = options;
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const safeOffset = Math.max(0, Math.floor((page - 1) * safeLimit));

    const conditions: string[] = [];
    const params: any[] = [];

    if (entityType) { conditions.push(`a.entity_type = ?`); params.push(entityType); }
    if (entityId) { conditions.push(`a.entity_id = ?`); params.push(entityId); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [activitiesResult, countResult] = await Promise.all([
      query(
        `SELECT a.*, u.id as u_id, u.name as u_name, u.email as u_email, u.avatar as u_avatar
         FROM activities a
         LEFT JOIN users u ON a.user_id = u.id
         ${whereClause}
         ORDER BY a.created_at DESC
         LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      ),
      query(`SELECT COUNT(*) as count FROM activities a ${whereClause}`, params),
    ]);

    return {
      data: activitiesResult.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        type: row.type,
        entityType: row.entity_type,
        entityId: row.entity_id,
        entityName: row.entity_name,
        description: row.description,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
        createdAt: row.created_at,
        user: row.u_id ? { id: row.u_id, name: row.u_name, email: row.u_email, avatar: row.u_avatar } : null,
      })),
      pagination: {
        page,
        limit: safeLimit,
        total: parseInt(countResult.rows[0].count || countResult.rows[0]['COUNT(*)'] || 0),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count || countResult.rows[0]['COUNT(*)'] || 0) / safeLimit),
      },
    };
  }

  async getByEntity(entityType: string, entityId: string, limit = 20) {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const result = await query(
      `SELECT a.*, u.id as u_id, u.name as u_name, u.email as u_email, u.avatar as u_avatar
       FROM activities a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.entity_type = $1 AND a.entity_id = $2
       ORDER BY a.created_at DESC
       LIMIT ${safeLimit}`,
      [entityType, entityId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityName: row.entity_name,
      description: row.description,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.created_at,
      user: row.u_id ? { id: row.u_id, name: row.u_name, email: row.u_email, avatar: row.u_avatar } : null,
    }));
  }

  async getRecentGlobal(limit = 30) {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const result = await query(
      `SELECT a.*, u.id as u_id, u.name as u_name, u.email as u_email, u.avatar as u_avatar
       FROM activities a
       LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC
       LIMIT ${safeLimit}`
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityName: row.entity_name,
      description: row.description,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.created_at,
      user: row.u_id ? { id: row.u_id, name: row.u_name, email: row.u_email, avatar: row.u_avatar } : null,
    }));
  }

  async getByUser(userId: string, limit = 30) {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const result = await query(
      `SELECT * FROM activities WHERE user_id = $1 ORDER BY created_at DESC LIMIT ${safeLimit}`,
      [userId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityName: row.entity_name,
      description: row.description,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.created_at,
    }));
  }

  async logProjectCreated(userId: string, projectId: string, projectName: string) {
    return this.create({
      userId,
      type: 'PROJECT_CREATED',
      entityType: 'project',
      entityId: projectId,
      entityName: projectName,
      description: `created project "${projectName}"`,
    });
  }

  async logTaskCompleted(userId: string, taskId: string, taskName: string, projectName: string) {
    return this.create({
      userId,
      type: 'TASK_COMPLETED',
      entityType: 'task',
      entityId: taskId,
      entityName: taskName,
      description: `completed task "${taskName}" in ${projectName}`,
    });
  }

  async logCommentAdded(userId: string, entityType: string, entityId: string, entityName: string) {
    return this.create({
      userId,
      type: 'COMMENT_ADDED',
      entityType,
      entityId,
      entityName,
      description: `commented on ${entityType} "${entityName}"`,
    });
  }

  async logDocumentUploaded(userId: string, documentId: string, documentName: string, projectName: string) {
    return this.create({
      userId,
      type: 'DOCUMENT_UPLOADED',
      entityType: 'document',
      entityId: documentId,
      entityName: documentName,
      description: `uploaded document "${documentName}" to ${projectName}`,
    });
  }
}

export const activityService = new ActivityService();
