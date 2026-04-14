import { prisma } from '../config/database';
import { logger } from '../utils/logger';

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

class TemplateService {
  async getAll() {
    return prisma.migrationTemplate.findMany({
      where: { isActive: true },
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
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string) {
    return prisma.migrationTemplate.findUnique({
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
      },
    });
  }

  async getByCode(code: string) {
    return prisma.migrationTemplate.findUnique({
      where: { code: code.toUpperCase() },
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
  }

  async create(data: CreateTemplateInput) {
    const template = await prisma.migrationTemplate.create({
      data: {
        name: data.name,
        code: data.code.toUpperCase(),
        description: data.description,
        phases: data.phases
          ? {
              create: data.phases.map((phase) => ({
                name: phase.name,
                orderIndex: phase.orderIndex,
                defaultDuration: phase.defaultDuration,
                description: phase.description,
                tasks: phase.tasks
                  ? {
                      create: phase.tasks.map((task) => ({
                        name: task.name,
                        orderIndex: task.orderIndex,
                        defaultDuration: task.defaultDuration,
                        description: task.description,
                        isMilestone: task.isMilestone || false,
                      })),
                    }
                  : undefined,
              })),
            }
          : undefined,
      },
      include: {
        phases: {
          include: {
            tasks: true,
          },
        },
      },
    });

    logger.info(`Template created: ${template.name} (${template.code})`);
    return template;
  }

  async update(id: string, data: UpdateTemplateInput) {
    return prisma.migrationTemplate.update({
      where: { id },
      data,
      include: {
        phases: {
          include: {
            tasks: true,
          },
        },
      },
    });
  }

  async delete(id: string) {
    await prisma.migrationTemplate.delete({
      where: { id },
    });
    logger.info(`Template deleted: ${id}`);
  }

  async addPhase(
    templateId: string,
    data: {
      name: string;
      orderIndex: number;
      defaultDuration: number;
      description?: string;
    }
  ) {
    return prisma.templatePhase.create({
      data: {
        templateId,
        ...data,
      },
      include: {
        tasks: true,
      },
    });
  }

  async updatePhase(
    phaseId: string,
    data: {
      name?: string;
      orderIndex?: number;
      defaultDuration?: number;
      description?: string;
    }
  ) {
    return prisma.templatePhase.update({
      where: { id: phaseId },
      data,
      include: {
        tasks: true,
      },
    });
  }

  async deletePhase(phaseId: string) {
    await prisma.templatePhase.delete({
      where: { id: phaseId },
    });
  }

  async addTask(
    phaseId: string,
    data: {
      name: string;
      orderIndex: number;
      defaultDuration: number;
      description?: string;
      isMilestone?: boolean;
    }
  ) {
    return prisma.templateTask.create({
      data: {
        phaseId,
        ...data,
      },
    });
  }

  async updateTask(
    taskId: string,
    data: {
      name?: string;
      orderIndex?: number;
      defaultDuration?: number;
      description?: string;
      isMilestone?: boolean;
    }
  ) {
    return prisma.templateTask.update({
      where: { id: taskId },
      data,
    });
  }

  async deleteTask(taskId: string) {
    await prisma.templateTask.delete({
      where: { id: taskId },
    });
  }

  async seedDefaultTemplates() {
    const existingTemplates = await prisma.migrationTemplate.count();
    if (existingTemplates > 0) {
      logger.info('Templates already exist, skipping seed');
      return;
    }

    logger.info('Seeding default migration templates...');

    // Content Migration Template
    await this.create({
      name: 'Content Migration Template',
      code: 'CONTENT',
      description: 'Standard template for content migration projects (SharePoint, File Servers, etc.)',
      phases: [
        {
          name: 'Phase 1: Initiation',
          orderIndex: 0,
          defaultDuration: 7,
          description: 'Project kickoff and initial setup',
          tasks: [
            { name: 'Kick off call', orderIndex: 0, defaultDuration: 1, isMilestone: true },
            { name: 'Pre-requisites', orderIndex: 1, defaultDuration: 5 },
            { name: 'Access provisioning', orderIndex: 2, defaultDuration: 2 },
          ],
        },
        {
          name: 'Phase 2: Infrastructure Setup',
          orderIndex: 1,
          defaultDuration: 14,
          description: 'Server and environment configuration',
          tasks: [
            { name: 'Server Creation', orderIndex: 0, defaultDuration: 2 },
            { name: 'Server Sanity', orderIndex: 1, defaultDuration: 2 },
            { name: 'Cloud Adding', orderIndex: 2, defaultDuration: 3 },
            { name: 'User & Channel Mapping', orderIndex: 3, defaultDuration: 5 },
          ],
        },
        {
          name: 'Phase 3: Migration Execution',
          orderIndex: 2,
          defaultDuration: 21,
          description: 'Actual data migration',
          tasks: [
            { name: 'Pilot Migration', orderIndex: 0, defaultDuration: 5, isMilestone: true },
            { name: 'One Time Migration', orderIndex: 1, defaultDuration: 10 },
            { name: 'Delta Migration', orderIndex: 2, defaultDuration: 5 },
          ],
        },
        {
          name: 'Phase 4: Validation',
          orderIndex: 3,
          defaultDuration: 7,
          description: 'Post-migration validation',
          tasks: [
            { name: 'Data Validation', orderIndex: 0, defaultDuration: 3 },
            { name: 'User Acceptance Testing', orderIndex: 1, defaultDuration: 3 },
            { name: 'Final Validation', orderIndex: 2, defaultDuration: 1, isMilestone: true },
          ],
        },
        {
          name: 'Phase 5: Closure',
          orderIndex: 4,
          defaultDuration: 3,
          description: 'Project closure and handover',
          tasks: [
            { name: 'Documentation', orderIndex: 0, defaultDuration: 2 },
            { name: 'Project Closure', orderIndex: 1, defaultDuration: 1, isMilestone: true },
          ],
        },
      ],
    });

    // Email Migration Template
    await this.create({
      name: 'Email Migration Template',
      code: 'EMAIL',
      description: 'Standard template for email migration projects (Exchange, Gmail, etc.)',
      phases: [
        {
          name: 'Phase 1: Initiation',
          orderIndex: 0,
          defaultDuration: 5,
          description: 'Project kickoff and planning',
          tasks: [
            { name: 'Kick off call', orderIndex: 0, defaultDuration: 1, isMilestone: true },
            { name: 'Requirements gathering', orderIndex: 1, defaultDuration: 2 },
            { name: 'Migration planning', orderIndex: 2, defaultDuration: 2 },
          ],
        },
        {
          name: 'Phase 2: Pre-Migration Setup',
          orderIndex: 1,
          defaultDuration: 10,
          description: 'Environment preparation',
          tasks: [
            { name: 'Source environment assessment', orderIndex: 0, defaultDuration: 2 },
            { name: 'Target environment setup', orderIndex: 1, defaultDuration: 3 },
            { name: 'User provisioning', orderIndex: 2, defaultDuration: 3 },
            { name: 'Coexistence configuration', orderIndex: 3, defaultDuration: 2 },
          ],
        },
        {
          name: 'Phase 3: Migration Execution',
          orderIndex: 2,
          defaultDuration: 14,
          description: 'Mailbox migration',
          tasks: [
            { name: 'Pilot batch migration', orderIndex: 0, defaultDuration: 3, isMilestone: true },
            { name: 'Batch 1 migration', orderIndex: 1, defaultDuration: 3 },
            { name: 'Batch 2 migration', orderIndex: 2, defaultDuration: 3 },
            { name: 'Final batch migration', orderIndex: 3, defaultDuration: 3 },
            { name: 'Delta sync', orderIndex: 4, defaultDuration: 2 },
          ],
        },
        {
          name: 'Phase 4: Post-Migration',
          orderIndex: 3,
          defaultDuration: 7,
          description: 'Validation and cutover',
          tasks: [
            { name: 'Mail flow validation', orderIndex: 0, defaultDuration: 2 },
            { name: 'User validation', orderIndex: 1, defaultDuration: 2 },
            { name: 'MX record cutover', orderIndex: 2, defaultDuration: 1, isMilestone: true },
            { name: 'Decommission source', orderIndex: 3, defaultDuration: 2 },
          ],
        },
        {
          name: 'Phase 5: Closure',
          orderIndex: 4,
          defaultDuration: 3,
          description: 'Project closure',
          tasks: [
            { name: 'Documentation', orderIndex: 0, defaultDuration: 2 },
            { name: 'Project Closure', orderIndex: 1, defaultDuration: 1, isMilestone: true },
          ],
        },
      ],
    });

    // Messaging Migration Template
    await this.create({
      name: 'Messaging Migration Template',
      code: 'MESSAGING',
      description: 'Standard template for messaging migration projects (Slack to Teams, etc.)',
      phases: [
        {
          name: 'Phase 1: Initiation',
          orderIndex: 0,
          defaultDuration: 5,
          description: 'Project kickoff',
          tasks: [
            { name: 'Kick off call', orderIndex: 0, defaultDuration: 1, isMilestone: true },
            { name: 'Scope definition', orderIndex: 1, defaultDuration: 2 },
            { name: 'Channel inventory', orderIndex: 2, defaultDuration: 2 },
          ],
        },
        {
          name: 'Phase 2: Infrastructure Setup',
          orderIndex: 1,
          defaultDuration: 10,
          description: 'Environment configuration',
          tasks: [
            { name: 'Teams provisioning', orderIndex: 0, defaultDuration: 2 },
            { name: 'Channel mapping', orderIndex: 1, defaultDuration: 3 },
            { name: 'User mapping', orderIndex: 2, defaultDuration: 3 },
            { name: 'Bot/App migration planning', orderIndex: 3, defaultDuration: 2 },
          ],
        },
        {
          name: 'Phase 3: Migration Execution',
          orderIndex: 2,
          defaultDuration: 14,
          description: 'Data migration',
          tasks: [
            { name: 'Pilot channel migration', orderIndex: 0, defaultDuration: 3, isMilestone: true },
            { name: 'Public channels migration', orderIndex: 1, defaultDuration: 4 },
            { name: 'Private channels migration', orderIndex: 2, defaultDuration: 4 },
            { name: 'Direct messages migration', orderIndex: 3, defaultDuration: 3 },
          ],
        },
        {
          name: 'Phase 4: Validation',
          orderIndex: 3,
          defaultDuration: 5,
          description: 'Testing and validation',
          tasks: [
            { name: 'Content validation', orderIndex: 0, defaultDuration: 2 },
            { name: 'User acceptance testing', orderIndex: 1, defaultDuration: 2 },
            { name: 'Sign-off', orderIndex: 2, defaultDuration: 1, isMilestone: true },
          ],
        },
        {
          name: 'Phase 5: Closure',
          orderIndex: 4,
          defaultDuration: 3,
          description: 'Project closure',
          tasks: [
            { name: 'Training', orderIndex: 0, defaultDuration: 1 },
            { name: 'Documentation', orderIndex: 1, defaultDuration: 1 },
            { name: 'Project Closure', orderIndex: 2, defaultDuration: 1, isMilestone: true },
          ],
        },
      ],
    });

    logger.info('Default templates seeded successfully');
  }
}

export const templateService = new TemplateService();
