import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { activityService } from './activityService';

interface CreateCommentInput {
  userId: string;
  entityType: string;
  entityId: string;
  content: string;
  parentId?: string;
}

interface UpdateCommentInput {
  content: string;
}

class CommentService {
  async getByEntity(entityType: string, entityId: string) {
    const comments = await prisma.comment.findMany({
      where: { entityType, entityId, parentId: null },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        replies: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return comments;
  }

  async getById(id: string) {
    return prisma.comment.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        replies: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
        },
      },
    });
  }

  async create(data: CreateCommentInput) {
    const comment = await prisma.comment.create({
      data: {
        userId: data.userId,
        entityType: data.entityType,
        entityId: data.entityId,
        content: data.content,
        parentId: data.parentId,
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });

    // Log activity
    await activityService.logCommentAdded(
      data.userId,
      data.entityType,
      data.entityId,
      data.entityType
    );

    logger.info(`Comment created: ${comment.id} on ${data.entityType}/${data.entityId}`);
    return comment;
  }

  async update(id: string, userId: string, data: UpdateCommentInput) {
    const existing = await prisma.comment.findUnique({ where: { id } });
    
    if (!existing) {
      throw new Error('Comment not found');
    }
    
    if (existing.userId !== userId) {
      throw new Error('Not authorized to edit this comment');
    }

    const comment = await prisma.comment.update({
      where: { id },
      data: {
        content: data.content,
        isEdited: true,
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });

    logger.info(`Comment updated: ${comment.id}`);
    return comment;
  }

  async delete(id: string, userId: string, isAdmin = false) {
    const existing = await prisma.comment.findUnique({ where: { id } });
    
    if (!existing) {
      throw new Error('Comment not found');
    }
    
    if (existing.userId !== userId && !isAdmin) {
      throw new Error('Not authorized to delete this comment');
    }

    await prisma.comment.delete({ where: { id } });
    logger.info(`Comment deleted: ${id}`);
  }

  async getCount(entityType: string, entityId: string) {
    return prisma.comment.count({
      where: { entityType, entityId },
    });
  }

  async getRecentComments(limit = 10) {
    return prisma.comment.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

export const commentService = new CommentService();
