// Customer Success → Account Tracker: formatting, date ranges, URL filters and constants (ported from the
// Sales Tracker frontend's lib/ folder).
import type { CompanyFilters } from '@/types/accountTracker';

export const TRACKER_BASE = '/customer-success/accounts';
export const DASH = '—';
export const NOT_ON_FILE = 'Not on file';

export const isBlank = (v: unknown): boolean => v == null || String(v).trim() === '';
export const orDash = (v: string | number | null | undefined): string => (isBlank(v) ? DASH : String(v));
export const orNotOnFile = (v: string | null | undefined): string => (isBlank(v) ? NOT_ON_FILE : String(v));
export const num = (v: number | string | null | undefined): string =>
  v == null || Number.isNaN(Number(v)) ? DASH : Number(v).toLocaleString('en-US');

/** Prefixes https:// when a link was stored without a scheme. */
export const href = (v: string | null | undefined): string | null => {
  if (isBlank(v)) return null;
  const s = String(v).trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
};

export const utcOffsetLabel = (h: number | null | undefined): string => {
  if (h == null) return NOT_ON_FILE;
  const sign = h < 0 ? '-' : '+';
  const abs = Math.abs(h);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  return `UTC${sign}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

export const relativeTime = (iso: string | null | undefined): string => {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const days = Math.floor(s / 86400);
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
};

/** 24000 -> "$24K"; 1250000 -> "$1.25M" (compact, for cards). Unknown currencies get their code as a suffix. */
export const money = (v: number | null | undefined, currency?: string | null, compact = true): string => {
  if (v == null || Number.isNaN(Number(v))) return DASH;
  const big = compact && Math.abs(v) >= 10_000;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      notation: big ? 'compact' : 'standard',
      maximumFractionDigits: big ? 2 : 0,
    }).format(v);
  } catch {
    return `${num(Math.round(v))} ${currency ?? ''}`.trim();
  }
};

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const asDate = (v: string): Date => new Date(v.length === 10 ? `${v}T00:00:00` : v);

/** "2025-02-15" or an ISO timestamp -> "15 Feb 2025". */
export const day = (v: string | null | undefined): string => {
  if (!v) return DASH;
  const d = asDate(String(v));
  return Number.isNaN(d.getTime()) ? DASH : DATE.format(d);
};

export const dayTime = (v: string | null | undefined): string => {
  if (!v) return DASH;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? DASH : DATE_TIME.format(d);
};

/** 125 -> "2m 05s"; 3700 -> "1h 1m". */
export const duration = (secs: number | null | undefined): string | null => {
  if (!secs) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, '0')}s`;
};

/** "5 days ago", "in 3 days", "today". */
export const fromNow = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const d = asDate(String(v));
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days === -1) return 'tomorrow';
  if (days > 0) return days < 60 ? `${days} days ago` : days < 730 ? `${Math.round(days / 30)} months ago` : `${Math.round(days / 365)} years ago`;
  return -days < 60 ? `in ${-days} days` : `in ${Math.round(-days / 30)} months`;
};

// ---------- date-range presets (Deals page and activity timeline); local "YYYY-MM-DD" ----------

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const quarterStart = (d: Date): Date => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);

export const RANGES = [
  { key: 'all', label: 'All time' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'this-quarter', label: 'This quarter' },
  { key: 'last-quarter', label: 'Last quarter' },
  { key: 'this-year', label: 'This year' },
  { key: 'last-year', label: 'Last year' },
  { key: 'last-30', label: 'Last 30 days' },
  { key: 'last-90', label: 'Last 90 days' },
  { key: 'custom', label: 'Custom range' },
] as const;

export interface DateRange { from: string | null; to: string | null }

/** { from, to } for a preset (null = open-ended). For "custom", the given from/to are used. */
export function rangeDates(key: string, from: string | null = null, to: string | null = null, today = new Date()): DateRange {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (key) {
    case 'this-month': return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case 'last-month': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case 'this-quarter': {
      const s = quarterStart(today);
      return { from: iso(s), to: iso(new Date(s.getFullYear(), s.getMonth() + 3, 0)) };
    }
    case 'last-quarter': {
      const s = quarterStart(today);
      const p = new Date(s.getFullYear(), s.getMonth() - 3, 1);
      return { from: iso(p), to: iso(new Date(p.getFullYear(), p.getMonth() + 3, 0)) };
    }
    case 'this-year': return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'last-year': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case 'last-30': return { from: iso(new Date(y, m, today.getDate() - 29)), to: iso(today) };
    case 'last-90': return { from: iso(new Date(y, m, today.getDate() - 89)), to: iso(today) };
    case 'custom': return { from: from || null, to: to || null };
    default: return { from: null, to: null };
  }
}

export const rangeLabel = (key: string): string => RANGES.find((r) => r.key === key)?.label ?? 'All time';

/** True when the date (ISO string) falls inside { from, to } (inclusive). */
export function inRange(value: string | null | undefined, { from, to }: DateRange): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const d = String(value).slice(0, 10);
  return (!from || d >= from) && (!to || d <= to);
}

// ---------- company filters live in the URL (?q=&tier=&country=…) so lists are shareable ----------

export const EMPTY_FILTERS: CompanyFilters = {
  search: '',
  tier: 'All',
  msp: false,
  openDeals: false,
  empRange: null,
  countries: [],
  industryGroups: [],
  probabilities: [],
};

export function filtersFromParams(p: URLSearchParams): CompanyFilters {
  const emp = p.get('emp');
  const range = emp && /^\d+-\d+$/.test(emp) ? (emp.split('-').map(Number) as [number, number]) : null;
  return {
    search: p.get('q') ?? '',
    tier: p.get('tier') ?? 'All',
    msp: p.get('msp') === '1',
    openDeals: p.get('deals') === '1',
    empRange: range,
    countries: p.getAll('country'),
    industryGroups: p.getAll('group'),
    probabilities: p.getAll('prob'),
  };
}

/** Writes filters into new params (drops empty values; resets paging and drill-downs). */
export function paramsFromFilters(f: CompanyFilters, base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const p = new URLSearchParams(base);
  ['q', 'tier', 'msp', 'deals', 'emp', 'country', 'group', 'prob', 'page', 'stat'].forEach((k) => p.delete(k));
  if (f.search.trim()) p.set('q', f.search.trim());
  if (f.tier && f.tier !== 'All') p.set('tier', f.tier);
  if (f.msp) p.set('msp', '1');
  if (f.openDeals) p.set('deals', '1');
  if (f.empRange) p.set('emp', `${f.empRange[0]}-${f.empRange[1]}`);
  f.countries.forEach((c) => p.append('country', c));
  f.industryGroups.forEach((g) => p.append('group', g));
  f.probabilities.forEach((x) => p.append('prob', x));
  return p;
}

/** Query for GET /companies. */
export function apiParams(f: CompanyFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (f.search.trim()) out.search = f.search.trim();
  if (f.tier !== 'All') out.tier = f.tier;
  if (f.msp) out.msp = 'true';
  if (f.openDeals) out.openDeals = 'true';
  if (f.empRange) {
    out.minEmployees = f.empRange[0];
    out.maxEmployees = f.empRange[1];
  }
  if (f.countries.length) out.country = f.countries;
  if (f.industryGroups.length) out.industryGroup = f.industryGroups;
  if (f.probabilities.length) out.probability = f.probabilities;
  return out;
}

export interface FilterChip { key: string; label: string; remove: Partial<CompanyFilters> }

/** Removable chips for the active filters (search is shown in the search box, not as a chip). */
export function activeChips(f: CompanyFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.tier !== 'All') chips.push({ key: 'tier', label: `Size: ${f.tier}`, remove: { tier: 'All' } });
  if (f.msp) chips.push({ key: 'msp', label: 'MSPs only', remove: { msp: false } });
  if (f.openDeals) chips.push({ key: 'deals', label: 'Has open deals', remove: { openDeals: false } });
  if (f.empRange) {
    chips.push({ key: 'emp', label: `Employees ${f.empRange[0].toLocaleString()}–${f.empRange[1].toLocaleString()}`, remove: { empRange: null } });
  }
  f.countries.forEach((c) => chips.push({ key: `c-${c}`, label: c, remove: { countries: f.countries.filter((x) => x !== c) } }));
  f.industryGroups.forEach((g) => chips.push({ key: `g-${g}`, label: g, remove: { industryGroups: f.industryGroups.filter((x) => x !== g) } }));
  f.probabilities.forEach((x) => chips.push({ key: `p-${x}`, label: `${x} probability`, remove: { probabilities: f.probabilities.filter((y) => y !== x) } }));
  return chips;
}

// ---------- KPI cards and drill-down lists on the Companies page (?stat=key) ----------

export const METRICS = [
  { key: 'total', label: 'Total companies', field: 'totalCompanies', alert: false, hint: null },
  { key: 'msps', label: 'MSPs', field: 'totalMsps', alert: false, hint: 'AI classification' },
  { key: 'not-reached', label: 'Not reached out', field: 'notReachedOut', alert: true, hint: null },
  { key: 'avg-days', label: 'Avg days since contact', field: 'avgDaysSinceContact', alert: false, hint: 'Longest first' },
  { key: 'customers', label: 'Customers', field: 'customers', alert: false, hint: null },
] as const;

export const STAT_TITLES: Record<string, string> = {
  msps: 'MSPs',
  'not-reached': 'Not reached out',
  'avg-days': 'Longest since last contact',
  customers: 'Customers',
  reached: 'Reached out',
  'open-deals': 'Companies with open deals',
  calls: 'Most calls',
  emails: 'Most emails',
  meetings: 'Most meetings',
  notes: 'Most notes',
};

export const STAT_COLUMNS: Record<string, string[]> = {
  'avg-days': ['company', 'industry', 'country', 'days', 'lastContact', 'stage'],
  'open-deals': ['company', 'industry', 'country', 'openDeals', 'lastContact', 'stage'],
  calls: ['company', 'industry', 'country', 'calls', 'lastContact', 'stage'],
  emails: ['company', 'industry', 'country', 'emails', 'lastContact', 'stage'],
  meetings: ['company', 'industry', 'country', 'meetings', 'lastContact', 'stage'],
  notes: ['company', 'industry', 'country', 'notes', 'lastContact', 'stage'],
};

// ---------- errors ----------

export interface TrackerErrorInfo { status: number | null; message: string; detail: string | null }

/** Message + detail from an Axios error (backend shape: { error: { message, detail } }). */
export function errorInfo(e: unknown): TrackerErrorInfo | null {
  if (!e) return null;
  const err = e as { response?: { status?: number; data?: { error?: { message?: string; detail?: string | null } | string } }; message?: string };
  const body = err.response?.data?.error;
  if (typeof body === 'string') return { status: err.response?.status ?? null, message: body, detail: null };
  if (body) return { status: err.response?.status ?? null, message: body.message ?? 'Request failed', detail: body.detail ?? null };
  if (!err.response) return { status: null, message: 'Backend unreachable', detail: 'Is the PMO backend running?' };
  return { status: err.response.status ?? null, message: err.message ?? 'Request failed', detail: null };
}
