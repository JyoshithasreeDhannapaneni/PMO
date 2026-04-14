import { prisma } from '../config/database';
import { DocumentCategory } from 'pg';
import { logger } from '../utils/logger';

interface CreateDocumentInput {
  projectId: string;
  name: string;
  description?: string;
  category?: DocumentCategory;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  version?: string;
  uploadedBy?: string;
}

interface UpdateDocumentInput {
  name?: string;
  description?: string;
  category?: DocumentCategory;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  version?: string;
}

class DocumentService {
  async getByProject(projectId: string) {
    return prisma.projectDocument.findMany({
      where: { projectId },
      orderBy: [
        { category: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async getById(id: string) {
    return prisma.projectDocument.findUnique({
      where: { id },
      include: { project: true },
    });
  }

  async getByCategory(projectId: string, category: DocumentCategory) {
    return prisma.projectDocument.findMany({
      where: { projectId, category },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: CreateDocumentInput) {
    const doc = await prisma.projectDocument.create({
      data: {
        projectId: data.projectId,
        name: data.name,
        description: data.description,
        category: data.category || 'OTHER',
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        version: data.version || '1.0',
        uploadedBy: data.uploadedBy,
      },
    });

    logger.info(`Document created: ${doc.id} for project ${data.projectId}`);
    return doc;
  }

  async update(id: string, data: UpdateDocumentInput) {
    const doc = await prisma.projectDocument.update({
      where: { id },
      data,
    });

    logger.info(`Document updated: ${doc.id}`);
    return doc;
  }

  async delete(id: string) {
    await prisma.projectDocument.delete({ where: { id } });
    logger.info(`Document deleted: ${id}`);
  }

  async getSummary(projectId: string) {
    const docs = await prisma.projectDocument.findMany({
      where: { projectId },
    });

    const byCategory = docs.reduce((acc, d) => {
      acc[d.category] = (acc[d.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalSize = docs.reduce((sum, d) => sum + (d.fileSize || 0), 0);

    return {
      total: docs.length,
      byCategory,
      totalSize,
      totalSizeFormatted: formatBytes(totalSize),
    };
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export const documentService = new DocumentService();
