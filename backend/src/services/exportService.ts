import { prisma } from '../config/database';
import { logger } from '../utils/logger';

class ExportService {
  async exportProjectsToCSV(filters?: { status?: string; phase?: string }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.phase) where.phase = filters.phase;

    const projects = await prisma.project.findMany({
      where,
      include: {
        phases: true,
        _count: { select: { tasks: true, risks: true, teamMembers: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

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
      p.customerName,
      p.projectManager,
      p.accountManager,
      p.status,
      p.phase,
      p.planType,
      p.migrationTypes || '',
      p.plannedStart.toISOString().split('T')[0],
      p.plannedEnd.toISOString().split('T')[0],
      p.actualStart?.toISOString().split('T')[0] || '',
      p.actualEnd?.toISOString().split('T')[0] || '',
      p.delayDays,
      p.delayStatus,
      p.estimatedCost?.toString() || '',
      p.actualCost?.toString() || '',
      p._count.tasks,
      p._count.risks,
      p._count.teamMembers,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    logger.info(`Exported ${projects.length} projects to CSV`);
    return csv;
  }

  async exportProjectDetailToJSON(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        phases: {
          include: { tasks: true },
          orderBy: { orderIndex: 'asc' },
        },
        tasks: true,
        risks: true,
        teamMembers: true,
        documents: true,
        statusReports: { orderBy: { reportDate: 'desc' }, take: 5 },
        changeRequests: true,
        caseStudy: true,
      },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    logger.info(`Exported project ${projectId} to JSON`);
    return project;
  }

  async exportStatusReportToHTML(reportId: string) {
    const report = await prisma.projectStatusReport.findUnique({
      where: { id: reportId },
      include: {
        project: {
          include: {
            risks: { where: { status: { in: ['OPEN', 'MITIGATING'] } } },
            tasks: true,
          },
        },
      },
    });

    if (!report) {
      throw new Error('Report not found');
    }

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
  <title>Status Report - ${report.project.name}</title>
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
    <h1>${report.project.name}</h1>
    <span class="date">${report.reportType} Report - ${new Date(report.reportDate).toLocaleDateString()}</span>
  </div>
  
  <p><strong>Customer:</strong> ${report.project.customerName}</p>
  <p><strong>Project Manager:</strong> ${report.project.projectManager}</p>
  
  <h2>Status Overview</h2>
  <div class="status-grid">
    <div class="status-item">
      <div class="status-circle" style="background: ${getStatusColor(report.overallStatus)}"></div>
      <div class="status-label">Overall</div>
    </div>
    <div class="status-item">
      <div class="status-circle" style="background: ${getStatusColor(report.scheduleStatus)}"></div>
      <div class="status-label">Schedule</div>
    </div>
    <div class="status-item">
      <div class="status-circle" style="background: ${getStatusColor(report.budgetStatus)}"></div>
      <div class="status-label">Budget</div>
    </div>
    <div class="status-item">
      <div class="status-circle" style="background: ${getStatusColor(report.resourceStatus)}"></div>
      <div class="status-label">Resources</div>
    </div>
  </div>
  
  <h2>Progress</h2>
  <div class="section">
    <p><strong>Completion:</strong> ${report.completionPercentage}%</p>
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${report.completionPercentage}%"></div>
    </div>
    <p><strong>Tasks:</strong> ${report.tasksCompleted} / ${report.tasksTotal} completed</p>
  </div>
  
  ${report.accomplishments ? `
  <div class="section">
    <h3>Accomplishments</h3>
    <p>${report.accomplishments.replace(/\n/g, '<br>')}</p>
  </div>
  ` : ''}
  
  ${report.plannedActivities ? `
  <div class="section">
    <h3>Planned Activities</h3>
    <p>${report.plannedActivities.replace(/\n/g, '<br>')}</p>
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
      <tr><th>Planned</th><td>$${Number(report.budgetPlanned || 0).toLocaleString()}</td></tr>
      <tr><th>Actual</th><td>$${Number(report.budgetActual || 0).toLocaleString()}</td></tr>
      <tr><th>Variance</th><td>$${(Number(report.budgetActual || 0) - Number(report.budgetPlanned || 0)).toLocaleString()}</td></tr>
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
    const tasks = await prisma.projectTask.findMany({
      where: { projectId },
      include: { phaseRecord: true },
      orderBy: [{ phaseRecord: { orderIndex: 'asc' } }, { orderIndex: 'asc' }],
    });

    const headers = [
      'Phase', 'Task Name', 'Status', 'Priority', 'Assignee',
      'Planned Start', 'Planned End', 'Actual Start', 'Actual End',
      'Duration (days)', 'Progress (%)', 'Is Milestone', 'Notes'
    ];

    const rows = tasks.map((t) => [
      t.phaseRecord.phaseName,
      t.name,
      t.status,
      t.priority,
      t.assignee || '',
      t.plannedStart.toISOString().split('T')[0],
      t.plannedEnd.toISOString().split('T')[0],
      t.actualStart?.toISOString().split('T')[0] || '',
      t.actualEnd?.toISOString().split('T')[0] || '',
      t.duration,
      t.progress,
      t.isMilestone ? 'Yes' : 'No',
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
    const risks = await prisma.projectRisk.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

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
      r.dueDate?.toISOString().split('T')[0] || '',
      r.createdAt.toISOString().split('T')[0],
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
