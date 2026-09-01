import { query, execute } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export type ActionItemStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE';
export type ActionItemPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ActionItemDTO {
  id: string;
  month: string; // 'yyyy-MM', e.g. '2026-07'
  item: string;
  accountable?: string | null;
  status?: ActionItemStatus;
  priority?: ActionItemPriority;
  createdBy?: string;
}

function mapRow(row: any) {
  return {
    id: row.id,
    month: row.month,
    item: row.item,
    accountable: row.accountable,
    status: row.status,
    priority: row.priority,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const VALID_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE'];
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];

class ActionItemService {
  async getAll() {
    const result = await query(`SELECT * FROM action_items ORDER BY month DESC, created_at DESC`);
    return result.rows.map(mapRow);
  }

  async create(data: ActionItemDTO) {
    if (!data.id || !data.month || !data.item?.trim()) {
      throw new AppError('id, month, and item are required', 400);
    }
    const status = data.status || 'OPEN';
    const priority = data.priority || 'MEDIUM';
    if (!VALID_STATUSES.includes(status)) throw new AppError(`status must be one of ${VALID_STATUSES.join(', ')}`, 400);
    if (!VALID_PRIORITIES.includes(priority)) throw new AppError(`priority must be one of ${VALID_PRIORITIES.join(', ')}`, 400);

    const result = await query(
      `INSERT INTO action_items (id, month, item, accountable, status, priority, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.id, data.month, data.item.trim(), data.accountable || null, status, priority, data.createdBy || null]
    );
    return mapRow(result.rows[0]);
  }

  async update(id: string, data: Partial<ActionItemDTO>) {
    const existing = await query(`SELECT id FROM action_items WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      throw new AppError('Action item not found', 404);
    }
    if (data.status !== undefined && !VALID_STATUSES.includes(data.status)) {
      throw new AppError(`status must be one of ${VALID_STATUSES.join(', ')}`, 400);
    }
    if (data.priority !== undefined && !VALID_PRIORITIES.includes(data.priority)) {
      throw new AppError(`priority must be one of ${VALID_PRIORITIES.join(', ')}`, 400);
    }

    const updates: string[] = [];
    const params: any[] = [];
    const push = (col: string, val: any) => { params.push(val); updates.push(`${col} = $${params.length}`); };

    if (data.month !== undefined) push('month', data.month);
    if (data.item !== undefined) push('item', data.item.trim());
    if (data.accountable !== undefined) push('accountable', data.accountable || null);
    if (data.status !== undefined) push('status', data.status);
    if (data.priority !== undefined) push('priority', data.priority);

    if (updates.length === 0) {
      const current = await query(`SELECT * FROM action_items WHERE id = $1`, [id]);
      return mapRow(current.rows[0]);
    }

    params.push(id);
    const result = await query(
      `UPDATE action_items SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
      params
    );
    return mapRow(result.rows[0]);
  }

  async remove(id: string) {
    const result = await execute(`DELETE FROM action_items WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      throw new AppError('Action item not found', 404);
    }
  }
}

export const actionItemService = new ActionItemService();
