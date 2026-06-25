import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

const JIRA_BASE  = (process.env.JIRA_API_URL  || 'https://cf2020.atlassian.net').replace(/\/$/, '');
const JIRA_EMAIL = process.env.JIRA_USER_EMAIL || '';
const JIRA_TOKEN = process.env.JIRA_API_TOKEN  || '';

export function isJiraConfigured(): boolean {
  return !!(JIRA_EMAIL && JIRA_TOKEN);
}

const client: AxiosInstance = axios.create({
  baseURL: JIRA_BASE,
  auth: { username: JIRA_EMAIL, password: JIRA_TOKEN },
  headers: { 'Accept': 'application/json' },
  timeout: 20_000,
});

// ── Field discovery ────────────────────────────────────────────────────────────

let _fieldMap: Record<string, string> | null = null;

async function getFieldMap(): Promise<Record<string, string>> {
  if (_fieldMap) return _fieldMap;
  const { data } = await client.get<any[]>('/rest/api/3/field');
  const map: Record<string, string> = {};
  for (const f of data) {
    map[f.name.toLowerCase()] = f.id;
  }
  _fieldMap = map;
  logger.info(`[Jira] Discovered ${data.length} fields`);
  return map;
}

function findField(map: Record<string, string>, ...candidates: string[]): string | null {
  for (const c of candidates) {
    const id = map[c.toLowerCase()];
    if (id) return id;
  }
  return null;
}

// ── SLA breach counting ────────────────────────────────────────────────────────

function countBreaches(slaField: any): number {
  if (!slaField) return 0;
  let n = 0;
  const completed: any[] = Array.isArray(slaField.completedCycles) ? slaField.completedCycles : [];
  n += completed.filter((c) => c.breached === true).length;
  if (slaField.ongoingCycle?.breached === true) n++;
  return n;
}

function fieldValue(value: any): string {
  if (!value) return 'Unknown';
  if (typeof value === 'string') return value;
  return value.value ?? value.name ?? value.displayName ?? value.emailAddress ?? String(value);
}

// ── Public types ──────────────────────────────────────────────────────────────

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

// ── Date helpers ──────────────────────────────────────────────────────────────

export function getLastMonthRange(): { startDate: string; endDate: string } {
  const now  = new Date();
  let year   = now.getFullYear();
  let month  = now.getMonth(); // 0-indexed; this is already the PREVIOUS month if we subtract 1
  if (month === 0) { month = 12; year -= 1; } // January → December of previous year
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return {
    startDate: `${year}-${mm}-01`,
    endDate:   `${year}-${mm}-${lastDay}`,
  };
}

// ── Main SLA fetch ────────────────────────────────────────────────────────────

export async function getSlaByManager(
  managerName: string,
  startDate: string,
  endDate: string,
): Promise<JiraSlaResult> {
  const fields = await getFieldMap();

  const pmField   = findField(fields, 'project manager', 'pm', 'project_manager');
  const custField = findField(fields, 'customer name', 'customer', 'organization name', 'organization');
  const frField   = findField(fields, 'time to first response', 'first response time', 'first response');
  const resField  = findField(fields, 'time to resolution', 'resolution time', 'time to resolve', 'resolution sla');

  if (!pmField) throw new Error('Cannot locate "Project Manager" custom field in Jira. Check field names.');

  // Build JQL — use cf[NNNN] syntax which works universally
  const pmId  = pmField.startsWith('customfield_')  ? pmField.replace('customfield_', '')  : null;
  const pmClause = pmId
    ? `cf[${pmId}] = "${managerName}"`
    : `"${pmField}" = "${managerName}"`;

  const jql = `${pmClause} AND created >= "${startDate}" AND created <= "${endDate}" ORDER BY created ASC`;
  logger.info(`[Jira] JQL for ${managerName}: ${jql}`);

  const requestFields: string[] = ['summary'];
  if (custField) requestFields.push(custField);
  if (frField)   requestFields.push(frField);
  if (resField)  requestFields.push(resField);

  // Paginate through all issues
  const allIssues: any[] = [];
  let startAt = 0;
  while (true) {
    const { data } = await client.get('/rest/api/3/search', {
      params: { jql, startAt, maxResults: 100, fields: requestFields.join(',') },
    });
    allIssues.push(...(data.issues || []));
    logger.info(`[Jira] Fetched ${allIssues.length}/${data.total} issues for ${managerName}`);
    if (allIssues.length >= data.total) break;
    startAt += 100;
  }

  // Group by customer name
  const grouped: Record<string, { total: number; frBreaches: number; resBreaches: number }> = {};

  for (const issue of allIssues) {
    const f = issue.fields;
    const customer = custField ? fieldValue(f[custField]) : 'Unknown';
    if (!grouped[customer]) grouped[customer] = { total: 0, frBreaches: 0, resBreaches: 0 };
    grouped[customer].total++;
    if (frField)  grouped[customer].frBreaches  += countBreaches(f[frField]);
    if (resField) grouped[customer].resBreaches += countBreaches(f[resField]);
  }

  const slotCount = (frField ? 1 : 0) + (resField ? 1 : 0) || 1;

  const projects: JiraProjectSla[] = Object.entries(grouped).map(([customerName, s]) => {
    const breachCount  = s.frBreaches + s.resBreaches;
    const maxPossible  = s.total * slotCount;
    return {
      customerName,
      totalTickets:          s.total,
      breachCount,
      breachRate:            maxPossible > 0 ? parseFloat(((breachCount / maxPossible) * 100).toFixed(1)) : 0,
      firstResponseBreaches: s.frBreaches,
      resolutionBreaches:    s.resBreaches,
    };
  }).sort((a, b) => b.totalTickets - a.totalTickets);

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
