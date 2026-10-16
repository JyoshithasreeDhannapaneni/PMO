import { query, transaction } from '../config/database';
import { logger } from '../utils/logger';

// Customer Success → Account Tracker storage. The tables belong to this module only and are
// created here on first use (idempotent), so the module stays self-contained instead of adding
// to index.ts's runMigrations(). Every row is partitioned by owner_key = the HubSpot owner id
// whose book of business it belongs to.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS cs_tracker_companies (
    id BIGSERIAL PRIMARY KEY,
    owner_key VARCHAR(40) NOT NULL,
    hubspot_id VARCHAR(40) NOT NULL,
    company TEXT,
    domain TEXT,
    website TEXT,
    hubspot_link TEXT,
    industry_group TEXT,
    industry TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    employees INTEGER,
    employee_size_tier TEXT,
    annual_revenue TEXT,
    annual_revenue_value DOUBLE PRECISION,
    founded_year TEXT,
    phone TEXT,
    linkedin TEXT,
    lifecycle_stage TEXT,
    open_deals INTEGER,
    associated_deals INTEGER,
    times_reached_out INTEGER,
    reached_out TEXT,
    outreach_stage TEXT,
    msp_flag TEXT,
    custom_probability TEXT,
    primary_contact_name TEXT,
    primary_contact_title TEXT,
    primary_contact_email TEXT,
    org_overview TEXT,
    last_contact_date VARCHAR(10),
    calls_count INTEGER,
    emails_count INTEGER,
    meetings_count INTEGER,
    notes_count INTEGER,
    hubspot_modified_at TEXT,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (owner_key, hubspot_id)
  )`,
  `CREATE TABLE IF NOT EXISTS cs_tracker_contacts (
    id BIGSERIAL PRIMARY KEY,
    owner_key VARCHAR(40) NOT NULL,
    company_hubspot_id VARCHAR(40) NOT NULL,
    hubspot_id VARCHAR(40) NOT NULL,
    company_domain TEXT,
    contact_name TEXT,
    title TEXT,
    email TEXT,
    phone TEXT,
    linkedin TEXT,
    row_index INTEGER,
    UNIQUE (owner_key, company_hubspot_id, hubspot_id)
  )`,
  `CREATE TABLE IF NOT EXISTS cs_tracker_deals (
    id BIGSERIAL PRIMARY KEY,
    owner_key VARCHAR(40) NOT NULL,
    hubspot_id VARCHAR(40) NOT NULL,
    deal_owner_id VARCHAR(40),
    deal_owner_name TEXT,
    mine BOOLEAN,
    name TEXT,
    amount DOUBLE PRECISION,
    currency VARCHAR(10),
    stage_id TEXT,
    stage_label TEXT,
    pipeline_label TEXT,
    status VARCHAR(10),
    stage_probability DOUBLE PRECISION,
    close_date VARCHAR(10),
    create_date VARCHAR(10),
    deal_type TEXT,
    lost_reason TEXT,
    won_reason TEXT,
    next_step TEXT,
    description TEXT,
    company_hubspot_id VARCHAR(40),
    company_name TEXT,
    hubspot_link TEXT,
    hubspot_modified_at TEXT,
    last_seen_at TIMESTAMPTZ,
    UNIQUE (owner_key, hubspot_id)
  )`,
  `CREATE TABLE IF NOT EXISTS cs_tracker_sync_state (
    owner_key VARCHAR(40) PRIMARY KEY,
    source VARCHAR(20),
    owner_name TEXT,
    owner_email TEXT,
    portal_id VARCHAR(40),
    last_synced_at TIMESTAMPTZ,
    last_full_sync_at TIMESTAMPTZ,
    last_sync_summary TEXT,
    last_sync_error TEXT,
    sync_warnings TEXT,
    outreach_complete BOOLEAN
  )`,
  `CREATE TABLE IF NOT EXISTS cs_tracker_owner_links (
    user_id VARCHAR(64) PRIMARY KEY,
    hubspot_owner_id VARCHAR(40) NOT NULL,
    hubspot_owner_name TEXT,
    updated_by VARCHAR(64),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  // AI analysis, stored so the same input is never sent to the model twice. subject = company HubSpot id
  // (company-level kinds) or "owner:<HubSpot owner id>" (deal insights); fingerprint = hash of the inputs used.
  `CREATE TABLE IF NOT EXISTS cs_tracker_ai (
    subject VARCHAR(80) NOT NULL,
    kind VARCHAR(20) NOT NULL,
    fingerprint VARCHAR(64),
    content JSONB,
    model VARCHAR(60),
    generated_at TIMESTAMPTZ,
    error TEXT,
    attempted_at TIMESTAMPTZ,
    PRIMARY KEY (subject, kind)
  )`,
  // What the AI has cost per person per calendar month (estimated from token usage), so the monthly cap holds.
  `CREATE TABLE IF NOT EXISTS cs_tracker_ai_spend (
    owner_key VARCHAR(40) NOT NULL,
    month CHAR(7) NOT NULL,
    usd NUMERIC(12,6) NOT NULL DEFAULT 0,
    PRIMARY KEY (owner_key, month)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_cs_tracker_contacts_owner ON cs_tracker_contacts (owner_key)',
  'CREATE INDEX IF NOT EXISTS idx_cs_tracker_deals_owner_company ON cs_tracker_deals (owner_key, company_hubspot_id)',
];

let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const sql of SCHEMA) await query(sql);
      logger.info('[AccountTracker] Schema ready');
    })().catch((e) => {
      ready = null; // retry on the next request
      throw e;
    });
  }
  return ready;
}

// ---------- row shapes (camelCase in code, snake_case in the database) ----------

export interface CompanyRecord {
  id?: number;
  ownerKey: string;
  hubspotId: string;
  company: string | null;
  domain: string | null;
  website: string | null;
  hubspotLink: string | null;
  industryGroup: string | null;
  industry: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  employees: number | null;
  employeeSizeTier: string | null;
  annualRevenue: string | null;
  annualRevenueValue: number | null;
  foundedYear: string | null;
  phone: string | null;
  linkedin: string | null;
  lifecycleStage: string | null;
  openDeals: number | null;
  associatedDeals: number | null;
  timesReachedOut: number | null;
  reachedOut: string | null;
  outreachStage: string | null;
  mspFlag: string | null;
  customProbability: string | null;
  primaryContactName: string | null;
  primaryContactTitle: string | null;
  primaryContactEmail: string | null;
  orgOverview: string | null;
  lastContactDate: string | null;
  callsCount: number | null;
  emailsCount: number | null;
  meetingsCount: number | null;
  notesCount: number | null;
  hubspotModifiedAt: string | null;
  lastSeenAt: Date | null;
}

export interface ContactRecord {
  id?: number;
  ownerKey: string;
  companyHubspotId: string;
  hubspotId: string;
  companyDomain: string | null;
  contactName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  rowIndex: number | null;
}

export type DealStatus = 'OPEN' | 'WON' | 'LOST';

export interface DealRecord {
  id?: number;
  ownerKey: string;
  hubspotId: string;
  dealOwnerId: string | null;
  dealOwnerName: string | null;
  mine: boolean | null;
  name: string | null;
  amount: number | null;
  currency: string | null;
  stageId: string | null;
  stageLabel: string | null;
  pipelineLabel: string | null;
  status: DealStatus | null;
  stageProbability: number | null;
  closeDate: string | null;
  createDate: string | null;
  dealType: string | null;
  lostReason: string | null;
  wonReason: string | null;
  nextStep: string | null;
  description: string | null;
  companyHubspotId: string | null;
  companyName: string | null;
  hubspotLink: string | null;
  hubspotModifiedAt: string | null;
  lastSeenAt: Date | null;
}

export interface SyncStateRecord {
  ownerKey: string;
  source: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  portalId: string | null;
  lastSyncedAt: Date | null;
  lastFullSyncAt: Date | null;
  lastSyncSummary: string | null;
  lastSyncError: string | null;
  syncWarnings: string | null;
  outreachComplete: boolean | null;
}

const snake = (k: string): string => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const camel = (k: string): string => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  Object.entries(row).forEach(([k, v]) => {
    // BIGSERIAL ids come back as strings from pg; they are far below 2^53 (users.id is a UUID and stays a string)
    out[camel(k)] = k === 'id' && typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  });
  return out as T;
}

const COMPANY_FIELDS: (keyof CompanyRecord)[] = [
  'ownerKey', 'hubspotId', 'company', 'domain', 'website', 'hubspotLink', 'industryGroup', 'industry', 'city', 'state',
  'country', 'employees', 'employeeSizeTier', 'annualRevenue', 'annualRevenueValue', 'foundedYear', 'phone', 'linkedin',
  'lifecycleStage', 'openDeals', 'associatedDeals', 'timesReachedOut', 'reachedOut', 'outreachStage', 'mspFlag',
  'customProbability', 'primaryContactName', 'primaryContactTitle', 'primaryContactEmail', 'orgOverview',
  'lastContactDate', 'callsCount', 'emailsCount', 'meetingsCount', 'notesCount', 'hubspotModifiedAt', 'lastSeenAt',
];

const CONTACT_FIELDS: (keyof ContactRecord)[] = [
  'ownerKey', 'companyHubspotId', 'hubspotId', 'companyDomain', 'contactName', 'title', 'email', 'phone', 'linkedin', 'rowIndex',
];

const DEAL_FIELDS: (keyof DealRecord)[] = [
  'ownerKey', 'hubspotId', 'dealOwnerId', 'dealOwnerName', 'mine', 'name', 'amount', 'currency', 'stageId', 'stageLabel',
  'pipelineLabel', 'status', 'stageProbability', 'closeDate', 'createDate', 'dealType', 'lostReason', 'wonReason',
  'nextStep', 'description', 'companyHubspotId', 'companyName', 'hubspotLink', 'hubspotModifiedAt', 'lastSeenAt',
];

const STATE_FIELDS: (keyof SyncStateRecord)[] = [
  'ownerKey', 'source', 'ownerName', 'ownerEmail', 'portalId', 'lastSyncedAt', 'lastFullSyncAt', 'lastSyncSummary',
  'lastSyncError', 'syncWarnings', 'outreachComplete',
];

type Client = { query: (sql: string, params: unknown[]) => Promise<unknown> };

/** Batched INSERT … ON CONFLICT DO UPDATE (update in place, never delete). */
async function upsert<T>(client: Client, table: string, fields: (keyof T)[], conflict: string[], rows: T[]): Promise<void> {
  if (rows.length === 0) return;
  const cols = fields.map((f) => snake(String(f)));
  const updates = cols.filter((c) => !conflict.includes(c)).map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  const per = Math.max(1, Math.floor(30_000 / cols.length));
  for (let i = 0; i < rows.length; i += per) {
    const slice = rows.slice(i, i + per);
    const params: unknown[] = [];
    const values = slice.map((r) => `(${fields.map((f) => {
      params.push((r as Record<string, unknown>)[String(f)] ?? null);
      return `$${params.length}`;
    }).join(', ')})`).join(', ');
    await client.query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${values} ON CONFLICT (${conflict.join(', ')}) DO UPDATE SET ${updates}`,
      params,
    );
  }
}

// ---------- reads ----------

export async function companiesOf(ownerKey: string): Promise<CompanyRecord[]> {
  const r = await query('SELECT * FROM cs_tracker_companies WHERE owner_key = ? ORDER BY lower(company), id', [ownerKey]);
  return r.rows.map((x) => fromRow<CompanyRecord>(x));
}

export async function companyById(id: number, ownerKey: string | null): Promise<CompanyRecord | null> {
  const r = ownerKey == null
    ? await query('SELECT * FROM cs_tracker_companies WHERE id = ?', [id])
    : await query('SELECT * FROM cs_tracker_companies WHERE id = ? AND owner_key = ?', [id, ownerKey]);
  return r.rows[0] ? fromRow<CompanyRecord>(r.rows[0]) : null;
}

export async function companyIdsByHubspotId(ownerKey: string): Promise<Map<string, number>> {
  const r = await query('SELECT hubspot_id, id FROM cs_tracker_companies WHERE owner_key = ?', [ownerKey]);
  const m = new Map<string, number>();
  r.rows.forEach((x: { hubspot_id: string; id: string }) => m.set(x.hubspot_id, Number(x.id)));
  return m;
}

export async function countCompanies(ownerKey: string): Promise<number> {
  const r = await query('SELECT COUNT(*)::int AS n FROM cs_tracker_companies WHERE owner_key = ?', [ownerKey]);
  return r.rows[0]?.n ?? 0;
}

export async function contactsOf(ownerKey: string): Promise<ContactRecord[]> {
  const r = await query('SELECT * FROM cs_tracker_contacts WHERE owner_key = ? ORDER BY company_hubspot_id, row_index, id', [ownerKey]);
  return r.rows.map((x) => fromRow<ContactRecord>(x));
}

export async function contactsOfCompany(ownerKey: string, companyHubspotId: string): Promise<ContactRecord[]> {
  const r = await query(
    'SELECT * FROM cs_tracker_contacts WHERE owner_key = ? AND company_hubspot_id = ? ORDER BY row_index, id',
    [ownerKey, companyHubspotId]);
  return r.rows.map((x) => fromRow<ContactRecord>(x));
}

export async function countContacts(ownerKey: string): Promise<number> {
  const r = await query('SELECT COUNT(*)::int AS n FROM cs_tracker_contacts WHERE owner_key = ?', [ownerKey]);
  return r.rows[0]?.n ?? 0;
}

export async function dealsOf(ownerKey: string): Promise<DealRecord[]> {
  const r = await query('SELECT * FROM cs_tracker_deals WHERE owner_key = ?', [ownerKey]);
  return r.rows.map((x) => fromRow<DealRecord>(x));
}

export async function dealsOfCompany(ownerKey: string, companyHubspotId: string): Promise<DealRecord[]> {
  const r = await query('SELECT * FROM cs_tracker_deals WHERE owner_key = ? AND company_hubspot_id = ?', [ownerKey, companyHubspotId]);
  return r.rows.map((x) => fromRow<DealRecord>(x));
}

export async function countDeals(ownerKey: string): Promise<number> {
  const r = await query('SELECT COUNT(*)::int AS n FROM cs_tracker_deals WHERE owner_key = ?', [ownerKey]);
  return r.rows[0]?.n ?? 0;
}

export async function syncState(ownerKey: string): Promise<SyncStateRecord | null> {
  const r = await query('SELECT * FROM cs_tracker_sync_state WHERE owner_key = ?', [ownerKey]);
  return r.rows[0] ? fromRow<SyncStateRecord>(r.rows[0]) : null;
}

export async function syncedOwnerKeys(): Promise<Set<string>> {
  const r = await query("SELECT owner_key FROM cs_tracker_sync_state WHERE source = 'hubspot'");
  return new Set(r.rows.map((x: { owner_key: string }) => x.owner_key));
}

// ---------- writes ----------

export async function saveCompaniesAndContacts(companies: CompanyRecord[], contacts: ContactRecord[]): Promise<void> {
  await transaction(async (client: Client) => {
    await upsert(client, 'cs_tracker_companies', COMPANY_FIELDS, ['owner_key', 'hubspot_id'], companies);
    await upsert(client, 'cs_tracker_contacts', CONTACT_FIELDS, ['owner_key', 'company_hubspot_id', 'hubspot_id'], contacts);
  });
}

export async function saveDeals(deals: DealRecord[]): Promise<void> {
  await transaction(async (client: Client) => {
    await upsert(client, 'cs_tracker_deals', DEAL_FIELDS, ['owner_key', 'hubspot_id'], deals);
  });
}

export async function updateSyncState(ownerKey: string, change: Partial<SyncStateRecord>): Promise<void> {
  const current = (await syncState(ownerKey)) ?? ({ ownerKey } as SyncStateRecord);
  const next = { ...current, ...change, ownerKey };
  await transaction(async (client: Client) => {
    await upsert(client, 'cs_tracker_sync_state', STATE_FIELDS, ['owner_key'], [next]);
  });
}

// ---------- stored AI analysis ----------

export type AiKind = 'account' | 'deals';

export interface AiRecord {
  subject: string;
  kind: AiKind;
  fingerprint: string | null;
  content: unknown;
  model: string | null;
  generatedAt: Date | null;
  error: string | null;
  attemptedAt: Date | null;
}

export async function aiRecords(subjects: string[]): Promise<AiRecord[]> {
  if (subjects.length === 0) return [];
  const r = await query('SELECT * FROM cs_tracker_ai WHERE subject = ANY(?::text[])', [subjects]);
  return r.rows.map((x) => fromRow<AiRecord>(x));
}

/** A successful result replaces the stored one; a failure keeps the last good content and records the error. */
export async function saveAiResult(subject: string, kind: AiKind, fingerprint: string, content: unknown, model: string): Promise<void> {
  await query(
    `INSERT INTO cs_tracker_ai (subject, kind, fingerprint, content, model, generated_at, error, attempted_at)
     VALUES (?, ?, ?, ?::jsonb, ?, NOW(), NULL, NOW())
     ON CONFLICT (subject, kind) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, content = EXCLUDED.content,
       model = EXCLUDED.model, generated_at = NOW(), error = NULL, attempted_at = NOW()`,
    [subject, kind, fingerprint, JSON.stringify(content), model]);
}

export async function saveAiFailure(subject: string, kind: AiKind, error: string): Promise<void> {
  await query(
    `INSERT INTO cs_tracker_ai (subject, kind, error, attempted_at) VALUES (?, ?, ?, NOW())
     ON CONFLICT (subject, kind) DO UPDATE SET error = EXCLUDED.error, attempted_at = NOW()`,
    [subject, kind, error.slice(0, 2000)]);
}

export async function aiSpend(ownerKey: string, month: string): Promise<number> {
  const r = await query('SELECT usd FROM cs_tracker_ai_spend WHERE owner_key = ? AND month = ?', [ownerKey, month]);
  return Number(r.rows[0]?.usd ?? 0);
}

export async function addAiSpend(ownerKey: string, month: string, usd: number): Promise<void> {
  if (!(usd > 0)) return;
  await query(
    `INSERT INTO cs_tracker_ai_spend (owner_key, month, usd) VALUES (?, ?, ?)
     ON CONFLICT (owner_key, month) DO UPDATE SET usd = cs_tracker_ai_spend.usd + EXCLUDED.usd`,
    [ownerKey, month, usd]);
}

// ---------- manual links between PMO users and HubSpot owners ----------

export interface OwnerLink { userId: string; hubspotOwnerId: string; hubspotOwnerName: string | null }

export async function ownerLink(userId: string): Promise<OwnerLink | null> {
  const r = await query('SELECT user_id, hubspot_owner_id, hubspot_owner_name FROM cs_tracker_owner_links WHERE user_id = ?', [userId]);
  return r.rows[0] ? fromRow<OwnerLink>(r.rows[0]) : null;
}

export async function ownerLinks(): Promise<Map<string, OwnerLink>> {
  const r = await query('SELECT user_id, hubspot_owner_id, hubspot_owner_name FROM cs_tracker_owner_links');
  const m = new Map<string, OwnerLink>();
  r.rows.forEach((x) => {
    const l = fromRow<OwnerLink>(x);
    m.set(l.userId, l);
  });
  return m;
}

export async function setOwnerLink(userId: string, owner: { id: string; name: string } | null, actorId: string): Promise<void> {
  if (owner == null) {
    await query('DELETE FROM cs_tracker_owner_links WHERE user_id = ?', [userId]);
    return;
  }
  await query(
    `INSERT INTO cs_tracker_owner_links (user_id, hubspot_owner_id, hubspot_owner_name, updated_by, updated_at)
     VALUES (?, ?, ?, ?, NOW())
     ON CONFLICT (user_id) DO UPDATE SET hubspot_owner_id = EXCLUDED.hubspot_owner_id,
       hubspot_owner_name = EXCLUDED.hubspot_owner_name, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [userId, owner.id, owner.name, actorId]);
}

export interface PmoUser { id: string; name: string | null; email: string; role: string; lastLoginAt: Date | null; isActive: boolean | null }

// users.last_login_at is never written by the login flow; the LOGIN audit events are the record of sign-ins.
const USER_COLUMNS = `u.id, u.name, u.email, u.role, u.is_active,
  COALESCE((SELECT MAX(a.created_at) FROM audit_logs a WHERE a.user_id = u.id AND a.action = 'LOGIN'), u.last_login_at) AS last_login_at`;

/** PMO users, read-only — roles are managed in PMO Settings, not here. */
export async function pmoUsers(): Promise<PmoUser[]> {
  const r = await query(`SELECT ${USER_COLUMNS} FROM users u ORDER BY lower(u.email)`);
  return r.rows.map((x) => fromRow<PmoUser>(x));
}

export async function pmoUser(id: string): Promise<PmoUser | null> {
  const r = await query(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id::text = ?`, [id]);
  return r.rows[0] ? fromRow<PmoUser>(r.rows[0]) : null;
}
