import { prisma } from '../config/database';
import { Prisma } from 'pg';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { calculateDelay } from '../utils/delayCalculator';
import { taskService } from './taskService';
import { caseStudyService } from './caseStudyService';

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
  description?: string | null;
  notes?: string | null;
  phase?: string;
  status?: string;
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

class ProjectService {
  /**
   * Get all projects with filtering, pagination, and sorting
   */
  async getAll(
    filters: ProjectFilters = {},
    pagination: PaginationOptions = {}
  ) {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;

    const where: Prisma.ProjectWhereInput = {};

    if (filters.status) {
      where.status = filters.status as any;
    }
    if (filters.phase) {
      where.phase = filters.phase as any;
    }
    if (filters.planType) {
      where.planType = filters.planType as any;
    }
    if (filters.delayStatus) {
      where.delayStatus = filters.delayStatus as any;
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { customerName: { contains: filters.search } },
        { projectManager: { contains: filters.search } },
      ];
    }
    if (filters.projectManager) {
      where.projectManager = filters.projectManager;
    }
    if (filters.accountManager) {
      where.accountManager = filters.accountManager;
    }

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          phases: true,
          caseStudy: true,
        },
      }),
      prisma.project.count({ where }),
    ]);

    return {
      projects,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single project by ID
   */
  async getById(id: string) {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        phases: {
          orderBy: { orderIndex: 'asc' },
          include: {
            tasks: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        tasks: {
          orderBy: { orderIndex: 'asc' },
        },
        caseStudy: true,
        notifications: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        template: true,
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    return project;
  }

  /**
   * Create a new project with phases and tasks from template
   */
  async create(data: CreateProjectDTO) {
    const plannedEnd = new Date(data.plannedEnd);
    const plannedStart = new Date(data.plannedStart);
    const actualEnd = data.actualEnd ? new Date(data.actualEnd) : null;
    const { delayDays, delayStatus } = calculateDelay(plannedEnd, actualEnd);

    // Determine migration type for template
    const migrationTypes = data.migrationTypes?.toUpperCase().split(',').map(t => t.trim()) || [];
    const primaryMigrationType = migrationTypes[0] || null;

    const project = await prisma.project.create({
      data: {
        name: data.name,
        customerName: data.customerName,
        projectManager: data.projectManager,
        accountManager: data.accountManager,
        planType: (data.planType as any) || 'SILVER',
        plannedStart,
        plannedEnd,
        actualStart: data.actualStart ? new Date(data.actualStart) : null,
        actualEnd,
        migrationTypes: data.migrationTypes,
        sourcePlatform: data.sourcePlatform,
        targetPlatform: data.targetPlatform,
        estimatedCost: data.estimatedCost,
        actualCost: data.actualCost,
        description: data.description,
        notes: data.notes,
        phase: (data.phase as any) || 'KICKOFF',
        status: (data.status as any) || 'ACTIVE',
        delayDays,
        delayStatus: delayStatus as any,
      },
      include: {
        phases: true,
        tasks: true,
      },
    });

    // Auto-generate tasks from template if migration type is specified
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

    // Reload project with all relations
    const fullProject = await prisma.project.findUnique({
      where: { id: project.id },
      include: {
        phases: {
          orderBy: { orderIndex: 'asc' },
          include: {
            tasks: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        tasks: true,
      },
    });

    logger.info(`Project created: ${project.id} - ${project.name}`);
    return fullProject;
  }


  /**
   * Update a project
   */
  async update(id: string, data: UpdateProjectDTO) {
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Project not found', 404);
    }

    const plannedEnd = data.plannedEnd ? new Date(data.plannedEnd) : existing.plannedEnd;
    const actualEnd = data.actualEnd !== undefined
      ? (data.actualEnd ? new Date(data.actualEnd) : null)
      : existing.actualEnd;

    const { delayDays, delayStatus } = calculateDelay(plannedEnd, actualEnd);

    const updateData: Prisma.ProjectUpdateInput = {
      delayDays,
      delayStatus: delayStatus as any,
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.customerName !== undefined) updateData.customerName = data.customerName;
    if (data.projectManager !== undefined) updateData.projectManager = data.projectManager;
    if (data.accountManager !== undefined) updateData.accountManager = data.accountManager;
    if (data.planType !== undefined) updateData.planType = data.planType as any;
    if (data.migrationTypes !== undefined) updateData.migrationTypes = data.migrationTypes;
    if (data.sourcePlatform !== undefined) updateData.sourcePlatform = data.sourcePlatform;
    if (data.targetPlatform !== undefined) updateData.targetPlatform = data.targetPlatform;
    if (data.estimatedCost !== undefined) updateData.estimatedCost = data.estimatedCost;
    if (data.actualCost !== undefined) updateData.actualCost = data.actualCost;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.phase !== undefined) updateData.phase = data.phase as any;
    if (data.status !== undefined) updateData.status = data.status as any;
    if (data.plannedStart !== undefined) updateData.plannedStart = new Date(data.plannedStart);
    if (data.plannedEnd !== undefined) updateData.plannedEnd = new Date(data.plannedEnd);
    if (data.actualStart !== undefined) updateData.actualStart = data.actualStart ? new Date(data.actualStart) : null;
    if (data.actualEnd !== undefined) updateData.actualEnd = actualEnd;

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
      include: {
        phases: true,
        caseStudy: true,
      },
    });

    // Auto-create case study when project is completed or closed
    const isNowCompleted = data.status === 'COMPLETED' && existing.status !== 'COMPLETED';
    const isNowClosed = data.phase === 'CLOSURE' && existing.phase !== 'CLOSURE';
    const isNowInCompletedPhase = data.phase === 'COMPLETED' && existing.phase !== 'COMPLETED';

    if ((isNowCompleted || isNowClosed || isNowInCompletedPhase) && !project.caseStudy) {
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

  /**
   * Delete a project
   */
  async delete(id: string): Promise<void> {
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Project not found', 404);
    }

    await prisma.project.delete({ where: { id } });
    logger.info(`Project deleted: ${id}`);
  }

  /**
   * Get delayed projects
   */
  async getDelayedProjects() {
    return prisma.project.findMany({
      where: { delayStatus: 'DELAYED' },
      orderBy: { delayDays: 'desc' },
    });
  }

  /**
   * Update all project delays (for cron job)
   */
  async updateAllDelays(): Promise<number> {
    const activeProjects = await prisma.project.findMany({
      where: {
        status: { in: ['ACTIVE', 'ON_HOLD'] },
      },
    });

    let updatedCount = 0;

    for (const project of activeProjects) {
      const { delayDays, delayStatus } = calculateDelay(project.plannedEnd, project.actualEnd);

      if (delayDays !== project.delayDays || delayStatus !== project.delayStatus) {
        await prisma.project.update({
          where: { id: project.id },
          data: {
            delayDays,
            delayStatus: delayStatus as any,
          },
        });
        updatedCount++;
      }
    }

    return updatedCount;
  }

  /**
   * Get projects without case study (completed projects)
   */
  async getProjectsWithoutCaseStudy() {
    return prisma.project.findMany({
      where: {
        status: 'COMPLETED',
        caseStudy: null,
      },
    });
  }
}

export const projectService = new ProjectService();
