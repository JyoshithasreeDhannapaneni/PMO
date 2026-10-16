import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { query } from './config/database';
import { emailHygieneService } from './services/emailHygieneService';

// September's stored scores (monthly snapshot + every September day), hashed before and after.
async function septemberFingerprint(): Promise<string> {
  const m = (await query(`SELECT metrics, team_hygiene FROM email_hygiene_monthly WHERE month_start = '2026-09-01'`)).rows;
  const d = (await query(`SELECT day_start, metrics, team_hygiene FROM email_hygiene_daily WHERE day_start >= '2026-09-01' AND day_start < '2026-10-01' ORDER BY day_start`)).rows;
  return crypto.createHash('sha256').update(JSON.stringify([m, d])).digest('hex').slice(0, 10) + ` (${m.length} month row, ${d.length} day rows)`;
}

(async () => {
  console.log('SEPTEMBER_BEFORE', await septemberFingerprint());
  const { alreadyRunning } = emailHygieneService.triggerRescoreCurrentMonth();
  if (alreadyRunning) { console.log('already running'); process.exit(1); }
  let last = -1;
  for (;;) {
    await new Promise((r) => setTimeout(r, 30_000));
    const s = emailHygieneService.getRescoreState();
    if (s.done.length !== last) { last = s.done.length; console.log(`PROGRESS ${s.done.length}/${s.total} ${s.done[s.done.length - 1] ?? ''}`); }
    if (!s.running) {
      if (s.error) { console.log('RESCORE_ERROR', s.error); process.exit(1); }
      console.log('RESCORE_DONE', s.done.join(', '));
      break;
    }
  }
  console.log('SEPTEMBER_AFTER', await septemberFingerprint());
  const rows = (await query(`SELECT day_start, metrics FROM email_hygiene_daily WHERE day_start >= '2026-10-01' ORDER BY day_start`)).rows;
  for (const r of rows) {
    const emails = (r.metrics as { userEmail: string; uniqueCustomerThreads: number }[]).map((x) => x.userEmail.toLowerCase());
    console.log('DAY', new Date(r.day_start).toISOString().slice(0, 10), 'users', emails.length, 'harshith', emails.some((e) => e.includes('harshith')), 'dls', emails.filter((e) => e.startsWith('cfmigrationsupport')).join(' ') || '-');
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
