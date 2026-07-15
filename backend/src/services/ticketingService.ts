import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

function client(): AxiosInstance {
  return axios.create({
    baseURL: process.env.NTA_API_URL || 'https://neutaraticketing.cftools.live/api',
    headers: { Authorization: `Bearer ${process.env.NTA_API_KEY || ''}` },
    timeout: 10000,
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
  department?: string;
  spaces?: string;
}

function pmOf(t: any): string {
  if (t.projectManager) return t.projectManager;
  if (t.reporter?.displayName) return t.reporter.displayName;
  const parts = [t.reporter?.firstName, t.reporter?.lastName].filter(Boolean);
  return parts.join(' ');
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
    const lc = (s: string) => (s || '').toLowerCase();

    const matches = all.filter((t) => {
      if (
        filters.spaces &&
        lc(t.spaceKey || '') !== lc(filters.spaces) &&
        !lc(t.spaceName || '').includes(lc(filters.spaces))
      )
        return false;
      if (filters.key && !lc(t.key).includes(lc(filters.key))) return false;
      if (filters.summary && !lc(t.summary).includes(lc(filters.summary))) return false;
      if (filters.status && lc(t.status?.category) !== lc(filters.status)) return false;
      if (filters.priority && lc(t.priority) !== lc(filters.priority)) return false;
      if (
        filters.customer &&
        !lc(t.customerName || t.clientName || '').includes(lc(filters.customer))
      )
        return false;
      if (
        filters.assignee &&
        !lc(t.assignee?.displayName || t.assignee?.name || '').includes(lc(filters.assignee))
      )
        return false;
      if (filters.reporter && !lc(pmOf(t)).includes(lc(filters.reporter))) return false;
      if (filters.department && !lc(t.current_department || '').includes(lc(filters.department)))
        return false;
      return true;
    });

    const cacheAge = _cache ? Math.round((Date.now() - _cache.at) / 1000) : 0;
    logger.info(`NTA search: ${matches.length} matches from ${all.length} cached`);
    return { tickets: matches, total: matches.length, cached: true, cacheAge };
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
