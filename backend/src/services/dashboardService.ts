import { prisma } from '../config/database';

export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  onHoldProjects: number;
  delayedProjects: number;
  atRiskProjects: number;
  pendingCaseStudies: number;
  avgDelayDays: number;
}

class DashboardService {
  /**
   * Get main dashboard statistics
   */
  async getStats(): Promise<DashboardStats> {
    const [
      totalProjects,
      activeProjects,
      completedProjects,
      onHoldProjects,
      delayedProjects,
      atRiskProjects,
      pendingCaseStudies,
      avgDelayResult,
    ] = await Promise.all([
      prisma.project.count(),
      prisma.project.count({ where: { status: 'ACTIVE' } }),
      prisma.project.count({ where: { status: 'COMPLETED' } }),
      prisma.project.count({ where: { status: 'ON_HOLD' } }),
      prisma.project.count({ where: { delayStatus: 'DELAYED' } }),
      prisma.project.count({ where: { delayStatus: 'AT_RISK' } }),
      prisma.caseStudy.count({ where: { status: 'PENDING' } }),
      prisma.project.aggregate({
        _avg: { delayDays: true },
        where: { delayDays: { gt: 0 } },
      }),
    ]);

    return {
      totalProjects,
      activeProjects,
      completedProjects,
      onHoldProjects,
      delayedProjects,
      atRiskProjects,
      pendingCaseStudies,
      avgDelayDays: Math.round(avgDelayResult._avg.delayDays || 0),
    };
  }

  /**
   * Get projects grouped by status
   */
  async getProjectsByStatus() {
    const results = await prisma.project.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    return results.map((r) => ({
      status: r.status,
      count: r._count.status,
    }));
  }

  /**
   * Get projects grouped by phase
   */
  async getProjectsByPhase() {
    const results = await prisma.project.groupBy({
      by: ['phase'],
      _count: { phase: true },
    });

    return results.map((r) => ({
      phase: r.phase,
      count: r._count.phase,
    }));
  }

  /**
   * Get projects grouped by plan type
   */
  async getProjectsByPlan() {
    const results = await prisma.project.groupBy({
      by: ['planType'],
      _count: { planType: true },
    });

    return results.map((r) => ({
      planType: r.planType,
      count: r._count.planType,
    }));
  }

  /**
   * Get recent activity feed
   */
  async getRecentActivity(limit: number = 10) {
    const recentProjects = await prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        status: true,
        phase: true,
        updatedAt: true,
      },
    });

    return recentProjects.map((p) => ({
      id: p.id,
      type: 'project_update',
      message: `Project "${p.name}" updated`,
      projectId: p.id,
      projectName: p.name,
      timestamp: p.updatedAt,
    }));
  }

  /**
   * Get delay summary
   */
  async getDelaySummary() {
    const [statusResults, topDelayed] = await Promise.all([
      prisma.project.groupBy({
        by: ['delayStatus'],
        _count: { delayStatus: true },
        _avg: { delayDays: true },
      }),
      prisma.project.findMany({
        where: { delayStatus: 'DELAYED' },
        orderBy: { delayDays: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          customerName: true,
          delayDays: true,
          delayStatus: true,
        },
      }),
    ]);

    return {
      byStatus: statusResults.map((r) => ({
        delayStatus: r.delayStatus,
        count: r._count.delayStatus,
        avgDays: Math.round(r._avg.delayDays || 0),
      })),
      topDelayed,
    };
  }

  /**
   * Get upcoming deadlines
   */
  async getUpcomingDeadlines(days: number = 14) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const projects = await prisma.project.findMany({
      where: {
        status: 'ACTIVE',
        plannedEnd: {
          gte: new Date(),
          lte: futureDate,
        },
      },
      orderBy: { plannedEnd: 'asc' },
      select: {
        id: true,
        name: true,
        customerName: true,
        plannedEnd: true,
        phase: true,
        delayStatus: true,
      },
    });

    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      customerName: p.customerName,
      deadline: p.plannedEnd,
      phase: p.phase,
      delayStatus: p.delayStatus,
    }));
  }

  /**
   * Get statistics by migration type for PM Dashboard
   */
  async getMigrationTypeStats() {
    const allProjects = await prisma.project.findMany({
      select: {
        id: true,
        migrationTypes: true,
        status: true,
        delayStatus: true,
        plannedEnd: true,
        createdAt: true,
      },
    });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const migrationTypes = ['CONTENT', 'EMAIL', 'MESSAGING'];
    
    const stats = migrationTypes.map((type) => {
      const projectsOfType = allProjects.filter((p) => 
        p.migrationTypes?.toUpperCase().includes(type)
      );

      const active = projectsOfType.filter((p) => p.status === 'ACTIVE').length;
      const inactive = projectsOfType.filter((p) => p.status === 'ON_HOLD').length;
      const completed = projectsOfType.filter((p) => p.status === 'COMPLETED').length;
      const cancelled = projectsOfType.filter((p) => p.status === 'CANCELLED').length;
      const newProjects = projectsOfType.filter((p) => p.createdAt >= thirtyDaysAgo).length;
      const overaged = projectsOfType.filter((p) => 
        p.status === 'ACTIVE' && p.plannedEnd < now
      ).length;
      const delayed = projectsOfType.filter((p) => p.delayStatus === 'DELAYED').length;
      const atRisk = projectsOfType.filter((p) => p.delayStatus === 'AT_RISK').length;

      return {
        type,
        total: projectsOfType.length,
        active,
        inactive,
        completed,
        cancelled,
        newProjects,
        overaged,
        delayed,
        atRisk,
      };
    });

    // Calculate totals
    const allActive = allProjects.filter((p) => p.status === 'ACTIVE').length;
    const allInactive = allProjects.filter((p) => p.status === 'ON_HOLD').length;
    const allCompleted = allProjects.filter((p) => p.status === 'COMPLETED').length;
    const allCancelled = allProjects.filter((p) => p.status === 'CANCELLED').length;
    const allNew = allProjects.filter((p) => p.createdAt >= thirtyDaysAgo).length;
    const allOveraged = allProjects.filter((p) => 
      p.status === 'ACTIVE' && p.plannedEnd < now
    ).length;
    const allDelayed = allProjects.filter((p) => p.delayStatus === 'DELAYED').length;
    const allAtRisk = allProjects.filter((p) => p.delayStatus === 'AT_RISK').length;

    return {
      byType: stats,
      totals: {
        total: allProjects.length,
        active: allActive,
        inactive: allInactive,
        completed: allCompleted,
        cancelled: allCancelled,
        newProjects: allNew,
        overaged: allOveraged,
        delayed: allDelayed,
        atRisk: allAtRisk,
      },
    };
  }

  /**
   * Get projects list by migration type
   */
  async getProjectsByMigrationType(type: string) {
    const projects = await prisma.project.findMany({
      where: {
        migrationTypes: {
          contains: type.toUpperCase(),
        },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        customerName: true,
        projectManager: true,
        status: true,
        phase: true,
        delayStatus: true,
        delayDays: true,
        plannedEnd: true,
        migrationTypes: true,
      },
    });

    return projects;
  }
}

export const dashboardService = new DashboardService();
