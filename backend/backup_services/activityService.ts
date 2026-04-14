import { prisma } from '../config/database';
import { ActivityType } from 'pg';
import { logger } from '../utils/logger';

interface CreateActivityInput {
  userId?: string;
  type: ActivityType;
  entityType: string;
  entityId: string;
  entityName?: string;
  description: string;
  metadata?: any;
}

class ActivityService {
  async create(data: CreateActivityInput) {
    try {
      const activity = await prisma.activity.create({
        data: {
          userId: data.userId,
          type: data.type,
          entityType: data.entityType,
          entityId: data.entityId,
          entityName: data.entityName,
          description: data.description,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      });
      return activity;
    } catch (error) {
      logger.error('Failed to create activity:', error);
    }
  }

  async getAll(options: {
    page?: number;
    limit?: number;
    entityType?: string;
    entityId?: string;
  } = {}) {
    const { page = 1, limit = 50, entityType, entityId } = options;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.activity.count({ where }),
    ]);

    return {
      data: activities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getByEntity(entityType: string, entityId: string, limit = 20) {
    return prisma.activity.findMany({
      where: { entityType, entityId },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getRecentGlobal(limit = 30) {
    return prisma.activity.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getByUser(userId: string, limit = 30) {
    return prisma.activity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // Helper methods for common activities
  async logProjectCreated(userId: string, projectId: string, projectName: string) {
    return this.create({
      userId,
      type: 'PROJECT_CREATED',
      entityType: 'project',
      entityId: projectId,
      entityName: projectName,
      description: `created project "${projectName}"`,
    });
  }

  async logTaskCompleted(userId: string, taskId: string, taskName: string, projectName: string) {
    return this.create({
      userId,
      type: 'TASK_COMPLETED',
      entityType: 'task',
      entityId: taskId,
      entityName: taskName,
      description: `completed task "${taskName}" in ${projectName}`,
    });
  }

  async logCommentAdded(userId: string, entityType: string, entityId: string, entityName: string) {
    return this.create({
      userId,
      type: 'COMMENT_ADDED',
      entityType,
      entityId,
      entityName,
      description: `commented on ${entityType} "${entityName}"`,
    });
  }

  async logDocumentUploaded(userId: string, documentId: string, documentName: string, projectName: string) {
    return this.create({
      userId,
      type: 'DOCUMENT_UPLOADED',
      entityType: 'document',
      entityId: documentId,
      entityName: documentName,
      description: `uploaded document "${documentName}" to ${projectName}`,
    });
  }
}

export const activityService = new ActivityService();
