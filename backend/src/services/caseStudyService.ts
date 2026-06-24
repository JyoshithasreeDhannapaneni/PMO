import { query, execute, transaction } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { calculateDelay } from '../utils/delayCalculator';

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
      SELECT cs.*,
             p.id as p_id, p.name as p_name, p.customer_name, p.project_manager,
             p.account_manager, p.plan_type, p.migration_types,
             p.planned_start, p.planned_end, p.actual_start, p.actual_end,
             p.estimated_cost, p.actual_cost,
             p.is_overaged, p.overage_amount, p.extended_end_date,
             p.delay_status, p.delay_days,
             p.cloud_adding_start, p.cloud_adding_end,
             p.pilot_migration_start, p.pilot_migration_end,
             p.onetime_migration_start, p.onetime_migration_end,
             p.delta_migration_start, p.delta_migration_end,
             p.final_validation_start, p.final_validation_end,
             p.phase, p.status as p_status
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

    return result.rows.map((row) => {
      // Compute delay live (same logic as projectService.mapProjectRow)
      let liveDelayStatus = row.delay_status;
      let liveDelayDays   = Number(row.delay_days) || 0;
      let expectedEnd: string | null = null;

      if (row.planned_start && row.planned_end) {
        const ps = new Date(row.planned_start);
        const pe = new Date(row.planned_end);
        const as = row.actual_start ? new Date(row.actual_start) : null;
        const extEnd = row.extended_end_date ? new Date(row.extended_end_date) : null;
        expectedEnd = (extEnd || pe).toISOString().split('T')[0];

        const isFinished = row.p_status === 'COMPLETED' || row.p_status === 'CANCELLED';
        const actualEndForDelay = isFinished && row.actual_end ? new Date(row.actual_end) : null;
        const result2 = calculateDelay(ps, pe, as, actualEndForDelay, new Date(), extEnd);
        liveDelayStatus = result2.delayStatus;
        liveDelayDays   = result2.delayDays;
      }

      return {
        ...mapCaseStudyRow(row),
        project: {
          id: row.p_id,
          name: row.p_name,
          customerName: row.customer_name,
          projectManager: row.project_manager,
          accountManager: row.account_manager,
          planType: row.plan_type,
          migrationTypes: row.migration_types,
          plannedStart: row.planned_start,
          plannedEnd: row.planned_end,
          actualStart: row.actual_start,
          actualEnd: row.actual_end,
          expectedEnd,
          estimatedCost: row.estimated_cost ?? null,
          actualCost: row.actual_cost ?? null,
          isOveraged: !!row.is_overaged,
          overageAmount: row.overage_amount ?? null,
          extendedEndDate: row.extended_end_date ?? null,
          delayStatus: liveDelayStatus,
          delayDays: liveDelayDays,
          cloudAddingStart: row.cloud_adding_start ?? null,
          cloudAddingEnd: row.cloud_adding_end ?? null,
          pilotMigrationStart: row.pilot_migration_start ?? null,
          pilotMigrationEnd: row.pilot_migration_end ?? null,
          onetimeMigrationStart: row.onetime_migration_start ?? null,
          onetimeMigrationEnd: row.onetime_migration_end ?? null,
          deltaMigrationStart: row.delta_migration_start ?? null,
          deltaMigrationEnd: row.delta_migration_end ?? null,
          finalValidationStart: row.final_validation_start ?? null,
          finalValidationEnd: row.final_validation_end ?? null,
          phase: row.phase,
          status: row.p_status,
        },
      };
    });
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
       VALUES ($1, $2, $3, $4, $5)`,
      [
        caseStudyId,
        data.projectId,
        data.title || `Case Study: ${project.name}`,
        data.content,
        data.status || 'PENDING',
      ]
    );

    const result = await query(`SELECT * FROM case_studies WHERE id = $1`, [caseStudyId]);
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

    await execute(
      `UPDATE case_studies SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      [...params, id]
    );

    // When case study is completed or published → archive the linked project
    if (
      (data.status === 'COMPLETED' || data.status === 'PUBLISHED') &&
      existing.status !== 'COMPLETED' && existing.status !== 'PUBLISHED'
    ) {
      try {
        await transaction(async (client) => {
          await client.query(
            `UPDATE projects SET archived_at = NOW(), archive_reason = 'CASE_STUDY_COMPLETED', archived_by = 'system' WHERE id = $1 AND archived_at IS NULL`,
            [existing.project_id]
          );
          await client.query(
            `UPDATE projects SET status = 'COMPLETED' WHERE id = $1`,
            [existing.project_id]
          );
        });
        logger.info(`[CaseStudy] Project ${existing.project_id} archived and marked COMPLETED`);
      } catch (err: any) {
        logger.error(`[CaseStudy] Failed to archive project ${existing.project_id}: ${err?.message || err}`);
      }
    }

    const result = await query(`SELECT * FROM case_studies WHERE id = $1`, [id]);
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

  async getAwaiting(projectManager?: string) {
    let sql = `
      SELECT p.id, p.name, p.customer_name, p.project_manager, p.status, p.phase
      FROM projects p
      LEFT JOIN case_studies cs ON cs.project_id = p.id
      WHERE p.status = 'COMPLETED'
        AND p.archived_at IS NULL
        AND cs.id IS NULL
    `;
    const params: any[] = [];
    if (projectManager) {
      sql += ` AND p.project_manager = $1`;
      params.push(projectManager);
    }
    sql += ` ORDER BY p.updated_at DESC`;
    const result = await query(sql, params);
    return result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      customerName: r.customer_name,
      projectManager: r.project_manager,
      status: r.status,
      phase: r.phase,
    }));
  }

  async getPendingCount(): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count FROM case_studies cs
       JOIN projects p ON cs.project_id = p.id
       WHERE cs.status = 'PENDING' AND p.archived_at IS NULL`
    );
    return parseInt(result.rows[0].count || result.rows[0]['COUNT(*)']);
  }
}

export const caseStudyService = new CaseStudyService();
