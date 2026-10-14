import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { query, execute, transaction } from '../config/database';

// HubSpot deals per company for the Customer Success / Account Manager views.
//
// 2026-10-14 redesign: companies and deals are stored as rows (hubspot_companies,
// hubspot_deals) and every page read is served from the database, so a page never waits on
// HubSpot. A background sync keeps the rows current: a full sync (every deal, removes deals
// deleted in HubSpot) at startup when the last one is over a day old and nightly, and an
// incremental sync of deals modified since the last run every 15 minutes. The previous
// design re-downloaded every deal into one JSON blob whenever it was 15 minutes old (the
// request waited for it) and stopped at 5,000 deals.

export type HubspotDealCategory = 'upsell' | 'cross_sell' | 'renewal' | 'new_business' | 'other';
export type CfProductTag = 'cf_migrate' | 'cf_manage' | 'professional_services' | 'managed_services' | 'other';

export interface HubspotDeal {
  id: string;
  name: string;
  amount: number | null;
  stage: string;
  pipeline: string;
  dealType: string | null;
  closeDate: string | null;
  isClosedWon: boolean;
  isClosedLost: boolean;
  isOpen: boolean;
  category: HubspotDealCategory;
  cfProduct: CfProductTag;
  companyName: string;
}

export interface HubspotCustomerDeals {
  companyName: string;
  deals: HubspotDeal[];
  upsellCount: number;
  crossSellCount: number;
  openValue: number;
  wonValue: number;
  productBreakdown: Partial<Record<CfProductTag, { openValue: number; wonValue: number; openCount: number }>>;
}

export interface HubspotInsight {
  type: 'interest' | 'opportunity' | 'risk' | 'renewal' | 'action';
  priority: 'high' | 'medium' | 'low';
  product?: CfProductTag;
  title: string;
  detail: string;
}

export interface HubspotSignalsData {
  configured: boolean;
  fetchedAt: string | null;
  customers: Record<string, HubspotCustomerDeals>;
  error?: string;
  syncing?: boolean;
  diagnostics?: { totalDeals: number; companies: number; dealsWithoutCompany: number };
}

export interface HubspotSyncStatus {
  configured: boolean;
  running: boolean;
  lastFullSyncAt: string | null;
  lastIncrementalSyncAt: string | null;
  lastError: string | null;
  dealCount: number;
  companyCount: number;
}

const HUBSPOT_API = 'https://api.hubapi.com';
const DEAL_PROPERTIES = ['dealname', 'amount', 'dealstage', 'pipeline', 'dealtype', 'closedate', 'hs_is_closed_won', 'hs_is_closed', 'hs_lastmodifieddate'];
const PAGE_SIZE = 100;
const MAX_PAGES = 2000; // 200,000 deals: a runaway guard, not a working limit
const FULL_SYNC_MAX_AGE_MS = 24 * 3600 * 1000;
// Modified-time filters overlap the previous run slightly so a deal edited during a sync is not missed.
const INCREMENTAL_OVERLAP_MS = 5 * 60 * 1000;

const PRODUCT_KEYWORDS = [
  'cf migrate', 'cf manage', 'cfmigrate', 'cfmanage',
  'migration', 'managed services', 'managed service',
  'professional services', 'professional service', 'ps pack',
  'renewal', 'upsell', 'cross-sell', 'crosssell',
  'expansion', 'upgrade', 'new business',
];

function getToken(): string {
  return (process.env.HUBSPOT_ACCESS_TOKEN || '').trim();
}

export function isHubspotConfigured(): boolean {
  const token = getToken();
  return !!token && !token.startsWith('PASTE_') && token !== 'your-hubspot-access-token-here';
}

function makeClient(): AxiosInstance {
  return axios.create({
    baseURL: HUBSPOT_API,
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    timeout: 30_000,
  });
}

export function normalizeCustomer(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Deals with no associated company are grouped under a company name taken from the deal name.
function extractCompanyFromDealName(dealName: string): string {
  let result = dealName;
  for (const kw of PRODUCT_KEYWORDS) result = result.replace(new RegExp(kw, 'gi'), ' ');
  result = result.replace(/[-|:·,/()[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
  return result || dealName;
}

function identifyCfProduct(dealName: string, pipelineLabel: string): CfProductTag {
  const text = `${(dealName || '').toLowerCase()} ${(pipelineLabel || '').toLowerCase()}`;
  if (text.includes('migrate') || text.includes('migration')) return 'cf_migrate';
  if (text.includes('professional service') || text.includes('ps pack') || text.includes('prof serv')) return 'professional_services';
  if (text.includes('managed service') || text.includes('msp')) return 'managed_services';
  if (text.includes('manage') || text.includes('management')) return 'cf_manage';
  return 'other';
}

function classifyDeal(name: string, dealType: string | null): HubspotDealCategory {
  const n = (name || '').toLowerCase();
  if (n.includes('upsell') || n.includes('upgrade') || n.includes('expansion')) return 'upsell';
  if (n.includes('cross')) return 'cross_sell';
  if (n.includes('renew')) return 'renewal';
  const t = (dealType || '').toLowerCase();
  if (t === 'existingbusiness') return 'upsell';
  if (t === 'newbusiness') return 'new_business';
  return 'other';
}

// HubSpot allows ~100 requests per 10 s for a private app; back off on 429.
async function hubspotCall<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.response?.status;
      if ((status === 429 || status >= 500) && attempt < 4) {
        const wait = Number(err?.response?.headers?.['retry-after']) * 1000 || 1000 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, Math.min(wait, 20_000)));
        continue;
      }
      throw err;
    }
  }
}

async function fetchStageLabels(client: AxiosInstance): Promise<{ stages: Record<string, string>; pipelines: Record<string, string> }> {
  try {
    const { data } = await hubspotCall(() => client.get('/crm/v3/pipelines/deals'));
    const stages: Record<string, string> = {};
    const pipelines: Record<string, string> = {};
    for (const pipeline of data.results || []) {
      pipelines[pipeline.id] = pipeline.label;
      for (const stage of pipeline.stages || []) stages[stage.id] = stage.label;
    }
    return { stages, pipelines };
  } catch (err) {
    logger.warn(`[HubSpot] Could not fetch pipeline labels (scope missing?): ${err instanceof Error ? err.message : String(err)}`);
    return { stages: {}, pipelines: {} };
  }
}

interface RawDeal { id: string; properties: Record<string, string | null>; companyId: string | null }

// Every deal, with its first associated company, via the list endpoint (unlike search it
// has no 10,000-result cap).
async function fetchAllDeals(client: AxiosInstance): Promise<RawDeal[]> {
  const deals: RawDeal[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await hubspotCall(() => client.get('/crm/v3/objects/deals', {
      params: { limit: PAGE_SIZE, properties: DEAL_PROPERTIES.join(','), associations: 'companies', ...(after ? { after } : {}) },
    }));
    for (const d of data.results || []) {
      deals.push({ id: String(d.id), properties: d.properties || {}, companyId: d.associations?.companies?.results?.[0]?.id ? String(d.associations.companies.results[0].id) : null });
    }
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return deals;
}

// Deals modified since `sinceMs` (search endpoint), with their companies resolved separately.
async function fetchModifiedDeals(client: AxiosInstance, sinceMs: number): Promise<RawDeal[]> {
  const raw: { id: string; properties: Record<string, string | null> }[] = [];
  let after: string | undefined;
  for (let page = 0; page < 100; page++) {
    const { data } = await hubspotCall(() => client.post('/crm/v3/objects/deals/search', {
      filterGroups: [{ filters: [{ propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: String(sinceMs) }] }],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'ASCENDING' }],
      properties: DEAL_PROPERTIES,
      limit: PAGE_SIZE,
      ...(after ? { after } : {}),
    }));
    raw.push(...(data.results || []).map((d: { id: string; properties?: Record<string, string | null> }) => ({ id: String(d.id), properties: d.properties || {} })));
    after = data.paging?.next?.after;
    if (!after) break;
  }
  const companyByDeal = await fetchDealCompanies(client, raw.map((d) => d.id));
  return raw.map((d) => ({ ...d, companyId: companyByDeal[d.id] ?? null }));
}

async function fetchDealCompanies(client: AxiosInstance, dealIds: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (let i = 0; i < dealIds.length; i += 100) {
    const chunk = dealIds.slice(i, i + 100);
    const { data } = await hubspotCall(() => client.post('/crm/v3/associations/deals/companies/batch/read', { inputs: chunk.map((id) => ({ id })) }));
    for (const result of data.results || []) {
      const dealId = String(result.from?.id || '');
      const companyId = String(result.to?.[0]?.id || '');
      if (dealId && companyId) map[dealId] = companyId;
    }
  }
  return map;
}

async function fetchCompanyNames(client: AxiosInstance, companyIds: string[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  for (let i = 0; i < companyIds.length; i += 100) {
    const chunk = companyIds.slice(i, i + 100);
    const { data } = await hubspotCall(() => client.post('/crm/v3/objects/companies/batch/read', { properties: ['name'], inputs: chunk.map((id) => ({ id })) }));
    for (const company of data.results || []) {
      if (company.id && company.properties?.name) names[String(company.id)] = company.properties.name;
    }
  }
  return names;
}

interface DealRow {
  deal_id: string; company_id: string | null; company_name: string; normalized_company: string;
  name: string; amount: number | null; stage: string; pipeline: string; deal_type: string | null;
  close_date: string | null; is_open: boolean; is_won: boolean; is_lost: boolean;
  category: HubspotDealCategory; cf_product: CfProductTag; hs_last_modified: string | null;
}

function toDealRow(raw: RawDeal, companyNames: Record<string, string>, labels: { stages: Record<string, string>; pipelines: Record<string, string> }): DealRow | null {
  const p = raw.properties;
  const dealName = p.dealname || '(unnamed deal)';
  const companyName = (raw.companyId && companyNames[raw.companyId]) || extractCompanyFromDealName(dealName);
  const normalized = normalizeCustomer(companyName);
  if (!normalized) return null;
  const isClosed = p.hs_is_closed === 'true';
  const isWon = p.hs_is_closed_won === 'true';
  const pipelineLabel = labels.pipelines[p.pipeline || ''] || p.pipeline || '';
  return {
    deal_id: raw.id,
    company_id: raw.companyId,
    company_name: companyName,
    normalized_company: normalized,
    name: dealName,
    amount: p.amount != null && p.amount !== '' && Number.isFinite(Number(p.amount)) ? Number(p.amount) : null,
    stage: labels.stages[p.dealstage || ''] || p.dealstage || '',
    pipeline: pipelineLabel,
    deal_type: p.dealtype || null,
    close_date: p.closedate || null,
    is_open: !isClosed,
    is_won: isWon,
    is_lost: isClosed && !isWon,
    category: classifyDeal(dealName, p.dealtype || null),
    cf_product: identifyCfProduct(dealName, pipelineLabel),
    hs_last_modified: p.hs_lastmodifieddate || null,
  };
}

const UPSERT_COLUMNS = ['deal_id', 'company_id', 'company_name', 'normalized_company', 'name', 'amount', 'stage', 'pipeline', 'deal_type', 'close_date', 'is_open', 'is_won', 'is_lost', 'category', 'cf_product', 'hs_last_modified'] as const;

async function upsertDeals(client: { query: (sql: string, params: unknown[]) => Promise<unknown> }, rows: DealRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const params: unknown[] = [];
    const values = chunk.map((row) => {
      const placeholders = UPSERT_COLUMNS.map((col) => { params.push(row[col]); return `$${params.length}`; });
      return `(${placeholders.join(', ')}, NOW())`;
    });
    await client.query(
      `INSERT INTO hubspot_deals (${UPSERT_COLUMNS.join(', ')}, synced_at) VALUES ${values.join(', ')}
       ON CONFLICT (deal_id) DO UPDATE SET ${UPSERT_COLUMNS.filter((c) => c !== 'deal_id').map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, synced_at = NOW()`,
      params
    );
  }
}

async function upsertCompanies(client: { query: (sql: string, params: unknown[]) => Promise<unknown> }, names: Record<string, string>): Promise<void> {
  const entries = Object.entries(names);
  for (let i = 0; i < entries.length; i += 1000) {
    const chunk = entries.slice(i, i + 1000);
    const params: unknown[] = [];
    const values = chunk.map(([id, name]) => { params.push(id, name, normalizeCustomer(name)); return `($${params.length - 2}, $${params.length - 1}, $${params.length}, NOW())`; });
    await client.query(
      `INSERT INTO hubspot_companies (company_id, name, normalized_name, updated_at) VALUES ${values.join(', ')}
       ON CONFLICT (company_id) DO UPDATE SET name = EXCLUDED.name, normalized_name = EXCLUDED.normalized_name, updated_at = NOW()`,
      params
    );
  }
}

let _syncRunning = false;
let _signalsMemo: { version: string; data: HubspotSignalsData } | null = null;

async function readSyncState(): Promise<{ lastFull: number | null; lastIncremental: number | null; cursor: number | null; lastError: string | null }> {
  const row = (await query(`SELECT last_full_sync_at, last_incremental_sync_at, modified_cursor, last_error FROM hubspot_sync_state WHERE singleton = TRUE`)).rows[0];
  const ms = (v: string | Date | null | undefined) => (v ? new Date(v).getTime() : null);
  return { lastFull: ms(row?.last_full_sync_at), lastIncremental: ms(row?.last_incremental_sync_at), cursor: ms(row?.modified_cursor), lastError: row?.last_error ?? null };
}

// Full sync: every deal and company, and deals no longer in HubSpot are removed.
async function runFullSync(): Promise<void> {
  const client = makeClient();
  const startedAt = Date.now();
  const [labels, deals] = await Promise.all([fetchStageLabels(client), fetchAllDeals(client)]);
  const companyIds = [...new Set(deals.map((d) => d.companyId).filter((id): id is string => !!id))];
  const companyNames = await fetchCompanyNames(client, companyIds);
  const rows = deals.map((d) => toDealRow(d, companyNames, labels)).filter((r): r is DealRow => !!r);
  const newest = Math.max(startedAt - INCREMENTAL_OVERLAP_MS, ...rows.map((r) => (r.hs_last_modified ? Date.parse(r.hs_last_modified) : 0)));
  await transaction(async (tx) => {
    await upsertCompanies(tx, companyNames);
    await upsertDeals(tx, rows);
    await tx.query(`DELETE FROM hubspot_deals WHERE NOT (deal_id = ANY($1::text[]))`, [rows.map((r) => r.deal_id)]);
    await tx.query(
      `INSERT INTO hubspot_sync_state (singleton, last_full_sync_at, last_incremental_sync_at, modified_cursor, last_error, updated_at)
       VALUES (TRUE, NOW(), NOW(), $1, NULL, NOW())
       ON CONFLICT (singleton) DO UPDATE SET last_full_sync_at = NOW(), last_incremental_sync_at = NOW(), modified_cursor = $1, last_error = NULL, updated_at = NOW()`,
      [new Date(newest)]
    );
  });
  logger.info(`[HubSpot] Full sync: ${rows.length} deals, ${Object.keys(companyNames).length} companies in ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

async function runIncrementalSync(cursorMs: number): Promise<void> {
  const client = makeClient();
  const startedAt = Date.now();
  const deals = await fetchModifiedDeals(client, cursorMs - INCREMENTAL_OVERLAP_MS);
  const known = new Set((await query(`SELECT company_id FROM hubspot_companies`)).rows.map((r: { company_id: string }) => r.company_id));
  const unknownIds = [...new Set(deals.map((d) => d.companyId).filter((id): id is string => !!id && !known.has(id)))];
  const companyNames: Record<string, string> = {};
  if (deals.length > 0) {
    const touched = [...new Set(deals.map((d) => d.companyId).filter((id): id is string => !!id))];
    const knownRows = (await query(`SELECT company_id, name FROM hubspot_companies WHERE company_id = ANY($1::text[])`, [touched])).rows;
    for (const r of knownRows as { company_id: string; name: string }[]) companyNames[r.company_id] = r.name;
    Object.assign(companyNames, await fetchCompanyNames(client, unknownIds));
  }
  const labels = deals.length > 0 ? await fetchStageLabels(client) : { stages: {}, pipelines: {} };
  const rows = deals.map((d) => toDealRow(d, companyNames, labels)).filter((r): r is DealRow => !!r);
  const newest = Math.max(cursorMs, ...rows.map((r) => (r.hs_last_modified ? Date.parse(r.hs_last_modified) : 0)));
  await transaction(async (tx) => {
    const fresh: Record<string, string> = {};
    for (const id of unknownIds) if (companyNames[id]) fresh[id] = companyNames[id];
    await upsertCompanies(tx, fresh);
    await upsertDeals(tx, rows);
    await tx.query(
      `UPDATE hubspot_sync_state SET last_incremental_sync_at = NOW(), modified_cursor = $1, last_error = NULL, updated_at = NOW() WHERE singleton = TRUE`,
      [new Date(newest)]
    );
  });
  if (rows.length > 0) logger.info(`[HubSpot] Incremental sync: ${rows.length} changed deals in ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

// Runs a full sync when none has happened in the last day (or `full` is set), otherwise an
// incremental one. Only one sync runs at a time; a call during a run is a no-op.
export async function syncHubspot(full = false): Promise<{ ran: boolean }> {
  if (!isHubspotConfigured() || _syncRunning) return { ran: false };
  _syncRunning = true;
  try {
    const state = await readSyncState();
    const needFull = full || !state.lastFull || !state.cursor || Date.now() - state.lastFull > FULL_SYNC_MAX_AGE_MS;
    if (needFull) await runFullSync();
    else await runIncrementalSync(state.cursor!);
    _signalsMemo = null;
    return { ran: true };
  } catch (err: any) {
    const message = err?.response?.data?.message || err?.message || String(err);
    logger.error(`[HubSpot] Sync failed: ${message}`);
    await execute(
      `INSERT INTO hubspot_sync_state (singleton, last_error, updated_at) VALUES (TRUE, $1, NOW())
       ON CONFLICT (singleton) DO UPDATE SET last_error = $1, updated_at = NOW()`,
      [message.slice(0, 500)]
    ).catch(() => undefined);
    return { ran: true };
  } finally {
    _syncRunning = false;
  }
}

export function triggerHubspotSync(full = false): void {
  syncHubspot(full).catch((err) => logger.error(`[HubSpot] Background sync crashed: ${err?.message}`));
}

export async function getSyncStatus(): Promise<HubspotSyncStatus> {
  const state = await readSyncState();
  const counts = (await query(`SELECT (SELECT COUNT(*) FROM hubspot_deals)::int AS deals, (SELECT COUNT(*) FROM hubspot_companies)::int AS companies`)).rows[0];
  return {
    configured: isHubspotConfigured(),
    running: _syncRunning,
    lastFullSyncAt: state.lastFull ? new Date(state.lastFull).toISOString() : null,
    lastIncrementalSyncAt: state.lastIncremental ? new Date(state.lastIncremental).toISOString() : null,
    lastError: state.lastError,
    dealCount: counts?.deals ?? 0,
    companyCount: counts?.companies ?? 0,
  };
}

// Served entirely from the database (memoised until the next sync changes it).
export async function getDealsByCustomer(): Promise<HubspotSignalsData> {
  if (!isHubspotConfigured()) return { configured: false, fetchedAt: null, customers: {} };
  const state = await readSyncState();
  const lastSync = Math.max(state.lastFull ?? 0, state.lastIncremental ?? 0);
  const version = `${lastSync}`;
  if (_signalsMemo && _signalsMemo.version === version) {
    return { ..._signalsMemo.data, syncing: _syncRunning, ...(state.lastError ? { error: state.lastError } : {}) };
  }

  const rows = (await query(
    `SELECT deal_id, company_id, company_name, normalized_company, name, amount::float8 AS amount, stage, pipeline, deal_type,
            close_date, is_open, is_won, is_lost, category, cf_product
     FROM hubspot_deals`
  )).rows as (DealRow & { close_date: Date | string | null })[];

  const customers: Record<string, HubspotCustomerDeals> = {};
  let withoutCompany = 0;
  for (const r of rows) {
    if (!r.company_id) withoutCompany++;
    const key = r.normalized_company;
    if (!customers[key]) customers[key] = { companyName: r.company_name, deals: [], upsellCount: 0, crossSellCount: 0, openValue: 0, wonValue: 0, productBreakdown: {} };
    const entry = customers[key];
    const deal: HubspotDeal = {
      id: r.deal_id, name: r.name, amount: r.amount, stage: r.stage, pipeline: r.pipeline, dealType: r.deal_type,
      closeDate: r.close_date ? new Date(r.close_date).toISOString() : null,
      isClosedWon: r.is_won, isClosedLost: r.is_lost, isOpen: r.is_open,
      category: r.category, cfProduct: r.cf_product, companyName: r.company_name,
    };
    entry.deals.push(deal);
    if (!deal.isClosedLost) {
      if (deal.category === 'upsell') entry.upsellCount++;
      if (deal.category === 'cross_sell') entry.crossSellCount++;
    }
    if (deal.amount !== null) {
      if (deal.isOpen) entry.openValue += deal.amount;
      if (deal.isClosedWon) entry.wonValue += deal.amount;
    }
    const prod = (entry.productBreakdown[deal.cfProduct] ??= { openValue: 0, wonValue: 0, openCount: 0 });
    if (deal.isOpen) { prod.openCount++; if (deal.amount) prod.openValue += deal.amount; }
    if (deal.isClosedWon && deal.amount) prod.wonValue += deal.amount;
  }
  for (const entry of Object.values(customers)) {
    entry.deals.sort((a, b) => {
      const rank = (d: HubspotDeal) => (d.isOpen ? 0 : d.isClosedWon ? 1 : 2);
      return rank(a) - rank(b) || (b.amount ?? 0) - (a.amount ?? 0);
    });
  }

  const data: HubspotSignalsData = {
    configured: true,
    fetchedAt: lastSync ? new Date(lastSync).toISOString() : null,
    customers,
    diagnostics: { totalDeals: rows.length, companies: Object.keys(customers).length, dealsWithoutCompany: withoutCompany },
  };
  _signalsMemo = { version, data };
  return { ...data, syncing: _syncRunning, ...(state.lastError ? { error: state.lastError } : {}) };
}

const PRODUCT_LABELS: Record<CfProductTag, string> = {
  cf_migrate: 'CF Migrate',
  cf_manage: 'CF Manage',
  professional_services: 'Professional Services',
  managed_services: 'Managed Services',
  other: 'Other',
};

export function generateInsights(customer: HubspotCustomerDeals): HubspotInsight[] {
  const insights: HubspotInsight[] = [];
  const { deals } = customer;
  const now = new Date();

  const openDeals = deals.filter((d) => d.isOpen);
  const wonDeals = deals.filter((d) => d.isClosedWon);
  const lostDeals = deals.filter((d) => d.isClosedLost);

  if (customer.openValue > 0) {
    const topDeal = [...openDeals].sort((a, b) => (b.amount || 0) - (a.amount || 0))[0];
    insights.push({
      type: 'opportunity',
      priority: customer.openValue >= 50000 ? 'high' : customer.openValue >= 10000 ? 'medium' : 'low',
      product: topDeal?.cfProduct,
      title: `$${customer.openValue.toLocaleString()} open pipeline`,
      detail: `${openDeals.length} active deal${openDeals.length !== 1 ? 's' : ''} · top: "${topDeal?.name || 'N/A'}" (${topDeal?.stage || 'pipeline'})`,
    });
  }

  const productMap: Partial<Record<CfProductTag, { count: number; value: number }>> = {};
  for (const d of openDeals) {
    if (d.cfProduct === 'other') continue;
    const p = (productMap[d.cfProduct] ??= { count: 0, value: 0 });
    p.count++;
    p.value += d.amount || 0;
  }
  for (const [product, stats] of Object.entries(productMap) as [CfProductTag, { count: number; value: number }][]) {
    if (stats.count === 0) continue;
    insights.push({
      type: 'interest',
      priority: stats.value >= 20000 ? 'high' : 'medium',
      product,
      title: `Interested in ${PRODUCT_LABELS[product]}`,
      detail: `${stats.count} open deal${stats.count !== 1 ? 's' : ''}${stats.value > 0 ? ` · $${stats.value.toLocaleString()}` : ''}`,
    });
  }

  const renewals = openDeals.filter((d) => {
    if (d.category !== 'renewal' || !d.closeDate) return false;
    const days = (new Date(d.closeDate).getTime() - now.getTime()) / 86400000;
    return days >= -7 && days <= 90;
  });
  for (const r of renewals) {
    const days = Math.round((new Date(r.closeDate!).getTime() - now.getTime()) / 86400000);
    insights.push({
      type: 'renewal',
      priority: days <= 14 ? 'high' : 'medium',
      title: days < 0 ? `Renewal overdue by ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''}` : `Renewal due in ${days} day${days !== 1 ? 's' : ''}`,
      detail: `"${r.name}" · ${r.stage || 'no stage'}`,
    });
  }

  const overdue = openDeals.filter((d) => d.closeDate && new Date(d.closeDate) < now && d.category !== 'renewal');
  if (overdue.length > 0) {
    insights.push({
      type: 'action',
      priority: 'high',
      title: `${overdue.length} deal${overdue.length !== 1 ? 's' : ''} past close date`,
      detail: `Follow up needed: ${overdue.map((d) => `"${d.name}"`).slice(0, 2).join(', ')}${overdue.length > 2 ? ` +${overdue.length - 2} more` : ''}`,
    });
  }

  if (customer.upsellCount > 0) {
    insights.push({
      type: 'opportunity', priority: 'medium',
      title: `${customer.upsellCount} upsell opportunit${customer.upsellCount !== 1 ? 'ies' : 'y'}`,
      detail: 'Expansion opportunities in active account',
    });
  }

  if (customer.crossSellCount > 0) {
    insights.push({
      type: 'opportunity', priority: 'medium',
      title: `${customer.crossSellCount} cross-sell deal${customer.crossSellCount !== 1 ? 's' : ''}`,
      detail: 'Cross-product opportunity detected',
    });
  }

  if (customer.wonValue > 0 && wonDeals.length > 0) {
    insights.push({
      type: 'opportunity', priority: 'low',
      title: `$${customer.wonValue.toLocaleString()} lifetime value`,
      detail: `${wonDeals.length} closed-won deal${wonDeals.length !== 1 ? 's' : ''} — strong existing relationship`,
    });
  }

  const recentLoss = lostDeals.filter((d) => d.closeDate && (now.getTime() - new Date(d.closeDate).getTime()) / 86400000 <= 90);
  if (recentLoss.length > 0) {
    insights.push({
      type: 'risk', priority: 'medium',
      title: `${recentLoss.length} deal${recentLoss.length !== 1 ? 's' : ''} lost in last 90 days`,
      detail: recentLoss.map((d) => `"${d.name}"`).slice(0, 2).join(', '),
    });
  }

  const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const TYPE_ORDER: Record<string, number> = { action: 0, renewal: 1, opportunity: 2, interest: 3, risk: 4 };
  return insights.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
}
