import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

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

    fs.writeFileSync(filePath, data.buffer);

    const fileId = uuidv4();
    await execute(
      `INSERT INTO file_uploads (id, filename, original_name, mime_type, size, path, entity_type, entity_id, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fileId, filename, data.originalName, data.mimeType, data.buffer.length, filePath, data.entityType, data.entityId, data.uploadedBy]
    );

    const result = await query(`SELECT * FROM file_uploads WHERE id = ?`, [fileId]);
    const fileRecord = result.rows[0];
    logger.info(`File uploaded: ${fileRecord.id} - ${data.originalName}`);
    
    return {
      id: fileRecord.id,
      filename: fileRecord.filename,
      originalName: fileRecord.original_name,
      mimeType: fileRecord.mime_type,
      size: fileRecord.size,
      path: fileRecord.path,
      entityType: fileRecord.entity_type,
      entityId: fileRecord.entity_id,
      uploadedBy: fileRecord.uploaded_by,
      createdAt: fileRecord.created_at,
    };
  }

  async getById(id: string) {
    const result = await query(`SELECT * FROM file_uploads WHERE id = $1`, [id]);
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      id: row.id,
      filename: row.filename,
      originalName: row.original_name,
      mimeType: row.mime_type,
      size: row.size,
      path: row.path,
      entityType: row.entity_type,
      entityId: row.entity_id,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
    };
  }

  async getByEntity(entityType: string, entityId: string) {
    const result = await query(
      `SELECT * FROM file_uploads WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC`,
      [entityType, entityId]
    );
    
    return result.rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      originalName: row.original_name,
      mimeType: row.mime_type,
      size: row.size,
      path: row.path,
      entityType: row.entity_type,
      entityId: row.entity_id,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
    }));
  }

  async delete(id: string) {
    const result = await query(`SELECT * FROM file_uploads WHERE id = $1`, [id]);
    
    if (result.rows.length === 0) {
      throw new Error('File not found');
    }

    const file = result.rows[0];

    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    await query(`DELETE FROM file_uploads WHERE id = $1`, [id]);
    logger.info(`File deleted: ${id}`);
  }

  getFilePath(filename: string): string {
    return path.join(UPLOAD_DIR, filename);
  }

  async getStats() {
    const result = await query(`SELECT * FROM file_uploads`);
    const files = result.rows;
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
