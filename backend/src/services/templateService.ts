import { query, execute, transaction } from '../config/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

interface CreateTemplateInput {
  name: string;
  code: string;
  description?: string;
  phases?: {
    name: string;
    orderIndex: number;
    defaultDuration: number;
    description?: string;
    tasks?: {
      name: string;
      orderIndex: number;
      defaultDuration: number;
      description?: string;
      isMilestone?: boolean;
    }[];
  }[];
}

interface UpdateTemplateInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

function mapTemplateRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTaskRow(t: any) {
  return {
    id: t.id,
    phaseId: t.phase_id,
    name: t.name,
    orderIndex: t.order_index,
    defaultDuration: t.default_duration,
    description: t.description,
    isMilestone: t.is_milestone,
  };
}

class TemplateService {
  async getAll() {
    const templatesResult = await query(
      `SELECT * FROM migration_templates WHERE is_active = true ORDER BY name ASC`
    );

    const templates = [];
    for (const templateRow of templatesResult.rows) {
      const phasesResult = await query(
        `SELECT * FROM template_phases WHERE template_id = $1 ORDER BY order_index ASC`,
        [templateRow.id]
      );

      const phases = [];
      for (const phaseRow of phasesResult.rows) {
        const tasksResult = await query(
          `SELECT * FROM template_tasks WHERE phase_id = $1 ORDER BY order_index ASC`,
          [phaseRow.id]
        );

        phases.push({
          id: phaseRow.id,
          templateId: phaseRow.template_id,
          name: phaseRow.name,
          orderIndex: phaseRow.order_index,
          defaultDuration: phaseRow.default_duration,
          description: phaseRow.description,
          tasks: tasksResult.rows.map(mapTaskRow),
        });
      }

      templates.push({ ...mapTemplateRow(templateRow), phases });
    }

    return templates;
  }

  async getById(id: string) {
    const templateResult = await query(
      `SELECT * FROM migration_templates WHERE id = $1`,
      [id]
    );

    if (templateResult.rows.length === 0) return null;

    const templateRow = templateResult.rows[0];
    const phasesResult = await query(
      `SELECT * FROM template_phases WHERE template_id = $1 ORDER BY order_index ASC`,
      [id]
    );

    const phases = [];
    for (const phaseRow of phasesResult.rows) {
      const tasksResult = await query(
        `SELECT * FROM template_tasks WHERE phase_id = $1 ORDER BY order_index ASC`,
        [phaseRow.id]
      );

      phases.push({
        id: phaseRow.id,
        templateId: phaseRow.template_id,
        name: phaseRow.name,
        orderIndex: phaseRow.order_index,
        defaultDuration: phaseRow.default_duration,
        description: phaseRow.description,
        tasks: tasksResult.rows.map(mapTaskRow),
      });
    }

    return { ...mapTemplateRow(templateRow), phases };
  }

  async getByCode(code: string) {
    const templateResult = await query(
      `SELECT * FROM migration_templates WHERE code = $1`,
      [code.toUpperCase()]
    );

    if (templateResult.rows.length === 0) return null;
    return this.getById(templateResult.rows[0].id);
  }

  async create(data: CreateTemplateInput) {
    return transaction(async (client) => {
      const templateId = uuidv4();
      await client.query(
        `INSERT INTO migration_templates (id, name, code, description) VALUES ($1, $2, $3, $4)`,
        [templateId, data.name, data.code.toUpperCase(), data.description ?? null]
      );

      if (data.phases) {
        for (const phase of data.phases) {
          const phaseId = uuidv4();
          await client.query(
            `INSERT INTO template_phases (id, template_id, name, order_index, default_duration, description)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [phaseId, templateId, phase.name, phase.orderIndex, phase.defaultDuration, phase.description ?? null]
          );

          if (phase.tasks) {
            for (const task of phase.tasks) {
              await client.query(
                `INSERT INTO template_tasks (id, phase_id, name, order_index, default_duration, description, is_milestone)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [uuidv4(), phaseId, task.name, task.orderIndex, task.defaultDuration, task.description ?? null, task.isMilestone ?? false]
              );
            }
          }
        }
      }

      logger.info(`Template created: ${data.name} (${data.code})`);
      return this.getById(templateId);
    });
  }

  async update(id: string, data: UpdateTemplateInput) {
    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) { updates.push(`name = $${params.length + 1}`); params.push(data.name); }
    if (data.description !== undefined) { updates.push(`description = $${params.length + 1}`); params.push(data.description); }
    if (data.isActive !== undefined) { updates.push(`is_active = $${params.length + 1}`); params.push(data.isActive); }

    if (updates.length === 0) return this.getById(id);

    params.push(id);
    await execute(
      `UPDATE migration_templates SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
      params
    );

    return this.getById(id);
  }

  async delete(id: string) {
    await execute(`DELETE FROM migration_templates WHERE id = $1`, [id]);
    logger.info(`Template deleted: ${id}`);
  }

  async addPhase(templateId: string, data: { name: string; orderIndex: number; defaultDuration: number; description?: string }) {
    const phaseId = uuidv4();
    await execute(
      `INSERT INTO template_phases (id, template_id, name, order_index, default_duration, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [phaseId, templateId, data.name, data.orderIndex, data.defaultDuration, data.description ?? null]
    );

    const result = await query(`SELECT * FROM template_phases WHERE id = $1`, [phaseId]);
    return {
      id: result.rows[0].id,
      templateId: result.rows[0].template_id,
      name: result.rows[0].name,
      orderIndex: result.rows[0].order_index,
      defaultDuration: result.rows[0].default_duration,
      description: result.rows[0].description,
      tasks: [],
    };
  }

  async updatePhase(phaseId: string, data: { name?: string; orderIndex?: number; defaultDuration?: number; description?: string }) {
    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) { updates.push(`name = $${params.length + 1}`); params.push(data.name); }
    if (data.orderIndex !== undefined) { updates.push(`order_index = $${params.length + 1}`); params.push(data.orderIndex); }
    if (data.defaultDuration !== undefined) { updates.push(`default_duration = $${params.length + 1}`); params.push(data.defaultDuration); }
    if (data.description !== undefined) { updates.push(`description = $${params.length + 1}`); params.push(data.description); }

    if (updates.length > 0) {
      params.push(phaseId);
      await execute(
        `UPDATE template_phases SET ${updates.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    const result = await query(`SELECT * FROM template_phases WHERE id = $1`, [phaseId]);
    const tasksResult = await query(
      `SELECT * FROM template_tasks WHERE phase_id = $1 ORDER BY order_index ASC`,
      [phaseId]
    );

    return {
      id: result.rows[0].id,
      templateId: result.rows[0].template_id,
      name: result.rows[0].name,
      orderIndex: result.rows[0].order_index,
      defaultDuration: result.rows[0].default_duration,
      description: result.rows[0].description,
      tasks: tasksResult.rows.map(mapTaskRow),
    };
  }

  async deletePhase(phaseId: string) {
    await execute(`DELETE FROM template_phases WHERE id = $1`, [phaseId]);
  }

  async addTask(phaseId: string, data: { name: string; orderIndex: number; defaultDuration: number; description?: string; isMilestone?: boolean }) {
    const taskId = uuidv4();
    await execute(
      `INSERT INTO template_tasks (id, phase_id, name, order_index, default_duration, description, is_milestone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [taskId, phaseId, data.name, data.orderIndex, data.defaultDuration, data.description ?? null, data.isMilestone ?? false]
    );

    const result = await query(`SELECT * FROM template_tasks WHERE id = $1`, [taskId]);
    return mapTaskRow(result.rows[0]);
  }

  async updateTask(taskId: string, data: { name?: string; orderIndex?: number; defaultDuration?: number; description?: string; isMilestone?: boolean }) {
    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) { updates.push(`name = $${params.length + 1}`); params.push(data.name); }
    if (data.orderIndex !== undefined) { updates.push(`order_index = $${params.length + 1}`); params.push(data.orderIndex); }
    if (data.defaultDuration !== undefined) { updates.push(`default_duration = $${params.length + 1}`); params.push(data.defaultDuration); }
    if (data.description !== undefined) { updates.push(`description = $${params.length + 1}`); params.push(data.description); }
    if (data.isMilestone !== undefined) { updates.push(`is_milestone = $${params.length + 1}`); params.push(data.isMilestone); }

    if (updates.length > 0) {
      params.push(taskId);
      await execute(
        `UPDATE template_tasks SET ${updates.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    const result = await query(`SELECT * FROM template_tasks WHERE id = $1`, [taskId]);
    return mapTaskRow(result.rows[0]);
  }

  async deleteTask(taskId: string) {
    await execute(`DELETE FROM template_tasks WHERE id = $1`, [taskId]);
  }

  async seedDefaultTemplates() {
    const existingResult = await query(`SELECT COUNT(*) as count FROM migration_templates`);
    if (parseInt(existingResult.rows[0].count || 0) > 0) {
      logger.info('Templates already exist, skipping seed');
      return;
    }
    logger.info('No default templates to seed');
  }
}

export const templateService = new TemplateService();
