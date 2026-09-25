import Anthropic from '@anthropic-ai/sdk';
import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { notificationService } from './notificationService';

export type IncidentSource = 'uncaught_exception' | 'unhandled_rejection' | 'http_5xx' | 'process_crash';

export interface CaptureIncidentInput {
  source: IncidentSource;
  severity?: 'error' | 'fatal';
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  autoHealed?: boolean;
}

function isConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return !!key && !key.startsWith('PASTE_');
}

const MAX_STACK_CHARS = 4000;

export const selfHealService = {
  isConfigured,

  // Best-effort by design: called from process.on('uncaughtException'/'unhandledRejection')
  // right before the process exits (Node's own docs say the process is in an undefined
  // state after either and must not keep running), and from the Express error handler for
  // unexpected 5xx responses. Never throws -- a failure here must not mask or replace the
  // original crash/error, and in the crash path there may not be time for a slow write
  // anyway (the process is about to call process.exit()).
  async captureIncident(input: CaptureIncidentInput): Promise<void> {
    // Swallow-and-log here (rather than letting it reject) so that if the timeout below
    // wins the race, this promise settling afterward can never become a second unhandled
    // rejection on top of whatever we're already crashing from.
    const insert = execute(
      `INSERT INTO self_heal_incidents (source, severity, message, stack, context, auto_healed)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.source,
        input.severity ?? 'error',
        input.message.slice(0, 2000),
        input.stack ? input.stack.slice(0, MAX_STACK_CHARS) : null,
        JSON.stringify(input.context ?? {}),
        input.autoHealed ?? false,
      ]
    ).catch((err) => {
      logger.error('[SelfHeal] Failed to capture incident (best-effort, non-fatal):', err);
    });
    // Called from the uncaughtException/unhandledRejection handlers right before
    // process.exit() -- a hung DB query here must never delay that exit indefinitely, so
    // this races the insert against a hard timeout instead of just awaiting it.
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
    await Promise.race([insert, timeout]);
  },

  async getRecentIncidents(limit = 100): Promise<any[]> {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const result = await query(
      `SELECT * FROM self_heal_incidents ORDER BY created_at DESC LIMIT ${safeLimit}`
    );
    return result.rows;
  },

  async resolveIncident(id: string, notes?: string): Promise<void> {
    await execute(
      `UPDATE self_heal_incidents SET resolved = true, resolved_at = NOW(),
       suggested_fix = COALESCE(suggested_fix, '') || $2
       WHERE id = $1`,
      [id, notes ? `\n\n[Resolved note] ${notes}` : '']
    );
  },

  // Groups unresolved, not-yet-diagnosed incidents by (source, message) so a single
  // recurring error (e.g. the same query failing every request) gets ONE diagnosis pass,
  // not one per occurrence -- then asks Claude for a plain-English root cause and a
  // concrete suggested fix. Never applies anything: this only writes the diagnosis back
  // onto the incident rows and raises an admin notification. A human decides whether the
  // suggestion is right and, if so, asks for it to actually be implemented.
  async diagnoseUnresolvedIncidents(): Promise<{ skipped: boolean; reason?: string; diagnosed: number }> {
    if (!isConfigured()) {
      logger.info('[SelfHeal] Diagnosis pass skipped — ANTHROPIC_API_KEY not configured.');
      return { skipped: true, reason: 'no ANTHROPIC_API_KEY configured', diagnosed: 0 };
    }

    const pending = await query(
      `SELECT * FROM self_heal_incidents
       WHERE resolved = false AND diagnosed_at IS NULL
       ORDER BY created_at DESC LIMIT 100`
    );
    if (pending.rows.length === 0) return { skipped: false, diagnosed: 0 };

    // One representative incident per (source, message) group -- diagnose that one,
    // then stamp every occurrence in the group with the same result, so a burst of the
    // identical error doesn't burn N Claude calls for N occurrences.
    const groups = new Map<string, any[]>();
    for (const row of pending.rows) {
      const key = `${row.source}::${row.message}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
    let diagnosedGroups = 0;

    for (const [, rows] of groups) {
      const rep = rows[0];
      try {
        const prompt = `You are diagnosing a real production error from "PMO Tracker," a Node/Express + \
PostgreSQL backend (TypeScript, raw parameterized SQL, no ORM) paired with a Next.js frontend. You are given \
one captured incident -- a source, an error message, a stack trace (may be truncated), and any extra context. \
Occurrences: ${rows.length} time(s) since ${rows[rows.length - 1].created_at}.

Source: ${rep.source}
Message: ${rep.message}
Stack:
${(rep.stack ?? '(no stack captured)').slice(0, MAX_STACK_CHARS)}
Context: ${JSON.stringify(rep.context ?? {})}

Respond in exactly two sections, plain text, no markdown headers:
DIAGNOSIS: <2-4 sentences on the most likely root cause. If the stack trace alone genuinely isn't enough to \
localize the bug, say so plainly instead of guessing -- do not fabricate a confident answer you don't have \
evidence for.>
SUGGESTED FIX: <a concrete, specific suggestion -- name the likely file/function if the stack trace points to \
one, and describe the actual code change. If you're not confident, say what additional information (e.g. \
"reproduce with X input" or "check whether Y is null in production") would be needed before anyone should \
change code. Never claim a fix is safe to auto-apply -- a human always reviews this before anything changes.>`;

        const response = await client.messages.create({
          model,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        });
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();

        const diagnosisMatch = text.match(/DIAGNOSIS:\s*([\s\S]*?)(?=SUGGESTED FIX:|$)/i);
        const fixMatch = text.match(/SUGGESTED FIX:\s*([\s\S]*)/i);
        const diagnosis = (diagnosisMatch?.[1] ?? text).trim();
        const suggestedFix = (fixMatch?.[1] ?? '').trim() || null;

        const ids = rows.map((r) => r.id);
        await execute(
          `UPDATE self_heal_incidents SET diagnosis = $1, suggested_fix = $2, diagnosed_at = NOW()
           WHERE id = ANY($3)`,
          [diagnosis, suggestedFix, ids]
        );
        diagnosedGroups++;

        const admins = await query(`SELECT email FROM users WHERE role = 'ADMIN' AND email IS NOT NULL`);
        const recipients = admins.rows.map((r: any) => r.email).filter(Boolean);
        await notificationService.createNotification(
          'GENERAL',
          `🩺 Self-heal diagnosis: ${rep.source} (${rows.length}x)`,
          `<p><strong>${rep.message}</strong></p><p><strong>Diagnosis:</strong> ${diagnosis}</p>` +
            (suggestedFix ? `<p><strong>Suggested fix:</strong> ${suggestedFix}</p>` : '') +
            `<p>This is a suggestion only -- nothing has been changed. Review in the Self-Heal admin view before asking for it to be applied.</p>`,
          recipients
        );
      } catch (err: any) {
        logger.error(`[SelfHeal] Diagnosis pass failed for "${rep.message}":`, err?.message ?? err);
      }
    }

    return { skipped: false, diagnosed: diagnosedGroups };
  },
};
