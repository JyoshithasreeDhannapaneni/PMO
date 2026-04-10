import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

type ChangeType = 'SCOPE' | 'SCHEDULE' | 'BUDGET' | 'RESOURCE' | 'TECHNICAL';
type ChangeRequestStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'IMPLEMENTED' | 'CANCELLED';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface CreateChangeRequestInput {
  projectId: string;
  title: string;
  description: string;
  changeType?: ChangeType;
  priority?: Priority;
  impact?: string;
  justification?: string;
  requestedBy: string;
  costImpact?: number;
  scheduleImpact?: number;
}

interface UpdateChangeRequestInput {
  title?: string;
  description?: string;
  changeType?: ChangeType;
  priority?: Priority;
  status?: ChangeRequestStatus;
  impact?: string;
  justification?: string;
  costImpact?: number;
  scheduleImpact?: number;
}

function mapChangeRequestRow(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    changeType: row.change_type,
    priority: row.priority,
    status: row.status,
    impact: row.impact,
    justification: row.justification,
    requestedBy: row.requested_by,
    requestedDate: row.requested_date,
    reviewedBy: row.reviewed_by,
    reviewedDate: row.reviewed_date,
    approvedBy: row.approved_by,
    approvedDate: row.approved_date,
    costImpact: row.cost_impact,
    scheduleImpact: row.schedule_impact,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class ChangeRequestService {
  async getByProject(projectId: string) {
    const result = await query(
      `SELECT * FROM change_requests WHERE project_id = $1 
       ORDER BY status ASC, priority DESC, requested_date DESC`,
      [projectId]
    );
    return result.rows.map(mapChangeRequestRow);
  }

  async getById(id: string) {
    const result = await query(
      `SELECT cr.*, p.name as project_name
       FROM change_requests cr
       JOIN projects p ON cr.project_id = p.id
       WHERE cr.id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      ...mapChangeRequestRow(row),
      project: { name: row.project_name },
    };
  }

  async getPending() {
    const result = await query(
      `SELECT cr.*, p.id as p_id, p.name as p_name, p.customer_name
       FROM change_requests cr
       JOIN projects p ON cr.project_id = p.id
       WHERE cr.status IN ('PENDING', 'UNDER_REVIEW')
       ORDER BY cr.priority DESC, cr.requested_date ASC`
    );

    return result.rows.map((row) => ({
      ...mapChangeRequestRow(row),
      project: { id: row.p_id, name: row.p_name, customerName: row.customer_name },
    }));
  }

  async create(data: CreateChangeRequestInput) {
    const crId = uuidv4();
    await execute(
      `INSERT INTO change_requests (
        id, project_id, title, description, change_type, priority, status, impact, justification,
        requested_by, requested_date, cost_impact, schedule_impact
      ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, NOW(), ?, ?)`,
      [
        crId,
        data.projectId,
        data.title,
        data.description,
        data.changeType || 'SCOPE',
        data.priority || 'MEDIUM',
        data.impact,
        data.justification,
        data.requestedBy,
        data.costImpact,
        data.scheduleImpact,
      ]
    );

    const result = await query(`SELECT * FROM change_requests WHERE id = ?`, [crId]);
    const cr = mapChangeRequestRow(result.rows[0]);
    logger.info(`Change request created: ${cr.id} for project ${data.projectId}`);
    return cr;
  }

  async update(id: string, data: UpdateChangeRequestInput) {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) { updates.push(`title = $${paramIndex++}`); params.push(data.title); }
    if (data.description !== undefined) { updates.push(`description = $${paramIndex++}`); params.push(data.description); }
    if (data.changeType !== undefined) { updates.push(`change_type = $${paramIndex++}`); params.push(data.changeType); }
    if (data.priority !== undefined) { updates.push(`priority = $${paramIndex++}`); params.push(data.priority); }
    if (data.status !== undefined) { updates.push(`status = $${paramIndex++}`); params.push(data.status); }
    if (data.impact !== undefined) { updates.push(`impact = $${paramIndex++}`); params.push(data.impact); }
    if (data.justification !== undefined) { updates.push(`justification = $${paramIndex++}`); params.push(data.justification); }
    if (data.costImpact !== undefined) { updates.push(`cost_impact = $${paramIndex++}`); params.push(data.costImpact); }
    if (data.scheduleImpact !== undefined) { updates.push(`schedule_impact = $${paramIndex++}`); params.push(data.scheduleImpact); }

    params.push(id);

    await execute(
      `UPDATE change_requests SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const result = await query(`SELECT * FROM change_requests WHERE id = ?`, [id]);
    const cr = mapChangeRequestRow(result.rows[0]);
    logger.info(`Change request updated: ${cr.id}`);
    return cr;
  }

  async review(id: string, reviewedBy: string) {
    await execute(
      `UPDATE change_requests SET status = 'UNDER_REVIEW', reviewed_by = ?, reviewed_date = NOW() 
       WHERE id = ?`,
      [reviewedBy, id]
    );

    const result = await query(`SELECT * FROM change_requests WHERE id = ?`, [id]);
    const cr = mapChangeRequestRow(result.rows[0]);
    logger.info(`Change request under review: ${cr.id}`);
    return cr;
  }

  async approve(id: string, approvedBy: string) {
    await execute(
      `UPDATE change_requests SET status = 'APPROVED', approved_by = ?, approved_date = NOW() 
       WHERE id = ?`,
      [approvedBy, id]
    );

    const result = await query(`SELECT * FROM change_requests WHERE id = ?`, [id]);
    const cr = mapChangeRequestRow(result.rows[0]);
    logger.info(`Change request approved: ${cr.id}`);
    return cr;
  }

  async reject(id: string, reviewedBy: string) {
    await execute(
      `UPDATE change_requests SET status = 'REJECTED', reviewed_by = ?, reviewed_date = NOW() 
       WHERE id = ?`,
      [reviewedBy, id]
    );

    const result = await query(`SELECT * FROM change_requests WHERE id = ?`, [id]);
    const cr = mapChangeRequestRow(result.rows[0]);
    logger.info(`Change request rejected: ${cr.id}`);
    return cr;
  }

  async implement(id: string) {
    await execute(
      `UPDATE change_requests SET status = 'IMPLEMENTED' WHERE id = ?`,
      [id]
    );

    const result = await query(`SELECT * FROM change_requests WHERE id = ?`, [id]);
    const cr = mapChangeRequestRow(result.rows[0]);
    logger.info(`Change request implemented: ${cr.id}`);
    return cr;
  }

  async delete(id: string) {
    await query(`DELETE FROM change_requests WHERE id = $1`, [id]);
    logger.info(`Change request deleted: ${id}`);
  }

  async getSummary(projectId: string) {
    const [total, pending, approved, rejected, implemented] = await Promise.all([
      query(`SELECT COUNT(*) FROM change_requests WHERE project_id = $1`, [projectId]),
      query(`SELECT COUNT(*) FROM change_requests WHERE project_id = $1 AND status IN ('PENDING', 'UNDER_REVIEW')`, [projectId]),
      query(`SELECT COUNT(*) FROM change_requests WHERE project_id = $1 AND status = 'APPROVED'`, [projectId]),
      query(`SELECT COUNT(*) FROM change_requests WHERE project_id = $1 AND status = 'REJECTED'`, [projectId]),
      query(`SELECT COUNT(*) FROM change_requests WHERE project_id = $1 AND status = 'IMPLEMENTED'`, [projectId]),
    ]);

    return {
      total: parseInt(total.rows[0].count || total.rows[0]['COUNT(*)'] || 0),
      pending: parseInt(pending.rows[0].count || pending.rows[0]['COUNT(*)'] || 0),
      approved: parseInt(approved.rows[0].count || approved.rows[0]['COUNT(*)'] || 0),
      rejected: parseInt(rejected.rows[0].count || rejected.rows[0]['COUNT(*)'] || 0),
      implemented: parseInt(implemented.rows[0].count || implemented.rows[0]['COUNT(*)'] || 0),
    };
  }
}

export const changeRequestService = new ChangeRequestService();
