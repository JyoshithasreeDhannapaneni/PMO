import { logger } from '../utils/logger';
import * as hs from './accountTrackerHubspot';
import {
  aiConfigured, aiCoverage, aiForCompanies, aiModel, aiSignals, dealInsightsFor, monthlyBudget, onAiChanged,
} from './accountTrackerAi';
import {
  bestConnectWindow, cleanPlace, connectProbability, countryFromPhone, daysBetween, daysSince, domain, eq, isBlank, isNo, isYes, location, lower,
  offsetHours, overview, probability, relationshipHealth, suggestedCallTime, tierOf, todayIst, trim, zoneFor,
} from './accountTrackerRules';
import {
  CompanyRecord, ContactRecord, DealRecord, companiesOf, companyById, companyIdsByHubspotId, contactsOf,
  contactsOfCompany, countCompanies, countContacts, dealsOf, dealsOfCompany, ownerLink, ownerLinks, pmoUser, pmoUsers,
  setOwnerLink, syncState, syncedOwnerKeys,
} from './accountTrackerStore';
import { isSyncing, onDataChanged, startSync, syncProgress, trackerConfig, TrackerConfig } from './accountTrackerSync';

// Customer Success → Account Tracker read side (port of the Sales Tracker's CompanyService, DealService,
// SyncService, Access and InsightService). Every read works on one HubSpot owner's book ("view" = owner id);
// viewKey() decides which books a PMO user may open.

export class TrackerError extends Error {
  status: number;
  detail: string | null;
  constructor(status: number, message: string, detail: string | null = null) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export interface TrackerUser { id: string; name?: string | null; email: string; role: string }

// ---------- access ----------

interface Access { admin: boolean; ownerId: string | null; ownerName: string | null; linkedManually: boolean }

async function accessOf(user: TrackerUser): Promise<Access> {
  const admin = user.role === 'ADMIN';
  const link = await ownerLink(String(user.id));
  if (link) return { admin, ownerId: link.hubspotOwnerId, ownerName: link.hubspotOwnerName, linkedManually: true };
  if (!hs.isConfigured()) return { admin, ownerId: null, ownerName: null, linkedManually: false };
  try {
    const o = await hs.ownerByEmail(user.email);
    return { admin, ownerId: o?.id ?? null, ownerName: o ? hs.ownerDisplayName(o) : null, linkedManually: false };
  } catch (e) {
    logger.warn(`[AccountTracker] Could not match ${user.email} to a HubSpot owner: ${(e as Error).message}`);
    return { admin, ownerId: null, ownerName: null, linkedManually: false };
  }
}

/**
 * The book to read: everyone gets their own HubSpot owner; PMO admins get the one they asked for (a HubSpot owner id),
 * defaulting to their own.
 */
export async function viewKey(user: TrackerUser, requested: unknown): Promise<string> {
  const a = await accessOf(user);
  const want = typeof requested === 'string' ? trim(requested) : null;
  if (want == null || want === a.ownerId) {
    if (a.ownerId == null) {
      throw new TrackerError(403, 'Not allowed', a.admin
        ? 'Choose whose data to view.'
        : "Your account isn't linked to a HubSpot user yet — ask an admin to link it.");
    }
    return a.ownerId;
  }
  if (!a.admin) throw new TrackerError(403, 'Not allowed', 'You can only see your own data.');
  if (!/^\d{1,20}$/.test(want)) throw new TrackerError(400, 'Invalid request', `Unknown view: ${want}`);
  return want;
}

export async function me(user: TrackerUser) {
  const a = await accessOf(user);
  return {
    id: String(user.id),
    name: user.name ?? null,
    email: user.email,
    role: user.role,
    admin: a.admin,
    hubspotOwnerId: a.ownerId,
    hubspotOwnerName: a.ownerName,
    ownerLinkedManually: a.linkedManually,
    hubspotConfigured: hs.isConfigured(),
    aiConfigured: aiConfigured(),
  };
}

// ---------- companies, with the fields that depend on today's date or the clock ----------

/** Where a value came from — shown to users so they know how much to trust it. */
type Basis = 'hubspot' | 'ai' | 'activity' | 'timezone';

export interface CompanyView extends CompanyRecord {
  id: number;
  /** HubSpot's address contradicted itself (e.g. a US state with country India) and was corrected for display. */
  placeCorrected: boolean;
  tier: string | null;
  /** null until the AI has classified the company (unless HubSpot has an MSP property configured). */
  msp: boolean | null;
  mspBasis: Basis | null;
  probability: string | null;
  connectProbability: string;
  connectBasis: Basis | null;
  daysSinceLastContact: number | null;
  timeZone: string | null;
  utcOffset: number | null;
  bestConnectWindow: string;
  suggestedCallTime: string;
}

type Signals = { msp: boolean | null; connect: string | null } | undefined;

function derive(raw: CompanyRecord, today: string, offsets: Map<string, number | null>, cfg: TrackerConfig, ai: Signals): CompanyView {
  const { corrected: placeCorrected, ...place } = cleanPlace(raw);
  const c = { ...raw, ...place };
  // no country in HubSpot: an international phone number is the next best clue for the time zone
  const zone = zoneFor(c.country, c.state) ?? (c.country ? null : zoneFor(countryFromPhone(c.phone), null));
  let utcOffset: number | null = null;
  if (zone != null) {
    if (!offsets.has(zone)) offsets.set(zone, offsetHours(zone));
    utcOffset = offsets.get(zone) ?? null;
  }
  // HubSpot property (when configured) > measured reply rate > time-zone overlap
  let connect: string;
  let connectBasis: Basis | null;
  if (cfg.probabilityProperty && c.customProbability != null) {
    connect = c.customProbability;
    connectBasis = 'hubspot';
  } else if (ai?.connect) {
    connect = ai.connect;
    connectBasis = 'activity';
  } else {
    connect = connectProbability(utcOffset);
    connectBasis = utcOffset == null ? null : 'timezone';
  }
  // the stored flag is HubSpot data only while an MSP property is configured
  const fromHubspot = !!cfg.mspProperty && c.mspFlag != null;
  const msp = fromHubspot ? isYes(c.mspFlag) : ai?.msp ?? null;
  return {
    ...c,
    id: Number(c.id),
    placeCorrected,
    tier: tierOf(c.employeeSizeTier, c.employees),
    msp,
    mspBasis: fromHubspot ? 'hubspot' : ai?.msp != null ? 'ai' : null,
    probability: probability(connect),
    connectProbability: connect,
    connectBasis,
    daysSinceLastContact: daysSince(c.lastContactDate, today),
    timeZone: zone,
    utcOffset,
    bestConnectWindow: bestConnectWindow(utcOffset),
    suggestedCallTime: suggestedCallTime(utcOffset),
  };
}

async function deriveOne(c: CompanyRecord): Promise<CompanyView> {
  const signals = await aiSignals([c.hubspotId]);
  return derive(c, todayIst(), new Map(), trackerConfig(), signals.get(c.hubspotId));
}

// Each person's companies, kept in memory between requests: the list, metrics, filters and Top 20 all read the same
// rows, which only change when that person syncs or the AI stores new results. Short TTL so date/clock-based fields
// roll over.
const VIEW_TTL_MS = 5 * 60_000;
const byView = new Map<string, { at: number; day: string; rows: CompanyView[] }>();
onDataChanged((ownerKey) => byView.delete(ownerKey));
onAiChanged((ownerKey) => byView.delete(ownerKey));

async function all(view: string): Promise<CompanyView[]> {
  const today = todayIst();
  const hit = byView.get(view);
  if (hit && hit.day === today && Date.now() - hit.at < VIEW_TTL_MS) return hit.rows;
  const offsets = new Map<string, number | null>();
  const cfg = trackerConfig();
  const companies = await companiesOf(view);
  const signals = await aiSignals(companies.map((c) => c.hubspotId));
  const rows = companies.map((c) => derive(c, today, offsets, cfg, signals.get(c.hubspotId)));
  byView.set(view, { at: Date.now(), day: today, rows });
  return rows;
}

/** Slim row used by tables and the drill-down lists. */
function row(c: CompanyView, priorityReason: string | null = null) {
  return {
    id: c.id,
    company: c.company,
    domain: c.domain,
    industry: c.industry,
    industryGroup: c.industryGroup,
    country: c.country,
    employees: c.employees,
    tier: c.tier,
    openDeals: c.openDeals,
    connectProbability: c.connectProbability,
    probability: c.probability,
    connectBasis: c.connectBasis,
    hubspotLink: c.hubspotLink,
    msp: c.msp,
    reachedOut: c.reachedOut,
    daysSinceLastContact: c.daysSinceLastContact,
    lifecycleStage: c.lifecycleStage,
    priorityReason,
    outreachStage: c.outreachStage,
    lastContactDate: c.lastContactDate,
    timesReachedOut: c.timesReachedOut,
    callsCount: c.callsCount,
    emailsCount: c.emailsCount,
    meetingsCount: c.meetingsCount,
    notesCount: c.notesCount,
  };
}

const IS_MSP = (c: CompanyView) => c.msp === true;
const NOT_REACHED = (c: CompanyView) => isNo(c.reachedOut);
const IS_CUSTOMER = (c: CompanyView) => eq(c.lifecycleStage, 'customer');

export async function metrics(view: string) {
  const rows = await all(view);
  const days = rows.map((c) => c.daysSinceLastContact).filter((d): d is number => d != null);
  return {
    totalCompanies: rows.length,
    totalMsps: rows.filter(IS_MSP).length,
    mspPending: rows.filter((c) => c.msp == null).length,
    notReachedOut: rows.filter(NOT_REACHED).length,
    avgDaysSinceContact: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
    customers: rows.filter(IS_CUSTOMER).length,
  };
}

function sortedBy(rows: CompanyView[], count: (c: CompanyView) => number | null) {
  return rows.filter((c) => (count(c) ?? 0) > 0).sort((a, b) => (count(b) ?? 0) - (count(a) ?? 0)).map((c) => row(c));
}

const STATS: Record<string, { title: string; rows: (all: CompanyView[]) => ReturnType<typeof row>[] }> = {
  total: { title: 'Total Companies', rows: (a) => a.map((c) => row(c)) },
  msps: { title: 'Total MSPs', rows: (a) => a.filter(IS_MSP).map((c) => row(c)) },
  'not-reached': { title: 'Not Reached Out', rows: (a) => a.filter(NOT_REACHED).map((c) => row(c)) },
  'avg-days': {
    title: 'Days Since Contact (longest first)',
    rows: (a) => a.filter((c) => c.daysSinceLastContact != null)
      .sort((x, y) => (y.daysSinceLastContact ?? 0) - (x.daysSinceLastContact ?? 0)).map((c) => row(c)),
  },
  customers: { title: 'Customers', rows: (a) => a.filter(IS_CUSTOMER).map((c) => row(c)) },
  reached: { title: 'Reached out', rows: (a) => a.filter((c) => isYes(c.reachedOut)).map((c) => row(c)) },
  'open-deals': { title: 'Companies with open deals', rows: (a) => sortedBy(a, (c) => c.openDeals) },
  calls: { title: 'Most calls', rows: (a) => sortedBy(a, (c) => c.callsCount) },
  emails: { title: 'Most emails', rows: (a) => sortedBy(a, (c) => c.emailsCount) },
  meetings: { title: 'Most meetings', rows: (a) => sortedBy(a, (c) => c.meetingsCount) },
  notes: { title: 'Most notes', rows: (a) => sortedBy(a, (c) => c.notesCount) },
};

export async function stat(view: string, key: string) {
  const s = STATS[key];
  if (!s) throw new TrackerError(404, 'Not found', `Unknown stat: ${key}`);
  return { key, title: s.title, rows: s.rows(await all(view)) };
}

export interface CompanyFilter {
  search: string | null;
  tier: string | null;
  mspOnly: boolean;
  openDealsOnly: boolean;
  minEmployees: number | null;
  maxEmployees: number | null;
  countries: string[];
  industryGroups: string[];
  probabilities: string[];
}

function matches(f: CompanyFilter): (c: CompanyView) => boolean {
  const q = lower(f.search);
  const t = lower(f.tier);
  const countries = new Set(f.countries.map(lower).filter(Boolean));
  const groups = new Set(f.industryGroups.map(lower).filter(Boolean));
  const probs = new Set(f.probabilities.map(lower).filter(Boolean));
  const rangeActive = f.minEmployees != null || f.maxEmployees != null;
  return (c) => {
    if (q && !lower(c.company).includes(q)) return false;
    if (t && t !== 'all' && t !== lower(c.tier)) return false;
    if (f.mspOnly && c.msp !== true) return false;
    if (f.openDealsOnly && !((c.openDeals ?? 0) > 0)) return false;
    if (rangeActive) {
      if (c.employees == null) return false;
      if (f.minEmployees != null && c.employees < f.minEmployees) return false;
      if (f.maxEmployees != null && c.employees > f.maxEmployees) return false;
    }
    if (countries.size && !countries.has(lower(c.country))) return false;
    if (groups.size && !groups.has(lower(c.industryGroup))) return false;
    if (probs.size && !probs.has(lower(c.probability))) return false;
    return true;
  };
}

export async function list(view: string, f: CompanyFilter) {
  return (await all(view)).filter(matches(f)).map((c) => row(c));
}

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

export async function filterOptions(view: string) {
  const countries = new Map<string, string>();
  const groups = new Map<string, string>();
  let maxEmployees = 0;
  (await all(view)).forEach((c) => {
    const country = trim(c.country);
    const group = trim(c.industryGroup);
    if (country && !countries.has(country.toLowerCase())) countries.set(country.toLowerCase(), country);
    if (group && !groups.has(group.toLowerCase())) groups.set(group.toLowerCase(), group);
    if (c.employees != null) maxEmployees = Math.max(maxEmployees, c.employees);
  });
  return { countries: [...countries.values()].sort(byText), industryGroups: [...groups.values()].sort(byText), maxEmployees };
}

/** Reached Out = No OR (MSP AND High connect probability). */
export async function priority(view: string) {
  const out: ReturnType<typeof row>[] = [];
  (await all(view)).forEach((c) => {
    const notReached = NOT_REACHED(c);
    const hotMsp = c.msp === true && c.probability === 'High';
    if (!notReached && !hotMsp) return;
    out.push(row(c, notReached && hotMsp ? 'Not reached · High-prob MSP' : notReached ? 'Not reached out' : 'High-prob MSP'));
  });
  return out;
}

export async function lookup(view: string, name: string): Promise<number | null> {
  const key = lower(name);
  return (await all(view)).find((c) => lower(c.company) === key)?.id ?? null;
}

// ---------- company page ----------

async function find(view: string | null, id: number): Promise<CompanyRecord> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new TrackerError(404, 'Not found', `Company not found: ${id}`);
  const c = await companyById(id, view);
  if (!c) throw new TrackerError(404, 'Not found', `Company not found: ${id}`);
  return c;
}

function dealRows(deals: DealRecord[], companyId: (d: DealRecord) => number | null) {
  return deals.map((d) => ({ deal: { ...d, id: Number(d.id) }, companyId: companyId(d) }));
}

/** `view` null = any book (admins open any company from a link). */
export async function detail(view: string | null, id: number) {
  const c = await deriveOne(await find(view, id));
  const contacts = await contactsOfCompany(c.ownerKey, c.hubspotId);
  const contactViews = contacts
    .map((ct) => ({
      contact: { ...ct, id: Number(ct.id) },
      primary: !isBlank(c.primaryContactName) && eq(ct.contactName, c.primaryContactName),
    }))
    .sort((a, b) => Number(b.primary) - Number(a.primary));
  const deals = (await dealsOfCompany(c.ownerKey, c.hubspotId)).sort((a, b) => {
    const open = Number(a.status !== 'OPEN') - Number(b.status !== 'OPEN');
    if (open !== 0) return open;
    return compareDesc(a.closeDate, b.closeDate);
  });
  const ai = (await aiForCompanies([c.hubspotId])).get(c.hubspotId) ?? null;
  return {
    company: c,
    location: location(c),
    overview: overview({ orgOverview: c.orgOverview, company: c.company ?? '' }),
    health: relationshipHealth(c.daysSinceLastContact, c.timesReachedOut),
    ai: {
      configured: aiConfigured(),
      analysis: ai?.analysis ?? null,
      engagement: ai?.engagement ?? null,
      error: ai?.error ?? null,
    },
    contacts: contactViews,
    deals: dealRows(deals, () => c.id),
  };
}

export async function activity(view: string | null, id: number, refresh: boolean) {
  const c = await find(view, id);
  return hs.activityForCompany(c.hubspotId, refresh);
}

/** Every contact in the person's book with its company (a contact on two companies is listed twice). */
export async function contacts(view: string) {
  const byHubspotId = new Map<string, CompanyView>();
  (await all(view)).forEach((c) => { if (!byHubspotId.has(c.hubspotId)) byHubspotId.set(c.hubspotId, c); });
  return (await contactsOf(view))
    .map((ct: ContactRecord) => {
      const c = byHubspotId.get(ct.companyHubspotId) ?? null;
      return {
        id: Number(ct.id),
        name: ct.contactName,
        title: ct.title,
        email: ct.email,
        phone: ct.phone,
        linkedin: ct.linkedin,
        companyId: c?.id ?? null,
        company: c ? c.company : ct.companyDomain,
        primary: !!c && !isBlank(c.primaryContactName) && eq(ct.contactName, c.primaryContactName),
      };
    })
    .sort((a, b) => lower(a.name).localeCompare(lower(b.name)));
}

// ---------- Top 20 ----------

/** Real revenue first (desc, employees as tiebreak), then companies without revenue by employees (desc). */
function top(rows: CompanyView[], type: 'companies' | 'msps') {
  return rows
    .filter((c) => type === 'companies' || c.msp === true)
    .sort((a, b) => {
      const ar = a.annualRevenueValue == null ? 1 : 0;
      const br = b.annualRevenueValue == null ? 1 : 0;
      if (ar !== br) return ar - br;
      const rev = (b.annualRevenueValue ?? 0) - (a.annualRevenueValue ?? 0);
      if (rev !== 0) return rev;
      return (b.employees ?? 0) - (a.employees ?? 0);
    })
    .slice(0, 20);
}

export async function top20(view: string, type: 'companies' | 'msps') {
  const ranked = top(await all(view), type).map((c, i) => ({
    rank: i + 1,
    companyId: c.id,
    company: c.company,
    domain: c.domain,
    industry: c.industry,
    country: c.country,
    employees: c.employees,
    annualRevenue: c.annualRevenue,
    annualRevenueValue: c.annualRevenueValue,
    rankingBasis: c.annualRevenueValue != null ? 'Real revenue on file' : 'Employee count, no revenue on file',
    lifecycleStage: c.lifecycleStage,
    msp: c.msp,
    timesReachedOut: c.timesReachedOut,
    outreachStage: c.outreachStage,
    probability: c.probability,
    primaryContactName: c.primaryContactName,
    hubspotLink: c.hubspotLink,
  }));
  const richest = ranked.filter((r) => r.annualRevenueValue != null)
    .reduce<typeof ranked[number] | null>((best, r) => (best == null || (r.annualRevenueValue ?? 0) > (best.annualRevenueValue ?? 0) ? r : best), null);
  const emps = ranked.map((r) => r.employees).filter((e): e is number => e != null);
  return {
    type,
    rows: ranked,
    stats: {
      highestRevenue: richest?.annualRevenue ?? null,
      highestRevenueCompany: richest?.company ?? null,
      highestRevenueCompanyId: richest?.companyId ?? null,
      averageEmployees: emps.length ? Math.round(emps.reduce((a, b) => a + b, 0) / emps.length) : null,
      highProbabilityCount: ranked.filter((r) => r.probability === 'High').length,
    },
  };
}

// ---------- Data & methodology ----------

function methodology(outreachComplete: boolean, cfg: TrackerConfig) {
  const model = aiModel();
  const rows: [string, string][] = [
    ['Data source', 'Live HubSpot CRM via a read-only Private App token. The first Sync loads everything; later syncs update only companies changed in HubSpot (plus a full refresh once a week). Nothing is deleted when a company is deleted in HubSpot.'],
    ['Company, Domain, Industry, Location, Employees, Revenue, Founded, LinkedIn, Phone, Lifecycle Stage, Open/Associated Deals', 'Copied from the matching HubSpot company properties. Industry and Lifecycle Stage are title-cased. Blank stays blank (Employees is no longer defaulted to 0).'],
    ['Employee Size Tier', 'Employees under 50 = Small, 50–499 = Mid, 500+ = Enterprise. Unknown when Employees is blank.'],
    ['Times Reached Out', outreachComplete
      ? 'Count of calls + emails + meetings associated to the company (real outreach only — system notes excluded).'
      : "HubSpot's num_contacted_notes (includes some system notes) — the token lacks a scope for calls, emails or meetings, so real counts were unavailable."],
    ['Reached Out', 'Yes when Times Reached Out > 0.'],
    ['Outreach Stage', `${cfg.stageProperty ? `HubSpot property '${cfg.stageProperty}' when set, otherwise: ` : ''}0 = Cold; 1–5 = Early Stage; 6–15 = Warm; 16–50 = Established; 51+ = Deep Relationship.`],
    ['Last Contact Date / Days Since Last Contact', 'HubSpot notes_last_contacted; days are counted to today (IST), not a frozen date.'],
    ['UTC Offset / Best Connect Window / Suggested Call Time', 'Country (+ state for US/Canada/Australia) mapped to a time zone, DST-aware. Window = their 9am–6pm in IST; call time = 90 minutes into their morning. Assumes a standard business day.'],
    ['Connect Probability', `${cfg.probabilityProperty ? `HubSpot property '${cfg.probabilityProperty}' when set, otherwise: ` : ''}measured from real activity — replies (received emails, connected calls, meetings held) ÷ outreach (sent emails, outbound calls) over the latest logged activity: 35%+ = High, 12%+ = Medium, below = Low. Calculated, not guessed by the AI. With fewer than 3 touches it falls back to time-zone overlap (IST minus local offset between −1 and 4.5 h = High). Each value shows which basis was used.`],
    ['Is MSP', `${cfg.mspProperty ? `HubSpot property '${cfg.mspProperty}' when set, otherwise: ` : ''}classified by the AI from the HubSpot record and the company's own website (homepage and services page, or a web search when the site cannot be read), with a confidence level and the evidence. Only companies that sell managed IT or cloud services to other businesses count. Shown as "Not analysed yet" until done.`],
    ['Primary Contact', 'Associated contact with the highest title priority: CIO/CTO, IT Director, Head of IT, VP, CEO/Founder/President, IT Manager; else the first contact.'],
    ['AI account brief', `One ${model} call per company reads the HubSpot company record, the company's public email and domain (DNS) records, its own homepage plus one services or about page, its deals and its latest logged calls (with notes), meetings, notes and emails. It writes the profile, key facts, MSP classification, CloudFuze fit, tech stack, buying signals, opportunities, positioning, conversation summary, open items, sentiment, risks, next action and the email and call plan. Fixed decision rules decide MSP, fit, signal strength, sentiment and the outreach channel; every fact names its source, and anything the data does not support is shown as Unknown. The productivity suite and verified tools (Slack, Box, Dropbox and others) come from the DNS records, which are facts, not AI guesses. Only when the website cannot be read does one web search fill in what the company does; that result is kept and reused.`],
    ['When the AI runs again', 'After every sync, only for companies whose data changed: at once when the company record changes in HubSpot; when only activity changes (new calls, meetings, notes, deal changes — emails count in steps of 5), at most once a day. A failed attempt is retried after 6 hours.'],
    ['AI deal insights', `One ${model} call per person reviews their deals (won/lost reasons, stages, amounts, dates) for win and loss patterns seen in at least 2 deals, open deals at risk (past close date, no next step, or unchanged for 30+ days) and next best actions. At most once a day, when deals change.`],
    ['How AI results are stored', 'Every AI result is saved with a fingerprint of the exact inputs it used, so the same data is never sent to the AI twice. Each result shows when it was written.'],
    ['AI budget', `Each person has a monthly AI budget of ${(monthlyBudget(1)).toFixed(2)} per company in their book (at least $0.50). Every call's cost is counted; when the month's budget is used, new analysis stops until the 1st of the next month and existing results stay visible. Calls use OpenAI's Flex tier (half price; slower, so results can take a few minutes after a sync) and cached prompts. Every company's brief is reserved first; web research is paid for from what is left, possible MSPs and active accounts first, and the rest are researched the next month.`],
    ['Org Overview', 'HubSpot description. Blank when HubSpot has none.'],
    ['Top 20 Companies / MSPs', 'Companies with real revenue first (by revenue), then by employees. MSP list is filtered to Is MSP = Yes first.'],
    ['Deals', "HubSpot deals connected to this person: deals where they are the Deal owner, plus deals on companies they own (whoever the Deal owner is, marked with that owner). The first sync reads all of them; later syncs read changes. Totals (won, open, win rate, average) count only their own deals. Won = closed won, Lost = closed lost (HubSpot's own flags); stage and pipeline names come from your deal pipelines. Win rate = won ÷ (won + lost). Weighted pipeline = open amount × stage probability. Totals add amounts as entered, so mixed currencies are flagged."],
    ['Activity timeline / Last call', 'Read live from HubSpot when a company is opened (not stored): the latest calls with their notes and outcome, notes, meetings, emails and tasks associated to the company — up to 40 of each. Emails need the sales-email-read scope.'],
  ];
  return rows.map(([field, note], i) => ({ id: i, field, note }));
}

function sumOrUnavailable(rows: CompanyView[], f: (c: CompanyView) => number | null): string {
  if (rows.length > 0 && rows.every((c) => f(c) == null)) return 'Unavailable (missing scope)';
  return String(rows.reduce((a, c) => a + (f(c) ?? 0), 0));
}

function portfolioStats(rows: CompanyView[], contactCount: number, ownerLabel: string, syncedDay: string | null, today: string) {
  const asOf = `Live from HubSpot, synced ${syncedDay ?? 'never'}`;
  const reached = rows.filter((c) => isYes(c.reachedOut)).length;
  const days = rows.map((c) => c.daysSinceLastContact).filter((d): d is number => d != null);
  const mspPending = rows.filter((c) => c.msp == null).length;
  const s: [string, string, string][] = [
    ['Owner', ownerLabel, 'Companies where HubSpot Company Owner = this person'],
    ['Total companies', String(rows.length), `${asOf} (companies deleted in HubSpot are kept)`],
    ['Total contacts', String(contactCount), 'Via HubSpot company–contact associations'],
    ['Companies reached out', `${reached} of ${rows.length}`, 'At least one logged call, email or meeting'],
    ['MSPs', String(rows.filter(IS_MSP).length), mspPending ? `AI classification — ${mspPending} still being analysed` : 'AI classification (see Methodology)'],
    ['Open deals', String(rows.reduce((a, c) => a + (c.openDeals ?? 0), 0)), 'Sum of Open Deals'],
    ['Logged calls', sumOrUnavailable(rows, (c) => c.callsCount), 'Calls associated to these companies'],
    ['Logged emails', sumOrUnavailable(rows, (c) => c.emailsCount), 'Emails associated to these companies'],
    ['Logged meetings', sumOrUnavailable(rows, (c) => c.meetingsCount), 'Meetings associated to these companies'],
    ['Notes', sumOrUnavailable(rows, (c) => c.notesCount), 'Notes associated to these companies'],
    ['Avg days since last contact', days.length ? String(Math.round(days.reduce((a, b) => a + b, 0) / days.length)) : '—', `Relative to ${today}`],
  ];
  return s.map(([metric, statValue, note], i) => ({ id: i, metric, statValue, note }));
}

function dataQuality(rows: CompanyView[], contactsPerCompany: Map<string, number>, warnings: string[]) {
  const out: { id: number; subject: string; issue: string; recommendation: string; companyId: number | null }[] = [];
  const add = (subject: string, issue: string, recommendation: string, companyId: number | null) =>
    out.push({ id: out.length, subject, issue, recommendation, companyId });
  warnings.forEach((w) => add('HubSpot sync', w, 'Add the missing scope to the Private App, then Sync.', null));
  const domainCounts = new Map<string, number>();
  rows.forEach((c) => {
    const d = domain(c.domain);
    if (d) domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  });
  rows.forEach((c) => {
    const d = domain(c.domain);
    const subject = `${c.company}${d ? ` / ${d}` : ''}`;
    if (d.includes('hubspot')) add(subject, 'Looks like a HubSpot system record, not a prospect.', 'Remove or reassign it in HubSpot.', c.id);
    if (!d) add(subject, 'No domain on file.', 'Add the company domain in HubSpot so contacts match reliably.', c.id);
    else if ((domainCounts.get(d) ?? 0) > 1) add(subject, 'Duplicate domain — appears on more than one company.', 'Merge the duplicate company records in HubSpot.', c.id);
    if (c.employees == null) add(subject, 'Employee count missing — size tier unknown.', 'Fill numberofemployees in HubSpot.', c.id);
    if ((contactsPerCompany.get(c.hubspotId) ?? 0) === 0) add(subject, 'No associated contacts.', 'Associate at least one contact to the company.', c.id);
    if (c.utcOffset == null) add(subject, 'Time zone unknown (country/state missing or unmapped).', 'Fill Country (and State for US) in HubSpot.', c.id);
  });
  return out;
}

export async function insights(view: string) {
  const cfg = trackerConfig();
  const [rows, state, contactRows] = await Promise.all([all(view), syncState(view), contactsOf(view)]);
  const perCompany = new Map<string, number>();
  contactRows.forEach((ct) => perCompany.set(ct.companyHubspotId, (perCompany.get(ct.companyHubspotId) ?? 0) + 1));
  const ownerLabel = state?.ownerName ? `${state.ownerName}${state.ownerEmail ? ` <${state.ownerEmail}>` : ''}` : view;
  const syncedDay = state?.lastSyncedAt ? todayIst(new Date(state.lastSyncedAt)) : null;
  const warnings = state?.syncWarnings ? state.syncWarnings.split('\n').filter(Boolean) : [];
  return {
    source: state?.source ?? null,
    stats: portfolioStats(rows, contactRows.length, ownerLabel, syncedDay, todayIst()),
    methodology: methodology(state?.outreachComplete ?? true, cfg),
    dataQuality: dataQuality(rows, perCompany, warnings),
  };
}

// ---------- deals ----------

export interface DealQuery {
  from: string | null;
  to: string | null;
  dateField: 'close' | 'created';
  status: string | null;
  pipeline: string | null;
  search: string | null;
  owner: string | null;
}

/** Up to 2 years the chart shows months, up to 9 years quarters (at most 36 bars), beyond that years. */
const MAX_MONTHS = 24;
const MAX_QUARTER_MONTHS = 108;

const ymd = (y: number, m: number, d: number): string =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const parts = (day: string): [number, number, number] => [Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10))];

function addMonths(day: string, n: number): string {
  const [y, m, d] = parts(day);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12 + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return ymd(ny, nm, Math.min(d, last));
}

function minusOneDay(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`) - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

type Unit = 'month' | 'quarter' | 'year';

function periodStart(day: string, unit: Unit): string {
  const [y, m] = parts(day);
  if (unit === 'year') return ymd(y, 1, 1);
  if (unit === 'quarter') return ymd(y, Math.floor((m - 1) / 3) * 3 + 1, 1);
  return ymd(y, m, 1);
}

const nextPeriod = (p: string, unit: Unit): string => addMonths(p, unit === 'year' ? 12 : unit === 'quarter' ? 3 : 1);

function periodKey(p: string, unit: Unit): string {
  const [y, m] = parts(p);
  if (unit === 'year') return String(y);
  if (unit === 'quarter') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  return p.slice(0, 7);
}

function compareDesc(a: string | null, b: string | null): number {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  return a < b ? 1 : a > b ? -1 : 0;
}

const amount = (d: DealRecord): number => d.amount ?? 0;
const sum = (ds: DealRecord[]): number => ds.reduce((a, d) => a + amount(d), 0);

function inRange(d: string | null, from: string | null, to: string | null): boolean {
  if (from == null && to == null) return true;
  if (d == null) return false;
  return (from == null || d >= from) && (to == null || d <= to);
}

/** Won amount over the selected period, empty periods included; long periods group by quarter or year. */
function overTime(won: DealRecord[], date: (d: DealRecord) => string | null, q: DealQuery) {
  const today = todayIst();
  const dates = won.map(date).filter((d): d is string => d != null).sort();
  const start = q.from ?? dates[0] ?? addMonths(today, -11);
  let end = q.to ?? (q.from != null ? (today > start ? today : start) : dates[dates.length - 1] ?? today);
  if (end < start) end = start;
  const [sy, sm] = parts(start);
  const [ey, em] = parts(end);
  const months = (ey * 12 + em) - (sy * 12 + sm) + 1;
  const unit: Unit = months <= MAX_MONTHS ? 'month' : months <= MAX_QUARTER_MONTHS ? 'quarter' : 'year';
  const slots = new Map<string, { amount: number; count: number }>();
  for (let p = periodStart(start, unit); p <= end; p = nextPeriod(p, unit)) slots.set(p, { amount: 0, count: 0 });
  won.forEach((d) => {
    const when = date(d);
    if (when == null) return;
    const slot = slots.get(periodStart(when, unit));
    if (!slot) return;
    slot.amount += amount(d);
    slot.count++;
  });
  const buckets = [...slots.entries()].map(([p, v]) => ({
    key: periodKey(p, unit), from: p, to: minusOneDay(nextPeriod(p, unit)), amount: v.amount, count: v.count,
  }));
  return { granularity: unit, buckets };
}

function summary(rows: DealRecord[], date: (d: DealRecord) => string | null, q: DealQuery, ids: Map<string, number>) {
  const won = rows.filter((d) => d.status === 'WON');
  const open = rows.filter((d) => d.status === 'OPEN');
  const lost = rows.filter((d) => d.status === 'LOST');
  const wonAmount = sum(won);
  const weighted = open.reduce((a, d) => a + amount(d) * (d.stageProbability ?? 0), 0);
  const winRate = won.length + lost.length === 0 ? null : won.length / (won.length + lost.length);
  const closeDays = won.filter((d) => d.createDate && d.closeDate)
    .map((d) => Math.max(0, daysBetween(d.createDate as string, d.closeDate as string)));

  const currencies = new Map<string, number>();
  rows.filter((d) => d.amount != null).forEach((d) => {
    const c = isBlank(d.currency) ? '' : (d.currency as string);
    currencies.set(c, (currencies.get(c) ?? 0) + 1);
  });
  let currency: string | null = null;
  let best = -1;
  for (const [c, n] of currencies) {
    if (n > best) {
      best = n;
      currency = c || null;
    }
  }

  const byCompany = new Map<string, { name: string | null; companyId: number | null; amount: number; count: number }>();
  won.forEach((d) => {
    const key = d.companyHubspotId != null ? d.companyHubspotId : `deal:${d.hubspotId}`;
    const cur = byCompany.get(key);
    if (cur) {
      cur.amount += amount(d);
      cur.count++;
    } else {
      byCompany.set(key, {
        name: d.companyName ?? d.name,
        companyId: d.companyHubspotId ? ids.get(d.companyHubspotId) ?? null : null,
        amount: amount(d),
        count: 1,
      });
    }
  });
  const topCompanies = [...byCompany.values()].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const chart = overTime(won, date, q);
  return {
    wonAmount, wonCount: won.length,
    openAmount: sum(open), openCount: open.length, weightedOpen: weighted,
    lostAmount: sum(lost), lostCount: lost.length,
    winRate,
    avgWonAmount: won.length ? wonAmount / won.length : null,
    avgDaysToClose: closeDays.length ? Math.round(closeDays.reduce((a, b) => a + b, 0) / closeDays.length) : null,
    currency,
    mixedCurrencies: currencies.size > 1,
    granularity: chart.granularity,
    wonOverTime: chart.buckets,
    topCompanies,
  };
}

export async function dealsPage(view: string, q: DealQuery) {
  const [rows, ids, insights] = await Promise.all([dealsOf(view), companyIdsByHubspotId(view), dealInsightsFor(view)]);
  const date = q.dateField === 'created' ? (d: DealRecord) => d.createDate : (d: DealRecord) => d.closeDate;
  const search = lower(q.search);
  const owner = lower(q.owner);
  const matched = rows
    .filter((d) => inRange(date(d), q.from, q.to))
    .filter((d) => (owner === 'mine' ? d.mine !== false : owner !== 'others' || d.mine === false))
    .filter((d) => isBlank(q.pipeline) || eq(d.pipelineLabel, q.pipeline))
    .filter((d) => !search || lower(d.name).includes(search) || lower(d.companyName).includes(search) || lower(d.stageLabel).includes(search));
  const status = ({ open: 'OPEN', won: 'WON', lost: 'LOST' } as Record<string, string>)[lower(q.status)] ?? null;
  const listed = matched
    .filter((d) => status == null || d.status === status)
    .sort((a, b) => compareDesc(date(a), date(b)));
  const pipelines = [...new Set(rows.map((d) => d.pipelineLabel).filter((p): p is string => p != null))].sort();
  const mine = rows.filter((d) => d.mine !== false).length;
  // totals are the person's own results (deals they own); with the "others" filter, the colleagues' deals
  const others = owner === 'others';
  const counted = others ? matched : matched.filter((d) => d.mine !== false);
  return {
    deals: dealRows(listed, (d) => (d.companyHubspotId ? ids.get(d.companyHubspotId) ?? null : null)),
    summary: summary(counted, date, q, ids),
    pipelines,
    totalDeals: rows.length,
    mineCount: mine,
    othersCount: rows.length - mine,
    counts: {
      all: matched.length,
      open: matched.filter((d) => d.status === 'OPEN').length,
      won: matched.filter((d) => d.status === 'WON').length,
      lost: matched.filter((d) => d.status === 'LOST').length,
    },
    totalsScope: others ? 'others' : 'mine',
    insights,
  };
}

// ---------- status & sync ----------

export async function status(view: string) {
  const [state, companies, contactCount, rows, ai] = await Promise.all([
    syncState(view), countCompanies(view), countContacts(view), all(view), aiCoverage(view),
  ]);
  let ownerName = state?.ownerName ?? null;
  let ownerEmail = state?.ownerEmail ?? null;
  if (ownerName == null && hs.isConfigured()) {
    try {
      const o = await hs.ownerById(view);
      if (o) {
        ownerName = hs.ownerDisplayName(o);
        ownerEmail = o.email;
      }
    } catch {
      // the name is cosmetic; the status still loads
    }
  }
  return {
    loaded: companies > 0,
    view,
    source: state?.source ?? null,
    ownerName,
    ownerEmail,
    lastSyncedAt: state?.lastSyncedAt ?? null,
    lastSyncSummary: state?.lastSyncSummary ?? null,
    syncing: isSyncing(view),
    progress: syncProgress(view),
    lastError: state?.lastSyncError ?? null,
    warnings: state?.syncWarnings ?? null,
    hubspotConfigured: hs.isConfigured(),
    ai,
    counts: {
      companies,
      contacts: contactCount,
      top20Companies: Math.min(20, rows.length),
      top20Msps: Math.min(20, rows.filter(IS_MSP).length),
    },
  };
}

export async function sync(view: string) {
  startSync(view);
  return status(view);
}

// ---------- admin: people and HubSpot links ----------

/** HubSpot users that can be viewed, people already synced first. */
export async function owners() {
  if (!hs.isConfigured()) return [];
  const [list, synced] = await Promise.all([hs.ownerList(), syncedOwnerKeys()]);
  return list
    .map((o) => ({ id: o.id, name: hs.ownerDisplayName(o), email: o.email, synced: synced.has(o.id) }))
    .sort((a, b) => Number(b.synced) - Number(a.synced) || lower(a.name).localeCompare(lower(b.name)));
}

export async function links() {
  const [users, manual] = await Promise.all([pmoUsers(), ownerLinks()]);
  let byEmail = new Map<string, { id: string; name: string }>();
  if (hs.isConfigured()) {
    try {
      byEmail = new Map((await hs.ownerList()).filter((o) => o.email).map((o) => [lower(o.email), { id: o.id, name: hs.ownerDisplayName(o) }]));
    } catch (e) {
      logger.warn(`[AccountTracker] Could not load HubSpot users for links: ${(e as Error).message}`);
    }
  }
  return users.map((u) => {
    const link = manual.get(String(u.id));
    const auto = link ? null : byEmail.get(lower(u.email)) ?? null;
    return {
      id: String(u.id),
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.isActive !== false,
      lastLoginAt: u.lastLoginAt,
      hubspotOwnerId: link?.hubspotOwnerId ?? auto?.id ?? null,
      hubspotOwnerName: link?.hubspotOwnerName ?? auto?.name ?? null,
      ownerLinkedManually: !!link,
    };
  });
}

/** Links (or with an empty owner id, unlinks) a PMO user to a HubSpot owner — for people whose emails differ. */
export async function setLink(userId: string, ownerId: unknown, actorId: string) {
  const user = await pmoUser(userId);
  if (!user) throw new TrackerError(404, 'Not found', 'User not found');
  const id = typeof ownerId === 'string' ? trim(ownerId) : null;
  if (id == null) {
    await setOwnerLink(String(user.id), null, actorId);
  } else {
    const o = await hs.ownerById(id);
    if (!o) throw new TrackerError(400, 'Invalid request', `No HubSpot user with id ${id}`);
    await setOwnerLink(String(user.id), { id: o.id, name: hs.ownerDisplayName(o) }, actorId);
  }
  return (await links()).find((u) => u.id === String(user.id));
}
