import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

type ReportType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'MILESTONE' | 'ADHOC';
type HealthStatus = 'GREEN' | 'YELLOW' | 'RED';

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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        data.createdBy,
      ]
    );

    const result = await query(`SELECT * FROM project_status_reports WHERE id = ?`, [reportId]);
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
      `UPDATE project_status_reports SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const result = await query(`SELECT * FROM project_status_reports WHERE id = ?`, [id]);
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

    const [tasksResult, risksResult, phasesResult] = await Promise.all([
      query(`SELECT * FROM project_tasks WHERE project_id = $1`, [projectId]),
      query(`SELECT * FROM project_risks WHERE project_id = $1 AND status IN ('OPEN', 'MITIGATING')`, [projectId]),
      query(`SELECT * FROM project_phases WHERE project_id = $1 ORDER BY order_index ASC`, [projectId]),
    ]);

    const tasks = tasksResult.rows;
    const risks = risksResult.rows;
    const phases = phasesResult.rows;

    const tasksCompleted = tasks.filter((t) => t.status === 'DONE').length;
    const tasksTotal = tasks.length;
    const completionPercentage = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

    let scheduleStatus: HealthStatus = 'GREEN';
    if (project.delay_status === 'DELAYED') scheduleStatus = 'RED';
    else if (project.delay_status === 'AT_RISK') scheduleStatus = 'YELLOW';

    const budgetStatus: HealthStatus =
      project.actual_cost && project.estimated_cost &&
      Number(project.actual_cost) > Number(project.estimated_cost) * 1.1 ? 'RED' :
      project.actual_cost && project.estimated_cost &&
      Number(project.actual_cost) > Number(project.estimated_cost) * 0.9 ? 'YELLOW' : 'GREEN';

    const highRisks = risks.filter((r) => r.impact === 'HIGH' || r.impact === 'CRITICAL');
    const overallStatus: HealthStatus =
      scheduleStatus === 'RED' || budgetStatus === 'RED' || highRisks.length > 2 ? 'RED' :
      scheduleStatus === 'YELLOW' || budgetStatus === 'YELLOW' || highRisks.length > 0 ? 'YELLOW' : 'GREEN';

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const recentlyCompleted = tasks.filter(
      (t) => t.status === 'DONE' && t.actual_end && new Date(t.actual_end) >= oneWeekAgo
    );

    const accomplishments = recentlyCompleted.length > 0
      ? recentlyCompleted.map((t) => `• ${t.name}`).join('\n')
      : '• No tasks completed this week';

    const upcomingTasks = tasks.filter(
      (t) => t.status === 'TODO' || t.status === 'IN_PROGRESS'
    ).slice(0, 5);

    const plannedActivities = upcomingTasks.length > 0
      ? upcomingTasks.map((t) => `• ${t.name} (${t.status})`).join('\n')
      : '• No upcoming tasks';

    const risksSummary = risks.length > 0
      ? risks.map((r) => `• ${r.title} - ${r.impact} impact, ${r.probability} probability`).join('\n')
      : '• No open risks';

    const currentPhase = phases.find((p) => p.status === 'IN_PROGRESS');
    const issues = currentPhase
      ? `Current Phase: ${currentPhase.phase_name}\nProgress: ${currentPhase.progress}%`
      : 'No active phase';

    return this.create({
      projectId,
      reportType: 'WEEKLY',
      overallStatus,
      scheduleStatus,
      budgetStatus,
      resourceStatus: 'GREEN',
      accomplishments,
      plannedActivities,
      issues,
      risks: risksSummary,
      createdBy,
    });
  }
}

export const statusReportService = new StatusReportService();
