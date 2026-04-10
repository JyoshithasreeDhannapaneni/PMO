import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

type DocumentCategory = 'SOW' | 'CONTRACT' | 'REQUIREMENTS' | 'DESIGN' | 'TECHNICAL' | 'MEETING_NOTES' | 'STATUS_REPORT' | 'SIGN_OFF' | 'OTHER';

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

function mapDocumentRow(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    category: row.category,
    fileUrl: row.file_url,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    version: row.version,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class DocumentService {
  async getByProject(projectId: string) {
    const result = await query(
      `SELECT * FROM project_documents WHERE project_id = $1 ORDER BY category ASC, created_at DESC`,
      [projectId]
    );
    return result.rows.map(mapDocumentRow);
  }

  async getById(id: string) {
    const result = await query(
      `SELECT d.*, p.name as project_name
       FROM project_documents d
       JOIN projects p ON d.project_id = p.id
       WHERE d.id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      ...mapDocumentRow(row),
      project: { name: row.project_name },
    };
  }

  async getByCategory(projectId: string, category: DocumentCategory) {
    const result = await query(
      `SELECT * FROM project_documents WHERE project_id = $1 AND category = $2 ORDER BY created_at DESC`,
      [projectId, category]
    );
    return result.rows.map(mapDocumentRow);
  }

  async create(data: CreateDocumentInput) {
    const docId = uuidv4();
    await execute(
      `INSERT INTO project_documents (id, project_id, name, description, category, file_url, file_size, mime_type, version, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docId,
        data.projectId,
        data.name,
        data.description,
        data.category || 'OTHER',
        data.fileUrl,
        data.fileSize,
        data.mimeType,
        data.version || '1.0',
        data.uploadedBy,
      ]
    );

    const result = await query(`SELECT * FROM project_documents WHERE id = ?`, [docId]);
    const doc = mapDocumentRow(result.rows[0]);
    logger.info(`Document created: ${doc.id} for project ${data.projectId}`);
    return doc;
  }

  async update(id: string, data: UpdateDocumentInput) {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) { updates.push(`name = $${paramIndex++}`); params.push(data.name); }
    if (data.description !== undefined) { updates.push(`description = $${paramIndex++}`); params.push(data.description); }
    if (data.category !== undefined) { updates.push(`category = $${paramIndex++}`); params.push(data.category); }
    if (data.fileUrl !== undefined) { updates.push(`file_url = $${paramIndex++}`); params.push(data.fileUrl); }
    if (data.fileSize !== undefined) { updates.push(`file_size = $${paramIndex++}`); params.push(data.fileSize); }
    if (data.mimeType !== undefined) { updates.push(`mime_type = $${paramIndex++}`); params.push(data.mimeType); }
    if (data.version !== undefined) { updates.push(`version = $${paramIndex++}`); params.push(data.version); }

    params.push(id);

    await execute(
      `UPDATE project_documents SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const result = await query(`SELECT * FROM project_documents WHERE id = ?`, [id]);
    const doc = mapDocumentRow(result.rows[0]);
    logger.info(`Document updated: ${doc.id}`);
    return doc;
  }

  async delete(id: string) {
    await query(`DELETE FROM project_documents WHERE id = $1`, [id]);
    logger.info(`Document deleted: ${id}`);
  }

  async getSummary(projectId: string) {
    const result = await query(
      `SELECT * FROM project_documents WHERE project_id = $1`,
      [projectId]
    );

    const docs = result.rows;
    const byCategory = docs.reduce((acc, d) => {
      acc[d.category] = (acc[d.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalSize = docs.reduce((sum, d) => sum + (d.file_size || 0), 0);

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
