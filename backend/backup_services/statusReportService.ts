import { prisma } from '../config/database';
import { ReportType, HealthStatus } from 'pg';
import { logger } from '../utils/logger';

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

class StatusReportService {
  async getByProject(projectId: string) {
    return prisma.projectStatusReport.findMany({
      where: { projectId },
      orderBy: { reportDate: 'desc' },
    });
  }

  async getById(id: string) {
    return prisma.projectStatusReport.findUnique({
      where: { id },
      include: { project: true },
    });
  }

  async getLatest(projectId: string) {
    return prisma.projectStatusReport.findFirst({
      where: { projectId },
      orderBy: { reportDate: 'desc' },
    });
  }

  async create(data: CreateReportInput) {
    // Get project progress data
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      include: {
        tasks: true,
        risks: { where: { status: 'OPEN' } },
      },
    });

    const tasksCompleted = project?.tasks.filter((t) => t.status === 'DONE').length || 0;
    const tasksTotal = project?.tasks.length || 0;
    const completionPercentage = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

    // Auto-generate risk summary if not provided
    let risksSummary = data.risks;
    if (!risksSummary && project?.risks && project.risks.length > 0) {
      risksSummary = project.risks
        .map((r) => `• ${r.title} (${r.impact} impact)`)
        .join('\n');
    }

    const report = await prisma.projectStatusReport.create({
      data: {
        projectId: data.projectId,
        reportDate: data.reportDate || new Date(),
        reportType: data.reportType || 'WEEKLY',
        overallStatus: data.overallStatus || 'GREEN',
        scheduleStatus: data.scheduleStatus || 'GREEN',
        budgetStatus: data.budgetStatus || 'GREEN',
        resourceStatus: data.resourceStatus || 'GREEN',
        completionPercentage,
        tasksCompleted,
        tasksTotal,
        accomplishments: data.accomplishments,
        plannedActivities: data.plannedActivities,
        issues: data.issues,
        risks: risksSummary,
        decisions: data.decisions,
        budgetPlanned: project?.estimatedCost,
        budgetActual: project?.actualCost,
        createdBy: data.createdBy,
      },
    });

    logger.info(`Status report created: ${report.id} for project ${data.projectId}`);
    return report;
  }

  async update(id: string, data: UpdateReportInput) {
    const report = await prisma.projectStatusReport.update({
      where: { id },
      data,
    });

    logger.info(`Status report updated: ${report.id}`);
    return report;
  }

  async delete(id: string) {
    await prisma.projectStatusReport.delete({ where: { id } });
    logger.info(`Status report deleted: ${id}`);
  }

  async generateWeeklyReport(projectId: string, createdBy?: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: {
          include: { phaseRecord: true },
        },
        risks: { where: { status: { in: ['OPEN', 'MITIGATING'] } } },
        phases: { orderBy: { orderIndex: 'asc' } },
      },
    });

    if (!project) return null;

    // Calculate progress
    const tasksCompleted = project.tasks.filter((t) => t.status === 'DONE').length;
    const tasksInProgress = project.tasks.filter((t) => t.status === 'IN_PROGRESS').length;
    const tasksTotal = project.tasks.length;
    const completionPercentage = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

    // Determine health status
    let scheduleStatus: HealthStatus = 'GREEN';
    if (project.delayStatus === 'DELAYED') {
      scheduleStatus = 'RED';
    } else if (project.delayStatus === 'AT_RISK') {
      scheduleStatus = 'YELLOW';
    }

    const budgetStatus: HealthStatus = 
      project.actualCost && project.estimatedCost && 
      Number(project.actualCost) > Number(project.estimatedCost) * 1.1 ? 'RED' :
      project.actualCost && project.estimatedCost && 
      Number(project.actualCost) > Number(project.estimatedCost) * 0.9 ? 'YELLOW' : 'GREEN';

    const highRisks = project.risks.filter((r) => r.impact === 'HIGH' || r.impact === 'CRITICAL');
    const overallStatus: HealthStatus = 
      scheduleStatus === 'RED' || budgetStatus === 'RED' || highRisks.length > 2 ? 'RED' :
      scheduleStatus === 'YELLOW' || budgetStatus === 'YELLOW' || highRisks.length > 0 ? 'YELLOW' : 'GREEN';

    // Generate accomplishments from completed tasks this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const recentlyCompleted = project.tasks.filter(
      (t) => t.status === 'DONE' && t.actualEnd && new Date(t.actualEnd) >= oneWeekAgo
    );
    
    const accomplishments = recentlyCompleted.length > 0
      ? recentlyCompleted.map((t) => `• ${t.name}`).join('\n')
      : '• No tasks completed this week';

    // Generate planned activities from in-progress and upcoming tasks
    const upcomingTasks = project.tasks.filter(
      (t) => t.status === 'TODO' || t.status === 'IN_PROGRESS'
    ).slice(0, 5);
    
    const plannedActivities = upcomingTasks.length > 0
      ? upcomingTasks.map((t) => `• ${t.name} (${t.status})`).join('\n')
      : '• No upcoming tasks';

    // Generate risks summary
    const risksSummary = project.risks.length > 0
      ? project.risks.map((r) => `• ${r.title} - ${r.impact} impact, ${r.probability} probability`).join('\n')
      : '• No open risks';

    // Current phase
    const currentPhase = project.phases.find((p) => p.status === 'IN_PROGRESS');
    const issues = currentPhase 
      ? `Current Phase: ${currentPhase.phaseName}\nProgress: ${currentPhase.progress}%`
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
