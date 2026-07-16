import { pool } from '../config/db';
import { logger } from '../utils/logger';
import { isNtaConfigured } from './ntaSyncService';

export interface SearchFilters {
  key?: string;
  summary?: string;
  status?: string;
  priority?: string;
  customer?: string;
  assignee?: string;
  reporter?: string;
  projectManager?: string;
  department?: string;
  spaces?: string;
  createdFrom?: string;
  createdTo?: string;
}

export interface TrendBucket {
  key: string;
  label: string;
  total: number;
  todo: number;
  inProgress: number;
  done: number;
}

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function weekLabel(isoKey: string): string {
  const [yearStr, wkStr] = isoKey.split('-W');
  const year = Number(yearStr), week = Number(wkStr);
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() + (dow <= 4 ? 1 - dow : 8 - dow));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Build a parameterized WHERE clause from search filters
function buildWhere(filters: SearchFilters): { sql: string; params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filters.spaces) {
    conditions.push(`(LOWER(space_key) = LOWER($${idx}) OR LOWER(space_name) LIKE LOWER($${idx + 1}))`);
    params.push(filters.spaces, `%${filters.spaces}%`);
    idx += 2;
  }
  if (filters.key) {
    conditions.push(`LOWER(key) LIKE LOWER($${idx})`);
    params.push(`%${filters.key}%`);
    idx++;
  }
  if (filters.summary) {
    conditions.push(`LOWER(summary) LIKE LOWER($${idx})`);
    params.push(`%${filters.summary}%`);
    idx++;
  }
  if (filters.status) {
    const s = filters.status.toLowerCase();
    if (s === 'todo' || s === 'in-progress' || s === 'done') {
      conditions.push(`LOWER(status_category) = $${idx}`);
      params.push(s);
    } else {
      conditions.push(`LOWER(status_name) = LOWER($${idx})`);
      params.push(filters.status);
    }
    idx++;
  }
  if (filters.priority) {
    conditions.push(`LOWER(priority) = LOWER($${idx})`);
    params.push(filters.priority);
    idx++;
  }
  if (filters.customer) {
    conditions.push(`LOWER(customer_name) LIKE LOWER($${idx})`);
    params.push(`%${filters.customer}%`);
    idx++;
  }
  for (const [filterKey, col] of [
    ['assignee', 'assignee_name'],
    ['reporter', 'reporter_name'],
    ['projectManager', 'project_manager'],
    ['department', 'department'],
  ] as [keyof SearchFilters, string][]) {
    const val = filters[filterKey] as string | undefined;
    if (!val) continue;
    if (val.includes(',')) {
      const names = val.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      conditions.push(`LOWER(${col}) = ANY($${idx}::text[])`);
      params.push(names);
    } else {
      conditions.push(`LOWER(${col}) LIKE LOWER($${idx})`);
      params.push(`%${val}%`);
    }
    idx++;
  }
  if (filters.createdFrom) {
    conditions.push(`created_at >= $${idx}`);
    params.push(new Date(filters.createdFrom));
    idx++;
  }
  if (filters.createdTo) {
    conditions.push(`created_at <= $${idx}`);
    params.push(new Date(filters.createdTo));
    idx++;
  }

  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const ticketingService = {
  isConfigured(): boolean {
    return isNtaConfigured();
  },

  async getStats(): Promise<{ totalTickets: number; totalAgents: number; totalBoards: number }> {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_tickets,
        COUNT(DISTINCT NULLIF(assignee_name, '')) as total_agents,
        COUNT(DISTINCT NULLIF(space_key, '')) as total_boards
      FROM nta_tickets
    `);
    const row = result.rows[0];
    return {
      totalTickets: Number(row.total_tickets),
      totalAgents: Number(row.total_agents),
      totalBoards: Number(row.total_boards),
    };
  },

  async getSpaces(): Promise<{ key: string; name: string }[]> {
    const result = await pool.query(`
      SELECT DISTINCT space_key as key, space_name as name
      FROM nta_tickets
      WHERE space_key IS NOT NULL AND space_key != ''
      ORDER BY space_name
    `);
    return result.rows;
  },

  async getIssues(params: {
    limit?: number;
    page?: number;
    spaces?: string;
  }): Promise<{ issues: any[]; total: number; page: number; totalPages: number }> {
    const limit = params.limit || 50;
    const page = params.page || 1;
    const offset = (page - 1) * limit;

    let whereSql = '';
    const whereParams: any[] = [];
    if (params.spaces) {
      whereSql = `WHERE (LOWER(space_key) = LOWER($1) OR LOWER(space_name) LIKE LOWER($2))`;
      whereParams.push(params.spaces, `%${params.spaces}%`);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM nta_tickets ${whereSql}`,
      whereParams
    );
    const total = Number(countResult.rows[0].cnt);

    const dataResult = await pool.query(
      `SELECT raw FROM nta_tickets ${whereSql} ORDER BY created_at DESC NULLS LAST LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}`,
      [...whereParams, limit, offset]
    );

    const issues = dataResult.rows.map((r) => r.raw);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    logger.info(`NTA tickets from DB: total=${total} page=${page}`);
    return { issues, total, page, totalPages };
  },

  async searchTickets(filters: SearchFilters): Promise<{
    tickets: any[];
    total: number;
    cached: boolean;
    cacheAge: number;
  }> {
    const { sql: whereSql, params } = buildWhere(filters);
    const result = await pool.query(
      `SELECT raw FROM nta_tickets ${whereSql} ORDER BY created_at DESC NULLS LAST`,
      params
    );
    const tickets = result.rows.map((r) => r.raw);
    logger.info(`NTA search from DB: ${tickets.length} matches`);
    return { tickets, total: tickets.length, cached: true, cacheAge: 0 };
  },

  async getTrends(params: SearchFilters & { groupBy: 'week' | 'month' }): Promise<{ buckets: TrendBucket[] }> {
    const { sql: whereSql, params: whereParams } = buildWhere(params);
    const result = await pool.query(
      `SELECT status_category, created_at FROM nta_tickets ${whereSql}`,
      whereParams
    );

    const buckets = new Map<string, TrendBucket>();
    for (const row of result.rows) {
      if (!row.created_at) continue;
      const created = new Date(row.created_at);
      if (isNaN(created.getTime())) continue;
      const key =
        params.groupBy === 'week'
          ? isoWeekKey(created)
          : `${created.getUTCFullYear()}-${String(created.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          key,
          label: params.groupBy === 'week' ? weekLabel(key) : monthLabel(key),
          total: 0, todo: 0, inProgress: 0, done: 0,
        });
      }
      const bucket = buckets.get(key)!;
      bucket.total++;
      const cat = (row.status_category || '').toLowerCase();
      if (cat === 'done') bucket.done++;
      else if (cat === 'in-progress') bucket.inProgress++;
      else bucket.todo++;
    }

    return { buckets: Array.from(buckets.values()).sort((a, b) => (a.key < b.key ? -1 : 1)) };
  },

  async getAssignees(): Promise<{ name: string; count: number }[]> {
    const result = await pool.query(`
      SELECT assignee_name as name, COUNT(*) as count
      FROM nta_tickets WHERE assignee_name IS NOT NULL AND assignee_name != ''
      GROUP BY assignee_name ORDER BY count DESC
    `);
    return result.rows.map((r) => ({ name: r.name, count: Number(r.count) }));
  },

  async getReporters(): Promise<{ name: string; count: number }[]> {
    const result = await pool.query(`
      SELECT reporter_name as name, COUNT(*) as count
      FROM nta_tickets WHERE reporter_name IS NOT NULL AND reporter_name != ''
      GROUP BY reporter_name ORDER BY count DESC
    `);
    return result.rows.map((r) => ({ name: r.name, count: Number(r.count) }));
  },

  async getProjectManagers(): Promise<{ name: string; count: number }[]> {
    const result = await pool.query(`
      SELECT project_manager as name, COUNT(*) as count
      FROM nta_tickets WHERE project_manager IS NOT NULL AND project_manager != ''
      GROUP BY project_manager ORDER BY count DESC
    `);
    return result.rows.map((r) => ({ name: r.name, count: Number(r.count) }));
  },

  async getDepartments(): Promise<{ name: string; count: number }[]> {
    const result = await pool.query(`
      SELECT department as name, COUNT(*) as count
      FROM nta_tickets WHERE department IS NOT NULL AND department != ''
      GROUP BY department ORDER BY count DESC
    `);
    return result.rows.map((r) => ({ name: r.name, count: Number(r.count) }));
  },

  async getTicketsForCustomers(customerNames: string[]): Promise<{
    tickets: any[];
    scanned: number;
    truncated: boolean;
  }> {
    if (!customerNames.length) return { tickets: [], scanned: 0, truncated: false };

    const countResult = await pool.query('SELECT COUNT(*) as cnt FROM nta_tickets');
    const scanned = Number(countResult.rows[0].cnt);

    // Each name becomes a LIKE pattern; match if either value contains the other
    const conditions = customerNames.map((_, i) => `LOWER(customer_name) LIKE LOWER($${i + 1})`).join(' OR ');
    const patterns = customerNames.map((n) => `%${n.trim()}%`);

    const result = await pool.query(
      `SELECT raw FROM nta_tickets WHERE (${conditions}) ORDER BY created_at DESC NULLS LAST`,
      patterns
    );
    logger.info(`NTA customer filter (${customerNames.length} customers): ${result.rows.length} matches from ${scanned} total`);
    return { tickets: result.rows.map((r) => r.raw), scanned, truncated: false };
  },
};
