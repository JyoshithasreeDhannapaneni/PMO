import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

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
const MAX_DEAL_PAGES = 50; // 100 deals per page × 50 pages = 5,000 deals; sorted newest-first so recent deals are always captured
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min — extended because we now fetch more pages

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

async function fetchStageLabels(client: AxiosInstance): Promise<{ stages: Record<string, string>; pipelines: Record<string, string> }> {
  const stages: Record<string, string> = {};
  const pipelines: Record<string, string> = {};
  const { data } = await client.get('/crm/v3/pipelines/deals');
  for (const pipeline of data.results || []) {
    pipelines[pipeline.id] = pipeline.label;
    for (const stage of pipeline.stages || []) {
      stages[stage.id] = stage.label;
    }
  }
  return { stages, pipelines };
}

async function fetchAllDeals(client: AxiosInstance): Promise<any[]> {
  const deals: any[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_DEAL_PAGES; page++) {
    // Use the search endpoint so we can sort newest-first — list endpoint has no sort support
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
  const map: Record<string, string> = {}; // dealId → first companyId
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

let cache: { at: number; data: HubspotSignalsData } | null = null;

export async function getDealsByCustomer(forceRefresh = false): Promise<HubspotSignalsData> {
  if (!isHubspotConfigured()) {
    return { configured: false, fetchedAt: null, customers: {} };
  }
  if (!forceRefresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  const client = makeClient();
  const [labels, rawDeals] = await Promise.all([fetchStageLabels(client), fetchAllDeals(client)]);
  logger.info(`[HubSpot] Fetched ${rawDeals.length} deals (newest-first)`);

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
      logger.warn(`[HubSpot] Company name batch fetch failed — deals keyed by deal name instead: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const customers: Record<string, HubspotCustomerDeals> = {};
  let dealsKeyedByDealName = 0;

  for (const raw of rawDeals) {
    const companyId = dealAssociations[String(raw.id)] || '';
    const companyName = companyId ? (companyNames[companyId] || '') : '';

    const p = raw.properties || {};
    const isClosed = p.hs_is_closed === 'true';
    const isClosedWon = p.hs_is_closed_won === 'true';
    const isClosedLost = isClosed && !isClosedWon;

    // When no company is linked, group by deal name so the deal is still searchable
    const groupName = companyName || (p.dealname ? String(p.dealname) : '');
    if (!groupName) continue;
    if (!companyName) dealsKeyedByDealName++;

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
    // Sort: open first, then closed-won, then closed-lost; within each group by amount desc
    entry.deals.sort((a, b) => {
      const rank = (d: HubspotDeal) => d.isOpen ? 0 : d.isClosedWon ? 1 : 2;
      return rank(a) - rank(b) || (b.amount ?? 0) - (a.amount ?? 0);
    });
  }

  logger.info(`[HubSpot] Indexed ${Object.keys(customers).length} companies/groups (${dealsKeyedByDealName} deals keyed by deal name)`);

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
  cache = { at: Date.now(), data };
  return data;
}
