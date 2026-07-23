import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

type ReportType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'MILESTONE' | 'ADHOC';
type HealthStatus = 'GREEN' | 'YELLOW' | 'RED' | 'GRAY';

interface CreateReportInput {
  projectId: string;
  reportDate?: Date;
  reportType?: ReportType;
  overallStatus?: HealthStatus;
  scheduleStatus?: HealthStatus;
  budgetStatus?: HealthStatus;
  resourceStatus?: HealthStatus;
  accomplishments?: string;
  plannedActivities?: string;
  issues?: string;
  risks?: string;
  decisions?: string;
  createdBy?: string;
}

interface UpdateReportInput {
  overallStatus?: HealthStatus;
  scheduleStatus?: HealthStatus;
  budgetStatus?: HealthStatus;
  resourceStatus?: HealthStatus;
  accomplishments?: string;
  plannedActivities?: string;
  issues?: string;
  risks?: string;
  decisions?: string;
}

function mapReportRow(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    reportDate: row.report_date,
    reportType: row.report_type,
    overallStatus: row.overall_status,
    scheduleStatus: row.schedule_status,
    budgetStatus: row.budget_status,
    resourceStatus: row.resource_status,
    completionPercentage: row.completion_percentage,
    tasksCompleted: row.tasks_completed,
    tasksTotal: row.tasks_total,
    accomplishments: row.accomplishments,
    plannedActivities: row.planned_activities,
    issues: row.issues,
    risks: row.risks,
    decisions: row.decisions,
    budgetPlanned: row.budget_planned,
    budgetActual: row.budget_actual,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class StatusReportService {
  async getByProject(projectId: string) {
    const result = await query(
      `SELECT * FROM project_status_reports WHERE project_id = $1 ORDER BY report_date DESC`,
      [projectId]
    );
    return result.rows.map(mapReportRow);
  }

  async getById(id: string) {
    const result = await query(
      `SELECT r.*, p.name as project_name
       FROM project_status_reports r
       JOIN projects p ON r.project_id = p.id
       WHERE r.id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      ...mapReportRow(row),
      project: { name: row.project_name },
    };
  }

  async getLatest(projectId: string) {
    const result = await query(
      `SELECT * FROM project_status_reports WHERE project_id = $1 ORDER BY report_date DESC LIMIT 1`,
      [projectId]
    );
    return result.rows.length > 0 ? mapReportRow(result.rows[0]) : null;
  }

  async create(data: CreateReportInput) {
    const projectResult = await query(
      `SELECT p.*, 
              (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id AND status = 'DONE') as tasks_done,
              (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id) as tasks_total
       FROM projects p WHERE p.id = $1`,
      [data.projectId]
    );

    const project = projectResult.rows[0];
    const tasksCompleted = parseInt(project?.tasks_done) || 0;
    const tasksTotal = parseInt(project?.tasks_total) || 0;
    const completionPercentage = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

    let risksSummary = data.risks;
    if (!risksSummary) {
      const risksResult = await query(
        `SELECT title, impact FROM project_risks WHERE project_id = $1 AND status = 'OPEN'`,
        [data.projectId]
      );
      if (risksResult.rows.length > 0) {
        risksSummary = risksResult.rows.map((r) => `• ${r.title} (${r.impact} impact)`).join('\n');
      }
    }

    const reportId = uuidv4();
    await execute(
      `INSERT INTO project_status_reports (
        id, project_id, report_date, report_type, overall_status, schedule_status, budget_status, resource_status,
        completion_percentage, tasks_completed, tasks_total, accomplishments, planned_activities, issues, risks, decisions,
        budget_planned, budget_actual, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        reportId,
        data.projectId,
        data.reportDate || new Date(),
        data.reportType || 'WEEKLY',
        data.overallStatus || 'GREEN',
        data.scheduleStatus || 'GREEN',
        data.budgetStatus || 'GREEN',
        data.resourceStatus || 'GREEN',
        completionPercentage,
        tasksCompleted,
        tasksTotal,
        data.accomplishments,
        data.plannedActivities,
        data.issues,
        risksSummary,
        data.decisions,
        project?.estimated_cost,
        project?.actual_cost,
        (data.createdBy && data.createdBy !== 'system' && data.createdBy.match(/^[0-9a-f-]{36}$/i)) ? data.createdBy : null,
      ]
    );

    const result = await query(`SELECT * FROM project_status_reports WHERE id = $1`, [reportId]);
    const report = mapReportRow(result.rows[0]);
    logger.info(`Status report created: ${report.id} for project ${data.projectId}`);
    return report;
  }

  async update(id: string, data: UpdateReportInput) {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.overallStatus !== undefined) { updates.push(`overall_status = $${paramIndex++}`); params.push(data.overallStatus); }
    if (data.scheduleStatus !== undefined) { updates.push(`schedule_status = $${paramIndex++}`); params.push(data.scheduleStatus); }
    if (data.budgetStatus !== undefined) { updates.push(`budget_status = $${paramIndex++}`); params.push(data.budgetStatus); }
    if (data.resourceStatus !== undefined) { updates.push(`resource_status = $${paramIndex++}`); params.push(data.resourceStatus); }
    if (data.accomplishments !== undefined) { updates.push(`accomplishments = $${paramIndex++}`); params.push(data.accomplishments); }
    if (data.plannedActivities !== undefined) { updates.push(`planned_activities = $${paramIndex++}`); params.push(data.plannedActivities); }
    if (data.issues !== undefined) { updates.push(`issues = $${paramIndex++}`); params.push(data.issues); }
    if (data.risks !== undefined) { updates.push(`risks = $${paramIndex++}`); params.push(data.risks); }
    if (data.decisions !== undefined) { updates.push(`decisions = $${paramIndex++}`); params.push(data.decisions); }

    params.push(id);

    await execute(
      `UPDATE project_status_reports SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    const result = await query(`SELECT * FROM project_status_reports WHERE id = $1`, [id]);
    const report = mapReportRow(result.rows[0]);
    logger.info(`Status report updated: ${report.id}`);
    return report;
  }

  async delete(id: string) {
    await query(`DELETE FROM project_status_reports WHERE id = $1`, [id]);
    logger.info(`Status report deleted: ${id}`);
  }

  async generateWeeklyReport(projectId: string, createdBy?: string) {
    const projectResult = await query(
      `SELECT * FROM projects WHERE id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) return null;

    const project = projectResult.rows[0];

    const [tasksResult, risksResult, phasesResult, teamResult] = await Promise.all([
      query(`SELECT * FROM project_tasks WHERE project_id = $1`, [projectId]),
      query(`SELECT * FROM project_risks WHERE project_id = $1 AND status IN ('OPEN', 'MITIGATING')`, [projectId]),
      query(`SELECT * FROM project_phases WHERE project_id = $1 ORDER BY order_index ASC`, [projectId]),
      query(`SELECT * FROM project_team_members WHERE project_id = $1 AND is_active = true`, [projectId]),
    ]);

    const tasks = tasksResult.rows;
    const risks = risksResult.rows;
    const phases = phasesResult.rows;
    const team = teamResult.rows;

    const tasksCompleted = tasks.filter((t) => t.status === 'DONE').length;
    const tasksTotal = tasks.length;
    const completionPercentage = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

    let scheduleStatus: HealthStatus = 'GREEN';
    if (project.delay_status === 'DELAYED') scheduleStatus = 'RED';
    else if (project.delay_status === 'AT_RISK') scheduleStatus = 'YELLOW';

    // GRAY (not GREEN) when nothing has actually been spent/recorded yet — an
    // untracked budget isn't the same as a healthy one, and defaulting to
    // GREEN here was misleadingly reassuring on projects with no cost data.
    const hasBudgetData = project.estimated_cost != null && project.actual_cost != null;
    let budgetStatus: HealthStatus = 'GRAY';
    if (hasBudgetData) {
      const ratio = Number(project.actual_cost) / Number(project.estimated_cost);
      budgetStatus = ratio > 1.1 ? 'RED' : ratio > 0.9 ? 'YELLOW' : 'GREEN';
    }

    // Resources is now actually computed from the Team tab's allocation data
    // instead of being hardcoded to GREEN on every report.
    const avgAllocation = team.length > 0
      ? team.reduce((sum: number, m: any) => sum + (m.allocation ?? 100), 0) / team.length
      : null;
    let resourceStatus: HealthStatus = 'GRAY';
    if (avgAllocation !== null) {
      resourceStatus = avgAllocation > 110 ? 'RED' : avgAllocation < 50 ? 'YELLOW' : 'GREEN';
    }

    const highRisks = risks.filter((r) => r.impact === 'HIGH' || r.impact === 'CRITICAL');
    const unknownCount = [budgetStatus, resourceStatus].filter((s) => s === 'GRAY').length;
    const overallStatus: HealthStatus =
      scheduleStatus === 'RED' || budgetStatus === 'RED' || resourceStatus === 'RED' || highRisks.length > 2 ? 'RED' :
      scheduleStatus === 'YELLOW' || budgetStatus === 'YELLOW' || resourceStatus === 'YELLOW' || highRisks.length > 0 || unknownCount > 0 ? 'YELLOW' :
      'GREEN';

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const recentlyCompleted = tasks.filter(
      (t) => t.status === 'DONE' && t.actual_end && new Date(t.actual_end) >= oneWeekAgo
    );
    const recentlyCompletedPhases = phases.filter(
      (p) => p.status === 'COMPLETED' && p.actual_end && new Date(p.actual_end) >= oneWeekAgo
    );

    const accomplishmentLines = [
      ...recentlyCompleted.map((t) => `• ${t.name}`),
      ...recentlyCompletedPhases.map((p) => `• Phase completed: ${p.phase_name}`),
    ];
    const accomplishments = accomplishmentLines.length > 0
      ? accomplishmentLines.join('\n')
      : (tasksTotal === 0 ? '• No tasks logged for this project yet' : '• No tasks completed this week');

    const upcomingTasks = tasks.filter(
      (t) => t.status === 'TODO' || t.status === 'IN_PROGRESS'
    ).slice(0, 5);

    const plannedActivities = upcomingTasks.length > 0
      ? upcomingTasks.map((t) => `• ${t.name} (${t.status})`).join('\n')
      : (tasksTotal === 0 ? '• No tasks logged for this project yet' : '• No upcoming tasks');

    const risksSummary = risks.length > 0
      ? risks.map((r) => `• ${r.title} - ${r.impact} impact, ${r.probability} probability`).join('\n')
      : '• No open risks';

    const currentPhase = phases.find((p) => p.status === 'IN_PROGRESS');
    const nextPhase = !currentPhase ? phases.find((p) => p.status === 'PENDING') : null;
    const issueLines: string[] = [];
    if (currentPhase) {
      issueLines.push(`Current Phase: ${currentPhase.phase_name}\nProgress: ${currentPhase.progress}%`);
    } else if (nextPhase) {
      issueLines.push(`No phase currently in progress — next up: ${nextPhase.phase_name} (Pending)`);
    } else {
      issueLines.push('No active or pending phase found');
    }
    if (!hasBudgetData) issueLines.push('Budget: no estimated/actual cost recorded yet — status cannot be verified');
    if (team.length === 0) issueLines.push('Resources: no active team members assigned to this project');
    const issues = issueLines.join('\n');

    return this.create({
      projectId,
      reportType: 'WEEKLY',
      overallStatus,
      scheduleStatus,
      budgetStatus,
      resourceStatus,
      accomplishments,
      plannedActivities,
      issues,
      risks: risksSummary,
      createdBy,
    });
  }
}

export const statusReportService = new StatusReportService();
