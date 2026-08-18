import axios, { type AxiosInstance } from 'axios';
import { query, execute } from '../config/database';
import { logger } from '../utils/logger';

interface GraphEvent {
  id: string;
  subject: string;
  organizer: { emailAddress: { name: string; address: string } };
  attendees: Array<{ emailAddress: { name: string; address: string }; status?: { response: string } }>;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isOnlineMeeting: boolean;
  isCancelled: boolean;
  responseStatus?: { response: string };
  onlineMeeting?: { joinUrl: string } | null;
}

export interface HeldCustomerCall {
  eventId: string;
  subject: string;
  start: string;
  organizerEmail: string;
  organizerName: string;
  joinUrl: string | null;
  customerAttendees: Array<{ name: string; email: string }>;
}

export interface UserCallHygiene {
  userEmail: string;
  userName: string;
  // Volume
  totalCustomerCalls: number;
  uniqueCustomers: number;
  internallyScheduled: number;    // held calls this person organized
  externallyScheduled: number;    // held calls the customer (or someone else) organized, this person attended
  // Cadence
  callsPerWeek: number;
  daysSinceLastCustomerCall: number | null;
  lastCustomerCallAt: string | null;
  // Reliability
  cancelledCalls: number;
  declinedCalls: number;          // invited but this person declined/never responded — not counted as held
  cancelledRate: number;          // 0-100 %
  onlineMeetingRate: number;      // 0-100 % — proper Teams link vs. plain calendar block
  // Category scores
  volumeScore: number;            // 0-40
  cadenceScore: number;           // 0-30
  reliabilityScore: number;       // 0-30
  // Overall
  callHygieneScore: number;       // 0-100
  // Individual held customer calls in the period — lets the UI offer
  // "rate this call" against a specific transcript rather than the aggregate.
  calls: HeldCustomerCall[];
}

const CF_DOMAIN = 'cloudfuze.com';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const CACHE_TTL_MS = 25 * 3600 * 1000; // 25h, same cadence as email hygiene cron

const SYSTEM_SENDER_DOMAINS = new Set([
  'microsoft.com',
  'microsoftonline.com',
  'teams.microsoft.com',
  'sharepointonline.com',
  'outlook.com',
  'onmicrosoft.com',
  'azurecomm.net',
  'mimecast.com',
]);

function isGraphConfigured(): boolean {
  const { MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET } = process.env;
  return !!(
    MS_GRAPH_TENANT_ID && MS_GRAPH_CLIENT_ID && MS_GRAPH_CLIENT_SECRET &&
    !MS_GRAPH_TENANT_ID.startsWith('PASTE_') &&
    !MS_GRAPH_CLIENT_ID.startsWith('PASTE_') &&
    !MS_GRAPH_CLIENT_SECRET.startsWith('PASTE_')
  );
}

async function getAccessToken(): Promise<string> {
  const { MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET } = process.env;
  const res = await axios.post(
    `https://login.microsoftonline.com/${MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: MS_GRAPH_CLIENT_ID!,
      client_secret: MS_GRAPH_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );
  return res.data.access_token as string;
}

function graphClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: GRAPH_BASE,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Forces start/end dateTime fields onto UTC, so they can be parsed
      // directly instead of guessing at whatever timeZone the organizer's
      // mailbox happens to be set to.
      Prefer: 'outlook.timezone="UTC"',
    },
    timeout: 30000,
  });
}

function isExternal(email: string): boolean {
  const lower = email.toLowerCase();
  if (lower.endsWith(`@${CF_DOMAIN}`)) return false;
  const domain = lower.split('@')[1] ?? '';
  if (SYSTEM_SENDER_DOMAINS.has(domain)) return false;
  if (domain.endsWith('.microsoft.com') || domain.endsWith('.microsoftonline.com')) return false;
  if (lower.startsWith('noreply@') || lower.startsWith('no-reply@') || lower.startsWith('donotreply@')) return false;
  return true;
}

async function getCFUsers(): Promise<Array<{ email: string; name: string }>> {
  // Same roster as email hygiene — one definitive team-member list for both mailbox-derived scores.
  const result = await query(
    `SELECT email, display_name AS name FROM email_hygiene_members WHERE is_active = true ORDER BY display_name`
  );
  return result.rows as Array<{ email: string; name: string }>;
}

async function userMailboxExists(client: AxiosInstance, userPath: string): Promise<boolean> {
  try {
    await client.get(`/users/${userPath}/mailFolders/SentItems?$select=id`);
    return true;
  } catch (err: any) {
    const status = err.response?.status;
    if (status === 404 || status === 400) return false;
    if (status === 403) return false;
    throw err;
  }
}

async function fetchEvents(
  client: AxiosInstance,
  url: string,
  cap = 300
): Promise<GraphEvent[]> {
  const events: GraphEvent[] = [];
  let next: string | null = url;
  while (next && events.length < cap) {
    const res: { data: { value?: GraphEvent[]; '@odata.nextLink'?: string } } =
      await client.get(next);
    events.push(...(res.data.value ?? []));
    next = res.data['@odata.nextLink'] ?? null;
  }
  return events;
}

async function analyzeUser(
  client: AxiosInstance,
  userEmail: string,
  userName: string,
  since: string,
  until: string
): Promise<UserCallHygiene> {
  const userPath = encodeURIComponent(userEmail);
  const url = `/users/${userPath}/calendarView` +
    `?startDateTime=${encodeURIComponent(since)}&endDateTime=${encodeURIComponent(until)}` +
    `&$select=id,subject,organizer,attendees,start,end,isOnlineMeeting,isCancelled,responseStatus,onlineMeeting` +
    `&$top=100`;

  // Let a failed calendar fetch (e.g. 403 from missing Calendars.Read consent)
  // reject analyzeUser rather than silently becoming an empty result — otherwise
  // every user renders as "0 calls" instead of the permissionDenied/authError
  // path below ever getting a chance to fire.
  const events = await fetchEvents(client, url, 500);

  // Customer-facing = at least one external attendee AND this person is on the invite
  // (as organizer OR attendee) — counts calls the PM scheduled as well as calls the
  // customer scheduled and invited the PM to, not just self-organized ones.
  const isOnInvite = (e: GraphEvent) =>
    e.organizer?.emailAddress?.address?.toLowerCase() === userEmail.toLowerCase() ||
    e.attendees?.some(a => a.emailAddress.address.toLowerCase() === userEmail.toLowerCase());

  // responseStatus is this mailbox owner's own RSVP on the event. A call this
  // person declined, or never responded to, never actually happened for them —
  // counting it toward Volume/Cadence would overstate real customer contact.
  const wasAttended = (e: GraphEvent) => {
    const resp = e.responseStatus?.response;
    if (e.organizer?.emailAddress?.address?.toLowerCase() === userEmail.toLowerCase()) return true;
    return resp === 'accepted' || resp === 'tentativelyAccepted' || resp === 'organizer';
  };

  const customerCalls = events.filter(e =>
    e.attendees?.some(a => isExternal(a.emailAddress.address)) && isOnInvite(e)
  );

  const held = customerCalls.filter(e => !e.isCancelled && wasAttended(e));
  const cancelled = customerCalls.filter(e => e.isCancelled);
  const declined = customerCalls.filter(e => !e.isCancelled && !wasAttended(e)).length;

  const internallyScheduled = held.filter(e =>
    e.organizer?.emailAddress?.address?.toLowerCase() === userEmail.toLowerCase()
  ).length;
  const externallyScheduled = held.length - internallyScheduled;

  const customerEmails = new Set<string>();
  for (const e of held) {
    for (const a of e.attendees ?? []) {
      if (isExternal(a.emailAddress.address)) customerEmails.add(a.emailAddress.address.toLowerCase());
    }
  }

  // start.dateTime has no offset of its own — it's in whatever zone the Prefer
  // header above requested (UTC), so appending 'Z' here is what makes it parse
  // correctly rather than being read in the server's local zone.
  const toUtcIso = (dateTime: string) => new Date(dateTime.endsWith('Z') ? dateTime : `${dateTime}Z`).toISOString();

  const sortedByStart = [...held].sort((a, b) => new Date(toUtcIso(a.start.dateTime)).getTime() - new Date(toUtcIso(b.start.dateTime)).getTime());
  const lastCall = sortedByStart[sortedByStart.length - 1] ?? null;
  const lastCustomerCallAt = lastCall ? toUtcIso(lastCall.start.dateTime) : null;
  const daysSinceLastCustomerCall = lastCustomerCallAt
    ? Math.floor((Date.now() - new Date(lastCustomerCallAt).getTime()) / 86400000)
    : null;

  const periodDays = Math.max(1, Math.round((new Date(until).getTime() - new Date(since).getTime()) / 86400000));
  const callsPerWeek = Math.round((held.length / periodDays) * 7 * 10) / 10;

  const onlineMeetingCount = held.filter(e => e.isOnlineMeeting).length;
  const onlineMeetingRate = held.length > 0 ? Math.round((onlineMeetingCount / held.length) * 100) : 100;
  const cancelledRate = customerCalls.length > 0 ? Math.round((cancelled.length / customerCalls.length) * 100) : 0;

  // ── Volume /40 — held customer calls, saturating at 12+ over the period ──
  const volumeScore = Math.min(40, Math.round((held.length / 12) * 40));

  // ── Cadence /30 — recency of last customer touch + steady weekly rate ──
  const recencyPts =
    daysSinceLastCustomerCall === null ? 0 :
    daysSinceLastCustomerCall <= 7  ? 15 :
    daysSinceLastCustomerCall <= 14 ? 10 :
    daysSinceLastCustomerCall <= 30 ? 5  : 0;
  const ratePts = Math.min(15, Math.round(callsPerWeek * 7.5));
  const cadenceScore = recencyPts + ratePts;

  // ── Reliability /30 — few cancellations, proper Teams links (not bare calendar blocks) ──
  const cancelPts = Math.max(0, 15 - Math.round(cancelledRate / 100 * 15 * 2));
  const onlinePts = Math.round((onlineMeetingRate / 100) * 15);
  const reliabilityScore = Math.min(30, cancelPts + onlinePts);

  const callHygieneScore = volumeScore + cadenceScore + reliabilityScore;

  const calls: HeldCustomerCall[] = held
    .filter(e => e.isOnlineMeeting && e.onlineMeeting?.joinUrl)
    .map(e => ({
      eventId: e.id,
      subject: e.subject,
      start: toUtcIso(e.start.dateTime),
      organizerEmail: e.organizer?.emailAddress?.address ?? '',
      organizerName: e.organizer?.emailAddress?.name ?? '',
      joinUrl: e.onlineMeeting?.joinUrl ?? null,
      customerAttendees: (e.attendees ?? [])
        .filter(a => isExternal(a.emailAddress.address))
        .map(a => ({ name: a.emailAddress.name, email: a.emailAddress.address })),
    }));

  return {
    userEmail,
    userName,
    totalCustomerCalls: held.length,
    uniqueCustomers: customerEmails.size,
    internallyScheduled,
    externallyScheduled,
    callsPerWeek,
    daysSinceLastCustomerCall,
    lastCustomerCallAt,
    cancelledCalls: cancelled.length,
    declinedCalls: declined,
    cancelledRate,
    onlineMeetingRate,
    volumeScore,
    cadenceScore,
    reliabilityScore,
    callHygieneScore,
    calls,
  };
}

export const callHygieneService = {
  isConfigured: isGraphConfigured,

  async getHygieneMetrics(forceRefresh = false): Promise<{
    metrics: UserCallHygiene[];
    computedAt: string;
    periodStart: string;
    periodEnd: string;
    isConfigured: boolean;
    authError?: string;
  }> {
    if (!isGraphConfigured()) {
      return {
        metrics: [],
        computedAt: new Date().toISOString(),
        periodStart: '',
        periodEnd: '',
        isConfigured: false,
      };
    }

    if (!forceRefresh) {
      try {
        const cached = await query(
          `SELECT * FROM call_hygiene_cache ORDER BY computed_at DESC LIMIT 1`
        );
        if (cached.rows.length > 0) {
          const row = cached.rows[0];
          if (Date.now() - new Date(row.computed_at).getTime() < CACHE_TTL_MS) {
            return {
              metrics: row.metrics as UserCallHygiene[],
              computedAt: row.computed_at as string,
              periodStart: row.period_start as string,
              periodEnd: row.period_end as string,
              isConfigured: true,
            };
          }
        }
      } catch {
        // cache miss — proceed to fetch
      }
    }

    let token: string;
    try {
      token = await getAccessToken();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string; error_description?: string } }; message?: string };
      const status = axiosErr?.response?.status;
      const desc = axiosErr?.response?.data?.error_description || axiosErr?.response?.data?.error || axiosErr?.message || 'Unknown error';
      const detail = status ? `HTTP ${status}: ${desc}` : desc;
      logger.error('Call hygiene: Graph API token fetch failed:', detail);
      return {
        metrics: [],
        computedAt: new Date().toISOString(),
        periodStart: '',
        periodEnd: '',
        isConfigured: true,
        authError: detail,
      };
    }
    const client = graphClient(token);

    const allUsers = await getCFUsers();
    logger.info(`Call hygiene: discovered ${allUsers.length} candidate CF users`);

    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 30 * 24 * 3600 * 1000);
    const since = periodStart.toISOString();
    const until = periodEnd.toISOString();

    const validUsers: Array<{ email: string; name: string }> = [];
    let permissionDenied = false;
    for (let i = 0; i < allUsers.length; i += 5) {
      const batch = allUsers.slice(i, i + 5);
      const checks = await Promise.allSettled(
        batch.map(async u => {
          const exists = await userMailboxExists(client, encodeURIComponent(u.email));
          return exists ? u : null;
        })
      );
      for (const r of checks) {
        if (r.status === 'fulfilled' && r.value) validUsers.push(r.value);
        else if (r.status === 'rejected') logger.warn('Mailbox existence check error:', r.reason?.message);
      }
    }
    logger.info(`Call hygiene: ${validUsers.length}/${allUsers.length} users have accessible mailboxes`);

    const results: UserCallHygiene[] = [];
    for (let i = 0; i < validUsers.length; i += 3) {
      const batch = validUsers.slice(i, i + 3);
      const settled = await Promise.allSettled(
        batch.map(u => analyzeUser(client, u.email, u.name, since, until))
      );
      for (const r of settled) {
        if (r.status === 'fulfilled') results.push(r.value);
        else {
          const status = (r.reason as any)?.response?.status;
          if (status === 403 || status === 401) permissionDenied = true;
          logger.error('Call hygiene analysis error:', r.reason);
        }
      }
    }

    if (results.length === 0 && permissionDenied) {
      return {
        metrics: [],
        computedAt: new Date().toISOString(),
        periodStart: since,
        periodEnd: until,
        isConfigured: true,
        authError: 'Calendars.Read application permission is missing or not admin-consented for this Azure AD app registration.',
      };
    }

    const sorted = results.sort((a, b) => b.callHygieneScore - a.callHygieneScore);

    await execute(
      `INSERT INTO call_hygiene_cache (period_start, period_end, metrics) VALUES ($1, $2, $3)`,
      [periodStart.toISOString(), periodEnd.toISOString(), JSON.stringify(sorted)]
    );
    await execute(
      `DELETE FROM call_hygiene_cache WHERE id NOT IN (
         SELECT id FROM call_hygiene_cache ORDER BY computed_at DESC LIMIT 5
       )`
    );

    return {
      metrics: sorted,
      computedAt: new Date().toISOString(),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      isConfigured: true,
    };
  },
};
