import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { query, execute } from '../config/db';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

export const templateCombinationController = {
  // GET /api/template-combinations
  getCombinations: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const result = await query(
      `SELECT id, migration_category, source_name, target_name, source_icon, target_icon, is_custom, created_at
       FROM template_combinations ORDER BY migration_category, created_at ASC`
    );
    res.json({ success: true, data: result.rows.map(mapCombo) });
  }),

  // POST /api/template-combinations
  createCombination: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { migrationCategory, sourceName, targetName, sourceIcon, targetIcon } = req.body;
    if (!migrationCategory || !sourceName || !targetName) {
      throw new AppError('migrationCategory, sourceName, and targetName are required', 400);
    }
    const result = await query(
      `INSERT INTO template_combinations (id, migration_category, source_name, target_name, source_icon, target_icon, is_custom)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *`,
      [uuidv4(), migrationCategory, sourceName, targetName, sourceIcon || '📂', targetIcon || '☁️']
    );
    res.status(201).json({ success: true, data: mapCombo(result.rows[0]) });
  }),

  // DELETE /api/template-combinations/:id
  deleteCombination: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await execute(`DELETE FROM template_combinations WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Combination deleted' });
  }),

  // GET /api/template-combinations/:id/documents
  getDocuments: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const result = await query(
      `SELECT id, combination_id, file_name, doc_type, file_size, mime_type, file_path, uploaded_by, created_at
       FROM template_combination_documents WHERE combination_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    res.json({ success: true, data: result.rows.map(mapDoc) });
  }),

  // POST /api/template-combinations/:id/documents
  uploadDocument: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { fileName, docType, fileData, mimeType, fileSize, uploadedBy } = req.body;
    if (!fileName || !fileData) throw new AppError('fileName and fileData are required', 400);

    const result = await query(
      `INSERT INTO template_combination_documents
         (id, combination_id, file_name, doc_type, file_size, mime_type, file_path, file_data, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8) RETURNING *`,
      [uuidv4(), id, fileName, docType || 'other', fileSize || null, mimeType || null, fileData, uploadedBy || null]
    );
    res.status(201).json({ success: true, data: mapDoc(result.rows[0]) });
  }),

  // PATCH /api/template-combinations/documents/:docId — rename
  renameDocument: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { docId } = req.params;
    const { fileName } = req.body;
    if (!fileName) throw new AppError('fileName is required', 400);
    await execute(`UPDATE template_combination_documents SET file_name = $1 WHERE id = $2`, [fileName, docId]);
    res.json({ success: true, message: 'Document renamed' });
  }),

  // DELETE /api/template-combinations/documents/:docId
  deleteDocument: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { docId } = req.params;
    await execute(`DELETE FROM template_combination_documents WHERE id = $1`, [docId]);
    res.json({ success: true, message: 'Document deleted' });
  }),

  // GET /api/template-combinations/documents/:docId/download
  downloadDocument: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { docId } = req.params;
    const result = await query(
      `SELECT file_name, mime_type, file_path, file_data FROM template_combination_documents WHERE id = $1`,
      [docId]
    );
    if (!result.rows[0]) throw new AppError('Document not found', 404);
    const { file_name, mime_type, file_path, file_data } = result.rows[0];

    if (file_data) {
      const buffer = Buffer.from(file_data, 'base64');
      res.setHeader('Content-Disposition', `attachment; filename="${file_name}"`);
      res.setHeader('Content-Type', mime_type || 'application/octet-stream');
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
      return;
    }

    // Legacy fallback for files uploaded before DB storage was implemented
    if (file_path) {
      const absPath = path.join(process.cwd(), file_path.replace(/^\//, ''));
      if (fs.existsSync(absPath)) {
        res.setHeader('Content-Disposition', `attachment; filename="${file_name}"`);
        res.setHeader('Content-Type', mime_type || 'application/octet-stream');
        res.sendFile(absPath);
        return;
      }
    }

    throw new AppError('File content not found. Please re-upload this document.', 404);
  }),
};

function mapCombo(r: any) {
  return {
    id: r.id,
    migrationCategory: r.migration_category,
    sourceName: r.source_name,
    targetName: r.target_name,
    sourceIcon: r.source_icon,
    targetIcon: r.target_icon,
    isCustom: r.is_custom,
    createdAt: r.created_at,
  };
}

function mapDoc(r: any) {
  return {
    id: r.id,
    combinationId: r.combination_id,
    fileName: r.file_name,
    docType: r.doc_type,
    fileSize: r.file_size,
    mimeType: r.mime_type,
    uploadedBy: r.uploaded_by,
    createdAt: r.created_at,
  };
}
