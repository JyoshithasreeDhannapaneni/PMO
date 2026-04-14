import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

interface UploadFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  entityType?: string;
  entityId?: string;
  uploadedBy?: string;
}

class FileUploadService {
  private generateFilename(originalName: string): string {
    const ext = path.extname(originalName);
    const randomName = randomBytes(16).toString('hex');
    return `${randomName}${ext}`;
  }

  async upload(data: UploadFileInput) {
    const filename = this.generateFilename(data.originalName);
    const filePath = path.join(UPLOAD_DIR, filename);

    // Write file to disk
    fs.writeFileSync(filePath, data.buffer);

    // Save metadata to database
    const fileRecord = await prisma.fileUpload.create({
      data: {
        filename,
        originalName: data.originalName,
        mimeType: data.mimeType,
        size: data.buffer.length,
        path: filePath,
        entityType: data.entityType,
        entityId: data.entityId,
        uploadedBy: data.uploadedBy,
      },
    });

    logger.info(`File uploaded: ${fileRecord.id} - ${data.originalName}`);
    return fileRecord;
  }

  async getById(id: string) {
    return prisma.fileUpload.findUnique({ where: { id } });
  }

  async getByEntity(entityType: string, entityId: string) {
    return prisma.fileUpload.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async delete(id: string) {
    const file = await prisma.fileUpload.findUnique({ where: { id } });
    
    if (!file) {
      throw new Error('File not found');
    }

    // Delete physical file
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    // Delete database record
    await prisma.fileUpload.delete({ where: { id } });
    logger.info(`File deleted: ${id}`);
  }

  getFilePath(filename: string): string {
    return path.join(UPLOAD_DIR, filename);
  }

  async getStats() {
    const files = await prisma.fileUpload.findMany();
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    
    return {
      totalFiles: files.length,
      totalSize,
      totalSizeFormatted: this.formatBytes(totalSize),
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export const fileUploadService = new FileUploadService();
