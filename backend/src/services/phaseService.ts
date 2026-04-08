import { prisma } from '../config/database';
import { ProjectPhaseRecord, PhaseStatus, ProjectPhase } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export interface UpdatePhaseDTO {
  actualDate?: Date | string | null;
  status?: PhaseStatus;
  notes?: string;
}

class PhaseService {
  /**
   * Get all phases for a project
   */
  async getByProjectId(projectId: string): Promise<ProjectPhaseRecord[]> {
    return prisma.projectPhaseRecord.findMany({
      where: { projectId },
      orderBy: { plannedDate: 'asc' },
    });
  }

  /**
   * Update a phase record
   */
  async update(id: string, data: UpdatePhaseDTO): Promise<ProjectPhaseRecord> {
    const existing = await prisma.projectPhaseRecord.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!existing) {
      throw new AppError('Phase record not found', 404);
    }

    const updateData: any = {};

    if (data.actualDate !== undefined) {
      updateData.actualDate = data.actualDate ? new Date(data.actualDate) : null;
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    const phase = await prisma.projectPhaseRecord.update({
      where: { id },
      data: updateData,
    });

    // Auto-update project phase if this phase is completed
    if (data.status === 'COMPLETED') {
      await this.updateProjectPhase(existing.projectId, existing.phaseName);
    }

    logger.info(`Phase updated: ${id} - ${existing.phaseName}`);
    return phase;
  }

  /**
   * Complete a phase and move to next
   */
  async completePhase(projectId: string, phaseName: ProjectPhase): Promise<void> {
    // Mark current phase as completed
    await prisma.projectPhaseRecord.updateMany({
      where: { projectId, phaseName },
      data: { status: 'COMPLETED', actualDate: new Date() },
    });

    // Update project's current phase
    await this.updateProjectPhase(projectId, phaseName);
  }

  /**
   * Update project's current phase based on completed phases
   */
  private async updateProjectPhase(
    projectId: string,
    completedPhase: ProjectPhase
  ): Promise<void> {
    const phaseOrder: ProjectPhase[] = ['KICKOFF', 'MIGRATION', 'VALIDATION', 'CLOSURE', 'COMPLETED'];
    const currentIndex = phaseOrder.indexOf(completedPhase);
    
    if (currentIndex < phaseOrder.length - 1) {
      const nextPhase = phaseOrder[currentIndex + 1];
      
      await prisma.project.update({
        where: { id: projectId },
        data: { 
          phase: nextPhase,
          // Auto-complete project if all phases done
          ...(nextPhase === 'COMPLETED' && { 
            status: 'COMPLETED',
            actualEnd: new Date(),
          }),
        },
      });

      // Mark next phase as in progress
      if (nextPhase !== 'COMPLETED') {
        await prisma.projectPhaseRecord.updateMany({
          where: { projectId, phaseName: nextPhase },
          data: { status: 'IN_PROGRESS' },
        });
      }
    }
  }

  /**
   * Get phase statistics for dashboard
   */
  async getPhaseStats(): Promise<Record<ProjectPhase, number>> {
    const phases = await prisma.project.groupBy({
      by: ['phase'],
      _count: { phase: true },
      where: { status: { in: ['ACTIVE', 'ON_HOLD'] } },
    });

    const stats: Record<string, number> = {
      KICKOFF: 0,
      MIGRATION: 0,
      VALIDATION: 0,
      CLOSURE: 0,
      COMPLETED: 0,
    };

    phases.forEach((p) => {
      stats[p.phase] = p._count.phase;
    });

    return stats as Record<ProjectPhase, number>;
  }
}

export const phaseService = new PhaseService();
