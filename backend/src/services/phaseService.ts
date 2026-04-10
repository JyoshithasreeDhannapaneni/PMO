import { query, execute } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

type PhaseStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
type ProjectPhase = 'KICKOFF' | 'MIGRATION' | 'VALIDATION' | 'CLOSURE' | 'COMPLETED';

export interface UpdatePhaseDTO {
  actualStart?: Date | string | null;
  actualEnd?: Date | string | null;
  status?: PhaseStatus;
  progress?: number;
  notes?: string;
}

function mapPhaseRow(row: any) {
  return {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class PhaseService {
  async getByProjectId(projectId: string) {
    const result = await query(
      `SELECT * FROM project_phases WHERE project_id = $1 ORDER BY order_index ASC`,
      [projectId]
    );
    return result.rows.map(mapPhaseRow);
  }

  async update(id: string, data: UpdatePhaseDTO) {
    const existingResult = await query(
      `SELECT pp.*, p.id as p_id FROM project_phases pp 
       JOIN projects p ON pp.project_id = p.id 
       WHERE pp.id = $1`,
      [id]
    );

    if (existingResult.rows.length === 0) {
      throw new AppError('Phase record not found', 404);
    }

    const existing = existingResult.rows[0];
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.actualStart !== undefined) {
      updates.push(`actual_start = $${paramIndex++}`);
      params.push(data.actualStart ? new Date(data.actualStart) : null);
    }
    if (data.actualEnd !== undefined) {
      updates.push(`actual_end = $${paramIndex++}`);
      params.push(data.actualEnd ? new Date(data.actualEnd) : null);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(data.status);
    }
    if (data.progress !== undefined) {
      updates.push(`progress = $${paramIndex++}`);
      params.push(data.progress);
    }
    if (data.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      params.push(data.notes);
    }

    params.push(id);

    await execute(
      `UPDATE project_phases SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const result = await query(`SELECT * FROM project_phases WHERE id = ?`, [id]);
    const phase = mapPhaseRow(result.rows[0]);

    if (data.status === 'COMPLETED') {
      await this.updateProjectPhase(existing.project_id, existing.phase_name);
    }

    logger.info(`Phase updated: ${id} - ${existing.phase_name}`);
    return phase;
  }

  async completePhase(projectId: string, phaseName: ProjectPhase): Promise<void> {
    await query(
      `UPDATE project_phases SET status = 'COMPLETED', actual_end = NOW() 
       WHERE project_id = $1 AND phase_name = $2`,
      [projectId, phaseName]
    );

    await this.updateProjectPhase(projectId, phaseName);
  }

  private async updateProjectPhase(projectId: string, completedPhase: string): Promise<void> {
    const phaseOrder: ProjectPhase[] = ['KICKOFF', 'MIGRATION', 'VALIDATION', 'CLOSURE', 'COMPLETED'];
    const currentIndex = phaseOrder.indexOf(completedPhase as ProjectPhase);

    if (currentIndex < phaseOrder.length - 1) {
      const nextPhase = phaseOrder[currentIndex + 1];

      if (nextPhase === 'COMPLETED') {
        await query(
          `UPDATE projects SET phase = $1, status = 'COMPLETED', actual_end = NOW() WHERE id = $2`,
          [nextPhase, projectId]
        );
      } else {
        await query(
          `UPDATE projects SET phase = $1 WHERE id = $2`,
          [nextPhase, projectId]
        );

        await query(
          `UPDATE project_phases SET status = 'IN_PROGRESS', actual_start = NOW() 
           WHERE project_id = $1 AND phase_name = $2`,
          [projectId, nextPhase]
        );
      }
    }
  }

  async getPhaseStats(): Promise<Record<ProjectPhase, number>> {
    const result = await query(
      `SELECT phase, COUNT(*) as count FROM projects 
       WHERE status IN ('ACTIVE', 'ON_HOLD') 
       GROUP BY phase`
    );

    const stats: Record<string, number> = {
      KICKOFF: 0,
      MIGRATION: 0,
      VALIDATION: 0,
      CLOSURE: 0,
      COMPLETED: 0,
    };

    result.rows.forEach((row) => {
      stats[row.phase] = parseInt(row.count);
    });

    return stats as Record<ProjectPhase, number>;
  }
}

export const phaseService = new PhaseService();
