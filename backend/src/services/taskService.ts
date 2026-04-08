import { prisma } from '../config/database';
import { TaskStatus } from '@prisma/client';
import { logger } from '../utils/logger';
import { caseStudyService } from './caseStudyService';

interface UpdateTaskInput {
  name?: string;
  status?: TaskStatus;
  plannedStart?: Date;
  plannedEnd?: Date;
  actualStart?: Date | null;
  actualEnd?: Date | null;
  progress?: number;
  assignee?: string | null;
  notes?: string | null;
}

class TaskService {
  async getProjectTasks(projectId: string) {
    const phases = await prisma.projectPhaseRecord.findMany({
      where: { projectId },
      orderBy: { orderIndex: 'asc' },
      include: {
        tasks: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    return phases;
  }

  async getTaskById(taskId: string) {
    return prisma.projectTask.findUnique({
      where: { id: taskId },
      include: {
        phaseRecord: true,
        project: true,
      },
    });
  }

  async updateTask(taskId: string, data: UpdateTaskInput) {
    const task = await prisma.projectTask.update({
      where: { id: taskId },
      data: {
        ...data,
        progress: data.status === 'DONE' ? 100 : data.progress,
      },
    });

    // Update phase progress
    await this.updatePhaseProgress(task.phaseRecordId);

    return task;
  }

  async updateTaskStatus(taskId: string, status: TaskStatus) {
    const task = await prisma.projectTask.update({
      where: { id: taskId },
      data: {
        status,
        progress: status === 'DONE' ? 100 : status === 'IN_PROGRESS' ? 50 : 0,
        actualStart: status === 'IN_PROGRESS' ? new Date() : undefined,
        actualEnd: status === 'DONE' ? new Date() : undefined,
      },
    });

    // Update phase progress
    await this.updatePhaseProgress(task.phaseRecordId);

    return task;
  }

  async updatePhaseProgress(phaseRecordId: string) {
    const tasks = await prisma.projectTask.findMany({
      where: { phaseRecordId },
    });

    if (tasks.length === 0) return;

    const totalProgress = tasks.reduce((sum, task) => sum + task.progress, 0);
    const avgProgress = Math.round(totalProgress / tasks.length);

    const allDone = tasks.every((t) => t.status === 'DONE');
    const anyInProgress = tasks.some((t) => t.status === 'IN_PROGRESS');

    let status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' = 'PENDING';
    if (allDone) {
      status = 'COMPLETED';
    } else if (anyInProgress || tasks.some((t) => t.status === 'DONE')) {
      status = 'IN_PROGRESS';
    }

    const phaseRecord = await prisma.projectPhaseRecord.update({
      where: { id: phaseRecordId },
      data: {
        progress: avgProgress,
        status,
        actualStart: status !== 'PENDING' ? new Date() : undefined,
        actualEnd: status === 'COMPLETED' ? new Date() : undefined,
      },
    });

    // Check if all phases are completed - auto-create case study
    if (status === 'COMPLETED') {
      await this.checkProjectCompletion(phaseRecord.projectId);
    }
  }

  async checkProjectCompletion(projectId: string) {
    const allPhases = await prisma.projectPhaseRecord.findMany({
      where: { projectId },
    });

    const allPhasesCompleted = allPhases.length > 0 && allPhases.every((p) => p.status === 'COMPLETED');

    if (allPhasesCompleted) {
      // Check if case study already exists
      const existingCaseStudy = await prisma.caseStudy.findUnique({
        where: { projectId },
      });

      if (!existingCaseStudy) {
        try {
          const project = await prisma.project.findUnique({
            where: { id: projectId },
          });

          if (project) {
            await caseStudyService.create({
              projectId,
              title: `${project.customerName} - ${project.name} Case Study`,
              status: 'PENDING',
            });
            logger.info(`Auto-created case study for project with all phases completed: ${projectId}`);

            // Also update project status to COMPLETED
            await prisma.project.update({
              where: { id: projectId },
              data: { 
                status: 'COMPLETED',
                phase: 'COMPLETED',
                actualEnd: new Date(),
              },
            });
            logger.info(`Project ${projectId} marked as COMPLETED`);
          }
        } catch (error) {
          logger.warn(`Could not auto-create case study: ${error}`);
        }
      }
    }
  }

  async getGanttData(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        phases: {
          orderBy: { orderIndex: 'asc' },
          include: {
            tasks: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
      },
    });

    if (!project) return null;

    const ganttData = {
      project: {
        id: project.id,
        name: project.name,
        plannedStart: project.plannedStart,
        plannedEnd: project.plannedEnd,
      },
      phases: project.phases.map((phase) => ({
        id: phase.id,
        name: phase.phaseName,
        orderIndex: phase.orderIndex,
        plannedStart: phase.plannedStart,
        plannedEnd: phase.plannedEnd,
        actualStart: phase.actualStart,
        actualEnd: phase.actualEnd,
        status: phase.status,
        progress: phase.progress,
        tasks: phase.tasks.map((task) => ({
          id: task.id,
          name: task.name,
          orderIndex: task.orderIndex,
          status: task.status,
          plannedStart: task.plannedStart,
          plannedEnd: task.plannedEnd,
          actualStart: task.actualStart,
          actualEnd: task.actualEnd,
          duration: task.duration,
          progress: task.progress,
          assignee: task.assignee,
          isMilestone: task.isMilestone,
        })),
      })),
    };

    return ganttData;
  }

  async createProjectTasksFromTemplate(
    projectId: string,
    templateCode: string,
    projectStartDate: Date
  ) {
    const template = await prisma.migrationTemplate.findUnique({
      where: { code: templateCode.toUpperCase() },
      include: {
        phases: {
          orderBy: { orderIndex: 'asc' },
          include: {
            tasks: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
      },
    });

    if (!template) {
      logger.warn(`Template not found: ${templateCode}`);
      return null;
    }

    let currentDate = new Date(projectStartDate);

    for (const templatePhase of template.phases) {
      const phaseStart = new Date(currentDate);
      const phaseEnd = new Date(currentDate);
      phaseEnd.setDate(phaseEnd.getDate() + templatePhase.defaultDuration);

      const phaseRecord = await prisma.projectPhaseRecord.create({
        data: {
          projectId,
          phaseName: templatePhase.name,
          orderIndex: templatePhase.orderIndex,
          plannedStart: phaseStart,
          plannedEnd: phaseEnd,
          status: 'PENDING',
          progress: 0,
        },
      });

      let taskDate = new Date(phaseStart);

      for (const templateTask of templatePhase.tasks) {
        const taskStart = new Date(taskDate);
        const taskEnd = new Date(taskDate);
        taskEnd.setDate(taskEnd.getDate() + templateTask.defaultDuration);

        await prisma.projectTask.create({
          data: {
            projectId,
            phaseRecordId: phaseRecord.id,
            name: templateTask.name,
            orderIndex: templateTask.orderIndex,
            status: 'TODO',
            plannedStart: taskStart,
            plannedEnd: taskEnd,
            duration: templateTask.defaultDuration,
            progress: 0,
            isMilestone: templateTask.isMilestone,
          },
        });

        taskDate = new Date(taskEnd);
      }

      currentDate = new Date(phaseEnd);
    }

    // Update project with template reference
    await prisma.project.update({
      where: { id: projectId },
      data: { templateId: template.id },
    });

    logger.info(`Created tasks for project ${projectId} from template ${templateCode}`);
    return true;
  }
}

export const taskService = new TaskService();
