import { prisma } from '../config/database';
import { CaseStudy, CaseStudyStatus } from 'pg';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export interface CreateCaseStudyDTO {
  projectId: string;
  title?: string;
  content?: string;
  status?: CaseStudyStatus;
}

export interface UpdateCaseStudyDTO {
  title?: string;
  content?: string;
  status?: CaseStudyStatus;
}

class CaseStudyService {
  /**
   * Get all case studies with optional filtering
   */
  async getAll(status?: CaseStudyStatus): Promise<CaseStudy[]> {
    const where = status ? { status } : {};
    
    return prisma.caseStudy.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            customerName: true,
            projectManager: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a case study by ID
   */
  async getById(id: string): Promise<CaseStudy> {
    const caseStudy = await prisma.caseStudy.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            customerName: true,
            projectManager: true,
            accountManager: true,
            plannedStart: true,
            plannedEnd: true,
            actualStart: true,
            actualEnd: true,
            sourcePlatform: true,
            targetPlatform: true,
            migrationTypes: true,
          },
        },
      },
    });

    if (!caseStudy) {
      throw new AppError('Case study not found', 404);
    }

    return caseStudy;
  }

  /**
   * Get case study by project ID
   */
  async getByProjectId(projectId: string): Promise<CaseStudy | null> {
    return prisma.caseStudy.findUnique({
      where: { projectId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            customerName: true,
          },
        },
      },
    });
  }

  /**
   * Create a new case study
   */
  async create(data: CreateCaseStudyDTO): Promise<CaseStudy> {
    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    // Check if case study already exists for this project
    const existing = await prisma.caseStudy.findUnique({
      where: { projectId: data.projectId },
    });

    if (existing) {
      throw new AppError('Case study already exists for this project', 400);
    }

    const caseStudy = await prisma.caseStudy.create({
      data: {
        projectId: data.projectId,
        title: data.title || `Case Study: ${project.name}`,
        content: data.content,
        status: data.status || 'PENDING',
      },
    });

    logger.info(`Case study created: ${caseStudy.id} for project ${data.projectId}`);
    return caseStudy;
  }

  /**
   * Update a case study
   */
  async update(id: string, data: UpdateCaseStudyDTO): Promise<CaseStudy> {
    const existing = await prisma.caseStudy.findUnique({ where: { id } });
    
    if (!existing) {
      throw new AppError('Case study not found', 404);
    }

    const updateData: any = { ...data };

    // Set published date when status changes to PUBLISHED
    if (data.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
      updateData.publishedAt = new Date();
    }

    const caseStudy = await prisma.caseStudy.update({
      where: { id },
      data: updateData,
    });

    logger.info(`Case study updated: ${caseStudy.id}`);
    return caseStudy;
  }

  /**
   * Delete a case study
   */
  async delete(id: string): Promise<void> {
    const existing = await prisma.caseStudy.findUnique({ where: { id } });
    
    if (!existing) {
      throw new AppError('Case study not found', 404);
    }

    await prisma.caseStudy.delete({ where: { id } });
    logger.info(`Case study deleted: ${id}`);
  }

  /**
   * Get pending case studies count
   */
  async getPendingCount(): Promise<number> {
    return prisma.caseStudy.count({
      where: { status: 'PENDING' },
    });
  }
}

export const caseStudyService = new CaseStudyService();
