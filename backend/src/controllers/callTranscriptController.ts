import { Request, Response } from 'express';
import { z } from 'zod';
import { query, execute } from '../config/database';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { callTranscriptService } from '../services/callTranscriptService';
import { transcriptGradingService } from '../services/transcriptGradingService';
import { logger } from '../utils/logger';

const rateSchema = z.object({
  eventId: z.string().min(1),
  subject: z.string().optional().default(''),
  meetingStart: z.string().optional().nullable(),
  organizerEmail: z.string().email(),
  joinUrl: z.string().url(),
  internalUserEmail: z.string().email(),
  internalUserName: z.string().min(1),
  customerAttendees: z.array(z.object({ name: z.string(), email: z.string() })).optional().default([]),
});

export const callTranscriptController = {
  getRating: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const eventId = String(req.query.eventId || '');
    const userEmail = String(req.query.userEmail || '');
    if (!eventId || !userEmail) {
      throw new AppError('eventId and userEmail are required', 400);
    }
    const result = await query(
      `SELECT * FROM call_transcript_ratings WHERE event_id = $1 AND user_email = $2`,
      [eventId, userEmail]
    );
    res.json({ success: true, data: result.rows[0] ?? null });
  }),

  rate: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const parsed = rateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues.map(i => i.message).join('; '), 400);
    }
    const data = parsed.data;

    if (!callTranscriptService.isConfigured()) {
      throw new AppError('Microsoft Graph is not configured on the server (MS_GRAPH_* env vars missing).', 400);
    }
    if (!transcriptGradingService.isConfigured()) {
      throw new AppError('OpenAI is not configured on the server (OPENAI_API_KEY missing).', 400);
    }

    const cues = await callTranscriptService.getTranscriptCues(data.organizerEmail, data.joinUrl);

    const rating = await transcriptGradingService.gradeTranscript({
      cues,
      internalUserName: data.internalUserName,
      internalUserEmail: data.internalUserEmail,
      customerNames: data.customerAttendees.map(a => a.name || a.email),
      subject: data.subject,
    });

    const ratedBy = (req as any).user?.email ?? null;
    await execute(
      // status/na_reason explicitly forced to 'graded'/NULL on both insert and update — a
      // manual, successful grade is always authoritative and must override any stale
      // 'excluded' status the automated callGradingJob may have left behind (e.g. if a call
      // it flagged as externally-organized is manually re-graded here).
      `INSERT INTO call_transcript_ratings (event_id, user_email, user_name, subject, meeting_start, rating, status, na_reason, rated_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'graded', NULL, $7)
       ON CONFLICT (event_id, user_email)
       DO UPDATE SET rating = $6, subject = $4, meeting_start = $5, rated_by = $7, status = 'graded', na_reason = NULL, created_at = NOW()`,
      [data.eventId, data.internalUserEmail, data.internalUserName, data.subject, data.meetingStart, JSON.stringify(rating), ratedBy]
    );

    logger.info(`Call transcript rated: ${data.internalUserEmail} for event ${data.eventId} — score ${rating.overallScore}`);
    res.json({ success: true, data: rating });
  }),
};
