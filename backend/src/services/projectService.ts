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
  cloudAddingStart?: Date | string | null;
  cloudAddingEnd?: Date | string | null;
  pilotMigrationStart?: Date | string | null;
  pilotMigrationEnd?: Date | string | null;
  onetimeMigrationStart?: Date | string | null;
  onetimeMigrationEnd?: Date | string | null;
  deltaMigrationStart?: Date | string | null;
  deltaMigrationEnd?: Date | string | null;
  finalValidationStart?: Date | string | null;
  finalValidationEnd?: Date | string | null;
  cloudAddingNotes?: string | null;
  pilotMigrationNotes?: string | null;
  onetimeMigrationNotes?: string | null;
  deltaMigrationNotes?: string | null;
  finalValidationNotes?: string | null;
  // POC fields
  projectType?: string;
  pocQualificationStatus?: string;
  pocEnvSetupStatus?: string;
  pocTrialStatus?: string;
  pocValidationStatus?: string;
  pocOutcomeStatus?: string;
  pocQualificationNotes?: string | null;
  pocEnvSetupNotes?: string | null;
  pocTrialNotes?: string | null;
  pocValidationNotes?: string | null;
  pocOutcomeNotes?: string | null;
  pocDeadline?: Date | string | null;
  pocOutcome?: string | null;
  pocHandoffTo?: string | null;
  pocHandoffDate?: Date | string | null;
  pocMigrationSpeed?: number | null;
  pocErrorRate?: number | null;
  customerContact?: string | null;
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
  migrationType?: string;
  projectType?: string;
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
    escalatedAt: row.escalated_at ?? null,
    escalationNotes: row.escalation_notes ?? null,
    overageAmount: row.overage_amount ?? null,
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
    cloudAddingNotes: row.cloud_adding_notes ?? null,
    pilotMigrationNotes: row.pilot_migration_notes ?? null,
    onetimeMigrationNotes: row.onetime_migration_notes ?? null,
    deltaMigrationNotes: row.delta_migration_notes ?? null,
    finalValidationNotes: row.final_validation_notes ?? null,
    // POC fields
    projectType: row.project_type ?? 'MIGRATION',
    pocQualificationStatus: row.poc_qualification_status ?? 'not_started',
    pocEnvSetupStatus: row.poc_env_setup_status ?? 'not_started',
    pocTrialStatus: row.poc_trial_status ?? 'not_started',
    pocValidationStatus: row.poc_validation_status ?? 'not_started',
    pocOutcomeStatus: row.poc_outcome_status ?? 'not_started',
    pocQualificationNotes: row.poc_qualification_notes ?? null,
    pocEnvSetupNotes: row.poc_env_setup_notes ?? null,
    pocTrialNotes: row.poc_trial_notes ?? null,
    pocValidationNotes: row.poc_validation_notes ?? null,
    pocOutcomeNotes: row.poc_outcome_notes ?? null,
    pocDeadline: row.poc_deadline ?? null,
    pocOutcome: row.poc_outcome ?? null,
    pocHandoffTo: row.poc_handoff_to ?? null,
    pocHandoffDate: row.poc_handoff_date ?? null,
    pocMigrationSpeed: row.poc_migration_speed ?? null,
    pocErrorRate: row.poc_error_rate ?? null,
    customerContact: row.customer_contact ?? null,
    pocSuccessCriteria: row.poc_success_criteria ?? null,
    pocDataVolume: row.poc_data_volume ?? null,
    pocPermissionsIntact: row.poc_permissions_intact ?? null,
    pocMetadataIntact: row.poc_metadata_intact ?? null,
    pocHandoffNotes: row.poc_handoff_notes ?? null,
    pocNumUsers: row.poc_num_users ?? null,
    pocEstimatedData: row.poc_estimated_data ?? null,
    pocPhase1Checklist: row.poc_phase1_checklist ?? null,
    pocTenantAccess: row.poc_tenant_access ?? null,
    pocToolVersion: row.poc_tool_version ?? null,
    pocTestAccounts: row.poc_test_accounts ?? null,
    pocFirewallIssues: row.poc_firewall_issues ?? null,
    pocPhase2Checklist: row.poc_phase2_checklist ?? null,
    pocFilesMigrated: row.poc_files_migrated ?? null,
    pocDataMigratedGb: row.poc_data_migrated_gb ?? null,
    pocErrorsFailed: row.poc_errors_failed ?? null,
    pocPhase3Checklist: row.poc_phase3_checklist ?? null,
    pocValidationDate: row.poc_validation_date ?? null,
    pocIssuesRaised: row.poc_issues_raised ?? null,
    pocCustomerSatisfaction: row.poc_customer_satisfaction ?? null,
    pocPhase4Checklist: row.poc_phase4_checklist ?? null,
    pocNextStep: row.poc_next_step ?? null,
    pocDealValue: row.poc_deal_value ?? null,
    pocPhase5Checklist: row.poc_phase5_checklist ?? null,
    pocPreSalesOwner: row.poc_pre_sales_owner ?? null,
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
      conditions.push(`status = $${params.length + 1}`);
      params.push(filters.status);
    }
    if (filters.phase) {
      conditions.push(`phase = $${params.length + 1}`);
      params.push(filters.phase);
    }
    if (filters.planType) {
      conditions.push(`plan_type = $${params.length + 1}`);
      params.push(filters.planType);
    }
    if (filters.delayStatus) {
      conditions.push(`delay_status = $${params.length + 1}`);
      params.push(filters.delayStatus);
    }
    if (filters.search) {
      conditions.push(`name ILIKE $${params.length + 1}`);
      params.push(`%${filters.search}%`);
    }
    if (filters.projectManager) {
      conditions.push(`(project_manager ILIKE $${params.length + 1} OR $${params.length + 2} ILIKE '%' || project_manager || '%')`);
      params.push(`%${filters.projectManager}%`);
      params.push(filters.projectManager);
    }
    if (filters.accountManager) {
      conditions.push(`account_manager = $${params.length + 1}`);
      params.push(filters.accountManager);
    }
    if (filters.migrationType) {
      conditions.push(`migration_types LIKE $${params.length + 1}`);
      params.push(`%${filters.migrationType}%`);
    }
    if (filters.projectType) {
      conditions.push(`project_type = $${params.length + 1}`);
      params.push(filters.projectType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortColumn = sortBy === 'createdAt' ? 'created_at' : sortBy;
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
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
    const projectResult = await query(`SELECT * FROM projects WHERE id = $1`, [id]);

    if (projectResult.rows.length === 0) {
      throw new AppError('Project not found', 404);
    }

    const project = mapProjectRow(projectResult.rows[0]);

    const [phasesResult, tasksResult, caseStudyResult, notificationsResult] = await Promise.all([
      query(
        `SELECT * FROM project_phases WHERE project_id = $1 ORDER BY order_index ASC`,
        [id]
      ),
      query(
        `SELECT * FROM project_tasks WHERE project_id = $1 ORDER BY order_index ASC`,
        [id]
      ),
      query(`SELECT * FROM case_studies WHERE project_id = $1`, [id]),
      query(
        `SELECT * FROM notifications WHERE project_id = $1 ORDER BY created_at DESC LIMIT 10`,
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW())`,
      [
        projectId,
        data.name.toLowerCase(),
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
          `UPDATE projects SET number_of_servers = $1, project_memory = $2 WHERE id = $3`,
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
          `UPDATE projects SET is_overaged = $1, is_escalated = $2, escalation_priority = $3, escalated_at = $4, overage_amount = $5 WHERE id = $6`,
          [isOveraged, isEscalated, escalationPriority, data.isEscalated ? new Date() : null, data.overageAmount ?? null, projectId]
        );
      } catch {
        // Columns not yet migrated — non-fatal
      }
    }

    const phaseRangeData = {
      cloud_adding_start: data.cloudAddingStart ? new Date(data.cloudAddingStart) : null,
      cloud_adding_end: data.cloudAddingEnd ? new Date(data.cloudAddingEnd) : null,
      pilot_migration_start: data.pilotMigrationStart ? new Date(data.pilotMigrationStart) : null,
      pilot_migration_end: data.pilotMigrationEnd ? new Date(data.pilotMigrationEnd) : null,
      onetime_migration_start: data.onetimeMigrationStart ? new Date(data.onetimeMigrationStart) : null,
      onetime_migration_end: data.onetimeMigrationEnd ? new Date(data.onetimeMigrationEnd) : null,
      delta_migration_start: data.deltaMigrationStart ? new Date(data.deltaMigrationStart) : null,
      delta_migration_end: data.deltaMigrationEnd ? new Date(data.deltaMigrationEnd) : null,
      final_validation_start: data.finalValidationStart ? new Date(data.finalValidationStart) : null,
      final_validation_end: data.finalValidationEnd ? new Date(data.finalValidationEnd) : null,
      cloud_adding_notes: data.cloudAddingNotes ?? null,
      pilot_migration_notes: data.pilotMigrationNotes ?? null,
      onetime_migration_notes: data.onetimeMigrationNotes ?? null,
      delta_migration_notes: data.deltaMigrationNotes ?? null,
      final_validation_notes: data.finalValidationNotes ?? null,
    };
    if (Object.values(phaseRangeData).some(v => v != null)) {
      try {
        const cols = Object.keys(phaseRangeData);
        const vals = Object.values(phaseRangeData);
        const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
        await execute(`UPDATE projects SET ${sets} WHERE id = $${cols.length + 1}`, [...vals, projectId]);
      } catch {}
    }

    // POC fields
    const pocData: Record<string, any> = {
      project_type: data.projectType || 'MIGRATION',
      poc_qualification_status: data.pocQualificationStatus || 'not_started',
      poc_env_setup_status: data.pocEnvSetupStatus || 'not_started',
      poc_trial_status: data.pocTrialStatus || 'not_started',
      poc_validation_status: data.pocValidationStatus || 'not_started',
      poc_outcome_status: data.pocOutcomeStatus || 'not_started',
      poc_qualification_notes: data.pocQualificationNotes ?? null,
      poc_env_setup_notes: data.pocEnvSetupNotes ?? null,
      poc_trial_notes: data.pocTrialNotes ?? null,
      poc_validation_notes: data.pocValidationNotes ?? null,
      poc_outcome_notes: data.pocOutcomeNotes ?? null,
      poc_deadline: data.pocDeadline ? new Date(data.pocDeadline) : null,
      poc_outcome: data.pocOutcome ?? null,
      poc_handoff_to: data.pocHandoffTo ?? null,
      poc_handoff_date: data.pocHandoffDate ? new Date(data.pocHandoffDate) : null,
      poc_migration_speed: data.pocMigrationSpeed ?? null,
      poc_error_rate: data.pocErrorRate ?? null,
      customer_contact: data.customerContact ?? null,
      poc_success_criteria: (data as any).pocSuccessCriteria ?? null,
      poc_data_volume: (data as any).pocDataVolume ?? null,
      poc_permissions_intact: (data as any).pocPermissionsIntact ?? null,
      poc_metadata_intact: (data as any).pocMetadataIntact ?? null,
      poc_handoff_notes: (data as any).pocHandoffNotes ?? null,
      poc_num_users: (data as any).pocNumUsers ?? null,
      poc_estimated_data: (data as any).pocEstimatedData ?? null,
      poc_phase1_checklist: (data as any).pocPhase1Checklist ?? null,
      poc_tenant_access: (data as any).pocTenantAccess ?? null,
      poc_tool_version: (data as any).pocToolVersion ?? null,
      poc_test_accounts: (data as any).pocTestAccounts ?? null,
      poc_firewall_issues: (data as any).pocFirewallIssues ?? null,
      poc_phase2_checklist: (data as any).pocPhase2Checklist ?? null,
      poc_files_migrated: (data as any).pocFilesMigrated ?? null,
      poc_data_migrated_gb: (data as any).pocDataMigratedGb ?? null,
      poc_errors_failed: (data as any).pocErrorsFailed ?? null,
      poc_phase3_checklist: (data as any).pocPhase3Checklist ?? null,
      poc_validation_date: (data as any).pocValidationDate ? new Date((data as any).pocValidationDate) : null,
      poc_issues_raised: (data as any).pocIssuesRaised ?? null,
      poc_customer_satisfaction: (data as any).pocCustomerSatisfaction ?? null,
      poc_phase4_checklist: (data as any).pocPhase4Checklist ?? null,
      poc_next_step: (data as any).pocNextStep ?? null,
      poc_deal_value: (data as any).pocDealValue ?? null,
      poc_phase5_checklist: (data as any).pocPhase5Checklist ?? null,
      poc_pre_sales_owner: (data as any).pocPreSalesOwner ?? null,
    };
    try {
      const pocCols = Object.keys(pocData);
      const pocVals = Object.values(pocData);
      const pocSets = pocCols.map((c, i) => `${c} = $${i + 1}`).join(', ');
      await execute(`UPDATE projects SET ${pocSets} WHERE id = $${pocCols.length + 1}`, [...pocVals, projectId]);
    } catch {}

    const result = await query(`SELECT * FROM projects WHERE id = $1`, [projectId]);
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
    const existingResult = await query(`SELECT * FROM projects WHERE id = $1`, [id]);
    if (existingResult.rows.length === 0) {
      throw new AppError('Project not found', 404);
    }

    const existing = existingResult.rows[0];
    const plannedEnd = data.plannedEnd ? new Date(data.plannedEnd) : existing.planned_end;
    const actualEnd = data.actualEnd !== undefined
      ? (data.actualEnd ? new Date(data.actualEnd) : null)
      : existing.actual_end;

    const calculated = calculateDelay(plannedEnd, actualEnd);
    const delayDays = Math.floor(Number(calculated.delayDays) || 0);
    const delayStatus = data.delayStatus || calculated.delayStatus;

    const updates: string[] = [];
    const params: any[] = [];
    updates.push(`delay_days = $${params.length + 1}`); params.push(delayDays);
    updates.push(`delay_status = $${params.length + 1}`); params.push(delayStatus);

    if (data.name !== undefined) { updates.push(`name = $${params.length + 1}`); params.push(data.name.toLowerCase()); }
    if (data.customerName !== undefined) { updates.push(`customer_name = $${params.length + 1}`); params.push(data.customerName); }
    if (data.projectManager !== undefined) { updates.push(`project_manager = $${params.length + 1}`); params.push(data.projectManager); }
    if (data.accountManager !== undefined) { updates.push(`account_manager = $${params.length + 1}`); params.push(data.accountManager); }
    if (data.planType !== undefined) {
      const sp = ['BRONZE','SILVER','GOLD','PLATINUM'].includes((data.planType||'').toUpperCase())
        ? data.planType.toUpperCase() : data.planType;
      updates.push(`plan_type = $${params.length + 1}`); params.push(sp);
    }
    if (data.migrationTypes !== undefined) { updates.push(`migration_types = $${params.length + 1}`); params.push(data.migrationTypes); }
    if (data.sourcePlatform !== undefined) { updates.push(`source_platform = $${params.length + 1}`); params.push(data.sourcePlatform); }
    if (data.targetPlatform !== undefined) { updates.push(`target_platform = $${params.length + 1}`); params.push(data.targetPlatform); }
    if (data.estimatedCost !== undefined) { updates.push(`estimated_cost = $${params.length + 1}`); params.push(data.estimatedCost); }
    if (data.actualCost !== undefined) { updates.push(`actual_cost = $${params.length + 1}`); params.push(data.actualCost); }
    if (data.numberOfServers !== undefined) { updates.push(`number_of_servers = $${params.length + 1}`); params.push(data.numberOfServers); }
    if (data.projectMemory !== undefined) { updates.push(`project_memory = $${params.length + 1}`); params.push(data.projectMemory); }
    if (data.description !== undefined) { updates.push(`description = $${params.length + 1}`); params.push(data.description); }
    if (data.notes !== undefined) { updates.push(`notes = $${params.length + 1}`); params.push(data.notes); }
    if (data.phase !== undefined) {
      const sp = ['KICKOFF','MIGRATION','VALIDATION','CLOSURE','COMPLETED'].includes((data.phase||'').toUpperCase())
        ? data.phase.toUpperCase() : data.phase;
      updates.push(`phase = $${params.length + 1}`); params.push(sp);
    }
    if (data.status !== undefined) { updates.push(`status = $${params.length + 1}`); params.push(data.status); }
    if (data.plannedStart !== undefined) { updates.push(`planned_start = $${params.length + 1}`); params.push(new Date(data.plannedStart)); }
    if (data.plannedEnd !== undefined) { updates.push(`planned_end = $${params.length + 1}`); params.push(new Date(data.plannedEnd)); }
    if (data.actualStart !== undefined) { updates.push(`actual_start = $${params.length + 1}`); params.push(data.actualStart ? new Date(data.actualStart) : null); }
    if (data.actualEnd !== undefined) { updates.push(`actual_end = $${params.length + 1}`); params.push(actualEnd); }
    if (data.isOveraged !== undefined) { updates.push(`is_overaged = $${params.length + 1}`); params.push(!!data.isOveraged); }
    if (data.isEscalated !== undefined) {
      updates.push(`is_escalated = $${params.length + 1}`); params.push(!!data.isEscalated);
      updates.push(`escalation_priority = $${params.length + 1}`); params.push(data.isEscalated ? (data.escalationPriority || existing.escalation_priority || 'MEDIUM') : null);
      updates.push(`escalated_at = $${params.length + 1}`); params.push(data.isEscalated ? new Date() : null);
    }
    if (data.overageAmount !== undefined) { updates.push(`overage_amount = $${params.length + 1}`); params.push(data.overageAmount ?? null); }
    if (data.cloudAddingStart !== undefined) { updates.push(`cloud_adding_start = $${params.length + 1}`); params.push(data.cloudAddingStart ? new Date(data.cloudAddingStart) : null); }
    if (data.cloudAddingEnd !== undefined) { updates.push(`cloud_adding_end = $${params.length + 1}`); params.push(data.cloudAddingEnd ? new Date(data.cloudAddingEnd) : null); }
    if (data.pilotMigrationStart !== undefined) { updates.push(`pilot_migration_start = $${params.length + 1}`); params.push(data.pilotMigrationStart ? new Date(data.pilotMigrationStart) : null); }
    if (data.pilotMigrationEnd !== undefined) { updates.push(`pilot_migration_end = $${params.length + 1}`); params.push(data.pilotMigrationEnd ? new Date(data.pilotMigrationEnd) : null); }
    if (data.onetimeMigrationStart !== undefined) { updates.push(`onetime_migration_start = $${params.length + 1}`); params.push(data.onetimeMigrationStart ? new Date(data.onetimeMigrationStart) : null); }
    if (data.onetimeMigrationEnd !== undefined) { updates.push(`onetime_migration_end = $${params.length + 1}`); params.push(data.onetimeMigrationEnd ? new Date(data.onetimeMigrationEnd) : null); }
    if (data.deltaMigrationStart !== undefined) { updates.push(`delta_migration_start = $${params.length + 1}`); params.push(data.deltaMigrationStart ? new Date(data.deltaMigrationStart) : null); }
    if (data.deltaMigrationEnd !== undefined) { updates.push(`delta_migration_end = $${params.length + 1}`); params.push(data.deltaMigrationEnd ? new Date(data.deltaMigrationEnd) : null); }
    if (data.finalValidationStart !== undefined) { updates.push(`final_validation_start = $${params.length + 1}`); params.push(data.finalValidationStart ? new Date(data.finalValidationStart) : null); }
    if (data.finalValidationEnd !== undefined) { updates.push(`final_validation_end = $${params.length + 1}`); params.push(data.finalValidationEnd ? new Date(data.finalValidationEnd) : null); }
    if (data.cloudAddingNotes !== undefined) { updates.push(`cloud_adding_notes = $${params.length + 1}`); params.push(data.cloudAddingNotes ?? null); }
    if (data.pilotMigrationNotes !== undefined) { updates.push(`pilot_migration_notes = $${params.length + 1}`); params.push(data.pilotMigrationNotes ?? null); }
    if (data.onetimeMigrationNotes !== undefined) { updates.push(`onetime_migration_notes = $${params.length + 1}`); params.push(data.onetimeMigrationNotes ?? null); }
    if (data.deltaMigrationNotes !== undefined) { updates.push(`delta_migration_notes = $${params.length + 1}`); params.push(data.deltaMigrationNotes ?? null); }
    if (data.finalValidationNotes !== undefined) { updates.push(`final_validation_notes = $${params.length + 1}`); params.push(data.finalValidationNotes ?? null); }
    // POC fields
    if (data.projectType !== undefined) { updates.push(`project_type = $${params.length + 1}`); params.push(data.projectType); }
    if (data.pocQualificationStatus !== undefined) { updates.push(`poc_qualification_status = $${params.length + 1}`); params.push(data.pocQualificationStatus); }
    if (data.pocEnvSetupStatus !== undefined) { updates.push(`poc_env_setup_status = $${params.length + 1}`); params.push(data.pocEnvSetupStatus); }
    if (data.pocTrialStatus !== undefined) { updates.push(`poc_trial_status = $${params.length + 1}`); params.push(data.pocTrialStatus); }
    if (data.pocValidationStatus !== undefined) { updates.push(`poc_validation_status = $${params.length + 1}`); params.push(data.pocValidationStatus); }
    if (data.pocOutcomeStatus !== undefined) { updates.push(`poc_outcome_status = $${params.length + 1}`); params.push(data.pocOutcomeStatus); }
    if (data.pocQualificationNotes !== undefined) { updates.push(`poc_qualification_notes = $${params.length + 1}`); params.push(data.pocQualificationNotes ?? null); }
    if (data.pocEnvSetupNotes !== undefined) { updates.push(`poc_env_setup_notes = $${params.length + 1}`); params.push(data.pocEnvSetupNotes ?? null); }
    if (data.pocTrialNotes !== undefined) { updates.push(`poc_trial_notes = $${params.length + 1}`); params.push(data.pocTrialNotes ?? null); }
    if (data.pocValidationNotes !== undefined) { updates.push(`poc_validation_notes = $${params.length + 1}`); params.push(data.pocValidationNotes ?? null); }
    if (data.pocOutcomeNotes !== undefined) { updates.push(`poc_outcome_notes = $${params.length + 1}`); params.push(data.pocOutcomeNotes ?? null); }
    if (data.pocDeadline !== undefined) { updates.push(`poc_deadline = $${params.length + 1}`); params.push(data.pocDeadline ? new Date(data.pocDeadline) : null); }
    if (data.pocOutcome !== undefined) { updates.push(`poc_outcome = $${params.length + 1}`); params.push(data.pocOutcome ?? null); }
    if (data.pocHandoffTo !== undefined) { updates.push(`poc_handoff_to = $${params.length + 1}`); params.push(data.pocHandoffTo ?? null); }
    if (data.pocHandoffDate !== undefined) { updates.push(`poc_handoff_date = $${params.length + 1}`); params.push(data.pocHandoffDate ? new Date(data.pocHandoffDate) : null); }
    if (data.pocMigrationSpeed !== undefined) { updates.push(`poc_migration_speed = $${params.length + 1}`); params.push(data.pocMigrationSpeed ?? null); }
    if (data.pocErrorRate !== undefined) { updates.push(`poc_error_rate = $${params.length + 1}`); params.push(data.pocErrorRate ?? null); }
    if (data.customerContact !== undefined) { updates.push(`customer_contact = $${params.length + 1}`); params.push(data.customerContact ?? null); }
    if ((data as any).pocSuccessCriteria !== undefined) { updates.push(`poc_success_criteria = $${params.length + 1}`); params.push((data as any).pocSuccessCriteria ?? null); }
    if ((data as any).pocDataVolume !== undefined) { updates.push(`poc_data_volume = $${params.length + 1}`); params.push((data as any).pocDataVolume ?? null); }
    if ((data as any).pocPermissionsIntact !== undefined) { updates.push(`poc_permissions_intact = $${params.length + 1}`); params.push((data as any).pocPermissionsIntact ?? null); }
    if ((data as any).pocMetadataIntact !== undefined) { updates.push(`poc_metadata_intact = $${params.length + 1}`); params.push((data as any).pocMetadataIntact ?? null); }
    if ((data as any).pocHandoffNotes !== undefined) { updates.push(`poc_handoff_notes = $${params.length + 1}`); params.push((data as any).pocHandoffNotes ?? null); }
    if ((data as any).pocNumUsers !== undefined) { updates.push(`poc_num_users = $${params.length + 1}`); params.push((data as any).pocNumUsers ?? null); }
    if ((data as any).pocEstimatedData !== undefined) { updates.push(`poc_estimated_data = $${params.length + 1}`); params.push((data as any).pocEstimatedData ?? null); }
    if ((data as any).pocPhase1Checklist !== undefined) { updates.push(`poc_phase1_checklist = $${params.length + 1}`); params.push((data as any).pocPhase1Checklist ?? null); }
    if ((data as any).pocTenantAccess !== undefined) { updates.push(`poc_tenant_access = $${params.length + 1}`); params.push((data as any).pocTenantAccess ?? null); }
    if ((data as any).pocToolVersion !== undefined) { updates.push(`poc_tool_version = $${params.length + 1}`); params.push((data as any).pocToolVersion ?? null); }
    if ((data as any).pocTestAccounts !== undefined) { updates.push(`poc_test_accounts = $${params.length + 1}`); params.push((data as any).pocTestAccounts ?? null); }
    if ((data as any).pocFirewallIssues !== undefined) { updates.push(`poc_firewall_issues = $${params.length + 1}`); params.push((data as any).pocFirewallIssues ?? null); }
    if ((data as any).pocPhase2Checklist !== undefined) { updates.push(`poc_phase2_checklist = $${params.length + 1}`); params.push((data as any).pocPhase2Checklist ?? null); }
    if ((data as any).pocFilesMigrated !== undefined) { updates.push(`poc_files_migrated = $${params.length + 1}`); params.push((data as any).pocFilesMigrated ?? null); }
    if ((data as any).pocDataMigratedGb !== undefined) { updates.push(`poc_data_migrated_gb = $${params.length + 1}`); params.push((data as any).pocDataMigratedGb ?? null); }
    if ((data as any).pocErrorsFailed !== undefined) { updates.push(`poc_errors_failed = $${params.length + 1}`); params.push((data as any).pocErrorsFailed ?? null); }
    if ((data as any).pocPhase3Checklist !== undefined) { updates.push(`poc_phase3_checklist = $${params.length + 1}`); params.push((data as any).pocPhase3Checklist ?? null); }
    if ((data as any).pocValidationDate !== undefined) { updates.push(`poc_validation_date = $${params.length + 1}`); params.push((data as any).pocValidationDate ? new Date((data as any).pocValidationDate) : null); }
    if ((data as any).pocIssuesRaised !== undefined) { updates.push(`poc_issues_raised = $${params.length + 1}`); params.push((data as any).pocIssuesRaised ?? null); }
    if ((data as any).pocCustomerSatisfaction !== undefined) { updates.push(`poc_customer_satisfaction = $${params.length + 1}`); params.push((data as any).pocCustomerSatisfaction ?? null); }
    if ((data as any).pocPhase4Checklist !== undefined) { updates.push(`poc_phase4_checklist = $${params.length + 1}`); params.push((data as any).pocPhase4Checklist ?? null); }
    if ((data as any).pocNextStep !== undefined) { updates.push(`poc_next_step = $${params.length + 1}`); params.push((data as any).pocNextStep ?? null); }
    if ((data as any).pocDealValue !== undefined) { updates.push(`poc_deal_value = $${params.length + 1}`); params.push((data as any).pocDealValue ?? null); }
    if ((data as any).pocPhase5Checklist !== undefined) { updates.push(`poc_phase5_checklist = $${params.length + 1}`); params.push((data as any).pocPhase5Checklist ?? null); }
    if ((data as any).pocPreSalesOwner !== undefined) { updates.push(`poc_pre_sales_owner = $${params.length + 1}`); params.push((data as any).pocPreSalesOwner ?? null); }

    await execute(
      `UPDATE projects SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length + 1}`,
      [...params, id]
    );

    // Auto-archive when status becomes a terminal status
    if (data.status && ['COMPLETED', 'CANCELLED', 'CLOSED', 'DECOMMISSIONED'].includes(data.status.toUpperCase())) {
      try {
        const { archiveService } = require('./archiveService');
        await archiveService.autoArchive(id, data.status);
      } catch (_) { /* non-critical */ }
    }

    const result = await query(`SELECT * FROM projects WHERE id = $1`, [id]);
    const project = mapProjectRow(result.rows[0]);

    const isNowCompleted = data.status === 'COMPLETED' && existing.status !== 'COMPLETED';
    const isNowClosed = data.phase === 'CLOSURE' && existing.phase !== 'CLOSURE';
    const isNowInCompletedPhase = data.phase === 'COMPLETED' && existing.phase !== 'COMPLETED';

    const caseStudyResult = await query(`SELECT id FROM case_studies WHERE project_id = $1`, [id]);

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
    const existing = await query(`SELECT id FROM projects WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      throw new AppError('Project not found', 404);
    }

    await query(`DELETE FROM projects WHERE id = $1`, [id]);
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
          `UPDATE projects SET delay_days = $1, delay_status = $2 WHERE id = $3`,
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
