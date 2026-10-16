import { logger } from '../utils/logger';
import * as hs from './accountTrackerHubspot';
import { CrmObject, HubSpotError, Stage } from './accountTrackerHubspot';
import {
  choosePrimary, intOr, isBlank, outreachStage, parseHubSpotDate, parseInstant, parseNumber, revenueDisplay, sizeTier,
  titleCaseEnum, trim, truthy, lower,
} from './accountTrackerRules';
import { enqueueAnalysis } from './accountTrackerAi';
import {
  CompanyRecord, ContactRecord, DealRecord, DealStatus, companiesOf, countCompanies, countDeals, dealsOf, ensureSchema,
  saveCompaniesAndContacts, saveDeals, syncState, syncedOwnerKeys, updateSyncState,
} from './accountTrackerStore';

// Customer Success → Account Tracker: pulls one HubSpot owner's book of business (companies, contacts, activity
// counts and deals) into that owner's partition. Port of the Sales Tracker's HubSpotSyncService / HubSpotStore /
// HubSpotDeals / HubSpotDatasetBuilder. Updates in place and never deletes (a company deleted in HubSpot stays).

/** A full re-read (instead of changes only) happens when the last one is older than this. */
const FULL_REFRESH_EVERY_MS = 7 * 24 * 3600 * 1000;
/** Overlap when asking HubSpot for "changed since", so edits made during the previous sync aren't missed. */
const CHANGE_OVERLAP_MS = 15 * 60_000;

export interface TrackerConfig {
  portalId: string | null;
  mspProperty: string | null;
  probabilityProperty: string | null;
  stageProperty: string | null;
}

export function trackerConfig(): TrackerConfig {
  return {
    portalId: trim(process.env.CS_TRACKER_HUBSPOT_PORTAL_ID),
    mspProperty: trim(process.env.CS_TRACKER_MSP_PROPERTY),
    probabilityProperty: trim(process.env.CS_TRACKER_PROBABILITY_PROPERTY),
    stageProperty: trim(process.env.CS_TRACKER_STAGE_PROPERTY),
  };
}

export const COMPANY_PROPERTIES = [
  'name', 'domain', 'website', 'industry', 'hs_industry_group', 'description', 'city', 'state', 'country',
  'phone', 'numberofemployees', 'annualrevenue', 'founded_year', 'linkedin_company_page', 'lifecyclestage',
  'hubspot_owner_id', 'notes_last_contacted', 'notes_last_activity_date', 'num_contacted_notes',
  'num_associated_contacts', 'hs_num_open_deals', 'num_associated_deals', 'hs_lastmodifieddate',
];

const CONTACT_PROPERTIES = ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'jobtitle', 'hs_linkedin_url'];

const DEAL_PROPERTIES = [
  'dealname', 'amount', 'deal_currency_code', 'dealstage', 'pipeline', 'closedate', 'createdate',
  'hs_lastmodifieddate', 'hubspot_owner_id', 'hs_is_closed', 'hs_is_closed_won', 'closed_lost_reason',
  'closed_won_reason', 'dealtype', 'hs_next_step', 'description', 'hs_deal_stage_probability',
];

/** Activity counts for the companies read in this sync; null means that type couldn't be read (missing scope). */
interface Activity {
  calls: Map<string, number> | null;
  emails: Map<string, number> | null;
  meetings: Map<string, number> | null;
  notes: Map<string, number> | null;
}

const outreachComplete = (a: Activity): boolean => a.calls != null && a.emails != null && a.meetings != null;

// ---------- progress (shown in the UI while a sync runs) ----------

const progress = new Map<string, string>();
const listeners: ((ownerKey: string) => void)[] = [];

export const isSyncing = (ownerKey: string | null): boolean => ownerKey != null && progress.has(ownerKey);
export const syncProgress = (ownerKey: string | null): string | null => (ownerKey == null ? null : progress.get(ownerKey) ?? null);

/** Called after a sync has written a person's data, so read caches for that person are dropped. */
export function onDataChanged(fn: (ownerKey: string) => void): void {
  listeners.push(fn);
}

const step = (ownerKey: string, text: string) => progress.set(ownerKey, text);

/**
 * Starts a sync of one owner's book in the background. Throws straight away when it can't start (not configured,
 * bad id, already running); failures during the sync are stored on the sync state and shown by /status.
 */
export function startSync(ownerId: string): void {
  if (!hs.isConfigured()) {
    throw new HubSpotError(0, 'HubSpot is not connected — set HUBSPOT_ACCESS_TOKEN in backend/.env and restart the backend.');
  }
  const id = trim(ownerId);
  if (id == null || !/^\d{1,20}$/.test(id)) throw new HubSpotError(400, 'Choose a HubSpot user to sync.');
  if (progress.has(id)) throw new HubSpotError(409, 'A sync for this person is already running — try again in a moment.');
  progress.set(id, 'Starting');
  void run(id);
}

/** Runs one sync to the end; failures are stored on the sync state (shown by /status), never thrown. */
async function run(id: string): Promise<boolean> {
  try {
    await doSync(id);
    await updateSyncState(id, { lastSyncError: null });
    enqueueAnalysis(id); // AI fills in what changed, in the background (stored, never re-run for the same input)
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn(`[AccountTracker] Sync failed for owner ${id}: ${message}`);
    try {
      await updateSyncState(id, { source: 'hubspot', lastSyncError: message });
    } catch (inner) {
      logger.error(`[AccountTracker] Could not record sync failure for owner ${id}: ${(inner as Error).message}`);
    }
    return false;
  } finally {
    progress.delete(id);
    listeners.forEach((fn) => fn(id));
  }
}

let refreshing = false;

/**
 * Scheduled refresh (jobs/index.ts, alongside the Customer Success HubSpot sync): re-syncs every book that has been
 * loaded at least once, one after another. Changes-only after the first load, so each takes seconds; a book whose
 * sync is already running (someone clicked Sync) is skipped. Overlapping runs are skipped too.
 */
export async function syncAllLoaded(): Promise<void> {
  if (refreshing || !hs.isConfigured()) return;
  refreshing = true;
  const started = Date.now();
  let ok = 0;
  let failed = 0;
  try {
    await ensureSchema();
    for (const id of await syncedOwnerKeys()) {
      if (progress.has(id)) continue;
      progress.set(id, 'Starting');
      if (await run(id)) ok++;
      else failed++;
    }
    if (ok + failed > 0) {
      logger.info(`[AccountTracker] Scheduled refresh: ${ok} book(s) synced${failed ? `, ${failed} failed` : ''} in ${Math.round((Date.now() - started) / 1000)}s`);
    }
  } catch (e) {
    logger.error(`[AccountTracker] Scheduled refresh failed: ${(e as Error).message}`);
  } finally {
    refreshing = false;
  }
}

async function doSync(ownerId: string): Promise<void> {
  const cfg = trackerConfig();
  const now = new Date();
  const warnings: string[] = [];
  const owner = await hs.ownerById(ownerId);
  if (!owner) throw new HubSpotError(404, `No HubSpot user with id ${ownerId}.`);
  const ownerName = hs.ownerDisplayName(owner);
  const ownerLabel = ownerName + (owner.email ? ` <${owner.email}>` : '');

  // First sync, or the weekly full refresh: read everything. Otherwise only companies changed since last time.
  const prev = await syncState(ownerId);
  const full = !prev || !prev.lastSyncedAt || !prev.lastFullSyncAt
    || new Date(prev.lastFullSyncAt).getTime() < now.getTime() - FULL_REFRESH_EVERY_MS
    || (await countCompanies(ownerId)) === 0;
  const since = full || !prev?.lastSyncedAt ? null : new Date(prev.lastSyncedAt).getTime() - CHANGE_OVERLAP_MS;

  let portalId = cfg.portalId ?? prev?.portalId ?? null;
  if (portalId == null) {
    try {
      portalId = await hs.portalId();
    } catch (e) {
      warnings.push(`Could not read the portal ID (${(e as Error).message}); HubSpot links are disabled. Set CS_TRACKER_HUBSPOT_PORTAL_ID to fix.`);
    }
  }

  step(ownerId, full ? 'Reading companies' : 'Reading companies changed since last sync');
  const properties = [...COMPANY_PROPERTIES];
  [cfg.mspProperty, cfg.probabilityProperty, cfg.stageProperty].forEach((p) => { if (p) properties.push(p); });
  const companies = await hs.searchOwned('companies', ownerId, properties, since);
  logger.info(`[AccountTracker] ${companies.length} ${full ? '(full)' : 'changed'} companies for ${ownerLabel}`);
  const ids = companies.map((c) => c.id);
  const n = companies.length.toLocaleString('en-US');

  let contactsByCompany: Map<string, CrmObject[]> | null = null;
  let activity: Activity = { calls: new Map(), emails: new Map(), meetings: new Map(), notes: new Map() };
  if (ids.length > 0) {
    step(ownerId, `Reading contacts for ${n} companies`);
    try {
      const links = await hs.associations('companies', 'contacts', ids);
      const contactIds = [...new Set([...links.values()].flat())];
      const byId = new Map<string, CrmObject>();
      (await hs.batchRead('contacts', contactIds, CONTACT_PROPERTIES)).forEach((c) => byId.set(c.id, c));
      const m = new Map<string, CrmObject[]>();
      links.forEach((cids, companyId) => m.set(companyId, cids.map((x) => byId.get(x)).filter((x): x is CrmObject => !!x)));
      contactsByCompany = m;
    } catch (e) {
      if (e instanceof HubSpotError && e.status === 401) throw e;
      warnings.push(`Contacts could not be read: ${(e as Error).message}`);
    }

    step(ownerId, `Counting calls for ${n} companies`);
    const calls = await counts('calls', ids, warnings);
    step(ownerId, `Counting emails for ${n} companies`);
    const emails = await counts('emails', ids, warnings);
    step(ownerId, `Counting meetings for ${n} companies`);
    const meetings = await counts('meetings', ids, warnings);
    step(ownerId, `Counting notes for ${n} companies`);
    const notes = await counts('notes', ids, warnings);
    activity = { calls, emails, meetings, notes };
    if (!outreachComplete(activity)) {
      warnings.push("Times Reached Out fell back to HubSpot's num_contacted_notes because calls/emails/meetings could not all be read.");
    }
  }

  if (ids.length === 0 && prev?.syncWarnings) {
    // nothing changed: keep the warnings from the last sync that actually read data
    prev.syncWarnings.split('\n').forEach((w) => { if (!warnings.includes(w)) warnings.push(w); });
  }

  // Deals connected to this person: theirs, and those on their companies (first time / weekly: everything)
  step(ownerId, 'Reading deals');
  let dealNote: string | null = null;
  try {
    const allDeals = full || (await countDeals(ownerId)) === 0;
    const fetched = await fetchDeals(ownerId, allDeals ? null : since, allDeals, companies, warnings);
    const [created, updated] = await applyDeals(ownerId, fetched, portalId, now);
    if (created + updated > 0) dealNote = `${created + updated} deal${created + updated === 1 ? '' : 's'} updated`;
  } catch (e) {
    if (e instanceof HubSpotError && e.status === 401) throw e;
    warnings.push(`Deals could not be read: ${(e as Error).message}`);
  }

  const distinct = [...new Set(warnings)];

  step(ownerId, 'Saving');
  const result = await applyCompanies(ownerId, companies, contactsByCompany, activity, portalId, now, cfg);

  const changes = (created: number, updated: number): string => {
    if (created === 0 && updated === 0) return 'Up to date — no changes in HubSpot';
    return `${full ? 'Full refresh: ' : 'Changes since last sync: '}${updated} updated${created > 0 ? `, ${created} new` : ''}`;
  };
  const summary = dealNote == null ? changes(result.created, result.updated)
    : result.created + result.updated === 0 ? `${full ? 'Full refresh: ' : 'Changes since last sync: '}${dealNote}`
      : `${changes(result.created, result.updated)} · ${dealNote}`;

  await updateSyncState(ownerId, {
    source: 'hubspot',
    lastSyncedAt: now,
    ...(full ? { lastFullSyncAt: now } : {}),
    lastSyncSummary: summary,
    ownerName,
    ownerEmail: owner.email,
    portalId,
    syncWarnings: distinct.length ? distinct.join('\n') : null,
    // with nothing changed, this sync read no activity — keep what the last real read found
    outreachComplete: ids.length > 0 ? outreachComplete(activity) : prev?.outreachComplete ?? true,
  });
}

async function counts(type: string, companyIds: string[], warnings: string[]): Promise<Map<string, number> | null> {
  try {
    const out = new Map<string, number>();
    (await hs.associations('companies', type, companyIds)).forEach((v, k) => out.set(k, v.length));
    return out;
  } catch (e) {
    if (e instanceof HubSpotError && e.status === 401) throw e;
    warnings.push(`Logged ${type} could not be read: ${(e as Error).message}`);
    return null;
  }
}

// ---------- companies & contacts ----------

function custom(o: CrmObject, property: string | null): string | null {
  return property ? trim(o.properties[property]) : null;
}

/** Copies HubSpot fields onto `c` (new or existing). A count that couldn't be read keeps its stored value. */
function fillCompany(c: CompanyRecord, o: CrmObject, activity: Activity, portalId: string | null, now: Date, cfg: TrackerConfig): void {
  const p = o.properties;
  const name = trim(p.name) ?? trim(p.domain) ?? `(unnamed company ${o.id})`;
  c.hubspotId = o.id;
  c.company = name;
  c.domain = trim(p.domain);
  c.website = trim(p.website) ?? (c.domain ? `https://${c.domain}` : null);
  if (portalId) c.hubspotLink = `https://app.hubspot.com/contacts/${portalId}/company/${o.id}`;
  c.industry = titleCaseEnum(p.industry);
  c.industryGroup = titleCaseEnum(p.hs_industry_group);
  c.city = trim(p.city);
  c.state = trim(p.state);
  c.country = trim(p.country);
  c.phone = trim(p.phone);
  const emp = parseNumber(p.numberofemployees);
  c.employees = emp == null ? null : Math.round(emp);
  c.employeeSizeTier = sizeTier(c.employees);
  const revenue = parseNumber(p.annualrevenue);
  c.annualRevenueValue = revenue != null && revenue > 0 ? revenue : null;
  c.annualRevenue = c.annualRevenueValue == null ? null : revenueDisplay(String(Math.trunc(c.annualRevenueValue)), c.annualRevenueValue);
  c.foundedYear = trim(p.founded_year);
  c.linkedin = trim(p.linkedin_company_page);
  c.lifecycleStage = titleCaseEnum(p.lifecyclestage);
  c.openDeals = intOr(p.hs_num_open_deals, 0);
  c.associatedDeals = intOr(p.num_associated_deals, 0);
  c.orgOverview = trim(p.description);
  c.lastContactDate = parseHubSpotDate(p.notes_last_contacted);

  if (activity.calls) c.callsCount = activity.calls.get(o.id) ?? 0;
  if (activity.emails) c.emailsCount = activity.emails.get(o.id) ?? 0;
  if (activity.meetings) c.meetingsCount = activity.meetings.get(o.id) ?? 0;
  if (activity.notes) c.notesCount = activity.notes.get(o.id) ?? 0;
  const touches = c.callsCount != null && c.emailsCount != null && c.meetingsCount != null
    ? c.callsCount + c.emailsCount + c.meetingsCount
    : intOr(p.num_contacted_notes, 0);
  c.timesReachedOut = touches;
  c.reachedOut = touches > 0 ? 'Yes' : 'No';
  c.outreachStage = custom(o, cfg.stageProperty) ?? outreachStage(touches);

  // a HubSpot MSP property (when configured) is real data and wins over the AI's classification
  const mspValue = custom(o, cfg.mspProperty);
  c.mspFlag = mspValue == null ? null : truthy(mspValue) ? 'Yes' : 'No';
  c.customProbability = custom(o, cfg.probabilityProperty); // null = derived from activity or time zone when read
  c.lastSeenAt = now;
  c.hubspotModifiedAt = trim(p.hs_lastmodifieddate);
}

function fillContact(ownerKey: string, p: CrmObject, c: CompanyRecord, rowIndex: number): ContactRecord {
  const q = p.properties;
  const name = [q.firstname, q.lastname].map(trim).filter((x): x is string => x != null).join(' ');
  return {
    ownerKey,
    companyHubspotId: c.hubspotId,
    hubspotId: p.id,
    companyDomain: c.domain,
    contactName: name || null,
    title: trim(q.jobtitle),
    email: trim(q.email),
    phone: trim(q.phone) ?? trim(q.mobilephone),
    linkedin: trim(q.hs_linkedin_url),
    rowIndex,
  };
}

function emptyCompany(ownerKey: string, hubspotId: string): CompanyRecord {
  return {
    ownerKey, hubspotId, company: null, domain: null, website: null, hubspotLink: null, industryGroup: null,
    industry: null, city: null, state: null, country: null, employees: null, employeeSizeTier: null,
    annualRevenue: null, annualRevenueValue: null, foundedYear: null, phone: null, linkedin: null,
    lifecycleStage: null, openDeals: null, associatedDeals: null, timesReachedOut: null, reachedOut: null,
    outreachStage: null, mspFlag: null, customProbability: null, primaryContactName: null,
    primaryContactTitle: null, primaryContactEmail: null, orgOverview: null, lastContactDate: null,
    callsCount: null, emailsCount: null,
    meetingsCount: null, notesCount: null, hubspotModifiedAt: null, lastSeenAt: null,
  };
}

async function applyCompanies(ownerKey: string, raw: CrmObject[], contactsByCompany: Map<string, CrmObject[]> | null,
  activity: Activity, portalId: string | null, now: Date, cfg: TrackerConfig): Promise<{ created: number; updated: number }> {
  const stored = new Map<string, CompanyRecord>();
  (await companiesOf(ownerKey)).forEach((c) => stored.set(c.hubspotId, c));
  let created = 0;
  let updated = 0;
  const touched: CompanyRecord[] = [];
  const contacts: ContactRecord[] = [];
  for (const o of raw) {
    let c = stored.get(o.id);
    if (!c) {
      c = emptyCompany(ownerKey, o.id);
      stored.set(o.id, c);
      created++;
    } else {
      updated++;
    }
    fillCompany(c, o, activity, portalId, now, cfg);
    if (contactsByCompany) {
      const current = (contactsByCompany.get(o.id) ?? []).map((p, i) => fillContact(ownerKey, p, c!, i));
      contacts.push(...current);
      const primary = choosePrimary(current);
      c.primaryContactName = primary?.contactName ?? null;
      c.primaryContactTitle = primary?.title ?? null;
      c.primaryContactEmail = primary?.email ?? null;
    }
    touched.push(c);
  }
  await saveCompaniesAndContacts(touched, contacts);
  return { created, updated };
}

// ---------- deals ----------

interface FetchedDeals {
  deals: CrmObject[];
  companyOfDeal: Map<string, string>;
  companyNames: Map<string, string>;
  stages: Map<string, Stage>;
  ownerNames: Map<string, string | null>;
}

/**
 * Every deal connected to the person: deals they own (all, or changed since `sinceMillis`), deals on their companies
 * whoever owns them, and every deal already stored (re-read so changes show).
 */
async function fetchDeals(ownerKey: string, sinceMillis: number | null, allCompanies: boolean, justRead: CrmObject[],
  warnings: string[]): Promise<FetchedDeals> {
  const byId = new Map<string, CrmObject>();
  (await hs.searchOwned('deals', ownerKey, DEAL_PROPERTIES, sinceMillis)).forEach((o) => byId.set(o.id, o));

  const stored = await companiesOf(ownerKey);
  const related = new Set<string>();
  try {
    const companyIds = new Set<string>(justRead.map((c) => c.id));
    if (allCompanies) stored.forEach((c) => companyIds.add(c.hubspotId));
    if (companyIds.size > 0) {
      (await hs.associations('companies', 'deals', [...companyIds])).forEach((v) => v.forEach((d) => related.add(d)));
    }
  } catch (e) {
    if (e instanceof HubSpotError && e.status === 401) throw e;
    warnings.push(`Deals on your companies could not be read: ${(e as Error).message}`);
  }
  (await dealsOf(ownerKey)).forEach((d) => related.add(d.hubspotId));
  byId.forEach((_, id) => related.delete(id));
  if (related.size > 0) {
    (await hs.batchRead('deals', [...related], DEAL_PROPERTIES)).forEach((o) => { if (!byId.has(o.id)) byId.set(o.id, o); });
  }
  const deals = [...byId.values()];
  const empty: FetchedDeals = { deals, companyOfDeal: new Map(), companyNames: new Map(), stages: new Map(), ownerNames: new Map() };
  if (deals.length === 0) return empty;

  let stages = new Map<string, Stage>();
  try {
    stages = await hs.dealStages();
  } catch (e) {
    if (e instanceof HubSpotError && e.status === 401) throw e;
    warnings.push(`Deal stage names could not be read (${(e as Error).message}); stage ids are shown instead.`);
  }

  const companyOfDeal = new Map<string, string>();
  const names = new Map<string, string>();
  try {
    (await hs.associations('deals', 'companies', deals.map((d) => d.id))).forEach((cs, deal) => {
      if (cs.length > 0) companyOfDeal.set(deal, cs[0]);
    });
    stored.forEach((c) => { if (c.company) names.set(c.hubspotId, c.company); });
    justRead.forEach((c) => {
      const name = isBlank(c.properties.name) ? c.properties.domain : c.properties.name;
      if (name != null) names.set(c.id, name.trim());
    });
    const missing = [...new Set(companyOfDeal.values())].filter((id) => !names.has(id));
    if (missing.length > 0) {
      (await hs.batchRead('companies', missing, ['name', 'domain'])).forEach((o) => {
        const name = isBlank(o.properties.name) ? o.properties.domain : o.properties.name;
        if (name != null) names.set(o.id, name);
      });
    }
  } catch (e) {
    if (e instanceof HubSpotError && e.status === 401) throw e;
    warnings.push(`Deal companies could not be read: ${(e as Error).message}`);
  }

  const ownerNames = new Map<string, string | null>();
  for (const d of deals) {
    const id = trim(d.properties.hubspot_owner_id);
    if (id != null && !ownerNames.has(id)) {
      const o = await hs.ownerById(id);
      ownerNames.set(id, o ? hs.ownerDisplayName(o) : null);
    }
  }
  return { deals, companyOfDeal, companyNames: names, stages, ownerNames };
}

const clip = (v: string | null | undefined, max: number): string | null => {
  const s = trim(v);
  return s == null || s.length <= max ? s : `${s.substring(0, max - 1)}…`;
};

const isoInstant = (v: string | null | undefined): string | null => parseInstant(v)?.toISOString() ?? null;
const isoDate = (v: string | null | undefined): string | null => parseInstant(v)?.toISOString().slice(0, 10) ?? null;

function fillDeal(d: DealRecord, o: CrmObject, f: FetchedDeals, portalId: string | null): void {
  const p = o.properties;
  d.name = isBlank(p.dealname) ? 'Untitled deal' : p.dealname.trim();
  d.amount = parseNumber(p.amount);
  d.currency = trim(p.deal_currency_code);
  const stageId = trim(p.dealstage);
  const stage = stageId == null ? undefined : f.stages.get(stageId);
  d.stageId = stageId;
  d.stageLabel = stage?.label ?? stageId;
  d.pipelineLabel = stage ? stage.pipeline : trim(p.pipeline);
  const won = lower(p.hs_is_closed_won) === 'true';
  const closed = won || lower(p.hs_is_closed) === 'true' || !!stage?.closed;
  const status: DealStatus = won ? 'WON' : closed ? 'LOST' : 'OPEN';
  d.status = status;
  d.stageProbability = parseNumber(p.hs_deal_stage_probability) ?? stage?.probability ?? null;
  d.closeDate = isoDate(p.closedate);
  d.createDate = isoDate(p.createdate);
  const type = lower(p.dealtype);
  d.dealType = type === 'newbusiness' ? 'New business' : type === 'existingbusiness' ? 'Existing business'
    : type === '' ? null : titleCaseEnum(p.dealtype);
  d.lostReason = clip(p.closed_lost_reason, 2000);
  d.wonReason = clip(p.closed_won_reason, 2000);
  d.nextStep = clip(p.hs_next_step, 2000);
  d.description = clip(p.description, 4000);
  const company = f.companyOfDeal.get(o.id) ?? null;
  if (company != null || d.companyHubspotId == null) {
    d.companyHubspotId = company;
    d.companyName = company == null ? null : f.companyNames.get(company) ?? null;
  }
  if (portalId) d.hubspotLink = `https://app.hubspot.com/contacts/${portalId}/record/0-3/${o.id}`;
  d.hubspotModifiedAt = isoInstant(p.hs_lastmodifieddate);
}

/** Upserts the fetched deals; returns how many were new and how many changed in HubSpot since last time. */
async function applyDeals(ownerKey: string, f: FetchedDeals, portalId: string | null, now: Date): Promise<[number, number]> {
  const known = new Map<string, DealRecord>();
  (await dealsOf(ownerKey)).forEach((d) => known.set(d.hubspotId, d));
  let created = 0;
  let updated = 0;
  const touched: DealRecord[] = [];
  for (const o of f.deals) {
    let d = known.get(o.id);
    if (!d) {
      d = {
        ownerKey, hubspotId: o.id, dealOwnerId: null, dealOwnerName: null, mine: null, name: null, amount: null,
        currency: null, stageId: null, stageLabel: null, pipelineLabel: null, status: null, stageProbability: null,
        closeDate: null, createDate: null, dealType: null, lostReason: null, wonReason: null, nextStep: null,
        description: null, companyHubspotId: null, companyName: null, hubspotLink: null, hubspotModifiedAt: null,
        lastSeenAt: null,
      };
      known.set(o.id, d);
      created++;
    } else if (d.hubspotModifiedAt !== isoInstant(o.properties.hs_lastmodifieddate)) {
      updated++;
    }
    fillDeal(d, o, f, portalId);
    const dealOwner = trim(o.properties.hubspot_owner_id);
    d.dealOwnerId = dealOwner;
    d.dealOwnerName = dealOwner == null ? null : f.ownerNames.get(dealOwner) ?? null;
    d.mine = ownerKey === dealOwner;
    d.lastSeenAt = now;
    touched.push(d);
  }
  await saveDeals(touched);
  return [created, updated];
}
