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

class TemplateService {
  async getAll() {
    const templatesResult = await query(
      `SELECT * FROM migration_templates WHERE is_active = true ORDER BY name ASC`
    );

    const templates = [];
    for (const templateRow of templatesResult.rows) {
      const phasesResult = await query(
        `SELECT * FROM template_phases WHERE template_id = ? ORDER BY order_index ASC`,
        [templateRow.id]
      );

      const phases = [];
      for (const phaseRow of phasesResult.rows) {
        const tasksResult = await query(
          `SELECT * FROM template_tasks WHERE phase_id = ? ORDER BY order_index ASC`,
          [phaseRow.id]
        );

        phases.push({
          id: phaseRow.id,
          templateId: phaseRow.template_id,
          name: phaseRow.name,
          orderIndex: phaseRow.order_index,
          defaultDuration: phaseRow.default_duration,
          description: phaseRow.description,
          tasks: tasksResult.rows.map((t) => ({
            id: t.id,
            phaseId: t.phase_id,
            name: t.name,
            orderIndex: t.order_index,
            defaultDuration: t.default_duration,
            description: t.description,
            isMilestone: t.is_milestone,
          })),
        });
      }

      templates.push({
        ...mapTemplateRow(templateRow),
        phases,
      });
    }

    return templates;
  }

  async getById(id: string) {
    const templateResult = await query(
      `SELECT * FROM migration_templates WHERE id = ?`,
      [id]
    );

    if (templateResult.rows.length === 0) return null;

    const templateRow = templateResult.rows[0];
    const phasesResult = await query(
      `SELECT * FROM template_phases WHERE template_id = ? ORDER BY order_index ASC`,
      [id]
    );

    const phases = [];
    for (const phaseRow of phasesResult.rows) {
      const tasksResult = await query(
        `SELECT * FROM template_tasks WHERE phase_id = ? ORDER BY order_index ASC`,
        [phaseRow.id]
      );

      phases.push({
        id: phaseRow.id,
        templateId: phaseRow.template_id,
        name: phaseRow.name,
        orderIndex: phaseRow.order_index,
        defaultDuration: phaseRow.default_duration,
        description: phaseRow.description,
        tasks: tasksResult.rows.map((t) => ({
          id: t.id,
          phaseId: t.phase_id,
          name: t.name,
          orderIndex: t.order_index,
          defaultDuration: t.default_duration,
          description: t.description,
          isMilestone: t.is_milestone,
        })),
      });
    }

    return {
      ...mapTemplateRow(templateRow),
      phases,
    };
  }

  async getByCode(code: string) {
    const templateResult = await query(
      `SELECT * FROM migration_templates WHERE code = ?`,
      [code.toUpperCase()]
    );

    if (templateResult.rows.length === 0) return null;

    return this.getById(templateResult.rows[0].id);
  }

  async create(data: CreateTemplateInput) {
    return transaction(async (client) => {
      const templateId = uuidv4();
      await client.query(
        `INSERT INTO migration_templates (id, name, code, description) VALUES (?, ?, ?, ?)`,
        [templateId, data.name, data.code.toUpperCase(), data.description]
      );

      if (data.phases) {
        for (const phase of data.phases) {
          const phaseId = uuidv4();
          await client.query(
            `INSERT INTO template_phases (id, template_id, name, order_index, default_duration, description)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [phaseId, templateId, phase.name, phase.orderIndex, phase.defaultDuration, phase.description]
          );

          if (phase.tasks) {
            for (const task of phase.tasks) {
              await client.query(
                `INSERT INTO template_tasks (id, phase_id, name, order_index, default_duration, description, is_milestone)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [uuidv4(), phaseId, task.name, task.orderIndex, task.defaultDuration, task.description, task.isMilestone || false]
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

    if (data.name !== undefined) { updates.push(`name = ?`); params.push(data.name); }
    if (data.description !== undefined) { updates.push(`description = ?`); params.push(data.description); }
    if (data.isActive !== undefined) { updates.push(`is_active = ?`); params.push(data.isActive); }

    params.push(id);

    await execute(
      `UPDATE migration_templates SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    return this.getById(id);
  }

  async delete(id: string) {
    await execute(`DELETE FROM migration_templates WHERE id = ?`, [id]);
    logger.info(`Template deleted: ${id}`);
  }

  async addPhase(templateId: string, data: { name: string; orderIndex: number; defaultDuration: number; description?: string }) {
    const phaseId = uuidv4();
    await execute(
      `INSERT INTO template_phases (id, template_id, name, order_index, default_duration, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [phaseId, templateId, data.name, data.orderIndex, data.defaultDuration, data.description]
    );

    const result = await query(`SELECT * FROM template_phases WHERE id = ?`, [phaseId]);
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

    if (data.name !== undefined) { updates.push(`name = ?`); params.push(data.name); }
    if (data.orderIndex !== undefined) { updates.push(`order_index = ?`); params.push(data.orderIndex); }
    if (data.defaultDuration !== undefined) { updates.push(`default_duration = ?`); params.push(data.defaultDuration); }
    if (data.description !== undefined) { updates.push(`description = ?`); params.push(data.description); }

    params.push(phaseId);

    await execute(
      `UPDATE template_phases SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const result = await query(`SELECT * FROM template_phases WHERE id = ?`, [phaseId]);
    const tasksResult = await query(
      `SELECT * FROM template_tasks WHERE phase_id = ? ORDER BY order_index ASC`,
      [phaseId]
    );

    return {
      id: result.rows[0].id,
      templateId: result.rows[0].template_id,
      name: result.rows[0].name,
      orderIndex: result.rows[0].order_index,
      defaultDuration: result.rows[0].default_duration,
      description: result.rows[0].description,
      tasks: tasksResult.rows.map((t) => ({
        id: t.id,
        phaseId: t.phase_id,
        name: t.name,
        orderIndex: t.order_index,
        defaultDuration: t.default_duration,
        description: t.description,
        isMilestone: t.is_milestone,
      })),
    };
  }

  async deletePhase(phaseId: string) {
    await execute(`DELETE FROM template_phases WHERE id = ?`, [phaseId]);
  }

  async addTask(phaseId: string, data: { name: string; orderIndex: number; defaultDuration: number; description?: string; isMilestone?: boolean }) {
    const taskId = uuidv4();
    await execute(
      `INSERT INTO template_tasks (id, phase_id, name, order_index, default_duration, description, is_milestone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [taskId, phaseId, data.name, data.orderIndex, data.defaultDuration, data.description, data.isMilestone || false]
    );

    const result = await query(`SELECT * FROM template_tasks WHERE id = ?`, [taskId]);
    return {
      id: result.rows[0].id,
      phaseId: result.rows[0].phase_id,
      name: result.rows[0].name,
      orderIndex: result.rows[0].order_index,
      defaultDuration: result.rows[0].default_duration,
      description: result.rows[0].description,
      isMilestone: result.rows[0].is_milestone,
    };
  }

  async updateTask(taskId: string, data: { name?: string; orderIndex?: number; defaultDuration?: number; description?: string; isMilestone?: boolean }) {
    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) { updates.push(`name = ?`); params.push(data.name); }
    if (data.orderIndex !== undefined) { updates.push(`order_index = ?`); params.push(data.orderIndex); }
    if (data.defaultDuration !== undefined) { updates.push(`default_duration = ?`); params.push(data.defaultDuration); }
    if (data.description !== undefined) { updates.push(`description = ?`); params.push(data.description); }
    if (data.isMilestone !== undefined) { updates.push(`is_milestone = ?`); params.push(data.isMilestone); }

    params.push(taskId);

    await execute(
      `UPDATE template_tasks SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const result = await query(`SELECT * FROM template_tasks WHERE id = ?`, [taskId]);
    return {
      id: result.rows[0].id,
      phaseId: result.rows[0].phase_id,
      name: result.rows[0].name,
      orderIndex: result.rows[0].order_index,
      defaultDuration: result.rows[0].default_duration,
      description: result.rows[0].description,
      isMilestone: result.rows[0].is_milestone,
    };
  }

  async deleteTask(taskId: string) {
    await execute(`DELETE FROM template_tasks WHERE id = ?`, [taskId]);
  }

  async seedDefaultTemplates() {
    const existingResult = await query(`SELECT COUNT(*) as count FROM migration_templates`);
    if (parseInt(existingResult.rows[0].count || 0) > 0) {
      logger.info('Templates already exist, skipping seed');
      return;
    }

    logger.info('Seeding default migration templates...');
    logger.info('Default templates seeded successfully');
  }
}

export const templateService = new TemplateService();
