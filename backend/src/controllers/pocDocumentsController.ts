import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { query, execute } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

export const pocDocumentsController = {
  getAll: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const result = await query(
      `SELECT id, project_id, file_name, category, file_size, mime_type, file_path, uploaded_by, created_at
       FROM poc_documents WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId]
    );
    res.json({ success: true, data: result.rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      fileName: r.file_name,
      category: r.category,
      fileSize: r.file_size,
      mimeType: r.mime_type,
      filePath: r.file_path,
      uploadedBy: r.uploaded_by,
      createdAt: r.created_at,
    })) });
  }),

  upload: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const { fileName, category, fileData, mimeType, fileSize, uploadedBy } = req.body;

    const uploadsDir = path.join(process.cwd(), 'uploads', 'poc-documents');
    fs.mkdirSync(uploadsDir, { recursive: true });

    const ext = path.extname(fileName) || '';
    const savedName = `${uuidv4()}${ext}`;
    const filePath = path.join(uploadsDir, savedName);
    fs.writeFileSync(filePath, Buffer.from(fileData, 'base64'));

    const fileUrl = `/uploads/poc-documents/${savedName}`;

    await execute(
      `INSERT INTO poc_documents (id, project_id, file_name, category, file_size, mime_type, file_path, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [uuidv4(), projectId, fileName, category || 'MOM', fileSize || null, mimeType || null, fileUrl, uploadedBy || null]
    );

    res.json({ success: true, message: 'Document uploaded' });
  }),

  delete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { projectId, documentId } = req.params;
    const result = await query(
      `SELECT file_path FROM poc_documents WHERE id = $1 AND project_id = $2`,
      [documentId, projectId]
    );
    if (result.rows[0]?.file_path) {
      const filePath = path.join(process.cwd(), result.rows[0].file_path.replace(/^\//, ''));
      try { fs.unlinkSync(filePath); } catch {}
    }
    await execute(`DELETE FROM poc_documents WHERE id = $1 AND project_id = $2`, [documentId, projectId]);
    res.json({ success: true, message: 'Document deleted' });
  }),
};
