import { query, execute } from '../config/database';
import { caseStudyService } from '../services/caseStudyService';
import { emailService, brandedEmail } from '../services/emailService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// Weekly case study digest: ONE email per person (project manager or account manager) listing
// every completed project of theirs that still has no case study. Replaces the old one-email-
// per-project design, which would have sent 100+ emails a week.
const MAX_ROWS = 50;
const RESEND_GUARD_DAYS = 6; // a restart on Monday must not send the digest twice

interface AwaitingProject {
  id: string;
  name: string;
  clientName: string | null;
  customerName: string | null;
  projectManager: string | null;
  accountManager: string | null;
  actualEnd: string | Date | null;
  archivedAt: string | Date | null;
}

export interface DigestResult {
  people: number;
  sent: number;
  skippedNoEmail: string[];
  skippedRecent: number;
  failed: number;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtDate = (d: string | Date | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

function digestHtml(name: string, projects: AwaitingProject[], frontendUrl: string): string {
  const rows = projects.slice(0, MAX_ROWS).map((p) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #eef0f6;">${escapeHtml(p.name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef0f6;color:#475569;">${escapeHtml(p.clientName || p.name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef0f6;color:#475569;white-space:nowrap;">${fmtDate(p.actualEnd ?? p.archivedAt)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef0f6;white-space:nowrap;">
          <a href="${frontendUrl}/case-studies/new?projectId=${encodeURIComponent(p.id)}" style="color:#4f46e5;font-weight:600;text-decoration:none;">Create &rarr;</a>
        </td>
      </tr>`).join('');
  const more = projects.length > MAX_ROWS
    ? `<p style="margin:12px 0 0 0;color:#64748b;font-size:13px;">…and ${projects.length - MAX_ROWS} more on the Case Studies page.</p>`
    : '';
  return brandedEmail(
    'Case studies waiting for you',
    `<p>Hi ${escapeHtml(name)},</p>
     <p>${projects.length} completed project${projects.length === 1 ? '' : 's'} you manage ${projects.length === 1 ? 'does' : 'do'} not have a case study yet.
        Please document ${projects.length === 1 ? 'it' : 'them'} while the details are fresh; you can generate a first draft from the project details.</p>
     <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">
       <thead><tr style="background:#f6f8fd;text-align:left;color:#64748b;font-size:12px;">
         <th style="padding:8px 10px;">Project</th><th style="padding:8px 10px;">Account</th>
         <th style="padding:8px 10px;">Completed</th><th style="padding:8px 10px;"></th>
       </tr></thead>
       <tbody>${rows}</tbody>
     </table>
     ${more}
     <p style="margin-top:16px;"><a href="${frontendUrl}/case-studies" style="color:#4f46e5;font-weight:600;">Open the Case Studies page</a></p>`
  );
}

class CaseStudyReminderJob {
  async run(): Promise<DigestResult> {
    const startTime = Date.now();
    logger.info('[CaseStudyDigest] Starting weekly case study digest...');
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

    const awaiting = (await caseStudyService.getAwaiting()) as AwaitingProject[];
    const byPerson = new Map<string, AwaitingProject[]>();
    for (const p of awaiting) {
      for (const person of new Set([p.projectManager, p.accountManager].map((n) => (n || '').trim()).filter(Boolean))) {
        if (!byPerson.has(person)) byPerson.set(person, []);
        byPerson.get(person)!.push(p);
      }
    }

    const result: DigestResult = { people: byPerson.size, sent: 0, skippedNoEmail: [], skippedRecent: 0, failed: 0 };
    if (byPerson.size === 0) {
      logger.info('[CaseStudyDigest] No completed projects are waiting for a case study.');
      return result;
    }

    const names = [...byPerson.keys()];
    const users = await query(
      `SELECT name, email FROM users WHERE LOWER(TRIM(name)) = ANY($1::text[]) AND email IS NOT NULL AND email <> ''`,
      [names.map((n) => n.toLowerCase())]
    );
    const emailByName = new Map<string, string>(users.rows.map((r: { name: string; email: string }) => [r.name.trim().toLowerCase(), r.email]));

    for (const [name, projects] of byPerson) {
      const email = emailByName.get(name.toLowerCase());
      if (!email) { result.skippedNoEmail.push(name); continue; }

      const recent = await query(
        `SELECT id FROM notifications
         WHERE type = 'CASE_STUDY_REMINDER' AND project_id IS NULL AND recipients::text ILIKE $1
           AND created_at >= NOW() - ($2 || ' days')::interval
         LIMIT 1`,
        [`%"${email}"%`, String(RESEND_GUARD_DAYS)]
      );
      if (recent.rows.length > 0) { result.skippedRecent++; continue; }

      const sorted = projects.slice().sort((a, b) =>
        new Date(b.actualEnd ?? b.archivedAt ?? 0).getTime() - new Date(a.actualEnd ?? a.archivedAt ?? 0).getTime());
      const subject = `${sorted.length} case stud${sorted.length === 1 ? 'y' : 'ies'} waiting for you`;
      try {
        await emailService.sendEmail({ to: email, subject, html: digestHtml(name, sorted, frontendUrl) });
        await execute(
          `INSERT INTO notifications (id, type, title, message, recipients, project_id, status)
           VALUES ($1, 'CASE_STUDY_REMINDER', $2, $3, $4, NULL, 'SENT')`,
          [uuidv4(), subject, `Weekly digest: ${sorted.length} completed project(s) without a case study.`, JSON.stringify([email])]
        );
        result.sent++;
      } catch (err) {
        result.failed++;
        logger.error(`[CaseStudyDigest] Digest to ${email} failed: ${(err as Error).message}`);
      }
    }

    if (result.skippedNoEmail.length > 0) {
      logger.warn(`[CaseStudyDigest] No user email for: ${result.skippedNoEmail.join(', ')}`);
    }
    logger.info(
      `[CaseStudyDigest] Done in ${Date.now() - startTime}ms: ${awaiting.length} projects, ${result.people} people, ` +
      `${result.sent} sent, ${result.skippedRecent} already sent this week, ${result.failed} failed`
    );
    return result;
  }
}

export const caseStudyReminderJob = new CaseStudyReminderJob();
