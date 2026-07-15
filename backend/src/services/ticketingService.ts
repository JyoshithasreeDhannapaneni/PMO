import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

function client(): AxiosInstance {
  return axios.create({
    baseURL: process.env.NTA_API_URL || 'https://neutaraticketing.cftools.live/api',
    headers: { Authorization: `Bearer ${process.env.NTA_API_KEY || ''}` },
    timeout: 15000,
  });
}

// ─── In-memory ticket cache ──────────────────────────────────────────────────
interface TicketCache {
  tickets: any[];
  at: number;
  totalPages: number;
}
let _cache: TicketCache | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let _warming = false;

async function warmCache(): Promise<any[]> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.tickets;

  // Only one warm-up at a time — if already running, wait for it
  if (_warming) {
    while (_warming) await new Promise((r) => setTimeout(r, 200));
    if (_cache) return _cache.tickets;
  }

  _warming = true;
  try {
    const first = await client().get('/issues', { params: { limit: 100, page: 1 } });
    const totalPages: number = first.data?.totalPages ?? 1;
    const all: any[] = [...(first.data?.issues ?? [])];

    const BATCH = 25; // parallel requests per round
    for (let start = 2; start <= totalPages; start += BATCH) {
      const pageNums: number[] = [];
      for (let p = start; p < start + BATCH && p <= totalPages; p++) pageNums.push(p);
      const results = await Promise.all(
        pageNums.map((p) =>
          client()
            .get('/issues', { params: { limit: 100, page: p } })
            .catch(() => null)
        )
      );
      results.forEach((r) => { if (r) all.push(...(r.data?.issues ?? [])); });
    }

    _cache = { tickets: all, at: Date.now(), totalPages };
    logger.info(`NTA cache warmed: ${all.length} tickets across ${totalPages} pages`);
    return all;
  } finally {
    _warming = false;
  }
}

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

function reporterOf(t: any): string {
  if (t.reporter?.displayName) return t.reporter.displayName;
  const parts = [t.reporter?.firstName, t.reporter?.lastName].filter(Boolean);
  return parts.join(' ');
}

// Comma-separated = multi-select from a dropdown (exact match, OR'd).
// A single value with no comma falls back to a substring match (free-text).
function matchesPerson(value: string, filterValue: string): boolean {
  const lc = (s: string) => (s || '').toLowerCase();
  const v = lc(value);
  if (filterValue.includes(',')) {
    const wanted = filterValue.split(',').map((s) => lc(s.trim())).filter(Boolean);
    return wanted.includes(v);
  }
  return v.includes(lc(filterValue));
}

function countByPerson(tickets: any[], nameOf: (t: any) => string): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of tickets) {
    const name = nameOf(t);
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

// `createdFrom`/`createdTo` are expected as precise ISO instants (the caller
// resolves the "day" in its own local timezone) — no UTC-day assumptions here.
function matchesFilters(t: any, filters: SearchFilters): boolean {
  const lc = (s: string) => (s || '').toLowerCase();
  if (
    filters.spaces &&
    lc(t.spaceKey || '') !== lc(filters.spaces) &&
    !lc(t.spaceName || '').includes(lc(filters.spaces))
  )
    return false;
  if (filters.key && !lc(t.key).includes(lc(filters.key))) return false;
  if (filters.summary && !lc(t.summary).includes(lc(filters.summary))) return false;
  if (filters.status) {
    const s = lc(filters.status);
    const isCategory = s === 'todo' || s === 'in-progress' || s === 'done';
    if (isCategory) {
      if (lc(t.status?.category) !== s) return false;
    } else if (lc(t.status?.name) !== s) {
      return false;
    }
  }
  if (filters.priority && lc(t.priority) !== lc(filters.priority)) return false;
  if (filters.customer && !lc(t.customerName || t.clientName || '').includes(lc(filters.customer)))
    return false;
  if (filters.assignee && !matchesPerson(t.assignee?.displayName || t.assignee?.name || '', filters.assignee))
    return false;
  if (filters.reporter && !matchesPerson(reporterOf(t), filters.reporter)) return false;
  if (filters.projectManager && !matchesPerson(t.projectManager || '', filters.projectManager)) return false;
  if (filters.department && !matchesPerson(t.current_department || '', filters.department)) return false;
  if (filters.createdFrom || filters.createdTo) {
    const created = t.createdAt ? new Date(t.createdAt).getTime() : NaN;
    if (isNaN(created)) return false;
    if (filters.createdFrom && created < new Date(filters.createdFrom).getTime()) return false;
    if (filters.createdTo && created > new Date(filters.createdTo).getTime()) return false;
  }
  return true;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const ticketingService = {
  isConfigured(): boolean {
    const key = process.env.NTA_API_KEY || '';
    return !!(key && !key.startsWith('PASTE_'));
  },

  async getStats(): Promise<{ totalTickets: number; totalAgents: number; totalBoards: number }> {
    const res = await client().get('/stats');
    return res.data;
  },

  async getSpaces(): Promise<any[]> {
    const res = await client().get('/spaces');
    return Array.isArray(res.data) ? res.data : res.data?.spaces ?? [];
  },

  async getIssues(params: {
    limit?: number;
    page?: number;
    spaces?: string;
  }): Promise<{ issues: any[]; total: number; page: number; totalPages: number }> {
    const res = await client().get('/issues', {
      params: {
        limit: params.limit || 50,
        page: params.page || 1,
        ...(params.spaces ? { spaces: params.spaces } : {}),
      },
    });
    logger.info(`NTA tickets fetched: total=${res.data?.total} page=${params.page || 1}`);
    return res.data;
  },

  async searchTickets(filters: SearchFilters): Promise<{
    tickets: any[];
    total: number;
    cached: boolean;
    cacheAge: number;
  }> {
    const all = await warmCache();
    const matches = all.filter((t) => matchesFilters(t, filters));

    const cacheAge = _cache ? Math.round((Date.now() - _cache.at) / 1000) : 0;
    logger.info(`NTA search: ${matches.length} matches from ${all.length} cached`);
    return { tickets: matches, total: matches.length, cached: true, cacheAge };
  },

  async getTrends(params: SearchFilters & { groupBy: 'week' | 'month' }): Promise<{ buckets: TrendBucket[] }> {
    const all = await warmCache();
    const buckets = new Map<string, TrendBucket>();

    for (const t of all) {
      if (!matchesFilters(t, params)) continue;
      if (!t.createdAt) continue;
      const created = new Date(t.createdAt);
      if (isNaN(created.getTime())) continue;

      const key =
        params.groupBy === 'week'
          ? isoWeekKey(created)
          : `${created.getUTCFullYear()}-${String(created.getUTCMonth() + 1).padStart(2, '0')}`;

      if (!buckets.has(key)) {
        buckets.set(key, {
          key,
          label: params.groupBy === 'week' ? weekLabel(key) : monthLabel(key),
          total: 0,
          todo: 0,
          inProgress: 0,
          done: 0,
        });
      }
      const bucket = buckets.get(key)!;
      bucket.total++;
      const cat = t.status?.category;
      if (cat === 'done') bucket.done++;
      else if (cat === 'in-progress') bucket.inProgress++;
      else bucket.todo++;
    }

    const sorted = Array.from(buckets.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
    logger.info(`NTA trends: groupBy=${params.groupBy} buckets=${sorted.length}`);
    return { buckets: sorted };
  },

  async getAssignees(): Promise<{ name: string; count: number }[]> {
    const all = await warmCache();
    return countByPerson(all, (t) => t.assignee?.displayName || t.assignee?.name || '');
  },

  async getReporters(): Promise<{ name: string; count: number }[]> {
    const all = await warmCache();
    return countByPerson(all, reporterOf);
  },

  async getProjectManagers(): Promise<{ name: string; count: number }[]> {
    const all = await warmCache();
    return countByPerson(all, (t) => t.projectManager || '');
  },

  async getDepartments(): Promise<{ name: string; count: number }[]> {
    const all = await warmCache();
    return countByPerson(all, (t) => t.current_department || '');
  },

  async getTicketsForCustomers(customerNames: string[]): Promise<{
    tickets: any[];
    scanned: number;
    truncated: boolean;
  }> {
    if (!customerNames.length) return { tickets: [], scanned: 0, truncated: false };

    const needles = customerNames.map((n) => n.toLowerCase().trim().replace(/\s+/g, ''));
    const looksLike = (val: string) => {
      const v = val.toLowerCase().trim().replace(/\s+/g, '');
      return needles.some((n) => v.includes(n) || n.includes(v));
    };

    const matched: any[] = [];
    const MAX_PAGES = 8;
    const PER_PAGE = 100;
    let scanned = 0;
    let truncated = false;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await client().get('/issues', { params: { limit: PER_PAGE, page } });
      const issues: any[] = res.data?.issues ?? [];
      if (!issues.length) break;
      scanned += issues.length;

      for (const t of issues) {
        const customer = t.customerName || t.clientName || '';
        if (customer && looksLike(customer)) matched.push(t);
      }

      if (res.data?.page >= res.data?.totalPages) break;
      if (page === MAX_PAGES) truncated = true;
    }

    logger.info(
      `NTA customer filter (${needles.length} customers): ${matched.length} matches from ${scanned} scanned`
    );
    return { tickets: matched, scanned, truncated };
  },
};
