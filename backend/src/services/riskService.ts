import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

type RiskCategory = 'TECHNICAL' | 'SCHEDULE' | 'RESOURCE' | 'BUDGET' | 'SCOPE' | 'EXTERNAL' | 'ORGANIZATIONAL';
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type RiskStatus = 'OPEN' | 'MITIGATING' | 'RESOLVED' | 'ACCEPTED' | 'CLOSED';

interface CreateRiskInput {
  projectId: string;
  title: string;
  description?: string;
  category?: RiskCategory;
  probability?: RiskLevel;
  impact?: RiskLevel;
  mitigation?: string;
  contingency?: string;
  owner?: string;
  dueDate?: Date;
}

interface UpdateRiskInput {
  title?: string;
  description?: string;
  category?: RiskCategory;
  probability?: RiskLevel;
  impact?: RiskLevel;
  status?: RiskStatus;
  mitigation?: string;
  contingency?: string;
  owner?: string;
  dueDate?: Date;
}

function mapRiskRow(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    category: row.category,
    probability: row.probability,
    impact: row.impact,
    status: row.status,
    mitigation: row.mitigation,
    contingency: row.contingency,
    owner: row.owner,
    dueDate: row.due_date,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class RiskService {
  async getByProject(projectId: string) {
    const result = await query(
      `SELECT * FROM project_risks WHERE project_id = $1 
       ORDER BY status ASC, impact DESC, probability DESC`,
      [projectId]
    );
    return result.rows.map(mapRiskRow);
  }

  async getById(id: string) {
    const result = await query(
      `SELECT r.*, p.name as project_name
       FROM project_risks r
       JOIN projects p ON r.project_id = p.id
       WHERE r.id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      ...mapRiskRow(row),
      project: { name: row.project_name },
    };
  }

  async create(data: CreateRiskInput) {
    const riskId = uuidv4();
    await execute(
      `INSERT INTO project_risks (id, project_id, title, description, category, probability, impact, mitigation, contingency, owner, due_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
      [
        riskId,
        data.projectId,
        data.title,
        data.description,
        data.category || 'TECHNICAL',
        data.probability || 'MEDIUM',
        data.impact || 'MEDIUM',
        data.mitigation,
        data.contingency,
        data.owner,
        data.dueDate,
      ]
    );

    const result = await query(`SELECT * FROM project_risks WHERE id = ?`, [riskId]);
    const risk = mapRiskRow(result.rows[0]);
    logger.info(`Risk created: ${risk.id} for project ${data.projectId}`);
    return risk;
  }

  async update(id: string, data: UpdateRiskInput) {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) { updates.push(`title = $${paramIndex++}`); params.push(data.title); }
    if (data.description !== undefined) { updates.push(`description = $${paramIndex++}`); params.push(data.description); }
    if (data.category !== undefined) { updates.push(`category = $${paramIndex++}`); params.push(data.category); }
    if (data.probability !== undefined) { updates.push(`probability = $${paramIndex++}`); params.push(data.probability); }
    if (data.impact !== undefined) { updates.push(`impact = $${paramIndex++}`); params.push(data.impact); }
    if (data.status !== undefined) { updates.push(`status = $${paramIndex++}`); params.push(data.status); }
    if (data.mitigation !== undefined) { updates.push(`mitigation = $${paramIndex++}`); params.push(data.mitigation); }
    if (data.contingency !== undefined) { updates.push(`contingency = $${paramIndex++}`); params.push(data.contingency); }
    if (data.owner !== undefined) { updates.push(`owner = $${paramIndex++}`); params.push(data.owner); }
    if (data.dueDate !== undefined) { updates.push(`due_date = $${paramIndex++}`); params.push(data.dueDate); }

    if (data.status === 'RESOLVED' || data.status === 'CLOSED') {
      updates.push(`resolved_at = $${paramIndex++}`);
      params.push(new Date());
    }

    params.push(id);

    await execute(
      `UPDATE project_risks SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const result = await query(`SELECT * FROM project_risks WHERE id = ?`, [id]);
    const risk = mapRiskRow(result.rows[0]);
    logger.info(`Risk updated: ${risk.id}`);
    return risk;
  }

  async delete(id: string) {
    await query(`DELETE FROM project_risks WHERE id = $1`, [id]);
    logger.info(`Risk deleted: ${id}`);
  }

  async getRiskMatrix(projectId: string) {
    const result = await query(
      `SELECT * FROM project_risks WHERE project_id = $1 AND status IN ('OPEN', 'MITIGATING')`,
      [projectId]
    );

    const risks = result.rows;
    const matrix = {
      critical: { high: 0, medium: 0, low: 0 },
      high: { high: 0, medium: 0, low: 0 },
      medium: { high: 0, medium: 0, low: 0 },
      low: { high: 0, medium: 0, low: 0 },
    };

    risks.forEach((risk) => {
      const impact = risk.impact.toLowerCase() as 'critical' | 'high' | 'medium' | 'low';
      const prob = risk.probability.toLowerCase() as 'critical' | 'high' | 'medium' | 'low';
      if (matrix[impact] && matrix[impact][prob] !== undefined) {
        matrix[impact][prob]++;
      }
    });

    return {
      matrix,
      totalOpen: risks.length,
      bySeverity: {
        critical: risks.filter((r) => r.impact === 'CRITICAL' || r.probability === 'CRITICAL').length,
        high: risks.filter((r) => r.impact === 'HIGH' && r.probability === 'HIGH').length,
        medium: risks.filter((r) => r.impact === 'MEDIUM' || r.probability === 'MEDIUM').length,
        low: risks.filter((r) => r.impact === 'LOW' && r.probability === 'LOW').length,
      },
    };
  }

  async getRiskSummary(projectId: string) {
    const [total, open, mitigating, resolved] = await Promise.all([
      query(`SELECT COUNT(*) FROM project_risks WHERE project_id = $1`, [projectId]),
      query(`SELECT COUNT(*) FROM project_risks WHERE project_id = $1 AND status = 'OPEN'`, [projectId]),
      query(`SELECT COUNT(*) FROM project_risks WHERE project_id = $1 AND status = 'MITIGATING'`, [projectId]),
      query(`SELECT COUNT(*) FROM project_risks WHERE project_id = $1 AND status IN ('RESOLVED', 'CLOSED')`, [projectId]),
    ]);

    return {
      total: parseInt(total.rows[0].count || total.rows[0]['COUNT(*)'] || 0),
      open: parseInt(open.rows[0].count || open.rows[0]['COUNT(*)'] || 0),
      mitigating: parseInt(mitigating.rows[0].count || mitigating.rows[0]['COUNT(*)'] || 0),
      resolved: parseInt(resolved.rows[0].count || resolved.rows[0]['COUNT(*)'] || 0),
    };
  }
}

export const riskService = new RiskService();
