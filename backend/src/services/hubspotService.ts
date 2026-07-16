import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { query, execute } from '../config/database';

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
  diagnostics?: {
    totalDeals: number;
    companyIdsFound: number;
    companyNamesFetched: number;
    companyFetchFailed: boolean;
    dealsKeyedByDealName: number;
  };
}

const HUBSPOT_API = 'https://api.hubapi.com';
const DEAL_PROPERTIES = ['dealname', 'amount', 'dealstage', 'pipeline', 'dealtype', 'closedate', 'hs_is_closed_won', 'hs_is_closed'];
const MAX_DEAL_PAGES = 50;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min — matches cron interval

// Keywords to strip when extracting company name from deal name
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

// Strip product/deal keywords from deal name to extract company name
function extractCompanyFromDealName(dealName: string): string {
  let result = dealName;
  for (const kw of PRODUCT_KEYWORDS) {
    result = result.replace(new RegExp(kw, 'gi'), ' ');
  }
  // Remove separators and clean up
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

// Non-fatal: if pipeline scope missing, returns empty maps and fetch continues
async function fetchStageLabels(client: AxiosInstance): Promise<{ stages: Record<string, string>; pipelines: Record<string, string> }> {
  try {
    const { data } = await client.get('/crm/v3/pipelines/deals');
    const stages: Record<string, string> = {};
    const pipelines: Record<string, string> = {};
    for (const pipeline of data.results || []) {
      pipelines[pipeline.id] = pipeline.label;
      for (const stage of pipeline.stages || []) {
        stages[stage.id] = stage.label;
      }
    }
    return { stages, pipelines };
  } catch (err) {
    logger.warn(`[HubSpot] Could not fetch pipeline labels (scope missing?): ${err instanceof Error ? err.message : String(err)}`);
    return { stages: {}, pipelines: {} };
  }
}

async function fetchAllDeals(client: AxiosInstance): Promise<any[]> {
  const deals: any[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_DEAL_PAGES; page++) {
    const { data } = await client.post('/crm/v3/objects/deals/search', {
      filterGroups: [],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      properties: DEAL_PROPERTIES,
      limit: 100,
      ...(after !== undefined ? { after } : {}),
    });
    deals.push(...(data.results || []));
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return deals;
}

async function fetchDealAssociations(client: AxiosInstance, dealIds: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (let i = 0; i < dealIds.length; i += 100) {
    const chunk = dealIds.slice(i, i + 100);
    try {
      const { data } = await client.post('/crm/v3/associations/deals/companies/batch/read', {
        inputs: chunk.map((id) => ({ id })),
      });
      for (const result of data.results || []) {
        const dealId = String(result.from?.id || '');
        const companyId = String(result.to?.[0]?.id || '');
        if (dealId && companyId) map[dealId] = companyId;
      }
    } catch (err) {
      logger.warn(`[HubSpot] Associations chunk ${Math.floor(i / 100) + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return map;
}

async function fetchCompanyNames(client: AxiosInstance, companyIds: string[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  for (let i = 0; i < companyIds.length; i += 100) {
    const chunk = companyIds.slice(i, i + 100);
    try {
      const { data } = await client.post('/crm/v3/objects/companies/batch/read', {
        properties: ['name'],
        inputs: chunk.map((id) => ({ id })),
      });
      for (const company of data.results || []) {
        if (company.id && company.properties?.name) {
          names[company.id] = company.properties.name;
        }
      }
    } catch (err) {
      logger.warn(`[HubSpot] Company batch chunk ${Math.floor(i / 100) + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return names;
}

// In-memory L1 cache (survives individual requests; lost on restart)
let memCache: { at: number; data: HubspotSignalsData } | null = null;

async function readDbCache(): Promise<{ data: HubspotSignalsData; fetchedAt: number } | null> {
  try {
    const result = await query(`SELECT data, fetched_at FROM hubspot_cache WHERE singleton = TRUE LIMIT 1`);
    if (result.rows.length === 0) return null;
    return { data: result.rows[0].data as HubspotSignalsData, fetchedAt: new Date(result.rows[0].fetched_at).getTime() };
  } catch {
    return null;
  }
}

async function writeDbCache(data: HubspotSignalsData): Promise<void> {
  try {
    await execute(
      `INSERT INTO hubspot_cache (singleton, fetched_at, data, updated_at)
       VALUES (TRUE, NOW(), $1, NOW())
       ON CONFLICT (singleton) DO UPDATE SET fetched_at = NOW(), data = $1, updated_at = NOW()`,
      [JSON.stringify(data)]
    );
  } catch (err) {
    logger.warn(`[HubSpot] Failed to write DB cache: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function getDealsByCustomer(forceRefresh = false): Promise<HubspotSignalsData> {
  if (!isHubspotConfigured()) {
    return { configured: false, fetchedAt: null, customers: {} };
  }

  // L1: in-memory cache
  if (!forceRefresh && memCache && Date.now() - memCache.at < CACHE_TTL_MS) {
    return memCache.data;
  }

  // L2: DB cache (survives restarts)
  if (!forceRefresh) {
    const db = await readDbCache();
    if (db && Date.now() - db.fetchedAt < CACHE_TTL_MS) {
      memCache = { at: db.fetchedAt, data: db.data };
      return db.data;
    }
  }

  // L3: fresh fetch from HubSpot API
  const client = makeClient();

  let rawDeals: any[] = [];
  try {
    const [labels, deals] = await Promise.all([fetchStageLabels(client), fetchAllDeals(client)]);
    rawDeals = deals;
    logger.info(`[HubSpot] Fetched ${rawDeals.length} deals`);

    const dealIds = rawDeals.map((d: any) => String(d.id));
    const dealAssociations = await fetchDealAssociations(client, dealIds);
    const companyIds = Array.from(new Set(Object.values(dealAssociations).filter(Boolean)));
    logger.info(`[HubSpot] ${companyIds.length} unique company IDs to resolve`);

    let companyNames: Record<string, string> = {};
    let companyFetchFailed = false;
    if (companyIds.length > 0) {
      try {
        companyNames = await fetchCompanyNames(client, companyIds);
        logger.info(`[HubSpot] Resolved ${Object.keys(companyNames).length} company names`);
      } catch (err) {
        companyFetchFailed = true;
        logger.warn(`[HubSpot] Company name batch fetch failed — falling back to deal-name extraction: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const customers: Record<string, HubspotCustomerDeals> = {};
    let dealsKeyedByDealName = 0;

    for (const raw of rawDeals) {
      const companyId = dealAssociations[String(raw.id)] || '';
      // Prefer resolved company name; fall back to extracting from deal name
      let companyName = companyId ? (companyNames[companyId] || '') : '';

      const p = raw.properties || {};
      const isClosed = p.hs_is_closed === 'true';
      const isClosedWon = p.hs_is_closed_won === 'true';
      const isClosedLost = isClosed && !isClosedWon;

      // If no company linked or name resolution failed, extract company from deal name
      if (!companyName && p.dealname) {
        companyName = extractCompanyFromDealName(String(p.dealname));
        dealsKeyedByDealName++;
      }

      const groupName = companyName;
      if (!groupName) continue;

      const pipelineLabel = labels.pipelines[p.pipeline] || p.pipeline || '';
      const deal: HubspotDeal = {
        id: String(raw.id),
        name: p.dealname || '(unnamed deal)',
        amount: p.amount != null && p.amount !== '' ? Number(p.amount) : null,
        stage: labels.stages[p.dealstage] || p.dealstage || '',
        pipeline: pipelineLabel,
        dealType: p.dealtype || null,
        closeDate: p.closedate || null,
        isClosedWon,
        isClosedLost,
        isOpen: !isClosed,
        category: classifyDeal(p.dealname, p.dealtype),
        cfProduct: identifyCfProduct(p.dealname, pipelineLabel),
        companyName: groupName,
      };

      const key = normalizeCustomer(groupName);
      if (!key) continue;
      if (!customers[key]) {
        customers[key] = { companyName: groupName, deals: [], upsellCount: 0, crossSellCount: 0, openValue: 0, wonValue: 0, productBreakdown: {} };
      }
      const entry = customers[key];
      entry.deals.push(deal);
      if (!deal.isClosedLost) {
        if (deal.category === 'upsell') entry.upsellCount++;
        if (deal.category === 'cross_sell') entry.crossSellCount++;
      }
      if (deal.amount !== null) {
        if (deal.isOpen) entry.openValue += deal.amount;
        if (deal.isClosedWon) entry.wonValue += deal.amount;
      }
      const prod = deal.cfProduct;
      if (!entry.productBreakdown[prod]) entry.productBreakdown[prod] = { openValue: 0, wonValue: 0, openCount: 0 };
      if (deal.isOpen) {
        entry.productBreakdown[prod]!.openCount++;
        if (deal.amount) entry.productBreakdown[prod]!.openValue += deal.amount;
      }
      if (deal.isClosedWon && deal.amount) {
        entry.productBreakdown[prod]!.wonValue += deal.amount;
      }
    }

    for (const entry of Object.values(customers)) {
      entry.deals.sort((a, b) => {
        const rank = (d: HubspotDeal) => d.isOpen ? 0 : d.isClosedWon ? 1 : 2;
        return rank(a) - rank(b) || (b.amount ?? 0) - (a.amount ?? 0);
      });
    }

    logger.info(`[HubSpot] Indexed ${Object.keys(customers).length} companies (${dealsKeyedByDealName} deals used deal-name fallback)`);

    const data: HubspotSignalsData = {
      configured: true,
      fetchedAt: new Date().toISOString(),
      customers,
      diagnostics: {
        totalDeals: rawDeals.length,
        companyIdsFound: Object.keys(dealAssociations).length,
        companyNamesFetched: Object.keys(companyNames).length,
        companyFetchFailed,
        dealsKeyedByDealName,
      },
    };

    memCache = { at: Date.now(), data };
    await writeDbCache(data);
    return data;

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[HubSpot] Fetch failed: ${message}`);

    // Return DB cache even if stale rather than empty on error
    const stale = await readDbCache();
    if (stale) {
      logger.info(`[HubSpot] Returning stale DB cache (${rawDeals.length} deals fetched before error)`);
      return { ...stale.data, error: `Live fetch failed — showing cached data from ${new Date(stale.fetchedAt).toLocaleString()}` };
    }

    return { configured: true, fetchedAt: null, customers: {}, error: message };
  }
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

  // Total open pipeline
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

  // Product interest from open deals
  const productMap: Partial<Record<CfProductTag, { count: number; value: number }>> = {};
  for (const d of openDeals) {
    if (d.cfProduct === 'other') continue;
    if (!productMap[d.cfProduct]) productMap[d.cfProduct] = { count: 0, value: 0 };
    productMap[d.cfProduct]!.count++;
    productMap[d.cfProduct]!.value += d.amount || 0;
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

  // Renewals coming up (within 90 days, including slightly overdue)
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

  // Overdue non-renewal open deals
  const overdue = openDeals.filter((d) => d.closeDate && new Date(d.closeDate) < now && d.category !== 'renewal');
  if (overdue.length > 0) {
    insights.push({
      type: 'action',
      priority: 'high',
      title: `${overdue.length} deal${overdue.length !== 1 ? 's' : ''} past close date`,
      detail: `Follow up needed: ${overdue.map((d) => `"${d.name}"`).slice(0, 2).join(', ')}${overdue.length > 2 ? ` +${overdue.length - 2} more` : ''}`,
    });
  }

  // Upsell signals
  if (customer.upsellCount > 0) {
    insights.push({
      type: 'opportunity',
      priority: 'medium',
      title: `${customer.upsellCount} upsell opportunit${customer.upsellCount !== 1 ? 'ies' : 'y'}`,
      detail: 'Expansion opportunities in active account',
    });
  }

  // Cross-sell signals
  if (customer.crossSellCount > 0) {
    insights.push({
      type: 'opportunity',
      priority: 'medium',
      title: `${customer.crossSellCount} cross-sell deal${customer.crossSellCount !== 1 ? 's' : ''}`,
      detail: 'Cross-product opportunity detected',
    });
  }

  // Won revenue (shows relationship health)
  if (customer.wonValue > 0 && wonDeals.length > 0) {
    insights.push({
      type: 'opportunity',
      priority: 'low',
      title: `$${customer.wonValue.toLocaleString()} lifetime value`,
      detail: `${wonDeals.length} closed-won deal${wonDeals.length !== 1 ? 's' : ''} — strong existing relationship`,
    });
  }

  // Recent loss
  const recentLoss = lostDeals.filter((d) => {
    if (!d.closeDate) return false;
    return (now.getTime() - new Date(d.closeDate).getTime()) / 86400000 <= 90;
  });
  if (recentLoss.length > 0) {
    insights.push({
      type: 'risk',
      priority: 'medium',
      title: `${recentLoss.length} deal${recentLoss.length !== 1 ? 's' : ''} lost in last 90 days`,
      detail: recentLoss.map((d) => `"${d.name}"`).slice(0, 2).join(', '),
    });
  }

  const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const TYPE_ORDER: Record<string, number> = { action: 0, renewal: 1, opportunity: 2, interest: 3, risk: 4 };
  return insights.sort((a, b) => {
    const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    return pd !== 0 ? pd : TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
  });
}
