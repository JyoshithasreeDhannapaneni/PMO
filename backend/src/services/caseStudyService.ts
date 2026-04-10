import { query, execute } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

type CaseStudyStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'PUBLISHED';

export interface CreateCaseStudyDTO {
  projectId: string;
  title?: string;
  content?: string;
  status?: CaseStudyStatus;
}

export interface UpdateCaseStudyDTO {
  title?: string;
  content?: string;
  status?: CaseStudyStatus;
}

function mapCaseStudyRow(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    title: row.title,
    content: row.content,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class CaseStudyService {
  async getAll(status?: CaseStudyStatus) {
    let queryStr = `
      SELECT cs.*, p.id as p_id, p.name as p_name, p.customer_name, p.project_manager
      FROM case_studies cs
      JOIN projects p ON cs.project_id = p.id
    `;
    const params: any[] = [];

    if (status) {
      queryStr += ` WHERE cs.status = $1`;
      params.push(status);
    }

    queryStr += ` ORDER BY cs.created_at DESC`;

    const result = await query(queryStr, params);

    return result.rows.map((row) => ({
      ...mapCaseStudyRow(row),
      project: {
        id: row.p_id,
        name: row.p_name,
        customerName: row.customer_name,
        projectManager: row.project_manager,
      },
    }));
  }

  async getById(id: string) {
    const result = await query(
      `SELECT cs.*, p.id as p_id, p.name as p_name, p.customer_name, p.project_manager,
              p.account_manager, p.planned_start, p.planned_end, p.actual_start, p.actual_end,
              p.source_platform, p.target_platform, p.migration_types
       FROM case_studies cs
       JOIN projects p ON cs.project_id = p.id
       WHERE cs.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Case study not found', 404);
    }

    const row = result.rows[0];
    return {
      ...mapCaseStudyRow(row),
      project: {
        id: row.p_id,
        name: row.p_name,
        customerName: row.customer_name,
        projectManager: row.project_manager,
        accountManager: row.account_manager,
        plannedStart: row.planned_start,
        plannedEnd: row.planned_end,
        actualStart: row.actual_start,
        actualEnd: row.actual_end,
        sourcePlatform: row.source_platform,
        targetPlatform: row.target_platform,
        migrationTypes: row.migration_types,
      },
    };
  }

  async getByProjectId(projectId: string) {
    const result = await query(
      `SELECT cs.*, p.id as p_id, p.name as p_name, p.customer_name
       FROM case_studies cs
       JOIN projects p ON cs.project_id = p.id
       WHERE cs.project_id = $1`,
      [projectId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      ...mapCaseStudyRow(row),
      project: {
        id: row.p_id,
        name: row.p_name,
        customerName: row.customer_name,
      },
    };
  }

  async create(data: CreateCaseStudyDTO) {
    const projectResult = await query(
      `SELECT * FROM projects WHERE id = $1`,
      [data.projectId]
    );

    if (projectResult.rows.length === 0) {
      throw new AppError('Project not found', 404);
    }

    const existingResult = await query(
      `SELECT id FROM case_studies WHERE project_id = $1`,
      [data.projectId]
    );

    if (existingResult.rows.length > 0) {
      throw new AppError('Case study already exists for this project', 400);
    }

    const project = projectResult.rows[0];
    const caseStudyId = uuidv4();
    await execute(
      `INSERT INTO case_studies (id, project_id, title, content, status)
       VALUES (?, ?, ?, ?, ?)`,
      [
        caseStudyId,
        data.projectId,
        data.title || `Case Study: ${project.name}`,
        data.content,
        data.status || 'PENDING',
      ]
    );

    const result = await query(`SELECT * FROM case_studies WHERE id = ?`, [caseStudyId]);
    const caseStudy = mapCaseStudyRow(result.rows[0]);
    logger.info(`Case study created: ${caseStudy.id} for project ${data.projectId}`);
    return caseStudy;
  }

  async update(id: string, data: UpdateCaseStudyDTO) {
    const existingResult = await query(`SELECT * FROM case_studies WHERE id = $1`, [id]);

    if (existingResult.rows.length === 0) {
      throw new AppError('Case study not found', 404);
    }

    const existing = existingResult.rows[0];
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) { updates.push(`title = $${paramIndex++}`); params.push(data.title); }
    if (data.content !== undefined) { updates.push(`content = $${paramIndex++}`); params.push(data.content); }
    if (data.status !== undefined) { updates.push(`status = $${paramIndex++}`); params.push(data.status); }

    if (data.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
      updates.push(`published_at = $${paramIndex++}`);
      params.push(new Date());
    }

    params.push(id);

    await execute(
      `UPDATE case_studies SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const result = await query(`SELECT * FROM case_studies WHERE id = ?`, [id]);
    const caseStudy = mapCaseStudyRow(result.rows[0]);
    logger.info(`Case study updated: ${caseStudy.id}`);
    return caseStudy;
  }

  async delete(id: string): Promise<void> {
    const existing = await query(`SELECT id FROM case_studies WHERE id = $1`, [id]);

    if (existing.rows.length === 0) {
      throw new AppError('Case study not found', 404);
    }

    await query(`DELETE FROM case_studies WHERE id = $1`, [id]);
    logger.info(`Case study deleted: ${id}`);
  }

  async getPendingCount(): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count FROM case_studies WHERE status = 'PENDING'`
    );
    return parseInt(result.rows[0].count || result.rows[0]['COUNT(*)']);
  }
}

export const caseStudyService = new CaseStudyService();
