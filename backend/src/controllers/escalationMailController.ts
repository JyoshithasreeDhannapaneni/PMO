import { Request, Response } from 'express';
import * as fs from 'fs';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import {
  escalationMailService,
  ISSUE_TYPES,
  ESCALATION_OWNERS,
} from '../services/escalationMailService';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB per image (videos allowed up to the route limit)

export const escalationMailController = {
  // Screenshots / screen-recordings attached as evidence to an escalation.
  // multer has already written the files to disk; we validate and return URLs
  // so the client can attach them on the subsequent save call.
  uploadMedia: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) throw new AppError('No files uploaded.', 400);

    const oversizedImage = files.find((f) => !f.mimetype.startsWith('video/') && f.size > MAX_IMAGE_BYTES);
    if (oversizedImage) {
      for (const f of files) { try { fs.unlinkSync(f.path); } catch { /* ignore */ } }
      throw new AppError(`"${oversizedImage.originalname}" is larger than 10MB — images must be 10MB or smaller.`, 400);
    }

    const data = files.map((f) => ({
      url: `/uploads/escalation-media/${f.filename}`,
      type: f.mimetype.startsWith('video/') ? ('video' as const) : ('image' as const),
      name: f.originalname,
    }));
    res.json({ success: true, data });
  }),

  getAll: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { owner, issueType, status } = req.query as Record<string, string | undefined>;
    const data = await escalationMailService.getAll({ owner, issueType, status });
    res.json({ success: true, data });
  }),

  getStats: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await escalationMailService.getStats();
    res.json({ success: true, data });
  }),

  getConfig: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const routing = await escalationMailService.getRoutingMap();
    res.json({ success: true, data: { issueTypes: ISSUE_TYPES, owners: ESCALATION_OWNERS, routing } });
  }),

  // Parse an uploaded/pasted mail into a draft record for review (no persistence).
  parse: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    let raw = (req.body?.rawMail as string) || '';
    let raisedVia = 'Email';

    if (req.file?.buffer) {
      const extracted = await escalationMailService.extractText(req.file.buffer, req.file.originalname || '');
      raw = extracted.text;
      raisedVia = extracted.via;
      if (!raw.trim()) {
        const name = (req.file.originalname || '').toLowerCase();
        if (name.endsWith('.doc')) {
          throw new AppError('Legacy .doc files are not supported. Please save as .docx or PDF and re-upload.', 400);
        }
        throw new AppError('Could not read any text from this file. If it is a scanned/image PDF, paste the text instead.', 400);
      }
    }

    if (!raw.trim()) throw new AppError('No content provided. Upload a .eml/.msg/.pdf/.docx file or paste the text.', 400);
    const draft = await escalationMailService.draftFromMail(raw, raisedVia);
    res.json({ success: true, data: draft });
  }),

  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { leaderName, customerName, issueSummary } = req.body || {};
    if (!leaderName || !customerName) {
      throw new AppError('leaderName and customerName are required.', 400);
    }
    const record = await escalationMailService.create({
      leaderName,
      customerName,
      issueSummary: issueSummary || '',
      projectManager: req.body.projectManager,
      issueType: req.body.issueType,
      raisedBy: req.body.raisedBy,
      raisedVia: req.body.raisedVia,
      receivedAt: req.body.receivedAt,
      rawMail: req.body.rawMail,
      escalationOwner: req.body.escalationOwner,
      status: req.body.status,
      attachments: Array.isArray(req.body.attachments) ? req.body.attachments : [],
    });
    res.status(201).json({ success: true, data: record });
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { status } = req.body || {};
    if (!status) throw new AppError('status is required.', 400);
    const record = await escalationMailService.updateStatus(req.params.id, status);
    if (!record) throw new AppError('Escalation not found.', 404);
    res.json({ success: true, data: record });
  }),

  updateOwner: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { escalationOwner } = req.body || {};
    if (!escalationOwner) throw new AppError('escalationOwner is required.', 400);
    const record = await escalationMailService.updateOwner(req.params.id, escalationOwner);
    if (!record) throw new AppError('Escalation not found.', 404);
    res.json({ success: true, data: record });
  }),

  // Close an escalation with an explicit resolved date (required), RCA text and
  // RCA documents (both optional).
  resolve: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { resolvedAt, rca, rcaDocs } = req.body || {};
    if (!resolvedAt) throw new AppError('resolvedAt is required to resolve an escalation.', 400);
    let record;
    try {
      record = await escalationMailService.resolve(req.params.id, resolvedAt, rca || '', Array.isArray(rcaDocs) ? rcaDocs : undefined);
    } catch {
      throw new AppError('resolvedAt is not a valid date.', 400);
    }
    if (!record) throw new AppError('Escalation not found.', 404);
    res.json({ success: true, data: record });
  }),

  // Edit resolution details later (resolved date, RCA text, and/or RCA docs).
  updateResolution: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { resolvedAt, rca, rcaDocs } = req.body || {};
    let record;
    try {
      record = await escalationMailService.updateResolution(req.params.id, resolvedAt, rca, Array.isArray(rcaDocs) ? rcaDocs : undefined);
    } catch {
      throw new AppError('resolvedAt is not a valid date.', 400);
    }
    if (!record) throw new AppError('Escalation not found.', 404);
    res.json({ success: true, data: record });
  }),

  // Upload RCA document(s) — PDF/Word/Excel/images. Returns URLs to attach on resolve.
  uploadRcaDoc: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) throw new AppError('No files uploaded.', 400);
    const data = files.map((f) => ({
      url: `/uploads/escalation-media/${f.filename}`,
      name: f.originalname,
    }));
    res.json({ success: true, data });
  }),

  updateReceivedAt: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { receivedAt } = req.body || {};
    if (!receivedAt) throw new AppError('receivedAt is required.', 400);
    let record;
    try {
      record = await escalationMailService.updateReceivedAt(req.params.id, receivedAt);
    } catch {
      throw new AppError('receivedAt is not a valid date.', 400);
    }
    if (!record) throw new AppError('Escalation not found.', 404);
    res.json({ success: true, data: record });
  }),

  delete: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await escalationMailService.delete(req.params.id);
    res.json({ success: true, message: 'Escalation deleted.' });
  }),
};
