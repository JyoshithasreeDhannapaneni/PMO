import { query, execute, transaction } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { calculateDelay } from '../utils/delayCalculator';
import { taskService } from './taskService';
import { caseStudyService } from './caseStudyService';
import { v4 as uuidv4 } from 'uuid';

export interface CreateProjectDTO {
  name: string;
  customerName: string;
  projectManager: string;
  accountManager: string;
  planType?: string;
  plannedStart: Date | string;
  plannedEnd: Date | string;
  actualStart?: Date | string | null;
  actualEnd?: Date | string | null;
  migrationTypes?: string | null;
  sourcePlatform?: string | null;
  targetPlatform?: string | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
  numberOfServers?: number | null;
  projectMemory?: string | null;
  description?: string | null;
  notes?: string | null;
  phase?: string;
  status?: string;
  delayStatus?: string;
  isOveraged?: boolean | null;
  isEscalated?: boolean | null;
  escalationPriority?: string | null;
  overageAmount?: number | null;
}

export interface UpdateProjectDTO extends Partial<CreateProjectDTO> {}

export interface ProjectFilters {
  status?: string;
  phase?: string;
  planType?: string;
  delayStatus?: string;
  search?: string;
  projectManager?: string;
  accountManager?: string;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

function mapProjectRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    customerName: row.customer_name,
    projectManager: row.project_manager,
    accountManager: row.account_manager,
    planType: row.plan_type,
    plannedStart: row.planned_start,
    plannedEnd: row.planned_end,
    actualStart: row.actual_start,
    actualEnd: row.actual_end,
    delayDays: row.delay_days,
    delayStatus: row.delay_status,
    phase: row.phase,
    status: row.status,
    migrationTypes: row.migration_types,
    sourcePlatform: row.source_platform,
    targetPlatform: row.target_platform,
    estimatedCost: row.estimated_cost,
    actualCost: row.actual_cost,
    numberOfServers: row.number_of_servers ?? null,
    projectMemory: row.project_memory ?? null,
    description: row.description,
    notes: row.notes,
    templateId: row.template_id,
    isOveraged: !!row.is_overaged,
    isEscalated: !!row.is_escalated,
    escalationPriority: row.escalation_priority ?? null,
    overageAmount: row.overage_amount ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class ProjectService {
  async getAll(filters: ProjectFilters = {}, pagination: PaginationOptions = {}) {
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
    
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.status) {
      conditions.push(`status = ?`);
      params.push(filters.status);
    }
    if (filters.phase) {
      conditions.push(`phase = ?`);
      params.push(filters.phase);
    }
    if (filters.planType) {
      conditions.push(`plan_type = ?`);
      params.push(filters.planType);
    }
    if (filters.delayStatus) {
      conditions.push(`delay_status = ?`);
      params.push(filters.delayStatus);
    }
    if (filters.search) {
      conditions.push(`(name LIKE ? OR customer_name LIKE ? OR project_manager LIKE ?)`);
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.projectManager) {
      conditions.push(`project_manager = ?`);
      params.push(filters.projectManager);
    }
    if (filters.accountManager) {
      conditions.push(`account_manager = ?`);
      params.push(filters.accountManager);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortColumn = sortBy === 'createdAt' ? 'created_at' : sortBy;
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const safeOffset = Math.max(0, Math.floor((page - 1) * safeLimit));

    const [projectsResult, countResult] = await Promise.all([
      query(
        `SELECT * FROM projects ${whereClause} 
         ORDER BY ${sortColumn} ${sortOrder} 
         LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      ),
      query(`SELECT COUNT(*) as count FROM projects ${whereClause}`, params),
    ]);

    const projects = projectsResult.rows.map(mapProjectRow);
    const total = parseInt(countResult.rows[0].count || countResult.rows[0]['COUNT(*)']);

    return {
      projects,
      total,
      page,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async getById(id: string) {
    const projectResult = await query(`SELECT * FROM projects WHERE id = ?`, [id]);

    if (projectResult.rows.length === 0) {
      throw new AppError('Project not found', 404);
    }

    const project = mapProjectRow(projectResult.rows[0]);

    const [phasesResult, tasksResult, caseStudyResult, notificationsResult] = await Promise.all([
      query(
        `SELECT * FROM project_phases WHERE project_id = ? ORDER BY order_index ASC`,
        [id]
      ),
      query(
        `SELECT * FROM project_tasks WHERE project_id = ? ORDER BY order_index ASC`,
        [id]
      ),
      query(`SELECT * FROM case_studies WHERE project_id = ?`, [id]),
      query(
        `SELECT * FROM notifications WHERE project_id = ? ORDER BY created_at DESC LIMIT 10`,
        [id]
      ),
    ]);

    return {
      ...project,
      phases: phasesResult.rows.map(row => ({
        id: row.id,
        projectId: row.project_id,
        phaseName: row.phase_name,
        orderIndex: row.order_index,
        plannedStart: row.planned_start,
        plannedEnd: row.planned_end,
        actualStart: row.actual_start,
        actualEnd: row.actual_end,
        status: row.status,
        progress: row.progress,
        notes: row.notes,
      })),
      tasks: tasksResult.rows.map(row => ({
        id: row.id,
        projectId: row.project_id,
        phaseRecordId: row.phase_record_id,
        name: row.name,
        orderIndex: row.order_index,
        status: row.status,
        plannedStart: row.planned_start,
        plannedEnd: row.planned_end,
        actualStart: row.actual_start,
        actualEnd: row.actual_end,
        duration: row.duration,
        progress: row.progress,
        assignee: row.assignee,
        isMilestone: row.is_milestone,
        notes: row.notes,
        priority: row.priority,
      })),
      caseStudy: caseStudyResult.rows[0] ? {
        id: caseStudyResult.rows[0].id,
        projectId: caseStudyResult.rows[0].project_id,
        status: caseStudyResult.rows[0].status,
        title: caseStudyResult.rows[0].title,
        content: caseStudyResult.rows[0].content,
        publishedAt: caseStudyResult.rows[0].published_at,
      } : null,
      notifications: notificationsResult.rows,
    };
  }

  async create(data: CreateProjectDTO) {
    const plannedEnd = new Date(data.plannedEnd);
    const plannedStart = new Date(data.plannedStart);
    const actualEnd = data.actualEnd ? new Date(data.actualEnd) : null;
    const { delayDays, delayStatus } = calculateDelay(plannedEnd, actualEnd);

    const migrationTypes = data.migrationTypes?.toUpperCase().split(',').map(t => t.trim()) || [];
    const primaryMigrationType = migrationTypes[0] || null;

    // Sanitise phase/planType — if column is still ENUM, only pass known values
    const safePhase = ['KICKOFF','MIGRATION','VALIDATION','CLOSURE','COMPLETED'].includes((data.phase || '').toUpperCase())
      ? (data.phase || 'KICKOFF').toUpperCase()
      : 'KICKOFF';
    const safePlanType = ['BRONZE','SILVER','GOLD','PLATINUM'].includes((data.planType || '').toUpperCase())
      ? (data.planType || 'SILVER').toUpperCase()
      : 'SILVER';

    const projectId = uuidv4();
    // Core INSERT — only columns guaranteed to exist in the original schema
    await execute(
      `INSERT INTO projects (
        id, name, customer_name, project_manager, account_manager, plan_type,
        planned_start, planned_end, actual_start, actual_end,
        migration_types, source_platform, target_platform,
        estimated_cost, actual_cost,
        description, notes, phase, status, delay_days, delay_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        projectId,
        data.name,
        data.customerName,
        data.projectManager,
        data.accountManager,
        safePlanType,
        plannedStart,
        plannedEnd,
        data.actualStart ? new Date(data.actualStart) : null,
        actualEnd,
        data.migrationTypes,
        data.sourcePlatform,
        data.targetPlatform,
        data.estimatedCost ?? null,
        data.actualCost ?? null,
        data.description,
        data.notes,
        safePhase,
        data.status || 'ACTIVE',
        delayDays,
        delayStatus,
      ]
    );

    // Set new optional columns if they were provided (columns added via migration)
    if (data.numberOfServers != null || data.projectMemory != null) {
      try {
        await execute(
          `UPDATE projects SET number_of_servers = ?, project_memory = ? WHERE id = ?`,
          [data.numberOfServers ?? null, data.projectMemory ?? null, projectId]
        );
      } catch {
        // Columns not yet migrated — non-fatal, project is still created
      }
    }
    if (data.isOveraged != null || data.isEscalated != null || data.overageAmount != null) {
      try {
        const isOveraged = data.isOveraged ? 1 : 0;
        const isEscalated = data.isEscalated ? 1 : 0;
        const escalationPriority = data.isEscalated ? (data.escalationPriority || 'MEDIUM') : null;
        await execute(
          `UPDATE projects SET is_overaged = ?, is_escalated = ?, escalation_priority = ?, escalated_at = ?, overage_amount = ? WHERE id = ?`,
          [isOveraged, isEscalated, escalationPriority, data.isEscalated ? new Date() : null, data.overageAmount ?? null, projectId]
        );
      } catch {
        // Columns not yet migrated — non-fatal
      }
    }

    const result = await query(`SELECT * FROM projects WHERE id = ?`, [projectId]);
    const project = mapProjectRow(result.rows[0]);

    if (primaryMigrationType) {
      try {
        await taskService.createProjectTasksFromTemplate(
          project.id,
          primaryMigrationType,
          plannedStart
        );
        logger.info(`Tasks generated from ${primaryMigrationType} template for project ${project.id}`);
      } catch (error) {
        logger.warn(`Could not generate tasks from template: ${error}`);
      }
    }

    logger.info(`Project created: ${project.id} - ${project.name}`);
    return this.getById(project.id);
  }

  async update(id: string, data: UpdateProjectDTO) {
    const existingResult = await query(`SELECT * FROM projects WHERE id = ?`, [id]);
    if (existingResult.rows.length === 0) {
      throw new AppError('Project not found', 404);
    }

    const existing = existingResult.rows[0];
    const plannedEnd = data.plannedEnd ? new Date(data.plannedEnd) : existing.planned_end;
    const actualEnd = data.actualEnd !== undefined
      ? (data.actualEnd ? new Date(data.actualEnd) : null)
      : existing.actual_end;

    const calculated = calculateDelay(plannedEnd, actualEnd);
    const delayDays = calculated.delayDays;
    const delayStatus = data.delayStatus || calculated.delayStatus;

    const updates: string[] = ['delay_days = ?', 'delay_status = ?'];
    const params: any[] = [delayDays, delayStatus];

    if (data.name !== undefined) { updates.push(`name = ?`); params.push(data.name); }
    if (data.customerName !== undefined) { updates.push(`customer_name = ?`); params.push(data.customerName); }
    if (data.projectManager !== undefined) { updates.push(`project_manager = ?`); params.push(data.projectManager); }
    if (data.accountManager !== undefined) { updates.push(`account_manager = ?`); params.push(data.accountManager); }
    if (data.planType !== undefined) {
      const sp = ['BRONZE','SILVER','GOLD','PLATINUM'].includes((data.planType||'').toUpperCase())
        ? data.planType.toUpperCase() : data.planType;
      updates.push(`plan_type = ?`); params.push(sp);
    }
    if (data.migrationTypes !== undefined) { updates.push(`migration_types = ?`); params.push(data.migrationTypes); }
    if (data.sourcePlatform !== undefined) { updates.push(`source_platform = ?`); params.push(data.sourcePlatform); }
    if (data.targetPlatform !== undefined) { updates.push(`target_platform = ?`); params.push(data.targetPlatform); }
    if (data.estimatedCost !== undefined) { updates.push(`estimated_cost = ?`); params.push(data.estimatedCost); }
    if (data.actualCost !== undefined) { updates.push(`actual_cost = ?`); params.push(data.actualCost); }
    if (data.numberOfServers !== undefined) { updates.push(`number_of_servers = ?`); params.push(data.numberOfServers); }
    if (data.projectMemory !== undefined) { updates.push(`project_memory = ?`); params.push(data.projectMemory); }
    if (data.description !== undefined) { updates.push(`description = ?`); params.push(data.description); }
    if (data.notes !== undefined) { updates.push(`notes = ?`); params.push(data.notes); }
    if (data.phase !== undefined) {
      const sp = ['KICKOFF','MIGRATION','VALIDATION','CLOSURE','COMPLETED'].includes((data.phase||'').toUpperCase())
        ? data.phase.toUpperCase() : data.phase;
      updates.push(`phase = ?`); params.push(sp);
    }
    if (data.status !== undefined) { updates.push(`status = ?`); params.push(data.status); }
    if (data.plannedStart !== undefined) { updates.push(`planned_start = ?`); params.push(new Date(data.plannedStart)); }
    if (data.plannedEnd !== undefined) { updates.push(`planned_end = ?`); params.push(new Date(data.plannedEnd)); }
    if (data.actualStart !== undefined) { updates.push(`actual_start = ?`); params.push(data.actualStart ? new Date(data.actualStart) : null); }
    if (data.actualEnd !== undefined) { updates.push(`actual_end = ?`); params.push(actualEnd); }
    if (data.isOveraged !== undefined) { updates.push(`is_overaged = ?`); params.push(data.isOveraged ? 1 : 0); }
    if (data.isEscalated !== undefined) {
      updates.push(`is_escalated = ?`); params.push(data.isEscalated ? 1 : 0);
      updates.push(`escalation_priority = ?`); params.push(data.isEscalated ? (data.escalationPriority || existing.escalation_priority || 'MEDIUM') : null);
      updates.push(`escalated_at = ?`); params.push(data.isEscalated ? new Date() : null);
    }
    if (data.overageAmount !== undefined) { try { updates.push(`overage_amount = ?`); params.push(data.overageAmount ?? null); } catch {} }

    params.push(id);

    await execute(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const result = await query(`SELECT * FROM projects WHERE id = ?`, [id]);
    const project = mapProjectRow(result.rows[0]);

    const isNowCompleted = data.status === 'COMPLETED' && existing.status !== 'COMPLETED';
    const isNowClosed = data.phase === 'CLOSURE' && existing.phase !== 'CLOSURE';
    const isNowInCompletedPhase = data.phase === 'COMPLETED' && existing.phase !== 'COMPLETED';

    const caseStudyResult = await query(`SELECT id FROM case_studies WHERE project_id = ?`, [id]);

    if ((isNowCompleted || isNowClosed || isNowInCompletedPhase) && caseStudyResult.rows.length === 0) {
      try {
        await caseStudyService.create({
          projectId: project.id,
          title: `${project.customerName} - ${project.name} Case Study`,
          status: 'PENDING',
        });
        logger.info(`Auto-created case study for completed project: ${project.id}`);
      } catch (error) {
        logger.warn(`Could not auto-create case study for project ${project.id}: ${error}`);
      }
    }

    logger.info(`Project updated: ${project.id} - ${project.name}`);
    return project;
  }

  async delete(id: string): Promise<void> {
    const existing = await query(`SELECT id FROM projects WHERE id = ?`, [id]);
    if (existing.rows.length === 0) {
      throw new AppError('Project not found', 404);
    }

    await query(`DELETE FROM projects WHERE id = ?`, [id]);
    logger.info(`Project deleted: ${id}`);
  }

  async getDelayedProjects() {
    const result = await query(
      `SELECT * FROM projects WHERE delay_status = 'DELAYED' ORDER BY delay_days DESC`
    );
    return result.rows.map(mapProjectRow);
  }

  async updateAllDelays(): Promise<number> {
    const result = await query(
      `SELECT * FROM projects WHERE status IN ('ACTIVE', 'ON_HOLD')`
    );

    let updatedCount = 0;

    for (const row of result.rows) {
      const { delayDays, delayStatus } = calculateDelay(row.planned_end, row.actual_end);

      if (delayDays !== row.delay_days || delayStatus !== row.delay_status) {
        await query(
          `UPDATE projects SET delay_days = ?, delay_status = ? WHERE id = ?`,
          [delayDays, delayStatus, row.id]
        );
        updatedCount++;
      }
    }

    return updatedCount;
  }

  async getProjectsWithoutCaseStudy() {
    const result = await query(
      `SELECT p.* FROM projects p 
       LEFT JOIN case_studies cs ON p.id = cs.project_id 
       WHERE p.status = 'COMPLETED' AND cs.id IS NULL`
    );
    return result.rows.map(mapProjectRow);
  }
}

export const projectService = new ProjectService();
