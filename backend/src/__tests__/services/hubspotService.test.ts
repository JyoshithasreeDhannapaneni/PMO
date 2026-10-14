// Value: protects=the Customer Success page is served from stored HubSpot rows (grouped per company with correct open/won totals), a full sync stores every page of deals and removes deals deleted in HubSpot, and throttling is retried;
//   fails_when=reads go back to calling HubSpot, paging stops early (the old 5,000-deal cap), deleted deals linger, or a 429 aborts the sync; why_new=new storage design; seam=none
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

type Row = Record<string, unknown>;
let mockDealRows: Row[];
let mockSyncState: Row | undefined;
const txCalls: { sql: string; params: unknown[] }[] = [];

const mockQuery = jest.fn(async (sql: string, _params?: unknown[]) => {
  if (/FROM hubspot_sync_state/.test(sql)) return { rows: mockSyncState ? [mockSyncState] : [] };
  if (/FROM hubspot_deals/.test(sql) && /SELECT deal_id/.test(sql)) return { rows: mockDealRows };
  if (/COUNT\(\*\)/.test(sql)) return { rows: [{ deals: mockDealRows.length, companies: 1 }] };
  return { rows: [] };
});
jest.mock('../../config/database', () => ({
  query: mockQuery,
  execute: jest.fn(async () => ({ rows: [], rowCount: 0 })),
  transaction: async (cb: (c: { query: (sql: string, params: unknown[]) => Promise<unknown> }) => Promise<unknown>) =>
    cb({ query: async (sql: string, params: unknown[]) => { txCalls.push({ sql, params }); return { rows: [] }; } }),
}));
jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const mockGet = jest.fn<(url: string, cfg?: { params?: Record<string, string> }) => Promise<unknown>>();
const mockPost = jest.fn<(url: string, body?: unknown) => Promise<unknown>>();
jest.mock('axios', () => ({ __esModule: true, default: { create: () => ({ get: mockGet, post: mockPost }) } }));

import { getDealsByCustomer, syncHubspot } from '../../services/hubspotService';

const deal = (over: Row = {}): Row => ({
  deal_id: 'd1', company_id: 'c1', company_name: 'Acme Corp', normalized_company: 'acmecorp', name: 'Acme CF Migrate',
  amount: 1000, stage: 'Proposal', pipeline: 'Sales', deal_type: 'newbusiness', close_date: null,
  is_open: true, is_won: false, is_lost: false, category: 'new_business', cf_product: 'cf_migrate', ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  txCalls.length = 0;
  process.env.HUBSPOT_ACCESS_TOKEN = 'pat-test';
  mockDealRows = [];
  mockSyncState = { last_full_sync_at: new Date(), last_incremental_sync_at: new Date(), modified_cursor: new Date(), last_error: null };
});

describe('hubspotService reads', () => {
  it('builds per-company totals from stored rows without calling HubSpot', async () => {
    mockDealRows = [deal(), deal({ deal_id: 'd2', amount: 500, is_open: false, is_won: true }), deal({ deal_id: 'd3', amount: 200, is_open: false, is_lost: true })];
    mockSyncState = { ...mockSyncState, last_incremental_sync_at: new Date(Date.now() + 1) };
    const data = await getDealsByCustomer();
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
    const acme = data.customers.acmecorp;
    expect(acme.deals).toHaveLength(3);
    expect(acme.openValue).toBe(1000);
    expect(acme.wonValue).toBe(500);
    expect(acme.deals[0].isOpen).toBe(true); // open first, then won, then lost
  });
});

describe('hubspotService full sync', () => {
  it('stores every page of deals and removes deals no longer in HubSpot', async () => {
    mockSyncState = undefined; // never synced: forces a full sync
    const page = (ids: string[], after?: string) => ({
      data: {
        results: ids.map((id) => ({ id, properties: { dealname: `Deal ${id}`, amount: '100', hs_is_closed: 'false', hs_lastmodifieddate: '2026-10-14T00:00:00Z' }, associations: { companies: { results: [{ id: 'c1' }] } } })),
        ...(after ? { paging: { next: { after } } } : {}),
      },
    });
    let throttled = false;
    mockGet.mockImplementation(async (url, cfg) => {
      if (url.includes('pipelines')) return { data: { results: [] } };
      const after = cfg?.params?.after;
      if (after === '2' && !throttled) { throttled = true; throw Object.assign(new Error('rate limited'), { response: { status: 429, headers: { 'retry-after': '0' } } }); }
      return after === undefined ? page(['1', '2'], '1') : after === '1' ? page(['3'], '2') : page(['4']);
    });
    mockPost.mockResolvedValue({ data: { results: [{ id: 'c1', properties: { name: 'Acme Corp' } }] } });

    await syncHubspot(true);

    const upsert = txCalls.find((c) => /INSERT INTO hubspot_deals/.test(c.sql))!;
    expect(upsert.params.filter((p) => ['1', '2', '3', '4'].includes(String(p)))).toHaveLength(4);
    const prune = txCalls.find((c) => /DELETE FROM hubspot_deals/.test(c.sql))!;
    expect(prune.params[0]).toEqual(['1', '2', '3', '4']);
    expect(throttled).toBe(true);
  });
});
