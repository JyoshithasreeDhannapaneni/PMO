// Customer Success → Account Tracker: derived-field rules, ported from the Sales Tracker (AM Dashboard)
// backend's FieldRules / Text / Html / InsightService. Pure functions only — no I/O.

export const IST_ZONE = 'Asia/Kolkata';
const IST_OFFSET = 5.5;

// ---------- text helpers ----------

export function trim(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === '' ? null : t;
}

export function lower(s: string | null | undefined): string {
  const t = trim(s);
  return t == null ? '' : t.toLowerCase();
}

export const isBlank = (s: string | null | undefined): boolean => trim(s) == null;

export const eq = (a: string | null | undefined, b: string | null | undefined): boolean => lower(a) === lower(b);

/** "Yes", and also annotated values such as "Yes - see M&A Watch tab". */
export function isYes(s: string | null | undefined): boolean {
  const v = lower(s);
  return v === 'yes' || /^yes\b/.test(v);
}

export const isNo = (s: string | null | undefined): boolean => lower(s) === 'no';

/** Normalizes High/Medium/Low (also "high probability", "med"); null when unknown. */
export function probability(s: string | null | undefined): 'High' | 'Medium' | 'Low' | null {
  const v = lower(s);
  if (v.startsWith('h')) return 'High';
  if (v.startsWith('m')) return 'Medium';
  if (v.startsWith('l')) return 'Low';
  return null;
}

/** Lowercase, without scheme, "www." or path — for matching domains. */
export function domain(s: string | null | undefined): string {
  let v = lower(s).replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  const slash = v.indexOf('/');
  if (slash >= 0) v = v.substring(0, slash);
  return v;
}

// ---------- formatting ----------

const SMALL_WORDS = new Set(['and', 'or', 'of', 'the', 'for', 'in', 'on', 'to', 'a']);

/** "INFORMATION_TECHNOLOGY_AND_SERVICES" -> "Information Technology and Services". */
export function titleCaseEnum(raw: string | null | undefined): string | null {
  const v = trim(raw);
  if (v == null) return null;
  const words = v.replace(/_/g, ' ').toLowerCase().split(/\s+/);
  const out: string[] = [];
  words.forEach((w, i) => {
    if (!w) return;
    out.push(i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.substring(1));
  });
  return out.join(' ');
}

/** "NO_SHOW" -> "No show"; "OUTBOUND" -> "Outbound". */
export function label(v: string | null | undefined): string | null {
  const s = titleCaseEnum(v);
  if (!s) return null;
  return s.charAt(0) + s.substring(1).toLowerCase();
}

/** Employees < 50 Small, < 500 Mid, else Enterprise; unknown stays unknown. */
export function sizeTier(employees: number | null | undefined): 'Small' | 'Mid' | 'Enterprise' | null {
  if (employees == null) return null;
  if (employees < 50) return 'Small';
  if (employees < 500) return 'Mid';
  return 'Enterprise';
}

/** Stated tier if it starts with small/mid/enterprise, otherwise derived from the employee count. */
export function tierOf(statedTier: string | null | undefined, employees: number | null | undefined): string | null {
  const stated = lower(statedTier);
  if (stated.startsWith('small')) return 'Small';
  if (stated.startsWith('mid')) return 'Mid';
  if (stated.startsWith('enterprise')) return 'Enterprise';
  return sizeTier(employees);
}

/** Parses "1,200", "$12.5M", "3.4B", "+5:30"; null when nothing numeric is found. */
export function parseNumber(s: string | null | undefined): number | null {
  const v = lower(s);
  if (!v) return null;
  const hm = /^(?:utc|gmt)?\s*([+-]?)(\d{1,2}):(\d{2})$/.exec(v);
  if (hm) {
    const h = Number(hm[2]) + Number(hm[3]) / 60;
    return hm[1] === '-' ? -h : h;
  }
  const m = /([+-]?\d[\d,]*(?:\.\d+)?|[+-]?\.\d+)\s*([kmb]|thousand|million|billion)?/.exec(v);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ''));
  if (Number.isNaN(n)) return null;
  const suffix = m[2];
  if (suffix) {
    const c = suffix.charAt(0);
    if (c === 'k' || c === 't') n *= 1_000;
    else if (c === 'm') n *= 1_000_000;
    else if (c === 'b') n *= 1_000_000_000;
  }
  return n;
}

export function intOr(raw: string | null | undefined, fallback: number): number {
  const d = parseNumber(raw);
  return d == null ? fallback : Math.round(d);
}

/** Bare numbers become "$12.5M"; text such as "$10M-$50M" is kept as is. */
export function revenueDisplay(text: string | null | undefined, value: number | null): string | null {
  if (isBlank(text)) return null;
  const t = String(text);
  const bareNumber = t.replace(/[\d,.\s]/g, '') === '';
  if (!bareNumber || value == null) return t;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`.replace('.0B', 'B');
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`.replace('.0M', 'M');
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`.replace('.0K', 'K');
  return `$${value.toFixed(0)}`;
}

// ---------- dates ----------

/** Today's date in IST as "YYYY-MM-DD". */
export function todayIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** HubSpot timestamps: ISO strings or epoch milliseconds. */
export function parseInstant(v: string | null | undefined): Date | null {
  const s = trim(v);
  if (s == null) return null;
  if (/^\d{10,}$/.test(s)) return new Date(Number(s));
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return day ? new Date(`${day[1]}T00:00:00Z`) : null;
}

/** HubSpot date → "YYYY-MM-DD" (UTC calendar day). */
export function parseHubSpotDate(raw: string | null | undefined): string | null {
  const v = trim(raw);
  if (v == null) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = parseInstant(v);
  return d ? d.toISOString().slice(0, 10) : null;
}

const dayNumber = (isoDay: string): number => Math.floor(Date.parse(`${isoDay}T00:00:00Z`) / 86_400_000);

export function daysBetween(fromDay: string, toDay: string): number {
  return dayNumber(toDay) - dayNumber(fromDay);
}

export function daysSince(last: string | null, today: string): number | null {
  return last == null ? null : Math.max(0, daysBetween(last, today));
}

// ---------- HubSpot values ----------

export function truthy(v: string | null | undefined): boolean {
  const s = lower(v);
  return s === 'yes' || s === 'true' || s === '1' || s === 'y';
}

// ---------- outreach ----------

export function outreachStage(touches: number | null | undefined): string {
  const n = touches ?? 0;
  if (n === 0) return 'Cold – First Outreach';
  if (n <= 5) return 'Early Stage – Follow Up';
  if (n <= 15) return 'Warm – Multiple Touches';
  if (n <= 50) return 'Established – Check In';
  return 'Deep Relationship – Nurture / Expand';
}

// ---------- time zones ----------

const COUNTRY_ZONES: Record<string, string> = {};
const US_STATE_ZONES: Record<string, string> = {};
const CA_PROVINCE_ZONES: Record<string, string> = {};
const AU_STATE_ZONES: Record<string, string> = {};

function put(m: Record<string, string>, zone: string, ...keys: string[]): void {
  keys.forEach((k) => { m[k] = zone; });
}

put(COUNTRY_ZONES, 'Asia/Kolkata', 'india', 'in');
put(COUNTRY_ZONES, 'Europe/London', 'united kingdom', 'uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland', 'gb');
put(COUNTRY_ZONES, 'Europe/Dublin', 'ireland', 'ie');
put(COUNTRY_ZONES, 'Europe/Berlin', 'germany', 'de');
put(COUNTRY_ZONES, 'Europe/Paris', 'france', 'fr');
put(COUNTRY_ZONES, 'Europe/Amsterdam', 'netherlands', 'the netherlands', 'nl');
put(COUNTRY_ZONES, 'Europe/Brussels', 'belgium', 'be');
put(COUNTRY_ZONES, 'Europe/Luxembourg', 'luxembourg');
put(COUNTRY_ZONES, 'Europe/Madrid', 'spain', 'es');
put(COUNTRY_ZONES, 'Europe/Lisbon', 'portugal', 'pt');
put(COUNTRY_ZONES, 'Europe/Rome', 'italy', 'it');
put(COUNTRY_ZONES, 'Europe/Zurich', 'switzerland', 'ch');
put(COUNTRY_ZONES, 'Europe/Vienna', 'austria', 'at');
put(COUNTRY_ZONES, 'Europe/Stockholm', 'sweden', 'se');
put(COUNTRY_ZONES, 'Europe/Oslo', 'norway', 'no');
put(COUNTRY_ZONES, 'Europe/Copenhagen', 'denmark', 'dk');
put(COUNTRY_ZONES, 'Europe/Helsinki', 'finland', 'fi');
put(COUNTRY_ZONES, 'Europe/Warsaw', 'poland', 'pl');
put(COUNTRY_ZONES, 'Europe/Prague', 'czech republic', 'czechia', 'cz');
put(COUNTRY_ZONES, 'Europe/Budapest', 'hungary');
put(COUNTRY_ZONES, 'Europe/Bucharest', 'romania');
put(COUNTRY_ZONES, 'Europe/Athens', 'greece');
put(COUNTRY_ZONES, 'Europe/Kiev', 'ukraine');
put(COUNTRY_ZONES, 'Europe/Istanbul', 'turkey', 'türkiye', 'turkiye');
put(COUNTRY_ZONES, 'Europe/Moscow', 'russia');
put(COUNTRY_ZONES, 'Asia/Jerusalem', 'israel', 'il');
put(COUNTRY_ZONES, 'Asia/Dubai', 'united arab emirates', 'uae', 'ae');
put(COUNTRY_ZONES, 'Asia/Riyadh', 'saudi arabia');
put(COUNTRY_ZONES, 'Asia/Qatar', 'qatar');
put(COUNTRY_ZONES, 'Asia/Karachi', 'pakistan');
put(COUNTRY_ZONES, 'Asia/Dhaka', 'bangladesh');
put(COUNTRY_ZONES, 'Asia/Colombo', 'sri lanka');
put(COUNTRY_ZONES, 'Asia/Kathmandu', 'nepal');
put(COUNTRY_ZONES, 'Asia/Singapore', 'singapore', 'sg');
put(COUNTRY_ZONES, 'Asia/Kuala_Lumpur', 'malaysia');
put(COUNTRY_ZONES, 'Asia/Manila', 'philippines');
put(COUNTRY_ZONES, 'Asia/Jakarta', 'indonesia');
put(COUNTRY_ZONES, 'Asia/Bangkok', 'thailand');
put(COUNTRY_ZONES, 'Asia/Ho_Chi_Minh', 'vietnam', 'viet nam');
put(COUNTRY_ZONES, 'Asia/Hong_Kong', 'hong kong');
put(COUNTRY_ZONES, 'Asia/Shanghai', 'china');
put(COUNTRY_ZONES, 'Asia/Taipei', 'taiwan');
put(COUNTRY_ZONES, 'Asia/Tokyo', 'japan', 'jp');
put(COUNTRY_ZONES, 'Asia/Seoul', 'south korea', 'korea', 'republic of korea');
put(COUNTRY_ZONES, 'Pacific/Auckland', 'new zealand', 'nz');
put(COUNTRY_ZONES, 'Africa/Johannesburg', 'south africa', 'za');
put(COUNTRY_ZONES, 'Africa/Lagos', 'nigeria');
put(COUNTRY_ZONES, 'Africa/Nairobi', 'kenya');
put(COUNTRY_ZONES, 'Africa/Cairo', 'egypt');
put(COUNTRY_ZONES, 'America/Sao_Paulo', 'brazil', 'br');
put(COUNTRY_ZONES, 'America/Mexico_City', 'mexico', 'mx');
put(COUNTRY_ZONES, 'America/Argentina/Buenos_Aires', 'argentina');
put(COUNTRY_ZONES, 'America/Santiago', 'chile');
put(COUNTRY_ZONES, 'America/Bogota', 'colombia');
put(COUNTRY_ZONES, 'America/Lima', 'peru');
put(COUNTRY_ZONES, 'America/Puerto_Rico', 'puerto rico');

put(US_STATE_ZONES, 'America/New_York',
  'connecticut', 'ct', 'delaware', 'de', 'district of columbia', 'dc', 'washington dc', 'florida', 'fl', 'georgia', 'ga',
  'maine', 'me', 'maryland', 'md', 'massachusetts', 'ma', 'michigan', 'mi', 'new hampshire', 'nh',
  'new jersey', 'nj', 'new york', 'ny', 'north carolina', 'nc', 'ohio', 'oh', 'pennsylvania', 'pa',
  'rhode island', 'ri', 'south carolina', 'sc', 'vermont', 'vt', 'virginia', 'va', 'west virginia', 'wv',
  'indiana', 'in', 'kentucky', 'ky');
put(US_STATE_ZONES, 'America/Chicago',
  'alabama', 'al', 'arkansas', 'ar', 'illinois', 'il', 'iowa', 'ia', 'kansas', 'ks', 'louisiana', 'la',
  'minnesota', 'mn', 'mississippi', 'ms', 'missouri', 'mo', 'nebraska', 'ne', 'north dakota', 'nd',
  'oklahoma', 'ok', 'south dakota', 'sd', 'tennessee', 'tn', 'texas', 'tx', 'wisconsin', 'wi');
put(US_STATE_ZONES, 'America/Denver', 'colorado', 'co', 'idaho', 'id', 'montana', 'mt', 'new mexico', 'nm',
  'utah', 'ut', 'wyoming', 'wy');
put(US_STATE_ZONES, 'America/Phoenix', 'arizona', 'az');
put(US_STATE_ZONES, 'America/Los_Angeles', 'california', 'ca', 'nevada', 'nv', 'oregon', 'or', 'washington', 'wa');
put(US_STATE_ZONES, 'America/Anchorage', 'alaska', 'ak');
put(US_STATE_ZONES, 'Pacific/Honolulu', 'hawaii', 'hi');

put(CA_PROVINCE_ZONES, 'America/Vancouver', 'british columbia', 'bc');
put(CA_PROVINCE_ZONES, 'America/Edmonton', 'alberta', 'ab');
put(CA_PROVINCE_ZONES, 'America/Regina', 'saskatchewan', 'sk');
put(CA_PROVINCE_ZONES, 'America/Winnipeg', 'manitoba', 'mb');
put(CA_PROVINCE_ZONES, 'America/Toronto', 'ontario', 'on', 'quebec', 'québec', 'qc');
put(CA_PROVINCE_ZONES, 'America/Halifax', 'nova scotia', 'ns', 'new brunswick', 'nb', 'prince edward island', 'pe');
put(CA_PROVINCE_ZONES, 'America/St_Johns', 'newfoundland and labrador', 'newfoundland', 'nl');

put(AU_STATE_ZONES, 'Australia/Sydney', 'new south wales', 'nsw', 'australian capital territory', 'act');
put(AU_STATE_ZONES, 'Australia/Melbourne', 'victoria', 'vic');
put(AU_STATE_ZONES, 'Australia/Hobart', 'tasmania', 'tas');
put(AU_STATE_ZONES, 'Australia/Brisbane', 'queensland', 'qld');
put(AU_STATE_ZONES, 'Australia/Adelaide', 'south australia', 'sa');
put(AU_STATE_ZONES, 'Australia/Darwin', 'northern territory', 'nt');
put(AU_STATE_ZONES, 'Australia/Perth', 'western australia', 'wa');

/** IANA zone for a country (and state/province for US, Canada, Australia); null when unknown. */
export function zoneFor(country: string | null | undefined, state: string | null | undefined): string | null {
  const c = lower(country);
  const s = lower(state);
  if (!c) return null;
  if (['united states', 'usa', 'us', 'united states of america', 'u.s.'].includes(c)) return US_STATE_ZONES[s] ?? null;
  if (c === 'canada' || c === 'ca') return CA_PROVINCE_ZONES[s] ?? 'America/Toronto';
  if (c === 'australia' || c === 'au') return AU_STATE_ZONES[s] ?? 'Australia/Sydney';
  return COUNTRY_ZONES[c] ?? null;
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** Current UTC offset in hours for the zone (DST-aware). */
export function offsetHours(zone: string | null, now: Date = new Date()): number | null {
  if (zone == null) return null;
  let f = offsetFormatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' });
    offsetFormatters.set(zone, f);
  }
  const name = f.formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!m) return 0;
  const h = Number(m[2]) + Number(m[3] ?? 0) / 60;
  return m[1] === '-' ? -h : h;
}

/** IST minus local offset: how many hours IST is ahead of the company. */
const diff = (utcOffset: number | null): number | null => (utcOffset == null ? null : IST_OFFSET - utcOffset);

export function clock12(hours: number): string {
  const minutes = Math.round((((hours % 24) + 24) % 24) * 60) % (24 * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Their 09:00–18:00 local business day, expressed in IST. */
export function bestConnectWindow(utcOffset: number | null): string {
  const d = diff(utcOffset);
  if (d == null) return 'Unknown';
  return `${clock12(9 + d)} – ${clock12(18 + d)} IST`;
}

/** 90 minutes into their morning, in IST. */
export function suggestedCallTime(utcOffset: number | null): string {
  const d = diff(utcOffset);
  if (d == null) return 'Unknown';
  return `${clock12(9 + d + 1.5)} IST`;
}

/** How comfortably their working day overlaps Bengaluru working hours. */
export function connectProbability(utcOffset: number | null): string {
  const d = diff(utcOffset);
  if (d == null) return 'Unknown';
  if (d >= -1 && d <= 4.5) return 'High';
  if ((d > 4.5 && d <= 7) || (d >= -3.5 && d < -1)) return 'Medium';
  return 'Low';
}

// ---------- primary contact ----------

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function words(...phrases: string[]): RegExp {
  return new RegExp(`(?<![a-z])(${phrases.map(escapeRe).join('|')})(?![a-z])`, 'i');
}

const TITLE_PRIORITY = [
  words('cio', 'cto', 'chief information', 'chief technology'),
  words('it director', 'director of information technology', 'director of it', 'director, it', 'director it'),
  words('head of it', 'head of information technology'),
  words('vp', 'vice president', 'svp', 'evp'),
  words('chief executive', 'ceo', 'founder', 'co-founder', 'president', 'owner', 'managing director'),
  words('it manager'),
];

/** First contact whose title matches the earliest priority tier; otherwise the first contact. */
export function choosePrimary<T extends { title: string | null }>(contacts: T[]): T | null {
  if (!contacts.length) return null;
  for (const tier of TITLE_PRIORITY) {
    const hit = contacts.find((c) => c.title != null && tier.test(c.title));
    if (hit) return hit;
  }
  return contacts[0];
}

// ---------- HubSpot rich text → plain text ----------

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, e: string) => {
    const named = ENTITIES[e.toLowerCase()];
    if (named != null) return named;
    try {
      if (/^#x/i.test(e)) return String.fromCodePoint(parseInt(e.substring(2), 16));
      if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.substring(1), 10));
    } catch {
      return whole;
    }
    return whole;
  });
}

/** Plain text with line breaks from HubSpot rich text (call notes, note bodies). Never returns markup. */
export function htmlToText(html: string | null | undefined, max: number): string | null {
  if (html == null || html.trim() === '') return null;
  let s = html.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  s = s.replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n');
  s = s.replace(/<\s*li[^>]*>/gi, '• ');
  s = s.replace(/<[^>]*>/g, '');
  s = decodeEntities(s);
  s = s.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!s) return null;
  return s.length <= max ? s : `${s.substring(0, max - 1).trim()}…`;
}

// ---------- company page helpers ----------

interface Place { city: string | null; state: string | null; country: string | null }

export function location(c: Place): string | null {
  const loc = [c.city, c.state, c.country].map(trim).filter((s): s is string => s != null).join(', ');
  return loc || null;
}

/** HubSpot description, shown only when meaningful: longer than 18 chars and not just the company name. */
export function overview(c: { orgOverview: string | null; company: string }): string | null {
  const notes = trim(c.orgOverview);
  if (notes == null || notes.length <= 18 || eq(notes, c.company)) return null;
  if (lower(notes).startsWith('no public description')) return null;
  return notes;
}

/** Relationship health from days since the last logged contact (deterministic — shown next to the AI analysis). */
export function relationshipHealth(daysSinceLastContact: number | null, timesReachedOut: number | null) {
  const days = daysSinceLastContact;
  let health: 'Hot' | 'Warm' | 'Cold' | 'Unknown';
  let score: number;
  if (days == null) {
    health = 'Unknown';
    score = 0;
  } else if (days <= 7) {
    health = 'Hot';
    score = Math.max(65, 100 - Math.max(days, 0) * 5);
  } else if (days <= 21) {
    health = 'Warm';
    score = 60 - (days - 8) * 2;
  } else {
    health = 'Cold';
    score = Math.max(8, 30 - Math.trunc((days - 21) / 3));
  }
  return {
    totalActivities: timesReachedOut,
    daysSinceLastContact: days,
    health,
    healthScore: score,
    healthLabel: days == null ? 'Unknown · last contact not on file' : `${health} · ${days} days since last contact`,
  };
}
