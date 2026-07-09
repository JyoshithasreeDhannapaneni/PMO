import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

export type HubspotDealCategory = 'upsell' | 'cross_sell' | 'renewal' | 'new_business' | 'other';

export interface HubspotDeal {
  id: string;
  name: string;
  amount: number | null;
  stage: string;
  pipeline: string;
  dealType: string | null;
  closeDate: string | null;
  isClosedWon: boolean;
  isOpen: boolean;
  category: HubspotDealCategory;
  companyName: string;
}

export interface HubspotCustomerDeals {
  companyName: string;
  deals: HubspotDeal[];
  upsellCount: number;
  crossSellCount: number;
  openValue: number;
  wonValue: number;
}

export interface HubspotSignalsData {
  configured: boolean;
  fetchedAt: string | null;
  customers: Record<string, HubspotCustomerDeals>;
}

const HUBSPOT_API = 'https://api.hubapi.com';
const DEAL_PROPERTIES = ['dealname', 'amount', 'dealstage', 'pipeline', 'dealtype', 'closedate', 'hs_is_closed_won', 'hs_is_closed'];
const MAX_DEAL_PAGES = 10; // 100 deals per page — 1,000 most recent deals is plenty for signal data
const CACHE_TTL_MS = 5 * 60 * 1000;

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
    const { data } = await client.get('/crm/v3/objects/deals', {
      params: {
        limit: 100,
        properties: DEAL_PROPERTIES.join(','),
        associations: 'companies',
        ...(after ? { after } : {}),
      },
    });
    deals.push(...(data.results || []));
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return deals;
}

async function fetchCompanyNames(client: AxiosInstance, companyIds: string[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  for (let i = 0; i < companyIds.length; i += 100) {
    const chunk = companyIds.slice(i, i + 100);
    const { data } = await client.post('/crm/v3/objects/companies/batch/read', {
      properties: ['name'],
      inputs: chunk.map((id) => ({ id })),
    });
    for (const company of data.results || []) {
      names[company.id] = company.properties?.name || '';
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
  logger.info(`[HubSpot] Fetched ${rawDeals.length} deals`);

  const companyIds = Array.from(new Set(
    rawDeals.flatMap((d: any) => (d.associations?.companies?.results || []).map((c: any) => String(c.id)))
  ));
  const companyNames = await fetchCompanyNames(client, companyIds);

  const customers: Record<string, HubspotCustomerDeals> = {};

  for (const raw of rawDeals) {
    const companyId = String(raw.associations?.companies?.results?.[0]?.id || '');
    const companyName = companyNames[companyId] || '';
    if (!companyName) continue;

    const p = raw.properties || {};
    const isClosed = p.hs_is_closed === 'true';
    const isClosedWon = p.hs_is_closed_won === 'true';
    if (isClosed && !isClosedWon) continue; // skip closed-lost — no signal value

    const deal: HubspotDeal = {
      id: String(raw.id),
      name: p.dealname || '(unnamed deal)',
      amount: p.amount != null && p.amount !== '' ? Number(p.amount) : null,
      stage: labels.stages[p.dealstage] || p.dealstage || '',
      pipeline: labels.pipelines[p.pipeline] || p.pipeline || '',
      dealType: p.dealtype || null,
      closeDate: p.closedate || null,
      isClosedWon,
      isOpen: !isClosed,
      category: classifyDeal(p.dealname, p.dealtype),
      companyName,
    };

    const key = normalizeCustomer(companyName);
    if (!key) continue;
    if (!customers[key]) {
      customers[key] = { companyName, deals: [], upsellCount: 0, crossSellCount: 0, openValue: 0, wonValue: 0 };
    }
    const entry = customers[key];
    entry.deals.push(deal);
    if (deal.category === 'upsell') entry.upsellCount++;
    if (deal.category === 'cross_sell') entry.crossSellCount++;
    if (deal.amount !== null) {
      if (deal.isOpen) entry.openValue += deal.amount;
      if (deal.isClosedWon) entry.wonValue += deal.amount;
    }
  }

  for (const entry of Object.values(customers)) {
    entry.deals.sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || (b.amount ?? 0) - (a.amount ?? 0));
  }

  const data: HubspotSignalsData = {
    configured: true,
    fetchedAt: new Date().toISOString(),
    customers,
  };
  cache = { at: Date.now(), data };
  return data;
}
