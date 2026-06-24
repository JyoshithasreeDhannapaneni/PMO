import { query, execute } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

type PhaseStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
type ProjectPhase =
  | 'KICKOFF'
  | 'CLOUD_ADDING'
  | 'PILOT_MIGRATION'
  | 'ONETIME_MIGRATION'
  | 'DELTA'
  | 'FINAL_VALIDATION'
  | 'COMPLETED';

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
      `UPDATE project_phases SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    const result = await query(`SELECT * FROM project_phases WHERE id = $1`, [id]);
    const phase = mapPhaseRow(result.rows[0]);

    if (data.status === 'COMPLETED') {
      await this.advanceProjectPhase(existing.project_id);
    }

    logger.info(`Phase updated: ${id} - ${existing.phase_name}`);
    return phase;
  }

  // Data-driven phase advance: reads project_phases order from DB, no hardcoded list.
  private async advanceProjectPhase(projectId: string): Promise<void> {
    // Find the next phase that is still PENDING, ordered by order_index
    const nextResult = await query(
      `SELECT phase_name FROM project_phases
       WHERE project_id = $1 AND status = 'PENDING'
       ORDER BY order_index ASC LIMIT 1`,
      [projectId]
    );

    if (nextResult.rows.length > 0) {
      const nextPhaseName: string = nextResult.rows[0].phase_name;
      // Advance the project's current phase column
      await execute(`UPDATE projects SET phase = $1 WHERE id = $2`, [nextPhaseName, projectId]);
      // Mark the next phase as IN_PROGRESS
      await execute(
        `UPDATE project_phases
         SET status = 'IN_PROGRESS', actual_start = COALESCE(actual_start, NOW())
         WHERE project_id = $1 AND phase_name = $2`,
        [projectId, nextPhaseName]
      );
    } else {
      // No pending phases remain — check if the project is fully complete
      const { taskService } = require('./taskService');
      await taskService.checkProjectCompletion(projectId);
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
      CLOUD_ADDING: 0,
      PILOT_MIGRATION: 0,
      ONETIME_MIGRATION: 0,
      DELTA: 0,
      FINAL_VALIDATION: 0,
      COMPLETED: 0,
    };

    result.rows.forEach((row) => {
      stats[row.phase] = parseInt(row.count);
    });

    return stats as Record<ProjectPhase, number>;
  }
}

export const phaseService = new PhaseService();
