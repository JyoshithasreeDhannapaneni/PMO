import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { callTranscriptService, ExternalOrganizerError } from '../services/callTranscriptService';
import { transcriptGradingService } from '../services/transcriptGradingService';
import type { UserCallHygiene, HeldCustomerCall } from '../services/callHygieneService';

// Small fixed batch size — same concurrency pattern already used in callHygieneService.ts
// for Graph calendar/mailbox calls, not a new rate-limiting library. See Performance
// review #1 in the 2026-08-15 eng review.
const BATCH_SIZE = 4;

// Ratings older than the hygiene window (30 days) plus a grace period are pruned —
// call_transcript_ratings has no equivalent to call_hygiene_cache's prune-to-5 today,
// and this job is what changes its growth pattern from occasional admin clicks to nightly
// automated writes.
const RETENTION_DAYS = 37;

type GradeOutcome = 'graded' | 'excluded';

async function gradeOneCall(
  call: HeldCustomerCall,
  userEmail: string,
  userName: string
): Promise<GradeOutcome> {
  try {
    const cues = await callTranscriptService.getTranscriptCues(call.organizerEmail, call.joinUrl!);
    const rating = await transcriptGradingService.gradeTranscript({
      cues,
      internalUserName: userName,
      internalUserEmail: userEmail,
      customerNames: call.customerAttendees.map(a => a.name || a.email),
      subject: call.subject,
    });
    await execute(
      `INSERT INTO call_transcript_ratings (event_id, user_email, user_name, subject, meeting_start, rating, status, rated_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'graded', 'system:callGradingJob')
       ON CONFLICT (event_id, user_email) DO NOTHING`,
      [call.eventId, userEmail, userName, call.subject, call.start, JSON.stringify(rating)]
    );
    return 'graded';
  } catch (err) {
    if (err instanceof ExternalOrganizerError) {
      // Permanent exclusion, not a failure — never retried on later cycles.
      await execute(
        `INSERT INTO call_transcript_ratings (event_id, user_email, user_name, subject, meeting_start, rating, status, na_reason, rated_by)
         VALUES ($1, $2, $3, $4, $5, '{}', 'excluded', 'external_organizer', 'system:callGradingJob')
         ON CONFLICT (event_id, user_email) DO NOTHING`,
        [call.eventId, userEmail, userName, call.subject, call.start]
      );
      return 'excluded';
    }
    // A real failure (Graph 403, no transcript generated, OpenAI error, etc.) — deliberately
    // NOT persisted, so the next cycle retries it. Caller logs this via Promise.allSettled,
    // matching the Promise.allSettled + logger.error pattern already established in
    // callHygieneService.ts rather than a silent .catch(() => emptyValue).
    throw err;
  }
}

async function pruneOldRatings(): Promise<number> {
  const result = await execute(
    `DELETE FROM call_transcript_ratings WHERE meeting_start < NOW() - INTERVAL '${RETENTION_DAYS} days'`
  );
  return result.rowCount ?? 0;
}

export const callGradingJob = {
  async run(): Promise<void> {
    const cacheRow = await query(`SELECT metrics FROM call_hygiene_cache ORDER BY computed_at DESC LIMIT 1`);
    if (cacheRow.rows.length === 0) {
      logger.info('[CallGradingJob] No call_hygiene_cache row yet — skipping this cycle, will pick up once a hygiene refresh runs.');
      return;
    }

    const allUsers = cacheRow.rows[0].metrics as UserCallHygiene[];
    let gradedCount = 0, excludedCount = 0, failedCount = 0, alreadyHandled = 0;

    for (const user of allUsers) {
      const gradableCalls = (user.calls ?? []).filter(c => !!c.joinUrl);
      if (gradableCalls.length === 0) continue;

      const eventIds = gradableCalls.map(c => c.eventId);
      const existing = await query(
        `SELECT event_id FROM call_transcript_ratings WHERE event_id = ANY($1) AND user_email = $2`,
        [eventIds, user.userEmail]
      );
      const handledIds = new Set((existing.rows as Array<{ event_id: string }>).map(r => r.event_id));
      const toGrade = gradableCalls.filter(c => !handledIds.has(c.eventId));
      alreadyHandled += gradableCalls.length - toGrade.length;

      for (let i = 0; i < toGrade.length; i += BATCH_SIZE) {
        const batch = toGrade.slice(i, i + BATCH_SIZE);
        const settled = await Promise.allSettled(
          batch.map(call => gradeOneCall(call, user.userEmail, user.userName))
        );
        for (const r of settled) {
          if (r.status === 'fulfilled') {
            if (r.value === 'graded') gradedCount++;
            else excludedCount++;
          } else {
            failedCount++;
            logger.error(`[CallGradingJob] Failed to grade a call for ${user.userEmail}:`, r.reason);
          }
        }
      }
    }

    const pruned = await pruneOldRatings();

    logger.info(
      `[CallGradingJob] Cycle complete — graded=${gradedCount} excluded=${excludedCount} ` +
      `failed=${failedCount} alreadyHandled=${alreadyHandled} pruned=${pruned}`
    );
  },
};
