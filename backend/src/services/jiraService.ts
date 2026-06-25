import axios from 'axios';
import { logger } from '../utils/logger';
import { isOAuthConfigured, isOAuthConnected, getValidAccessToken, loadTokens } from './jiraOAuthService';

function getConfig() {
  return {
    baseURL:   (process.env.JIRA_API_URL  || 'https://cf2020.atlassian.net').replace(/\/$/, '').trim(),
    email:     (process.env.JIRA_USER_EMAIL || '').trim(),
    token:     (process.env.JIRA_API_TOKEN  || '').trim(),
    project:   (process.env.JIRA_PROJECT    || 'L1').trim(),
    pmField:   (process.env.JIRA_PM_FIELD   || '').trim(),
    custField: (process.env.JIRA_CUST_FIELD || '').trim(),
    frField:   (process.env.JIRA_FR_FIELD   || '').trim(),
    resField:  (process.env.JIRA_RES_FIELD  || '').trim(),
  };
}

export function isJiraConfigured(): boolean {
  // Connected via OAuth takes priority
  if (isOAuthConfigured() && isOAuthConnected()) return true;
  // Fall back to API token check
  const { email, token } = getConfig();
  return !!(
    email && token &&
    email !== 'your-jira-email@cloudfuze.com' &&
    token !== 'your-jira-api-token-here'
  );
}

async function makeClient() {
  // Try OAuth first (works even when org blocks API tokens)
  if (isOAuthConfigured()) {
    const oauth = await getValidAccessToken();
    if (oauth) {
      logger.info('[Jira] Using OAuth 2.0 access token');
      return axios.create({
        baseURL:      `https://api.atlassian.com/ex/jira/${oauth.cloudId}`,
        headers:      { Accept: 'application/json', Authorization: `Bearer ${oauth.token}` },
        maxRedirects: 5,
        timeout:      30_000,
      });
    }
  }
  // Fall back to Basic Auth API token
  const { baseURL, email, token } = getConfig();
  const basicAuth = Buffer.from(`${email}:${token}`).toString('base64');
  logger.info('[Jira] Using API token (Basic auth)');
  return axios.create({
    baseURL,
    headers:      { Accept: 'application/json', Authorization: `Basic ${basicAuth}` },
    maxRedirects: 5,
    timeout:      30_000,
  });
}

// ── Field discovery ────────────────────────────────────────────────────────────

let _fieldMap: Record<string, string> | null = null;
let _fieldMapEmail = '';

async function getFieldMap(): Promise<Record<string, string>> {
  const { email } = getConfig();
  const cacheKey = isOAuthConnected() ? `oauth:${loadTokens()?.cloudId}` : email;
  if (_fieldMapEmail !== cacheKey) { _fieldMap = null; _fieldMapEmail = cacheKey; }
  if (_fieldMap) return _fieldMap;

  const client = await makeClient();
  const { data } = await client.get<any[]>('/rest/api/3/field');
  const map: Record<string, string> = {};
  for (const f of data) map[f.name.toLowerCase()] = f.id;
  _fieldMap = map;

  const custom = data
    .filter((f) => f.id.startsWith('customfield_'))
    .map((f) => `"${f.name}" (${f.id})`)
    .join(', ');
  logger.info(`[Jira] Custom fields: ${custom}`);
  return map;
}

export async function listAllFields(): Promise<Array<{ name: string; id: string }>> {
  const client = await makeClient();
  const { data } = await client.get<any[]>('/rest/api/3/field');
  return data.map((f) => ({ name: f.name, id: f.id })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listProjects(): Promise<any[]> {
  const client = await makeClient();
  const { data } = await client.get('/rest/api/3/project/search', {
    params: { maxResults: 50, orderBy: 'name' },
  });
  return (data.values || []).map((p: any) => ({
    key:  p.key,
    name: p.name,
    type: p.projectTypeKey,
    style: p.style,
  }));
}

export async function sampleTickets(): Promise<any> {
  const client = await makeClient();
  const { project } = getConfig();
  const { pmField, custField } = await resolveFields();
  const { startDate, nextMonthStart, endDate } = getLastMonthRange();

  const results: Record<string, any> = { project, pmField, period: { startDate, endDate } };

  // Test 1: any accessible issue at all
  try {
    const r1 = await client.post('/rest/api/3/search/jql', { jql: 'ORDER BY created DESC', maxResults: 1, fields: ['summary'] });
    results.test1_anyIssue = { total: r1.data.total, firstKey: r1.data.issues?.[0]?.key ?? null };
  } catch (e: any) {
    results.test1_anyIssue = { error: e.message, status: e.response?.status, detail: e.response?.data };
  }

  // Test 2: project exists and is accessible
  try {
    const r2 = await client.post('/rest/api/3/search/jql', { jql: `project = ${project} ORDER BY created DESC`, maxResults: 3, fields: ['summary', 'assignee', pmField].filter(Boolean) });
    results.test2_projectOnly = { total: r2.data.total, issues: (r2.data.issues || []).map((i: any) => ({ key: i.key, summary: i.fields?.summary })) };
  } catch (e: any) {
    results.test2_projectOnly = { error: e.message, status: e.response?.status, detail: e.response?.data };
  }

  // Test 3: project + date range (the real query)
  try {
    const jql =
      `project = ${project} ` +
      `AND ((created >= "${startDate}" AND created < "${nextMonthStart}") ` +
      `OR (updated >= "${startDate}" AND updated < "${nextMonthStart}")) ` +
      `ORDER BY updated DESC`;
    const fields = ['summary', 'assignee'];
    if (pmField)   fields.push(pmField);
    if (custField) fields.push(custField);
    const r3 = await client.post('/rest/api/3/search/jql', { jql, maxResults: 10, fields });
    const pmValues = new Set<string>();
    const samples = (r3.data.issues || []).map((issue: any) => {
      const rawPm = pmField ? issue.fields[pmField] : null;
      const pmVal = rawPm ? fieldValue(rawPm) : null;
      if (pmVal) pmValues.add(pmVal);
      return { key: issue.key, summary: issue.fields.summary, pmFieldValue: pmVal, assignee: issue.fields.assignee?.displayName ?? null };
    });
    results.test3_withDateRange = { jql, total: r3.data.total, distinctPmValues: Array.from(pmValues), samples };
  } catch (e: any) {
    results.test3_withDateRange = { error: e.message, status: e.response?.status, detail: e.response?.data };
  }

  // Test 4a: Server info (no auth required — confirms base URL is correct)
  try {
    const r4a = await client.get('/rest/api/3/serverInfo');
    results.test4a_serverInfo = { baseUrl: r4a.data.baseUrl, version: r4a.data.version, deploymentType: r4a.data.deploymentType };
  } catch (e: any) {
    results.test4a_serverInfo = { error: e.message, status: e.response?.status };
  }

  // Test 4b: Who am I (confirms token + email combo is valid)
  const { email: configEmail, token: configToken } = getConfig();
  results.test4b_configuredEmail = configEmail;
  results.test4b_tokenInfo = { length: configToken.length, prefix: configToken.slice(0, 8), suffix: configToken.slice(-6) };
  try {
    const r4b = await client.get('/rest/api/3/myself');
    results.test4b_myself = { accountId: r4b.data.accountId, displayName: r4b.data.displayName, emailAddress: r4b.data.emailAddress };
  } catch (e: any) {
    results.test4b_myself = { error: e.message, status: e.response?.status, detail: e.response?.data };
    // Try v2 as fallback
    try {
      const r4b2 = await client.get('/rest/api/2/myself');
      results.test4b_myselfV2 = { accountId: r4b2.data.accountId, displayName: r4b2.data.displayName, emailAddress: r4b2.data.emailAddress };
    } catch (e2: any) {
      results.test4b_myselfV2 = { error: e2.message, status: e2.response?.status };
    }
  }

  // Test 5: Exact permissions this user has in the L1 project
  try {
    const r5 = await client.get('/rest/api/3/mypermissions', { params: { projectKey: project } });
    const perms = r5.data.permissions ?? {};
    const relevant = ['BROWSE_PROJECTS', 'VIEW_WORKFLOW_TRANSITION_DETAIL', 'CREATE_ISSUES', 'MANAGE_WATCHERS'];
    results.test5_myPermissionsInL1 = Object.fromEntries(
      relevant.map((p) => [p, perms[p]?.havePermission ?? false])
    );
  } catch (e: any) {
    results.test5_myPermissionsInL1 = { error: e.message, status: e.response?.status };
  }

  // Test 6: List all projects this user can see (finds correct project key)
  try {
    const r6 = await client.get('/rest/api/3/project/search', { params: { maxResults: 20, orderBy: 'key' } });
    results.test6_allProjects = (r6.data.values || []).map((p: any) => ({ key: p.key, name: p.name, type: p.projectTypeKey }));
  } catch (e: any) {
    results.test6_allProjects = { error: e.message, status: e.response?.status };
  }

  // Test 7: JSM service desk list (with opt-in header)
  try {
    const r7 = await client.get('/rest/servicedeskapi/servicedesk', { headers: { 'X-ExperimentalApi': 'opt-in' } });
    results.test7_jsmServiceDesks = {
      total: r7.data.size ?? r7.data.total,
      desks: (r7.data.values || []).map((sd: any) => ({ id: sd.id, projectKey: sd.projectKey, projectName: sd.projectName })),
    };
  } catch (e: any) {
    results.test7_jsmServiceDesks = { error: e.message, status: e.response?.status };
  }

  return results;
}

function findField(map: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    const id = map[c.toLowerCase()];
    if (id) return id;
  }
  return '';
}

async function resolveFields() {
  const cfg = getConfig();
  const map = await getFieldMap();
  const pmField   = cfg.pmField   || findField(map, 'project manager', 'pm', 'project_manager');
  const custField = cfg.custField || findField(map, 'customer name', 'customer', 'organization name', 'organizations', 'organization', 'company', 'client name', 'client');
  const frField   = cfg.frField   || findField(map, 'time to first response', 'first response time', 'first response');
  const resField  = cfg.resField  || findField(map, 'time to resolution', 'resolution time', 'time to resolve', 'resolution sla');
  logger.info(`[Jira] Fields → PM:${pmField} Cust:${custField} FR:${frField} Res:${resField}`);
  return { pmField, custField, frField, resField };
}

// ── SLA helpers ────────────────────────────────────────────────────────────────

function countBreaches(slaField: any): number {
  if (!slaField) return 0;
  let n = 0;
  const completed: any[] = Array.isArray(slaField.completedCycles) ? slaField.completedCycles : [];
  n += completed.filter((c: any) => c.breached === true).length;
  if (slaField.ongoingCycle?.breached === true) n++;
  return n;
}

function fieldValue(value: any): string {
  if (!value) return 'Unknown';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((v) => v.name ?? v.displayName ?? String(v)).join(', ') || 'Unknown';
  return value.value ?? value.name ?? value.displayName ?? value.emailAddress ?? String(value);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JiraProjectSla {
  customerName: string;
  totalTickets: number;
  breachCount: number;
  breachRate: number;
  firstResponseBreaches: number;
  resolutionBreaches: number;
}

export interface JiraSlaResult {
  manager: string;
  period: { startDate: string; endDate: string };
  projects: JiraProjectSla[];
  totalTickets: number;
  totalBreaches: number;
  overallBreachRate: number;
}

export interface EngineerStat {
  engineerName: string;
  totalTickets: number;
  breachedTickets: number;
  breachRate: number;
}

export interface EngineerSlaResult {
  period: { startDate: string; endDate: string };
  engineers: EngineerStat[];
  totalTickets: number;
  totalBreached: number;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

export function getLastMonthRange(): { startDate: string; endDate: string; nextMonthStart: string } {
  const now          = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed (June = 6)

  let lastMonthYear = currentYear;
  let lastMonthNum  = currentMonth - 1;
  if (lastMonthNum === 0) { lastMonthNum = 12; lastMonthYear--; }

  const mm      = String(lastMonthNum).padStart(2, '0');
  const cmm     = String(currentMonth).padStart(2, '0');
  const lastDay = new Date(lastMonthYear, lastMonthNum, 0).getDate();

  return {
    startDate:     `${lastMonthYear}-${mm}-01`,
    endDate:       `${lastMonthYear}-${mm}-${String(lastDay).padStart(2, '0')}`,
    nextMonthStart:`${currentYear}-${cmm}-01`,
  };
}

// ── Shared paginator ──────────────────────────────────────────────────────────

async function paginateV2(client: Awaited<ReturnType<typeof makeClient>>, jql: string, fields: string[]): Promise<any[]> {
  const all: any[] = [];
  let startAt = 0;
  const maxResults = 100;
  while (true) {
    const { data } = await client.post('/rest/api/2/search', { jql, startAt, maxResults, fields });
    logger.info(`[Jira v2] total=${data.total} startAt=${startAt} issues=${(data.issues || []).length}`);
    const issues: any[] = data.issues || [];
    all.push(...issues);
    startAt += issues.length;
    if (issues.length === 0 || startAt >= (data.total ?? 0)) break;
  }
  return all;
}

async function paginate(client: Awaited<ReturnType<typeof makeClient>>, jql: string, fields: string[]): Promise<any[]> {
  const all: any[] = [];
  let nextPageToken: string | undefined;
  while (true) {
    const body: Record<string, any> = { jql, maxResults: 100, fields };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const { data } = await client.post('/rest/api/3/search/jql', body);
    logger.info(`[Jira v3] total=${data.total} issues=${(data.issues || []).length} nextPageToken=${data.nextPageToken ?? 'none'}`);
    const issues: any[] = data.issues || [];
    all.push(...issues);
    nextPageToken = data.nextPageToken;
    if (!nextPageToken || issues.length === 0) break;
  }

  // v3 returned 0 — try v2 as a fallback (some Jira instances still support it)
  if (all.length === 0) {
    logger.info('[Jira] v3 returned 0 issues — retrying with v2 API');
    try {
      return await paginateV2(client, jql, fields);
    } catch (e: any) {
      logger.warn(`[Jira] v2 fallback also failed: ${e.message} (status ${e.response?.status})`);
    }
  }

  return all;
}

// ── PM name matching (flexible) ───────────────────────────────────────────────

function pmMatches(jiraValue: string, configuredName: string): boolean {
  if (!jiraValue || jiraValue === 'Unknown') return false;
  const jv = jiraValue.toLowerCase().trim();
  const cn = configuredName.toLowerCase().trim();

  // 1. Exact match
  if (jv === cn) return true;

  // 2. Email prefix match — e.g. "abhishek.sakala@cloudfuze.com" vs "Abhishek Sakala"
  const emailUser = jv.split('@')[0].replace(/[._]/g, ' ');
  if (emailUser === cn) return true;

  // 3. First-name match — "Abhishek" matches "Abhishek Sakala"
  const jvFirst = jv.split(/\s+/)[0];
  const cnFirst = cn.split(/\s+/)[0];
  if (jvFirst.length > 2 && jvFirst === cnFirst) return true;

  // 4. Contains — one name fully contained in the other
  if (jv.includes(cn) || cn.includes(jv)) return true;

  return false;
}

// ── Manager SLA ───────────────────────────────────────────────────────────────

export async function getSlaByManager(
  managerName: string,
  startDate: string,
  endDate: string,
  nextMonthStart: string,
): Promise<JiraSlaResult> {
  const client = await makeClient();
  const { pmField, custField, frField, resField } = await resolveFields();
  const { project } = getConfig();

  // Use the plain project+date JQL (no cf[] filter — causes 400 on Jira Cloud).
  // Fetch all tickets and filter by PM field value in code.
  const jql =
    `project = ${project} ` +
    `AND ((created >= "${startDate}" AND created < "${nextMonthStart}") ` +
    `OR (updated >= "${startDate}" AND updated < "${nextMonthStart}")) ` +
    `ORDER BY updated DESC`;

  logger.info(`[Jira] Manager JQL: ${jql}`);

  const reqFields: string[] = ['summary'];
  if (pmField)   reqFields.push(pmField);
  if (custField) reqFields.push(custField);
  if (frField)   reqFields.push(frField);
  if (resField)  reqFields.push(resField);

  const allIssues = await paginate(client, jql, reqFields);

  if (allIssues.length === 0) {
    logger.warn('[Jira] 0 tickets returned — check that the API token user has Agent role in the L1 JSM project (Project Settings → People → Service Desk Team)');
    return {
      manager: managerName,
      period: { startDate, endDate },
      projects: [],
      totalTickets: 0,
      totalBreaches: 0,
      overallBreachRate: 0,
      hint: 'API returned 0 tickets. Ensure the API token user has "Service Desk Team" (Agent) role in the L1 Jira project.',
    } as any;
  }

  // Filter to this manager's tickets using flexible name matching
  const issues = pmField
    ? allIssues.filter((issue) => pmMatches(fieldValue(issue.fields[pmField]), managerName))
    : allIssues;

  logger.info(`[Jira] ${issues.length}/${allIssues.length} tickets matched PM "${managerName}"`);

  // Log distinct PM values to help debug mismatches
  if (pmField) {
    const pmValues = new Set(allIssues.map((i) => fieldValue(i.fields[pmField])));
    logger.info(`[Jira] Distinct PM values in tickets: ${Array.from(pmValues).join(' | ')}`);
  }

  const grouped: Record<string, { total: number; frBreaches: number; resBreaches: number }> = {};
  for (const issue of issues) {
    const f        = issue.fields;
    const customer = custField ? fieldValue(f[custField]) : 'Unknown';
    if (!grouped[customer]) grouped[customer] = { total: 0, frBreaches: 0, resBreaches: 0 };
    grouped[customer].total++;
    if (frField)  grouped[customer].frBreaches  += countBreaches(f[frField]);
    if (resField) grouped[customer].resBreaches += countBreaches(f[resField]);
  }

  const slotCount = (frField ? 1 : 0) + (resField ? 1 : 0) || 1;
  const projects: JiraProjectSla[] = Object.entries(grouped)
    .map(([customerName, s]) => {
      const breachCount = s.frBreaches + s.resBreaches;
      const maxPossible = s.total * slotCount;
      return {
        customerName,
        totalTickets:          s.total,
        breachCount,
        breachRate:            maxPossible > 0 ? parseFloat(((breachCount / maxPossible) * 100).toFixed(1)) : 0,
        firstResponseBreaches: s.frBreaches,
        resolutionBreaches:    s.resBreaches,
      };
    })
    .sort((a, b) => b.totalTickets - a.totalTickets);

  const totalTickets  = projects.reduce((n, p) => n + p.totalTickets, 0);
  const totalBreaches = projects.reduce((n, p) => n + p.breachCount, 0);
  const maxTotal      = totalTickets * slotCount;

  return {
    manager: managerName,
    period: { startDate, endDate },
    projects,
    totalTickets,
    totalBreaches,
    overallBreachRate: maxTotal > 0 ? parseFloat(((totalBreaches / maxTotal) * 100).toFixed(1)) : 0,
  };
}

// ── Engineer SLA ──────────────────────────────────────────────────────────────

export async function getEngineerStats(
  startDate: string,
  endDate: string,
  nextMonthStart: string,
): Promise<EngineerSlaResult> {
  const client = await makeClient();
  const { frField, resField } = await resolveFields();
  const { project } = getConfig();

  const jql =
    `project = ${project} ` +
    `AND ((created >= "${startDate}" AND created < "${nextMonthStart}") ` +
    `OR (updated >= "${startDate}" AND updated < "${nextMonthStart}")) ` +
    `ORDER BY updated DESC`;

  logger.info(`[Jira] Engineer JQL: ${jql}`);

  const reqFields: string[] = ['summary', 'assignee'];
  if (frField)  reqFields.push(frField);
  if (resField) reqFields.push(resField);

  const issues = await paginate(client, jql, reqFields);

  const grouped: Record<string, { total: number; breached: number }> = {};
  for (const issue of issues) {
    const f        = issue.fields;
    const name     = f.assignee?.displayName || 'Unassigned';
    if (!grouped[name]) grouped[name] = { total: 0, breached: 0 };
    grouped[name].total++;
    const anyBreach = (frField && countBreaches(f[frField]) > 0) || (resField && countBreaches(f[resField]) > 0);
    if (anyBreach) grouped[name].breached++;
  }

  const engineers: EngineerStat[] = Object.entries(grouped)
    .map(([engineerName, s]) => ({
      engineerName,
      totalTickets:   s.total,
      breachedTickets: s.breached,
      breachRate:     s.total > 0 ? parseFloat(((s.breached / s.total) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.totalTickets - a.totalTickets);

  return {
    period: { startDate, endDate },
    engineers,
    totalTickets:  engineers.reduce((n, e) => n + e.totalTickets, 0),
    totalBreached: engineers.reduce((n, e) => n + e.breachedTickets, 0),
  };
}
