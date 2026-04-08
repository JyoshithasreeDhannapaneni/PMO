import { prisma } from '../config/database';
import { ChangeType, ChangeRequestStatus, Priority } from '@prisma/client';
import { logger } from '../utils/logger';

interface CreateChangeRequestInput {
  projectId: string;
  title: string;
  description: string;
  changeType?: ChangeType;
  priority?: Priority;
  impact?: string;
  justification?: string;
  requestedBy: string;
  costImpact?: number;
  scheduleImpact?: number;
}

interface UpdateChangeRequestInput {
  title?: string;
  description?: string;
  changeType?: ChangeType;
  priority?: Priority;
  status?: ChangeRequestStatus;
  impact?: string;
  justification?: string;
  costImpact?: number;
  scheduleImpact?: number;
}

class ChangeRequestService {
  async getByProject(projectId: string) {
    return prisma.changeRequest.findMany({
      where: { projectId },
      orderBy: [
        { status: 'asc' },
        { priority: 'desc' },
        { requestedDate: 'desc' },
      ],
    });
  }

  async getById(id: string) {
    return prisma.changeRequest.findUnique({
      where: { id },
      include: { project: true },
    });
  }

  async getPending() {
    return prisma.changeRequest.findMany({
      where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } },
      include: { project: { select: { id: true, name: true, customerName: true } } },
      orderBy: [
        { priority: 'desc' },
        { requestedDate: 'asc' },
      ],
    });
  }

  async create(data: CreateChangeRequestInput) {
    const cr = await prisma.changeRequest.create({
      data: {
        projectId: data.projectId,
        title: data.title,
        description: data.description,
        changeType: data.changeType || 'SCOPE',
        priority: data.priority || 'MEDIUM',
        status: 'PENDING',
        impact: data.impact,
        justification: data.justification,
        requestedBy: data.requestedBy,
        requestedDate: new Date(),
        costImpact: data.costImpact,
        scheduleImpact: data.scheduleImpact,
      },
    });

    logger.info(`Change request created: ${cr.id} for project ${data.projectId}`);
    return cr;
  }

  async update(id: string, data: UpdateChangeRequestInput) {
    const cr = await prisma.changeRequest.update({
      where: { id },
      data,
    });

    logger.info(`Change request updated: ${cr.id}`);
    return cr;
  }

  async review(id: string, reviewedBy: string) {
    const cr = await prisma.changeRequest.update({
      where: { id },
      data: {
        status: 'UNDER_REVIEW',
        reviewedBy,
        reviewedDate: new Date(),
      },
    });

    logger.info(`Change request under review: ${cr.id}`);
    return cr;
  }

  async approve(id: string, approvedBy: string) {
    const cr = await prisma.changeRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy,
        approvedDate: new Date(),
      },
    });

    logger.info(`Change request approved: ${cr.id}`);
    return cr;
  }

  async reject(id: string, reviewedBy: string) {
    const cr = await prisma.changeRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedBy,
        reviewedDate: new Date(),
      },
    });

    logger.info(`Change request rejected: ${cr.id}`);
    return cr;
  }

  async implement(id: string) {
    const cr = await prisma.changeRequest.update({
      where: { id },
      data: { status: 'IMPLEMENTED' },
    });

    logger.info(`Change request implemented: ${cr.id}`);
    return cr;
  }

  async delete(id: string) {
    await prisma.changeRequest.delete({ where: { id } });
    logger.info(`Change request deleted: ${id}`);
  }

  async getSummary(projectId: string) {
    const [total, pending, approved, rejected, implemented] = await Promise.all([
      prisma.changeRequest.count({ where: { projectId } }),
      prisma.changeRequest.count({ where: { projectId, status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
      prisma.changeRequest.count({ where: { projectId, status: 'APPROVED' } }),
      prisma.changeRequest.count({ where: { projectId, status: 'REJECTED' } }),
      prisma.changeRequest.count({ where: { projectId, status: 'IMPLEMENTED' } }),
    ]);

    return { total, pending, approved, rejected, implemented };
  }
}

export const changeRequestService = new ChangeRequestService();
