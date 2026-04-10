import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { caseStudyService } from './caseStudyService';
import { v4 as uuidv4 } from 'uuid';

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'SKIPPED';

function calculateTaskStatusFromDates(plannedStart: Date, plannedEnd: Date, currentStatus: TaskStatus): { status: TaskStatus; progress: number } {
  if (currentStatus === 'DONE' || currentStatus === 'BLOCKED' || currentStatus === 'SKIPPED') {
    return { status: currentStatus, progress: currentStatus === 'DONE' ? 100 : 0 };
  }

  const now = new Date();
  const start = new Date(plannedStart);
  const end = new Date(plannedEnd);
  
  if (now < start) {
    return { status: 'TODO', progress: 0 };
  }
  
  if (now > end) {
    return { status: 'DONE', progress: 100 };
  }
  
  const totalDuration = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  const progress = Math.min(99, Math.max(1, Math.round((elapsed / totalDuration) * 100)));
  
  return { status: 'IN_PROGRESS', progress };
}

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

function mapTaskRow(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    phaseRecordId: row.phase_record_id,
    name: row.name,
    orderIndex: row.order_index,
    status: row.status,
    plannedStart: row.planned_start,
    plannedEnd: row.planned_end,
    actualStart: row.actual_start,
    actualEnd: row.actual_end,
    duration: row.duration,
    progress: row.progress,
    assignee: row.assignee,
    isMilestone: row.is_milestone,
    notes: row.notes,
    priority: row.priority,
    estimatedHours: row.estimated_hours,
    actualHours: row.actual_hours,
  };
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
  };
}

class TaskService {
  async getProjectTasks(projectId: string) {
    const phasesResult = await query(
      `SELECT * FROM project_phases WHERE project_id = $1 ORDER BY order_index ASC`,
      [projectId]
    );

    const phases = [];
    for (const phaseRow of phasesResult.rows) {
      const tasksResult = await query(
        `SELECT * FROM project_tasks WHERE phase_record_id = $1 ORDER BY order_index ASC`,
        [phaseRow.id]
      );
      
      phases.push({
        ...mapPhaseRow(phaseRow),
        tasks: tasksResult.rows.map(mapTaskRow),
      });
    }

    return phases;
  }

  async getTaskById(taskId: string) {
    const result = await query(
      `SELECT t.*, p.name as project_name, ph.phase_name 
       FROM project_tasks t
       JOIN projects p ON t.project_id = p.id
       JOIN project_phases ph ON t.phase_record_id = ph.id
       WHERE t.id = $1`,
      [taskId]
    );

    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      ...mapTaskRow(row),
      project: { name: row.project_name },
      phaseRecord: { phaseName: row.phase_name },
    };
  }

  async updateTask(taskId: string, data: UpdateTaskInput) {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) { updates.push(`name = $${paramIndex++}`); params.push(data.name); }
    if (data.status !== undefined) { updates.push(`status = $${paramIndex++}`); params.push(data.status); }
    if (data.plannedStart !== undefined) { updates.push(`planned_start = $${paramIndex++}`); params.push(data.plannedStart); }
    if (data.plannedEnd !== undefined) { updates.push(`planned_end = $${paramIndex++}`); params.push(data.plannedEnd); }
    if (data.actualStart !== undefined) { updates.push(`actual_start = $${paramIndex++}`); params.push(data.actualStart); }
    if (data.actualEnd !== undefined) { updates.push(`actual_end = $${paramIndex++}`); params.push(data.actualEnd); }
    if (data.assignee !== undefined) { updates.push(`assignee = $${paramIndex++}`); params.push(data.assignee); }
    if (data.notes !== undefined) { updates.push(`notes = $${paramIndex++}`); params.push(data.notes); }
    
    const progress = data.status === 'DONE' ? 100 : data.progress;
    if (progress !== undefined) { updates.push(`progress = $${paramIndex++}`); params.push(progress); }

    params.push(taskId);

    await execute(
      `UPDATE project_tasks SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const result = await query(`SELECT * FROM project_tasks WHERE id = ?`, [taskId]);
    const task = mapTaskRow(result.rows[0]);
    await this.updatePhaseProgress(task.phaseRecordId);

    return task;
  }

  async updateTaskStatus(taskId: string, status: TaskStatus) {
    const progress = status === 'DONE' ? 100 : status === 'IN_PROGRESS' ? 50 : 0;
    const actualStart = status === 'IN_PROGRESS' ? new Date() : null;
    const actualEnd = status === 'DONE' ? new Date() : null;

    await execute(
      `UPDATE project_tasks 
       SET status = ?, progress = ?, actual_start = COALESCE(?, actual_start), actual_end = ? 
       WHERE id = ?`,
      [status, progress, actualStart, actualEnd, taskId]
    );

    const result = await query(`SELECT * FROM project_tasks WHERE id = ?`, [taskId]);
    const task = mapTaskRow(result.rows[0]);
    await this.updatePhaseProgress(task.phaseRecordId);

    return task;
  }

  async updatePhaseProgress(phaseRecordId: string) {
    const tasksResult = await query(
      `SELECT * FROM project_tasks WHERE phase_record_id = $1`,
      [phaseRecordId]
    );

    const tasks = tasksResult.rows;
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

    await execute(
      `UPDATE project_phases 
       SET progress = ?, status = ?, 
           actual_start = CASE WHEN ? != 'PENDING' THEN COALESCE(actual_start, NOW()) ELSE actual_start END,
           actual_end = CASE WHEN ? = 'COMPLETED' THEN NOW() ELSE actual_end END
       WHERE id = ?`,
      [avgProgress, status, status, status, phaseRecordId]
    );

    const phaseResult = await query(`SELECT project_id FROM project_phases WHERE id = ?`, [phaseRecordId]);
    if (status === 'COMPLETED' && phaseResult.rows.length > 0) {
      await this.checkProjectCompletion(phaseResult.rows[0].project_id);
    }
  }

  async checkProjectCompletion(projectId: string) {
    const phasesResult = await query(
      `SELECT * FROM project_phases WHERE project_id = $1`,
      [projectId]
    );

    const allPhases = phasesResult.rows;
    const allPhasesCompleted = allPhases.length > 0 && allPhases.every((p) => p.status === 'COMPLETED');

    if (allPhasesCompleted) {
      const existingCaseStudy = await query(
        `SELECT id FROM case_studies WHERE project_id = $1`,
        [projectId]
      );

      if (existingCaseStudy.rows.length === 0) {
        try {
          const projectResult = await query(
            `SELECT * FROM projects WHERE id = $1`,
            [projectId]
          );

          const project = projectResult.rows[0];
          if (project) {
            await caseStudyService.create({
              projectId,
              title: `${project.customer_name} - ${project.name} Case Study`,
              status: 'PENDING',
            });
            logger.info(`Auto-created case study for project with all phases completed: ${projectId}`);

            await query(
              `UPDATE projects SET status = 'COMPLETED', phase = 'COMPLETED', actual_end = NOW() WHERE id = $1`,
              [projectId]
            );
            logger.info(`Project ${projectId} marked as COMPLETED`);
          }
        } catch (error) {
          logger.warn(`Could not auto-create case study: ${error}`);
        }
      }
    }
  }

  async autoUpdateTaskStatuses(projectId: string) {
    const tasksResult = await query(
      `SELECT t.*, ph.id as phase_id FROM project_tasks t 
       JOIN project_phases ph ON t.phase_record_id = ph.id 
       WHERE t.project_id = $1 AND t.status NOT IN ('DONE', 'BLOCKED', 'SKIPPED')`,
      [projectId]
    );

    const updatedPhases = new Set<string>();

    for (const task of tasksResult.rows) {
      const { status, progress } = calculateTaskStatusFromDates(
        task.planned_start,
        task.planned_end,
        task.status
      );

      if (status !== task.status || progress !== task.progress) {
        const actualStart = status === 'IN_PROGRESS' && !task.actual_start ? new Date() : null;
        const actualEnd = status === 'DONE' ? new Date() : null;

        await execute(
          `UPDATE project_tasks 
           SET status = ?, progress = ?, 
               actual_start = COALESCE(?, actual_start), 
               actual_end = COALESCE(?, actual_end)
           WHERE id = ?`,
          [status, progress, actualStart, actualEnd, task.id]
        );

        updatedPhases.add(task.phase_id);
        logger.debug(`Auto-updated task ${task.name}: ${task.status} -> ${status} (${progress}%)`);
      }
    }

    for (const phaseId of updatedPhases) {
      await this.updatePhaseProgress(phaseId);
    }

    return updatedPhases.size;
  }

  async getGanttData(projectId: string) {
    const projectResult = await query(`SELECT * FROM projects WHERE id = $1`, [projectId]);
    if (projectResult.rows.length === 0) return null;

    await this.autoUpdateTaskStatuses(projectId);

    const project = projectResult.rows[0];
    const phasesResult = await query(
      `SELECT * FROM project_phases WHERE project_id = $1 ORDER BY order_index ASC`,
      [projectId]
    );

    const phases = [];
    for (const phaseRow of phasesResult.rows) {
      const tasksResult = await query(
        `SELECT * FROM project_tasks WHERE phase_record_id = $1 ORDER BY order_index ASC`,
        [phaseRow.id]
      );

      const phaseRefresh = await query(`SELECT * FROM project_phases WHERE id = ?`, [phaseRow.id]);
      const refreshedPhase = phaseRefresh.rows[0] || phaseRow;

      phases.push({
        id: refreshedPhase.id,
        phaseName: refreshedPhase.phase_name,
        orderIndex: refreshedPhase.order_index,
        plannedStart: refreshedPhase.planned_start,
        plannedEnd: refreshedPhase.planned_end,
        actualStart: refreshedPhase.actual_start,
        actualEnd: refreshedPhase.actual_end,
        status: refreshedPhase.status,
        progress: refreshedPhase.progress,
        tasks: tasksResult.rows.map((task) => ({
          id: task.id,
          name: task.name,
          orderIndex: task.order_index,
          status: task.status,
          plannedStart: task.planned_start,
          plannedEnd: task.planned_end,
          actualStart: task.actual_start,
          actualEnd: task.actual_end,
          duration: task.duration,
          progress: task.progress,
          assignee: task.assignee,
          isMilestone: task.is_milestone,
        })),
      });
    }

    return {
      project: {
        id: project.id,
        name: project.name,
        customerName: project.customer_name,
        plannedStart: project.planned_start,
        plannedEnd: project.planned_end,
      },
      phases,
    };
  }

  async createProjectTasksFromTemplate(
    projectId: string,
    templateCode: string,
    projectStartDate: Date
  ) {
    const templateResult = await query(
      `SELECT * FROM migration_templates WHERE code = $1`,
      [templateCode.toUpperCase()]
    );

    if (templateResult.rows.length === 0) {
      logger.warn(`Template not found: ${templateCode}`);
      return null;
    }

    const template = templateResult.rows[0];
    const phasesResult = await query(
      `SELECT * FROM template_phases WHERE template_id = $1 ORDER BY order_index ASC`,
      [template.id]
    );

    let currentDate = new Date(projectStartDate);

    for (const templatePhase of phasesResult.rows) {
      const phaseStart = new Date(currentDate);
      const phaseEnd = new Date(currentDate);
      phaseEnd.setDate(phaseEnd.getDate() + templatePhase.default_duration);

      const phaseRecordId = uuidv4();
      await execute(
        `INSERT INTO project_phases (id, project_id, phase_name, order_index, planned_start, planned_end, status, progress)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0)`,
        [phaseRecordId, projectId, templatePhase.name, templatePhase.order_index, phaseStart, phaseEnd]
      );

      const tasksResult = await query(
        `SELECT * FROM template_tasks WHERE phase_id = $1 ORDER BY order_index ASC`,
        [templatePhase.id]
      );

      let taskDate = new Date(phaseStart);

      for (const templateTask of tasksResult.rows) {
        const taskStart = new Date(taskDate);
        const taskEnd = new Date(taskDate);
        taskEnd.setDate(taskEnd.getDate() + templateTask.default_duration);

        await execute(
          `INSERT INTO project_tasks (id, project_id, phase_record_id, name, order_index, status, planned_start, planned_end, duration, progress, is_milestone)
           VALUES (?, ?, ?, ?, ?, 'TODO', ?, ?, ?, 0, ?)`,
          [uuidv4(), projectId, phaseRecordId, templateTask.name, templateTask.order_index, taskStart, taskEnd, templateTask.default_duration, templateTask.is_milestone]
        );

        taskDate = new Date(taskEnd);
      }

      currentDate = new Date(phaseEnd);
    }

    await query(
      `UPDATE projects SET template_id = $1 WHERE id = $2`,
      [template.id, projectId]
    );

    logger.info(`Created tasks for project ${projectId} from template ${templateCode}`);
    return true;
  }
}

export const taskService = new TaskService();
