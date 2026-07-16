import axios, { AxiosInstance } from 'axios';
import { pool } from '../config/db';
import { logger } from '../utils/logger';

function ntaClient(): AxiosInstance {
  return axios.create({
    baseURL: process.env.NTA_API_URL || 'https://neutaraticketing.cftools.live/api',
    headers: { Authorization: `Bearer ${process.env.NTA_API_KEY || ''}` },
    timeout: 10000,
  });
}

export function isNtaConfigured(): boolean {
  const key = process.env.NTA_API_KEY || '';
  return !!(key && !key.startsWith('PASTE_'));
}

let _syncRunning = false;
let _lastSync: { at: number; total: number; synced: number } | null = null;
let _lastFailedAt: number | null = null;
const SYNC_FAIL_COOLDOWN_MS = 15 * 60 * 1000; // wait 15 min before retrying after a failure

function extractFields(t: any) {
  const reporterName = t.reporter?.displayName
    ? t.reporter.displayName
    : [t.reporter?.firstName, t.reporter?.lastName].filter(Boolean).join(' ');
  return {
    key: (t.key || '') as string,
    summary: (t.summary || '') as string,
    status_name: (t.status?.name || t.status || '') as string,
    status_category: (t.status?.category || '') as string,
    priority: (t.priority || '') as string,
    assignee_name: (t.assignee?.displayName || t.assignee?.name || '') as string,
    reporter_name: reporterName as string,
    customer_name: (t.customerName || t.clientName || '') as string,
    department: (t.current_department || '') as string,
    project_manager: (t.projectManager || '') as string,
    space_key: (t.spaceKey || '') as string,
    space_name: (t.spaceName || '') as string,
    created_at: t.createdAt ? new Date(t.createdAt) : null,
    updated_at: t.updatedAt ? new Date(t.updatedAt) : null,
  };
}

export const ntaSyncService = {
  isSyncing(): boolean {
    return _syncRunning;
  },

  getLastSync() {
    return _lastSync;
  },

  async getDbCount(): Promise<number> {
    const result = await pool.query('SELECT COUNT(*) as cnt FROM nta_tickets');
    return Number(result.rows[0]?.cnt ?? 0);
  },

  async syncFromNta(): Promise<{ synced: number; total: number }> {
    if (!isNtaConfigured()) throw new Error('NTA_API_KEY not configured');
    if (_syncRunning) {
      logger.info('NTA sync already in progress, skipping');
      return { synced: 0, total: _lastSync?.total ?? 0 };
    }
    if (_lastFailedAt && Date.now() - _lastFailedAt < SYNC_FAIL_COOLDOWN_MS) {
      const retryIn = Math.ceil((SYNC_FAIL_COOLDOWN_MS - (Date.now() - _lastFailedAt)) / 60000);
      logger.info(`NTA sync skipped: API unreachable, retrying in ~${retryIn}m`);
      return { synced: 0, total: _lastSync?.total ?? 0 };
    }

    _syncRunning = true;
    const client = ntaClient();
    let synced = 0;

    try {
      const first = await client.get('/issues', { params: { limit: 100, page: 1 } });
      const totalPages: number = first.data?.totalPages ?? 1;
      const allTickets: any[] = [...(first.data?.issues ?? [])];

      const BATCH = 25;
      for (let start = 2; start <= totalPages; start += BATCH) {
        const pageNums: number[] = [];
        for (let p = start; p < start + BATCH && p <= totalPages; p++) pageNums.push(p);
        const results = await Promise.all(
          pageNums.map((p) =>
            client.get('/issues', { params: { limit: 100, page: p } }).catch(() => null)
          )
        );
        results.forEach((r) => { if (r) allTickets.push(...(r.data?.issues ?? [])); });
      }

      for (const t of allTickets) {
        const f = extractFields(t);
        if (!f.key) continue;
        await pool.query(
          `INSERT INTO nta_tickets
             (key, summary, status_name, status_category, priority,
              assignee_name, reporter_name, customer_name, department,
              project_manager, space_key, space_name, created_at, updated_at, raw, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,NOW())
           ON CONFLICT (key) DO UPDATE SET
             summary = EXCLUDED.summary,
             status_name = EXCLUDED.status_name,
             status_category = EXCLUDED.status_category,
             priority = EXCLUDED.priority,
             assignee_name = EXCLUDED.assignee_name,
             reporter_name = EXCLUDED.reporter_name,
             customer_name = EXCLUDED.customer_name,
             department = EXCLUDED.department,
             project_manager = EXCLUDED.project_manager,
             space_key = EXCLUDED.space_key,
             space_name = EXCLUDED.space_name,
             created_at = EXCLUDED.created_at,
             updated_at = EXCLUDED.updated_at,
             raw = EXCLUDED.raw,
             synced_at = NOW()`,
          [
            f.key, f.summary, f.status_name, f.status_category, f.priority,
            f.assignee_name, f.reporter_name, f.customer_name, f.department,
            f.project_manager, f.space_key, f.space_name, f.created_at, f.updated_at,
            JSON.stringify(t),
          ]
        );
        synced++;
      }

      const total = await this.getDbCount();
      _lastSync = { at: Date.now(), total, synced };
      _lastFailedAt = null;
      logger.info(`NTA sync complete: ${synced} upserted, ${total} total in DB`);
      return { synced, total };
    } catch (err) {
      _lastFailedAt = Date.now();
      logger.error(`NTA sync failed: ${(err as Error).message}`);
      throw err;
    } finally {
      _syncRunning = false;
    }
  },
};
