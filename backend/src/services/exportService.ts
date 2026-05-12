import { query } from '../config/database';
import { logger } from '../utils/logger';

class ExportService {
  async exportProjectsToCSV(filters?: { status?: string; phase?: string }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }
    if (filters?.phase) {
      conditions.push(`phase = $${paramIndex++}`);
      params.push(filters.phase);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT p.*,
              (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id) as task_count,
              (SELECT COUNT(*) FROM project_risks WHERE project_id = p.id) as risk_count,
              (SELECT COUNT(*) FROM project_team_members WHERE project_id = p.id) as team_count
       FROM projects p ${whereClause} ORDER BY created_at DESC`,
      params
    );

    const projects = result.rows;

    const headers = [
      'ID', 'Name', 'Customer', 'Project Manager', 'Account Manager',
      'Status', 'Phase', 'Plan Type', 'Migration Types',
      'Planned Start', 'Planned End', 'Actual Start', 'Actual End',
      'Delay Days', 'Delay Status', 'Estimated Cost', 'Actual Cost',
      'Tasks Count', 'Risks Count', 'Team Members'
    ];

    const rows = projects.map((p) => [
      p.id,
      p.name,
      p.customer_name,
      p.project_manager,
      p.account_manager,
      p.status,
      p.phase,
      p.plan_type,
      p.migration_types || '',
      new Date(p.planned_start).toISOString().split('T')[0],
      new Date(p.planned_end).toISOString().split('T')[0],
      p.actual_start ? new Date(p.actual_start).toISOString().split('T')[0] : '',
      p.actual_end ? new Date(p.actual_end).toISOString().split('T')[0] : '',
      p.delay_days,
      p.delay_status,
      p.estimated_cost?.toString() || '',
      p.actual_cost?.toString() || '',
      p.task_count,
      p.risk_count,
      p.team_count,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    logger.info(`Exported ${projects.length} projects to CSV`);
    return csv;
  }

  async exportProjectDetailToJSON(projectId: string) {
    const [projectResult, phasesResult, tasksResult, risksResult, teamResult, docsResult, reportsResult, crResult, caseStudyResult] = await Promise.all([
      query(`SELECT * FROM projects WHERE id = $1`, [projectId]),
      query(`SELECT * FROM project_phases WHERE project_id = $1 ORDER BY order_index ASC`, [projectId]),
      query(`SELECT * FROM project_tasks WHERE project_id = $1 ORDER BY order_index ASC`, [projectId]),
      query(`SELECT * FROM project_risks WHERE project_id = $1`, [projectId]),
      query(`SELECT * FROM project_team_members WHERE project_id = $1`, [projectId]),
      query(`SELECT * FROM project_documents WHERE project_id = $1`, [projectId]),
      query(`SELECT * FROM project_status_reports WHERE project_id = $1 ORDER BY report_date DESC LIMIT 5`, [projectId]),
      query(`SELECT * FROM change_requests WHERE project_id = $1`, [projectId]),
      query(`SELECT * FROM case_studies WHERE project_id = $1`, [projectId]),
    ]);

    if (projectResult.rows.length === 0) {
      throw new Error('Project not found');
    }

    const project = projectResult.rows[0];

    logger.info(`Exported project ${projectId} to JSON`);
    return {
      ...project,
      phases: phasesResult.rows,
      tasks: tasksResult.rows,
      risks: risksResult.rows,
      teamMembers: teamResult.rows,
      documents: docsResult.rows,
      statusReports: reportsResult.rows,
      changeRequests: crResult.rows,
      caseStudy: caseStudyResult.rows[0] || null,
    };
  }

  async exportStatusReportToHTML(reportId: string) {
    const reportResult = await query(
      `SELECT r.*, p.name as project_name, p.customer_name, p.project_manager
       FROM project_status_reports r
       JOIN projects p ON r.project_id = p.id
       WHERE r.id = $1`,
      [reportId]
    );

    if (reportResult.rows.length === 0) {
      throw new Error('Report not found');
    }

    const report = reportResult.rows[0];

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'GREEN': return '#22c55e';
        case 'YELLOW': return '#eab308';
        case 'RED': return '#ef4444';
        default: return '#6b7280';
      }
    };

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Status Report - ${report.project_name}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #1f2937; border-bottom: 2px solid #4f46e5; padding-bottom: 10px; }
    h2 { color: #374151; margin-top: 30px; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .date { color: #6b7280; }
    .status-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
    .status-item { text-align: center; padding: 15px; border-radius: 8px; background: #f3f4f6; }
    .status-circle { width: 40px; height: 40px; border-radius: 50%; margin: 0 auto 10px; }
    .status-label { font-size: 12px; color: #6b7280; }
    .section { margin: 20px 0; padding: 15px; background: #f9fafb; border-radius: 8px; }
    .section h3 { margin-top: 0; color: #4f46e5; }
    .progress-bar { height: 20px; background: #e5e7eb; border-radius: 10px; overflow: hidden; }
    .progress-fill { height: 100%; background: #4f46e5; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${report.project_name}</h1>
    <span class="date">${report.report_type} Report - ${new Date(report.report_date).toLocaleDateString()}</span>
  </div>
  
  <p><strong>Customer:</strong> ${report.customer_name}</p>
  <p><strong>Project Manager:</strong> ${report.project_manager}</p>
  
  <h2>Status Overview</h2>
  <div class="status-grid">
    <div class="status-item">
      <div class="status-circle" style="background: ${getStatusColor(report.overall_status)}"></div>
      <div class="status-label">Overall</div>
    </div>
    <div class="status-item">
      <div class="status-circle" style="background: ${getStatusColor(report.schedule_status)}"></div>
      <div class="status-label">Schedule</div>
    </div>
    <div class="status-item">
      <div class="status-circle" style="background: ${getStatusColor(report.budget_status)}"></div>
      <div class="status-label">Budget</div>
    </div>
    <div class="status-item">
      <div class="status-circle" style="background: ${getStatusColor(report.resource_status)}"></div>
      <div class="status-label">Resources</div>
    </div>
  </div>
  
  <h2>Progress</h2>
  <div class="section">
    <p><strong>Completion:</strong> ${report.completion_percentage}%</p>
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${report.completion_percentage}%"></div>
    </div>
    <p><strong>Tasks:</strong> ${report.tasks_completed} / ${report.tasks_total} completed</p>
  </div>
  
  ${report.accomplishments ? `
  <div class="section">
    <h3>Accomplishments</h3>
    <p>${report.accomplishments.replace(/\n/g, '<br>')}</p>
  </div>
  ` : ''}
  
  ${report.planned_activities ? `
  <div class="section">
    <h3>Planned Activities</h3>
    <p>${report.planned_activities.replace(/\n/g, '<br>')}</p>
  </div>
  ` : ''}
  
  ${report.issues ? `
  <div class="section">
    <h3>Issues</h3>
    <p>${report.issues.replace(/\n/g, '<br>')}</p>
  </div>
  ` : ''}
  
  ${report.risks ? `
  <div class="section">
    <h3>Risks</h3>
    <p>${report.risks.replace(/\n/g, '<br>')}</p>
  </div>
  ` : ''}
  
  <div class="section">
    <h3>Budget</h3>
    <table>
      <tr><th>Planned</th><td>$${Number(report.budget_planned || 0).toLocaleString()}</td></tr>
      <tr><th>Actual</th><td>$${Number(report.budget_actual || 0).toLocaleString()}</td></tr>
      <tr><th>Variance</th><td>$${(Number(report.budget_actual || 0) - Number(report.budget_planned || 0)).toLocaleString()}</td></tr>
    </table>
  </div>
  
  <footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
    Generated on ${new Date().toLocaleString()} | PMO Tracker
  </footer>
</body>
</html>
    `;

    logger.info(`Exported status report ${reportId} to HTML`);
    return html;
  }

  async exportTasksToCSV(projectId: string) {
    const result = await query(
      `SELECT t.*, ph.phase_name
       FROM project_tasks t
       JOIN project_phases ph ON t.phase_record_id = ph.id
       WHERE t.project_id = $1
       ORDER BY ph.order_index ASC, t.order_index ASC`,
      [projectId]
    );

    const tasks = result.rows;

    const headers = [
      'Phase', 'Task Name', 'Status', 'Priority', 'Assignee',
      'Planned Start', 'Planned End', 'Actual Start', 'Actual End',
      'Duration (days)', 'Progress (%)', 'Is Milestone', 'Notes'
    ];

    const rows = tasks.map((t) => [
      t.phase_name,
      t.name,
      t.status,
      t.priority,
      t.assignee || '',
      new Date(t.planned_start).toISOString().split('T')[0],
      new Date(t.planned_end).toISOString().split('T')[0],
      t.actual_start ? new Date(t.actual_start).toISOString().split('T')[0] : '',
      t.actual_end ? new Date(t.actual_end).toISOString().split('T')[0] : '',
      t.duration,
      t.progress,
      t.is_milestone ? 'Yes' : 'No',
      t.notes || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    logger.info(`Exported ${tasks.length} tasks for project ${projectId} to CSV`);
    return csv;
  }

  async exportRisksToCSV(projectId: string) {
    const result = await query(
      `SELECT * FROM project_risks WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId]
    );

    const risks = result.rows;

    const headers = [
      'Title', 'Description', 'Category', 'Probability', 'Impact',
      'Status', 'Owner', 'Mitigation', 'Due Date', 'Created At'
    ];

    const rows = risks.map((r) => [
      r.title,
      r.description || '',
      r.category,
      r.probability,
      r.impact,
      r.status,
      r.owner || '',
      r.mitigation || '',
      r.due_date ? new Date(r.due_date).toISOString().split('T')[0] : '',
      new Date(r.created_at).toISOString().split('T')[0],
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    logger.info(`Exported ${risks.length} risks for project ${projectId} to CSV`);
    return csv;
  }
}

export const exportService = new ExportService();
