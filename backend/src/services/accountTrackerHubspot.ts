import axios, { AxiosError, AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { htmlToText, label, lower, parseInstant, parseNumber, trim } from './accountTrackerRules';

// Customer Success → Account Tracker: read-only HubSpot CRM client (port of the Sales Tracker's
// HubSpotClient + HubSpotActivity). Uses the same private-app token as hubspotService
// (HUBSPOT_ACCESS_TOKEN) but its own rate limiter, so a tracker sync never stalls the
// Customer Success deal sync.

const BASE_URL = 'https://api.hubapi.com';
const BATCH = 100;
const MAX_RETRIES = 6;
const SEARCH_PAGE = 200;
const MAX_IN_FLIGHT = 4;
// ~9 requests/second overall; the search API has its own, lower limit (~4/second).
const MIN_GAP_MS = 110;
const SEARCH_GAP_MS = 260;
const OWNER_CACHE_MS = 10 * 60_000;

export class HubSpotError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface Owner { id: string; email: string | null; firstName: string | null; lastName: string | null }
export interface CrmObject { id: string; properties: Record<string, string> }
export interface Stage { id: string; label: string | null; pipeline: string | null; closed: boolean; probability: number | null }

export function ownerDisplayName(o: Owner): string {
  const first = (o.firstName ?? '').trim();
  const last = (o.lastName ?? '').trim();
  // some HubSpot users have the full name in both fields
  const n = first.toLowerCase() === last.toLowerCase() || first.toLowerCase().endsWith(` ${last.toLowerCase()}`)
    ? first : `${first} ${last}`.trim();
  return n || o.email || o.id;
}

function token(): string {
  let t = (process.env.HUBSPOT_ACCESS_TOKEN || '').trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) t = t.slice(1, -1).trim();
  return t;
}

export function isConfigured(): boolean {
  const t = token();
  return !!t && !t.startsWith('PASTE_') && t !== 'your-hubspot-access-token-here';
}

let client: AxiosInstance | null = null;
let clientToken = '';
function http(): AxiosInstance {
  const t = token();
  if (!client || clientToken !== t) {
    client = axios.create({
      baseURL: BASE_URL,
      timeout: 60_000,
      headers: { Authorization: `Bearer ${t}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    });
    clientToken = t;
  }
  return client;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------- rate limiting: at most MAX_IN_FLIGHT requests, MIN_GAP_MS between starts ----------

let inFlight = 0;
const waiters: (() => void)[] = [];
let lastStart = 0;
let startChain: Promise<void> = Promise.resolve();
let lastSearch = 0;
let searchChain: Promise<void> = Promise.resolve();

async function acquire(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) inFlight++;
  else await new Promise<void>((r) => waiters.push(r)); // the releasing request hands its slot over
  const turn = startChain.then(async () => {
    const wait = lastStart + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
  });
  startChain = turn;
  await turn;
}

function release(): void {
  const next = waiters.shift();
  if (next) next();
  else inFlight--;
}

function retryDelay(err: AxiosError, attempt: number): number {
  const ra = err.response?.headers?.['retry-after'];
  const secs = ra == null ? NaN : Number(ra);
  return Number.isFinite(secs) ? Math.max(500, secs * 1000) : 1000 * attempt;
}

function translate(status: number, err: AxiosError): HubSpotError {
  const data = err.response?.data as { message?: string } | undefined;
  const detail = data?.message ?? '';
  logger.warn(`[AccountTracker] HubSpot ${status}: ${detail}`);
  if (status === 401) return new HubSpotError(401, 'HubSpot rejected the token (401). Check HUBSPOT_ACCESS_TOKEN — it may be wrong, revoked or expired.');
  if (status === 403) return new HubSpotError(403, `The token is missing a required scope (403). ${detail}`.trim());
  return new HubSpotError(status, `HubSpot error ${status}${detail ? `: ${detail}` : ''}`);
}

async function call<T>(method: 'get' | 'post', url: string, body?: unknown): Promise<T> {
  if (!isConfigured()) {
    throw new HubSpotError(0, 'HubSpot is not connected — set HUBSPOT_ACCESS_TOKEN in backend/.env and restart the backend.');
  }
  for (let attempt = 1; ; attempt++) {
    try {
      await acquire();
      let res;
      try {
        res = method === 'get' ? await http().get(url) : await http().post(url, body);
      } finally {
        release(); // before any back-off sleep, so waiting retries don't hold a slot
      }
      return (res.data ?? {}) as T;
    } catch (e) {
      const err = e as AxiosError;
      const status = err.response?.status;
      if (status != null) {
        if ((status === 429 || status >= 500) && attempt < MAX_RETRIES) {
          await sleep(retryDelay(err, attempt));
          continue;
        }
        throw translate(status, err);
      }
      if (attempt < 3) {
        await sleep(1000 * attempt);
        continue;
      }
      throw new HubSpotError(0, `Could not reach HubSpot (${err.message}).`);
    }
  }
}

async function search<T>(objectType: string, body: unknown): Promise<T> {
  const turn = searchChain.then(async () => {
    const wait = lastSearch + SEARCH_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastSearch = Date.now();
  });
  searchChain = turn;
  await turn;
  return call<T>('post', `/crm/v3/objects/${objectType}/search`, body);
}

function chunks<T>(items: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface RawObject { id: string; properties?: Record<string, unknown> }

function toObject(r: RawObject): CrmObject {
  const p: Record<string, string> = {};
  Object.entries(r.properties ?? {}).forEach(([k, v]) => {
    if (v != null) p[k] = String(v);
  });
  return { id: String(r.id), properties: p };
}

// ---------- account & owners ----------

export async function portalId(): Promise<string | null> {
  const n = await call<{ portalId?: number | string }>('get', '/account-info/v3/details');
  return n.portalId != null ? String(n.portalId) : null;
}

async function fetchOwners(): Promise<Owner[]> {
  const out: Owner[] = [];
  let after: string | null = null;
  do {
    const page: { results?: { id: string; email?: string; firstName?: string; lastName?: string }[]; paging?: { next?: { after?: string } } } =
      await call('get', `/crm/v3/owners?limit=100&archived=false${after ? `&after=${encodeURIComponent(after)}` : ''}`);
    (page.results ?? []).forEach((o) => out.push({
      id: String(o.id), email: o.email ?? null, firstName: o.firstName ?? null, lastName: o.lastName ?? null,
    }));
    after = page.paging?.next?.after ?? null;
  } while (after);
  return out;
}

let ownerCache: Owner[] = [];
let ownerCacheAt = 0;
let ownerLoad: Promise<Owner[]> | null = null;

/** HubSpot users, cached for 10 minutes. */
export async function ownerList(): Promise<Owner[]> {
  if (ownerCache.length && Date.now() - ownerCacheAt < OWNER_CACHE_MS) return ownerCache;
  if (!ownerLoad) {
    ownerLoad = fetchOwners()
      .then((list) => {
        ownerCache = list;
        ownerCacheAt = Date.now();
        return list;
      })
      .finally(() => { ownerLoad = null; });
  }
  return ownerLoad;
}

export async function ownerById(id: string): Promise<Owner | null> {
  return (await ownerList()).find((o) => o.id === id) ?? null;
}

export async function ownerByEmail(email: string): Promise<Owner | null> {
  const e = lower(email);
  if (!e) return null;
  return (await ownerList()).find((o) => lower(o.email) === e) ?? null;
}

// ---------- companies & deals by owner ----------

/**
 * Objects owned by `ownerId`; with `modifiedSinceMillis`, only those changed since then. Pages by ascending object
 * id ("id greater than the last one seen"), which avoids HubSpot's 10,000-result search limit for large books.
 */
export async function searchOwned(objectType: 'companies' | 'deals', ownerId: string, properties: string[],
  modifiedSinceMillis: number | null): Promise<CrmObject[]> {
  const out: CrmObject[] = [];
  let lastId: string | null = null;
  for (;;) {
    const filters: { propertyName: string; operator: string; value: string }[] = [
      { propertyName: 'hubspot_owner_id', operator: 'EQ', value: ownerId },
    ];
    if (modifiedSinceMillis != null) filters.push({ propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: String(modifiedSinceMillis) });
    if (lastId != null) filters.push({ propertyName: 'hs_object_id', operator: 'GT', value: lastId });
    const page = await search<{ results?: RawObject[] }>(objectType, {
      filterGroups: [{ filters }],
      sorts: [{ propertyName: 'hs_object_id', direction: 'ASCENDING' }],
      properties,
      limit: SEARCH_PAGE,
    });
    const results = page.results ?? [];
    results.forEach((r) => {
      const o = toObject(r);
      out.push(o);
      lastId = o.id;
    });
    if (results.length < SEARCH_PAGE) return out;
  }
}

/** Every deal stage in every deal pipeline, by stage id. */
export async function dealStages(): Promise<Map<string, Stage>> {
  const out = new Map<string, Stage>();
  const res = await call<{ results?: { label?: string; stages?: { id: string; label?: string; metadata?: { probability?: string; isClosed?: string } }[] }[] }>(
    'get', '/crm/v3/pipelines/deals');
  (res.results ?? []).forEach((p) => {
    (p.stages ?? []).forEach((s) => {
      const prob = s.metadata?.probability;
      const parsed = prob != null && String(prob).trim() !== '' ? Number(prob) : NaN;
      out.set(String(s.id), {
        id: String(s.id),
        label: s.label ?? null,
        pipeline: p.label ?? null,
        closed: String(s.metadata?.isClosed ?? '').toLowerCase() === 'true',
        probability: Number.isFinite(parsed) ? parsed : null,
      });
    });
  });
  return out;
}

// ---------- associations & batch reads ----------

/** For each id in `fromIds`, the ids of associated `toType` objects (all pages). */
export async function associations(fromType: string, toType: string, fromIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  await Promise.all(chunks(fromIds).map(async (chunk) => {
    const res = await call<{ results?: { from: { id: string | number }; to?: { toObjectId: string | number }[]; paging?: { next?: { after?: string } } }[] }>(
      'post', `/crm/v4/associations/${fromType}/${toType}/batch/read`, { inputs: chunk.map((id) => ({ id })) });
    for (const r of res.results ?? []) {
      const from = String(r.from.id);
      const to = out.get(from) ?? [];
      out.set(from, to);
      (r.to ?? []).forEach((t) => to.push(String(t.toObjectId)));
      let after = r.paging?.next?.after ?? null;
      while (after) {
        const page: { results?: { toObjectId: string | number }[]; paging?: { next?: { after?: string } } } = await call('get',
          `/crm/v4/objects/${fromType}/${from}/associations/${toType}?limit=500&after=${encodeURIComponent(after)}`);
        (page.results ?? []).forEach((t) => to.push(String(t.toObjectId)));
        after = page.paging?.next?.after ?? null;
      }
    }
  }));
  return out;
}

export async function batchRead(objectType: string, ids: string[], properties: string[]): Promise<CrmObject[]> {
  const parts = await Promise.all(chunks(ids).map(async (chunk) => {
    const res = await call<{ results?: RawObject[] }>('post', `/crm/v3/objects/${objectType}/batch/read`, {
      properties, inputs: chunk.map((id) => ({ id })),
    });
    return (res.results ?? []).map(toObject);
  }));
  return parts.flat();
}

// ---------- activity timeline (read live when a company is opened; cached 2 minutes) ----------

const PER_TYPE = 40;
const ACTIVITY_CACHE_MS = 2 * 60_000;
const BODY_MAX = 6000;
const TYPES = ['calls', 'notes', 'meetings', 'emails', 'tasks'] as const;
type ActivityType = typeof TYPES[number];

const ACTIVITY_PROPERTIES: Record<ActivityType, string[]> = {
  calls: ['hs_timestamp', 'hs_call_title', 'hs_call_body', 'hs_call_direction', 'hs_call_disposition',
    'hs_call_duration', 'hs_call_status', 'hubspot_owner_id'],
  notes: ['hs_timestamp', 'hs_note_body', 'hubspot_owner_id'],
  meetings: ['hs_timestamp', 'hs_meeting_title', 'hs_meeting_body', 'hs_internal_meeting_notes',
    'hs_meeting_outcome', 'hs_meeting_start_time', 'hs_meeting_end_time', 'hs_meeting_location', 'hubspot_owner_id'],
  emails: ['hs_timestamp', 'hs_email_subject', 'hs_email_text', 'hs_email_html', 'hs_email_direction',
    'hs_email_status', 'hubspot_owner_id'],
  tasks: ['hs_timestamp', 'hs_task_subject', 'hs_task_body', 'hs_task_status', 'hs_task_priority',
    'hs_task_type', 'hubspot_owner_id'],
};

export interface ActivityItem {
  type: 'call' | 'note' | 'meeting' | 'email' | 'task';
  id: string;
  timestamp: string | null;
  title: string | null;
  body: string | null;
  ownerId: string | null;
  ownerName: string | null;
  direction: string | null;
  outcome: string | null;
  durationSeconds: number | null;
  priority: string | null;
}

export interface ActivityFeed {
  items: ActivityItem[];
  unavailable: { type: string; reason: string }[];
  totals: Record<string, number>;
  fetchedAt: string;
}

const activityCache = new Map<string, { at: number; feed: ActivityFeed }>();
let callOutcomeLabels: Promise<Map<string, string>> | null = null;

/** Call outcome ids to labels such as "Connected" or "Left voicemail" — looked up once, shared by concurrent callers. */
function callOutcomes(): Promise<Map<string, string>> {
  if (!callOutcomeLabels) {
    callOutcomeLabels = loadCallOutcomes().catch((e) => {
      callOutcomeLabels = null; // e.g. a 401: let the next request try again
      throw e;
    });
  }
  return callOutcomeLabels;
}

async function loadCallOutcomes(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  // /calling/v1 is the current endpoint; /calls/v1 (what the Sales Tracker used) is retired on this portal
  for (const url of ['/calling/v1/dispositions', '/calls/v1/dispositions']) {
    if (m.size > 0) break;
    try {
      const list = await call<{ id: string; label: string }[]>('get', url);
      if (Array.isArray(list)) list.forEach((d) => m.set(String(d.id), d.label));
    } catch (e) {
      if (e instanceof HubSpotError && e.status === 401) throw e;
    }
  }
  if (m.size === 0) {
    // last resort: the property's options carry the same labels on some portals
    try {
      const prop = await call<{ options?: { value: string; label: string }[] }>('get', '/crm/v3/properties/calls/hs_call_disposition');
      (prop.options ?? []).forEach((o) => m.set(String(o.value), o.label));
    } catch (e) {
      if (e instanceof HubSpotError && e.status === 401) throw e;
    }
  }
  return m;
}

function seconds(ms: string | undefined): number | null {
  const d = parseNumber(ms);
  return d == null || d <= 0 ? null : Math.round(d / 1000);
}

async function toItem(type: ActivityType, o: CrmObject, owners: Map<string, string>): Promise<ActivityItem> {
  const p = o.properties;
  const owner = trim(p.hubspot_owner_id);
  const ownerName = owner == null ? null : owners.get(owner) ?? null;
  const at = parseInstant(p.hs_timestamp);
  const base = { id: o.id, ownerId: owner, ownerName, direction: null, outcome: null, durationSeconds: null, priority: null };
  switch (type) {
    case 'calls': {
      let outcome: string | null = null;
      const disposition = trim(p.hs_call_disposition);
      if (disposition != null) outcome = (await callOutcomes()).get(disposition) ?? null;
      if (outcome == null) {
        const s = label(p.hs_call_status);
        outcome = s === 'Completed' ? null : s; // "Completed" just means the call was logged
      }
      return {
        ...base, type: 'call', timestamp: at?.toISOString() ?? null, title: trim(p.hs_call_title),
        body: htmlToText(p.hs_call_body, BODY_MAX), direction: label(p.hs_call_direction), outcome,
        durationSeconds: seconds(p.hs_call_duration),
      };
    }
    case 'notes':
      return { ...base, type: 'note', timestamp: at?.toISOString() ?? null, title: null, body: htmlToText(p.hs_note_body, BODY_MAX) };
    case 'meetings': {
      const body = htmlToText(p.hs_meeting_body, BODY_MAX);
      const internal = htmlToText(p.hs_internal_meeting_notes, BODY_MAX);
      const text = body == null ? internal : internal == null ? body : `${body}\n\nInternal notes:\n${internal}`;
      const start = parseInstant(p.hs_meeting_start_time);
      const end = parseInstant(p.hs_meeting_end_time);
      const secs = start && end && end > start ? Math.round((end.getTime() - start.getTime()) / 1000) : null;
      return {
        ...base, type: 'meeting', timestamp: (start ?? at)?.toISOString() ?? null, title: trim(p.hs_meeting_title), body: text,
        direction: trim(p.hs_meeting_location), outcome: label(p.hs_meeting_outcome), durationSeconds: secs,
      };
    }
    case 'emails': {
      const text = trim(p.hs_email_text) == null ? htmlToText(p.hs_email_html, BODY_MAX)
        : htmlToText(p.hs_email_text.replace(/\n/g, '<br>'), BODY_MAX);
      const dir = p.hs_email_direction;
      const direction = dir == null ? null : dir.startsWith('INCOMING') ? 'Received' : dir.startsWith('FORWARDED') ? 'Forwarded' : 'Sent';
      return {
        ...base, type: 'email', timestamp: at?.toISOString() ?? null, title: trim(p.hs_email_subject), body: text,
        direction, outcome: label(p.hs_email_status),
      };
    }
    default:
      return {
        ...base, type: 'task', timestamp: at?.toISOString() ?? null, title: trim(p.hs_task_subject),
        body: htmlToText(p.hs_task_body, BODY_MAX), direction: label(p.hs_task_type), outcome: label(p.hs_task_status),
        priority: label(p.hs_task_priority),
      };
  }
}

function scopeHint(type: ActivityType): string {
  if (type === 'emails') return ': sales-email-read';
  if (type === 'tasks') return ': crm.objects.tasks.read';
  return '';
}

async function readPart(companyId: string, type: ActivityType, owners: Map<string, string>) {
  try {
    const ids = [...((await associations('companies', type, [companyId])).get(companyId) ?? [])];
    if (ids.length === 0) return { type, items: [] as ActivityItem[], total: 0, unavailable: null };
    // newest first: HubSpot ids grow over time, so the largest ids are the most recent records
    ids.sort((a, b) => Number(b) - Number(a));
    const recent = ids.slice(0, PER_TYPE);
    const objects = await batchRead(type, recent, ACTIVITY_PROPERTIES[type]);
    const items = await Promise.all(objects.map((o) => toItem(type, o, owners)));
    return { type, items, total: ids.length, unavailable: null };
  } catch (e) {
    if (e instanceof HubSpotError && e.status === 401) throw e;
    const reason = e instanceof HubSpotError && e.status === 403
      ? `The HubSpot token can't read ${type} (missing scope${scopeHint(type)}).`
      : (e as Error).message;
    return { type, items: [] as ActivityItem[], total: 0, unavailable: { type, reason } };
  }
}

export async function activityForCompany(companyHubspotId: string | null, refresh: boolean): Promise<ActivityFeed> {
  if (!companyHubspotId) return { items: [], unavailable: [], totals: {}, fetchedAt: new Date().toISOString() };
  const hit = activityCache.get(companyHubspotId);
  if (!refresh && hit && Date.now() - hit.at < ACTIVITY_CACHE_MS) return hit.feed;

  const owners = new Map<string, string>();
  try {
    (await ownerList()).forEach((o) => owners.set(o.id, ownerDisplayName(o)));
  } catch (e) {
    if (e instanceof HubSpotError && e.status === 401) throw e;
  }
  const parts = await Promise.all(TYPES.map((t) => readPart(companyHubspotId, t, owners)));
  const items: ActivityItem[] = [];
  const unavailable: { type: string; reason: string }[] = [];
  const totals: Record<string, number> = {};
  parts.forEach((p) => {
    items.push(...p.items);
    if (p.unavailable) unavailable.push(p.unavailable);
    else totals[p.type] = p.total;
  });
  items.sort((a, b) => {
    if (a.timestamp == null) return b.timestamp == null ? 0 : 1;
    if (b.timestamp == null) return -1;
    return b.timestamp.localeCompare(a.timestamp);
  });
  const feed: ActivityFeed = { items, unavailable, totals, fetchedAt: new Date().toISOString() };
  if (activityCache.size > 500) activityCache.clear();
  activityCache.set(companyHubspotId, { at: Date.now(), feed });
  return feed;
}
