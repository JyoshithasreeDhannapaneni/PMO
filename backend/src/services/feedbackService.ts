import { query, execute } from '../config/database';

export type FeedbackType = 'ISSUE' | 'SUGGESTION';
export type FeedbackStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE';

export interface FeedbackImage {
  url: string;
  name: string;
}

export interface FeedbackItem {
  id: string;
  type: FeedbackType;
  message: string;
  status: FeedbackStatus;
  images: FeedbackImage[];
  createdById: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

function toFeedbackItem(r: any): FeedbackItem {
  return {
    id: r.id,
    type: r.type,
    message: r.message,
    status: r.status,
    images: Array.isArray(r.images) ? r.images : [],
    createdById: r.created_by_id,
    createdByName: r.created_by_name,
    createdByEmail: r.created_by_email,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const feedbackService = {
  // Oldest first — this is a chat-style feed, so items read top-to-bottom like a
  // conversation, with the newest submission appearing at the bottom.
  async getAll(): Promise<FeedbackItem[]> {
    const result = await query(`SELECT * FROM feedback_items ORDER BY created_at ASC`);
    return result.rows.map(toFeedbackItem);
  },

  async create(params: {
    type: FeedbackType;
    message: string;
    userId: string;
    userName: string;
    userEmail: string;
    images?: FeedbackImage[];
  }): Promise<FeedbackItem> {
    const result = await execute(
      `INSERT INTO feedback_items (type, message, created_by_id, created_by_name, created_by_email, images)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [params.type, params.message, params.userId, params.userName, params.userEmail, JSON.stringify(params.images ?? [])]
    );
    return toFeedbackItem((result as any).rows[0]);
  },

  async updateStatus(id: string, status: FeedbackStatus): Promise<FeedbackItem | null> {
    const result = await execute(
      `UPDATE feedback_items SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );
    const row = (result as any).rows?.[0];
    return row ? toFeedbackItem(row) : null;
  },
};
