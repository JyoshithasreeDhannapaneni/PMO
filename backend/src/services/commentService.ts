import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { activityService } from './activityService';
import { v4 as uuidv4 } from 'uuid';

interface CreateCommentInput {
  userId: string;
  entityType: string;
  entityId: string;
  content: string;
  parentId?: string;
}

interface UpdateCommentInput {
  content: string;
}

class CommentService {
  async getByEntity(entityType: string, entityId: string) {
    const commentsResult = await query(
      `SELECT c.*, u.id as u_id, u.name as u_name, u.email as u_email, u.avatar as u_avatar
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.entity_type = $1 AND c.entity_id = $2 AND c.parent_id IS NULL
       ORDER BY c.created_at DESC`,
      [entityType, entityId]
    );

    const comments = [];
    for (const row of commentsResult.rows) {
      const repliesResult = await query(
        `SELECT c.*, u.id as u_id, u.name as u_name, u.email as u_email, u.avatar as u_avatar
         FROM comments c
         JOIN users u ON c.user_id = u.id
         WHERE c.parent_id = $1
         ORDER BY c.created_at ASC`,
        [row.id]
      );

      comments.push({
        id: row.id,
        userId: row.user_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        content: row.content,
        parentId: row.parent_id,
        isEdited: row.is_edited,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        user: { id: row.u_id, name: row.u_name, email: row.u_email, avatar: row.u_avatar },
        replies: repliesResult.rows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          entityType: r.entity_type,
          entityId: r.entity_id,
          content: r.content,
          parentId: r.parent_id,
          isEdited: r.is_edited,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          user: { id: r.u_id, name: r.u_name, email: r.u_email, avatar: r.u_avatar },
        })),
      });
    }

    return comments;
  }

  async getById(id: string) {
    const result = await query(
      `SELECT c.*, u.id as u_id, u.name as u_name, u.email as u_email, u.avatar as u_avatar
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const repliesResult = await query(
      `SELECT c.*, u.id as u_id, u.name as u_name, u.email as u_email, u.avatar as u_avatar
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.parent_id = $1
       ORDER BY c.created_at ASC`,
      [id]
    );

    return {
      id: row.id,
      userId: row.user_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      content: row.content,
      parentId: row.parent_id,
      isEdited: row.is_edited,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      user: { id: row.u_id, name: row.u_name, email: row.u_email, avatar: row.u_avatar },
      replies: repliesResult.rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        content: r.content,
        isEdited: r.is_edited,
        createdAt: r.created_at,
        user: { id: r.u_id, name: r.u_name, email: r.u_email, avatar: r.u_avatar },
      })),
    };
  }

  async create(data: CreateCommentInput) {
    const commentId = uuidv4();
    await execute(
      `INSERT INTO comments (id, user_id, entity_type, entity_id, content, parent_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [commentId, data.userId, data.entityType, data.entityId, data.content, data.parentId]
    );

    const result = await query(`SELECT * FROM comments WHERE id = ?`, [commentId]);
    const row = result.rows[0];
    const userResult = await query(
      `SELECT id, name, email, avatar FROM users WHERE id = $1`,
      [data.userId]
    );

    await activityService.logCommentAdded(data.userId, data.entityType, data.entityId, data.entityType);

    logger.info(`Comment created: ${row.id} on ${data.entityType}/${data.entityId}`);

    return {
      id: row.id,
      userId: row.user_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      content: row.content,
      parentId: row.parent_id,
      isEdited: row.is_edited,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      user: userResult.rows[0],
    };
  }

  async update(id: string, userId: string, data: UpdateCommentInput) {
    const existing = await query(`SELECT * FROM comments WHERE id = $1`, [id]);

    if (existing.rows.length === 0) {
      throw new Error('Comment not found');
    }

    if (existing.rows[0].user_id !== userId) {
      throw new Error('Not authorized to edit this comment');
    }

    await execute(
      `UPDATE comments SET content = ?, is_edited = true WHERE id = ?`,
      [data.content, id]
    );

    const result = await query(`SELECT * FROM comments WHERE id = ?`, [id]);
    const row = result.rows[0];
    const userResult = await query(
      `SELECT id, name, email, avatar FROM users WHERE id = $1`,
      [row.user_id]
    );

    logger.info(`Comment updated: ${row.id}`);

    return {
      id: row.id,
      userId: row.user_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      content: row.content,
      parentId: row.parent_id,
      isEdited: row.is_edited,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      user: userResult.rows[0],
    };
  }

  async delete(id: string, userId: string, isAdmin = false) {
    const existing = await query(`SELECT * FROM comments WHERE id = $1`, [id]);

    if (existing.rows.length === 0) {
      throw new Error('Comment not found');
    }

    if (existing.rows[0].user_id !== userId && !isAdmin) {
      throw new Error('Not authorized to delete this comment');
    }

    await query(`DELETE FROM comments WHERE id = $1`, [id]);
    logger.info(`Comment deleted: ${id}`);
  }

  async getCount(entityType: string, entityId: string) {
    const result = await query(
      `SELECT COUNT(*) as count FROM comments WHERE entity_type = ? AND entity_id = ?`,
      [entityType, entityId]
    );
    return parseInt(result.rows[0].count || result.rows[0]['COUNT(*)'] || 0);
  }

  async getRecentComments(limit = 10) {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const result = await query(
      `SELECT c.*, u.id as u_id, u.name as u_name, u.email as u_email, u.avatar as u_avatar
       FROM comments c
       JOIN users u ON c.user_id = u.id
       ORDER BY c.created_at DESC
       LIMIT ${safeLimit}`
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      content: row.content,
      parentId: row.parent_id,
      isEdited: row.is_edited,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      user: { id: row.u_id, name: row.u_name, email: row.u_email, avatar: row.u_avatar },
    }));
  }
}

export const commentService = new CommentService();
