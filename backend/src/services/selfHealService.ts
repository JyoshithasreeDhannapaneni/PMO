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

// Errors that clear on their own once the underlying condition passes (DB under load, a
// second dev process racing for the port). No code change fixes these, so they're closed
// automatically once the DB answers again and the error has stopped recurring.
const TRANSIENT_PATTERNS = [
  'timeout exceeded when trying to connect',
  'Connection terminated due to connection timeout',
  'Connection terminated unexpectedly',
  'listen EADDRINUSE',
];
const TRANSIENT_QUIET_MS = 15 * 60 * 1000;
// A merged fix counts as working once its error hasn't recurred for this long after merge.
const FIX_VERIFY_MS = 24 * 60 * 60 * 1000;

function isTransientMessage(message: string): boolean {
  return TRANSIENT_PATTERNS.some((p) => message.includes(p));
}

function githubConfig(): { repo: string; token: string } | null {
  const repo = process.env.SELF_HEAL_GITHUB_REPO;
  const token = process.env.SELF_HEAL_GITHUB_TOKEN;
  if (!repo || !token || token.startsWith('PASTE_') || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return { repo, token };
}

function maxFixPrsPerDay(): number {
  const n = Number(process.env.SELF_HEAL_MAX_FIX_PRS_PER_DAY);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

async function githubFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const cfg = githubConfig();
  if (!cfg) throw new Error('GitHub not configured for self-heal');
  return fetch(`https://api.github.com/repos/${cfg.repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
}

async function markResolved(ids: string[], resolvedBy: 'auto_transient' | 'auto_fix_pr', note: string): Promise<void> {
  await execute(
    `UPDATE self_heal_incidents SET resolved = true, resolved_at = NOW(), auto_healed = true, resolved_by = $2,
       suggested_fix = COALESCE(suggested_fix, '') || $3
     WHERE id = ANY($1) AND resolved = false`,
    [ids, resolvedBy, `\n\n[Auto-resolved] ${note}`]
  );
}

async function dbHealthy(): Promise<boolean> {
  try {
    await Promise.race([
      query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('health check timeout')), 3000)),
    ]);
    return true;
  } catch {
    return false;
  }
}

function groupBySignature(rows: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const key = `${row.source}::${row.message}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return groups;
}

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
      `UPDATE self_heal_incidents SET resolved = true, resolved_at = NOW(), resolved_by = 'admin',
       suggested_fix = COALESCE(suggested_fix, '') || $2
       WHERE id = $1`,
      [id, notes ? `\n\n[Resolved note] ${notes}` : '']
    );
  },

  // The full autonomous pass, in order — shared by the 15-minute cron and the admin "Run
  // self-heal now" button. Each step is isolated so one failing (e.g. GitHub unreachable)
  // doesn't block the others.
  async runFullPass(): Promise<{
    transientResolved: number; diagnosed: number; fixPrsRequested: number; fixedResolved: number; errors: string[];
    githubConfigured: boolean;
  }> {
    const errors: string[] = [];
    const step = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await fn(); } catch (err: any) {
        logger.error(`[SelfHeal] ${label} step failed:`, err?.message ?? err);
        errors.push(`${label}: ${err?.message ?? 'failed'}`);
        return fallback;
      }
    };
    const transient = await step('transient auto-resolve', () => selfHealService.autoResolveTransientIncidents(), { resolved: 0 });
    const diagnosis = await step('diagnosis', () => selfHealService.diagnoseUnresolvedIncidents(), { skipped: true, diagnosed: 0 });
    const prs = await step('fix-PR dispatch', () => selfHealService.requestFixPullRequests(), { requested: 0 });
    const fixed = await step('fixed auto-resolve', () => selfHealService.autoResolveFixedIncidents(), { resolved: 0 });
    return {
      transientResolved: transient.resolved,
      diagnosed: diagnosis.diagnosed,
      fixPrsRequested: prs.requested,
      fixedResolved: fixed.resolved,
      errors,
      githubConfigured: !!githubConfig(),
    };
  },

  isGithubConfigured(): boolean {
    return !!githubConfig();
  },

  // Closes transient incidents (see TRANSIENT_PATTERNS) with no human step: once the error
  // signature has been quiet for TRANSIENT_QUIET_MS and the DB answers a health check now.
  // A signature still firing stays open, so an ongoing outage is never hidden.
  async autoResolveTransientIncidents(): Promise<{ resolved: number }> {
    const rows = (await query(
      `SELECT id, source, message, created_at FROM self_heal_incidents WHERE resolved = false ORDER BY created_at DESC LIMIT 1000`
    )).rows.filter((r: any) => isTransientMessage(r.message));
    if (rows.length === 0) return { resolved: 0 };
    if (!(await dbHealthy())) {
      logger.warn('[SelfHeal] Transient auto-resolve skipped — DB health check failed, issue may be ongoing.');
      return { resolved: 0 };
    }

    let resolved = 0;
    for (const [, group] of groupBySignature(rows)) {
      const lastSeen = Math.max(...group.map((r: any) => new Date(r.created_at).getTime()));
      if (Date.now() - lastSeen < TRANSIENT_QUIET_MS) continue;
      await markResolved(
        group.map((r: any) => r.id),
        'auto_transient',
        `Transient infrastructure error (${group.length}x). Database healthy at ${new Date().toISOString()} and no recurrence for ${TRANSIENT_QUIET_MS / 60000}+ minutes — no code change needed.`
      );
      resolved += group.length;
    }
    if (resolved > 0) logger.info(`[SelfHeal] Auto-resolved ${resolved} transient incident(s)`);
    return { resolved };
  },

  // For each code_bug signature not yet handed off, triggers the self-heal-fix GitHub
  // workflow (.github/workflows/self-heal-fix.yml), which has Claude Code implement the
  // diagnosed fix on a self-heal/<incidentId> branch and open a PR. Never merges or
  // deploys — merging stays a human click. Capped per day so a noisy bug can't run up cost.
  async requestFixPullRequests(): Promise<{ requested: number; skipped?: string }> {
    if (!githubConfig()) return { requested: 0, skipped: 'SELF_HEAL_GITHUB_REPO / SELF_HEAL_GITHUB_TOKEN not configured' };

    const usedToday = Number((await query(
      `SELECT COUNT(DISTINCT message) AS n FROM self_heal_incidents WHERE fix_requested_at > NOW() - INTERVAL '24 hours'`
    )).rows[0]?.n ?? 0);
    let budget = maxFixPrsPerDay() - usedToday;
    if (budget <= 0) return { requested: 0, skipped: 'daily fix-PR cap reached' };

    const rows = (await query(
      `SELECT * FROM self_heal_incidents
       WHERE resolved = false AND category = 'code_bug' AND diagnosed_at IS NOT NULL
       ORDER BY created_at DESC LIMIT 200`
    )).rows;
    let requested = 0;
    for (const [, group] of groupBySignature(rows)) {
      if (budget <= 0) break;
      if (group.some((r: any) => r.fix_requested_at)) continue;
      const rep = group[0];
      const res = await githubFetch('/dispatches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'self-heal-fix',
          client_payload: {
            incident_id: rep.id,
            source: rep.source,
            occurrences: group.length,
            message: String(rep.message).slice(0, 2000),
            stack: String(rep.stack ?? '').slice(0, MAX_STACK_CHARS),
            diagnosis: String(rep.diagnosis ?? '').slice(0, 3000),
            suggested_fix: String(rep.suggested_fix ?? '').slice(0, 3000),
          },
        }),
      });
      if (!res.ok) {
        logger.error(`[SelfHeal] Fix-PR dispatch failed (${res.status}) for "${rep.message}": ${(await res.text()).slice(0, 300)}`);
        continue;
      }
      await execute(`UPDATE self_heal_incidents SET fix_requested_at = NOW() WHERE id = ANY($1)`, [group.map((r: any) => r.id)]);
      requested++;
      budget--;
    }
    if (requested > 0) logger.info(`[SelfHeal] Requested ${requested} fix PR(s) via GitHub`);
    return { requested };
  },

  // Closes code_bug incidents whose fix PR (head branch self-heal/<incidentId>) has been
  // merged, once the same error hasn't recurred for FIX_VERIFY_MS after the merge. A
  // recurrence after merge leaves it open (the fix didn't work) for a human to look at.
  async autoResolveFixedIncidents(): Promise<{ resolved: number }> {
    const cfg = githubConfig();
    if (!cfg) return { resolved: 0 };
    const owner = cfg.repo.split('/')[0];
    // Every open row of a signature that has a fix in flight — including occurrences logged
    // after the dispatch, which don't carry fix_requested_at but must count as recurrences.
    const rows = (await query(
      `SELECT i.id, i.source, i.message, i.created_at, i.fix_requested_at, i.fix_pr_url FROM self_heal_incidents i
       WHERE i.resolved = false AND EXISTS (
         SELECT 1 FROM self_heal_incidents f
         WHERE f.resolved = false AND f.fix_requested_at IS NOT NULL AND f.source = i.source AND f.message = i.message
       )
       ORDER BY i.created_at DESC LIMIT 1000`
    )).rows;

    let resolved = 0;
    for (const [, group] of groupBySignature(rows)) {
      const knownUrl: string | undefined = group.find((r: any) => r.fix_pr_url)?.fix_pr_url;
      let pr: any = null;
      if (knownUrl) {
        const num = knownUrl.match(/\/pull\/(\d+)/)?.[1];
        const res = num ? await githubFetch(`/pulls/${num}`) : null;
        if (res?.ok) pr = await res.json();
      } else {
        // The dispatch used the then-newest row's id as the branch name; only rows stamped
        // at dispatch time can be it.
        for (const r of group.filter((x: any) => x.fix_requested_at)) {
          const res = await githubFetch(`/pulls?state=all&head=${encodeURIComponent(`${owner}:self-heal/${r.id}`)}`);
          if (!res.ok) continue;
          const list = (await res.json()) as any[];
          if (list.length > 0) { pr = list[0]; break; }
        }
      }
      if (!pr) continue;
      if (!knownUrl) {
        await execute(`UPDATE self_heal_incidents SET fix_pr_url = $1 WHERE id = ANY($2)`, [pr.html_url, group.map((r: any) => r.id)]);
      }
      if (!pr.merged_at) continue;
      const mergedAt = new Date(pr.merged_at).getTime();
      const lastSeen = Math.max(...group.map((r: any) => new Date(r.created_at).getTime()));
      if (lastSeen > mergedAt || Date.now() - mergedAt < FIX_VERIFY_MS) continue;
      await markResolved(
        group.map((r: any) => r.id),
        'auto_fix_pr',
        `Fixed by ${pr.html_url} (merged ${pr.merged_at}); no recurrence for ${FIX_VERIFY_MS / 3600000}h after merge.`
      );
      resolved += group.length;
    }
    if (resolved > 0) logger.info(`[SelfHeal] Auto-resolved ${resolved} incident(s) after their fix PR merged`);
    return { resolved };
  },

  // Groups unresolved, not-yet-diagnosed incidents by (source, message) so a single
  // recurring error (e.g. the same query failing every request) gets ONE diagnosis pass,
  // not one per occurrence -- then asks Claude for a triage category, a plain-English root
  // cause and a concrete suggested fix. Applies nothing itself: code_bug results are handed
  // to requestFixPullRequests (a PR a human merges); everything else stays for review.
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
    // Transient infra errors are closed by autoResolveTransientIncidents, not by a code
    // change — no point spending a Claude call on them.
    const diagnosable = pending.rows.filter((r: any) => !isTransientMessage(r.message));
    if (diagnosable.length === 0) return { skipped: false, diagnosed: 0 };

    // One representative incident per (source, message) group -- diagnose that one,
    // then stamp every occurrence in the group with the same result, so a burst of the
    // identical error doesn't burn N Claude calls for N occurrences. A repeat of an already
    // diagnosed signature reuses that diagnosis instead of asking again.
    const groups = groupBySignature(diagnosable);
    for (const [key, rows] of [...groups]) {
      const prior = (await query(
        `SELECT diagnosis, suggested_fix, category FROM self_heal_incidents
         WHERE source = $1 AND message = $2 AND diagnosed_at IS NOT NULL
         ORDER BY diagnosed_at DESC LIMIT 1`,
        [rows[0].source, rows[0].message]
      )).rows[0];
      if (!prior) continue;
      await execute(
        `UPDATE self_heal_incidents SET diagnosis = $1, suggested_fix = $2, category = $3, diagnosed_at = NOW() WHERE id = ANY($4)`,
        [prior.diagnosis, prior.suggested_fix, prior.category, rows.map((r: any) => r.id)]
      );
      groups.delete(key);
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

Respond in exactly three sections, plain text, no markdown headers:
CATEGORY: <exactly one of: code_bug (a defect in this codebase that a code change would fix), transient \
(infrastructure/network/load blip that clears on its own), config (missing/wrong env var, credential, or \
deployment setting), unknown (not enough evidence to tell)>
DIAGNOSIS: <2-4 sentences on the most likely root cause. If the stack trace alone genuinely isn't enough to \
localize the bug, say so plainly instead of guessing -- do not fabricate a confident answer you don't have \
evidence for.>
SUGGESTED FIX: <a concrete, specific suggestion -- name the likely file/function if the stack trace points to \
one, and describe the actual code change. If you're not confident, say what additional information (e.g. \
"reproduce with X input" or "check whether Y is null in production") would be needed before anyone should \
change code. A code_bug fix is implemented as a pull request that a human reviews and merges -- never claim \
a fix is safe to apply without that review.>`;

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

        const categoryMatch = text.match(/CATEGORY:\s*(code_bug|transient|config|unknown)/i);
        const diagnosisMatch = text.match(/DIAGNOSIS:\s*([\s\S]*?)(?=SUGGESTED FIX:|$)/i);
        const fixMatch = text.match(/SUGGESTED FIX:\s*([\s\S]*)/i);
        const category = (categoryMatch?.[1] ?? 'unknown').toLowerCase();
        const diagnosis = (diagnosisMatch?.[1] ?? text).trim();
        const suggestedFix = (fixMatch?.[1] ?? '').trim() || null;

        const ids = rows.map((r) => r.id);
        await execute(
          `UPDATE self_heal_incidents SET diagnosis = $1, suggested_fix = $2, category = $3, diagnosed_at = NOW()
           WHERE id = ANY($4)`,
          [diagnosis, suggestedFix, category, ids]
        );
        diagnosedGroups++;

        const admins = await query(`SELECT email FROM users WHERE role = 'ADMIN' AND email IS NOT NULL`);
        const recipients = admins.rows.map((r: any) => r.email).filter(Boolean);
        await notificationService.createNotification(
          'GENERAL',
          `🩺 Self-heal diagnosis: ${rep.source} (${rows.length}x)`,
          `<p><strong>${rep.message}</strong></p><p><strong>Diagnosis:</strong> ${diagnosis}</p>` +
            (suggestedFix ? `<p><strong>Suggested fix:</strong> ${suggestedFix}</p>` : '') +
            (category === 'code_bug' && githubConfig()
              ? `<p>Category: code bug — an agent is opening a fix pull request. Review and merge it; the incident closes itself once the error stops after the merge.</p>`
              : `<p>Category: ${category} — nothing has been changed automatically. Review in the Self-Heal admin view.</p>`),
          recipients
        );
      } catch (err: any) {
        logger.error(`[SelfHeal] Diagnosis pass failed for "${rep.message}":`, err?.message ?? err);
      }
    }

    return { skipped: false, diagnosed: diagnosedGroups };
  },
};
