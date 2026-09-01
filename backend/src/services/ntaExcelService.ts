// Upload-based data source for the Manager Dashboard's Tickets/Engineers tabs.
//
// The Tickets/Engineers UI (frontend/src/app/(authenticated)/manager-dashboard/page.tsx)
// and its useNta*() hooks (frontend/src/hooks/useProjects.ts) were fully built against a
// live Neutara Ticketing API at /api/ticketing/* -- but that route was never implemented
// on the backend (ntaSyncService.ts is orphaned dead code: no route calls it, and it
// upserts into an `nta_tickets` table that has no migration). Rather than stand up the
// live API integration, this mirrors the existing, already-working Jira Excel upload
// pattern (jiraExcelService.ts): parse an exported CSV/XLSX, hold it as a flat JSON file,
// and serve every useNta*() endpoint shape from that in-memory/on-disk snapshot.
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

const DATA_FILE = path.join(process.cwd(), '.nta-excel-data.json');
const CONFIG_FILE = path.join(process.cwd(), '.nta-excel-config.json');

export interface NtaTicket {
  id: string;
  key: string;
  type: string;
  summary: string;
  status: { name: string; category: 'todo' | 'in-progress' | 'done' };
  priority: string;
  assignee: { displayName: string };
  reporter: { displayName: string };
  current_department: string;
  slaBreached: boolean;
  slaBreachedBy: string;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
  customerName?: string;
  projectManager?: string;
}

export interface NtaDataStore {
  uploadedAt: string;
  filename: string;
  ticketCount: number;
  tickets: NtaTicket[];
}

export interface NtaSearchFilters {
  key?: string;
  summary?: string;
  status?: string;
  priority?: string;
  customer?: string;
  assignee?: string;
  reporter?: string;
  projectManager?: string;
  department?: string;
  spaces?: string;
  createdFrom?: string;
  createdTo?: string;
}

// ── Column detection (same fuzzy-match approach as jiraExcelService.ts) ──────────

function cleanHeader(h: any): string {
  return String(h == null ? '' : h).replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function findColIdx(headers: string[], ...candidates: string[]): number {
  const cleaned = headers.map(cleanHeader);
  for (const c of candidates) {
    const lc = cleanHeader(c);
    const idx = cleaned.findIndex((h) => h === lc);
    if (idx !== -1) return idx;
  }
  for (const c of candidates) {
    const lc = cleanHeader(c);
    if (lc.length <= 3) continue;
    const idx = cleaned.findIndex((h) => h.includes(lc));
    if (idx !== -1) return idx;
  }
  return -1;
}

function cellStr(row: any[], idx: number): string {
  if (idx < 0 || idx >= row.length) return '';
  const v = row[idx];
  return v == null ? '' : String(v).trim();
}

function isYes(value: any): boolean {
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1';
}

function statusCategory(status: string): 'todo' | 'in-progress' | 'done' {
  const s = status.toLowerCase().trim();
  if (['resolved', 'closed', 'done'].includes(s)) return 'done';
  if (s === 'in progress' || s === 'in-progress') return 'in-progress';
  return 'todo';
}

// Export format seen: "31/8/2026, 7:21:38 pm" (D/M/YYYY, h:mm:ss am/pm) -- JS's native
// Date parser is unreliable across environments for day-first dates, so this is parsed
// by hand rather than trusting `new Date(raw)`.
function parseNtaDate(raw: string): string {
  if (!raw) return '';
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return '';
  const [, dd, mm, yyyy, hh, min, ss, ampm] = m;
  let hour = parseInt(hh, 10) % 12;
  if (ampm.toLowerCase() === 'pm') hour += 12;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), hour, Number(min), Number(ss));
  return isNaN(date.getTime()) ? '' : date.toISOString();
}

// ── Parse ─────────────────────────────────────────────────────────────────────

export function parseNtaCsv(buffer: Buffer, filename: string): NtaDataStore {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rows.length < 2) throw new Error('File appears empty — no data rows found.');

  const rawHeaders: string[] = rows[0].map((h: any) => String(h == null ? '' : h).replace(/[^\x20-\x7E]/g, '').trim());
  logger.info(`[NTA Excel] Headers (${rawHeaders.length}): ${rawHeaders.join(' | ')}`);

  const idxKey          = findColIdx(rawHeaders, 'Key', 'Issue Key');
  const idxType         = findColIdx(rawHeaders, 'Type', 'Issue Type');
  const idxSummary      = findColIdx(rawHeaders, 'Summary');
  const idxAssignee     = findColIdx(rawHeaders, 'Assignee');
  const idxReporter     = findColIdx(rawHeaders, 'Reporter');
  const idxStatus       = findColIdx(rawHeaders, 'Status');
  const idxPriority     = findColIdx(rawHeaders, 'Priority');
  const idxSlaBreached  = findColIdx(rawHeaders, 'SLA Breached');
  const idxSlaBreachBy  = findColIdx(rawHeaders, 'SLA Breached By');
  const idxOverdue      = findColIdx(rawHeaders, 'Overdue');
  const idxDept         = findColIdx(rawHeaders, 'Department');
  const idxCreated      = findColIdx(rawHeaders, 'Created');
  const idxUpdated      = findColIdx(rawHeaders, 'Updated');

  const tickets: NtaTicket[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    if (row.every((c: any) => c === '' || c == null)) continue;

    const key = cellStr(row, idxKey);
    const summary = cellStr(row, idxSummary);
    if (!key && !summary) continue;

    const status = cellStr(row, idxStatus);
    tickets.push({
      id: key,
      key,
      type: cellStr(row, idxType),
      summary,
      status: { name: status, category: statusCategory(status) },
      priority: cellStr(row, idxPriority).toLowerCase() || 'medium',
      assignee: { displayName: cellStr(row, idxAssignee) || 'Unassigned' },
      reporter: { displayName: cellStr(row, idxReporter) },
      current_department: cellStr(row, idxDept),
      slaBreached: isYes(row[idxSlaBreached]),
      slaBreachedBy: cellStr(row, idxSlaBreachBy),
      overdue: isYes(row[idxOverdue]),
      createdAt: parseNtaDate(cellStr(row, idxCreated)),
      updatedAt: parseNtaDate(cellStr(row, idxUpdated)),
    });
  }

  logger.info(`[NTA Excel] Parsed ${tickets.length} tickets from "${filename}"`);

  return { uploadedAt: new Date().toISOString(), filename, ticketCount: tickets.length, tickets };
}

// ── Persistence (flat JSON file, same one-shot-replace pattern as jiraExcelService) ──

export function saveNtaData(data: NtaDataStore): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function loadNtaData(): NtaDataStore | null {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e: any) {
    logger.error(`[NTA Excel] Failed to load data: ${e.message}`);
  }
  return null;
}

export function clearNtaData(): void {
  if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
}

export function isNtaDataAvailable(): boolean {
  return fs.existsSync(DATA_FILE);
}

// Separate tiny file so "hide the tab" survives independently of the uploaded dataset --
// an admin can disable the tab without losing the underlying data.
export function getNtaManuallyDisabled(): boolean {
  try {
    if (fs.existsSync(CONFIG_FILE)) return !!JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')).manuallyDisabled;
  } catch { /* default to not disabled */ }
  return false;
}

export function setNtaManuallyDisabled(disabled: boolean): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ manuallyDisabled: disabled }), 'utf8');
}

// ── Derived views (mirrors the shapes the existing useNta*() hooks expect) ───────

function countBy(tickets: NtaTicket[], fn: (t: NtaTicket) => string): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const t of tickets) {
    const name = fn(t) || 'Unknown';
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export function getStats(store: NtaDataStore) {
  return { totalTickets: store.tickets.length, totalBoards: 0 };
}

// No "board/space" concept exists in this CSV export -- the filter dropdown it feeds
// simply has no options, which the UI already handles gracefully (empty list).
export function getSpaces(_store: NtaDataStore): { key: string; name: string }[] {
  return [];
}

export function getAssignees(store: NtaDataStore) {
  return countBy(store.tickets, (t) => t.assignee.displayName);
}

export function getReporters(store: NtaDataStore) {
  return countBy(store.tickets, (t) => t.reporter.displayName);
}

// Not present in this CSV format (no "Project Manager" column) -- empty by design.
export function getProjectManagers(_store: NtaDataStore): { name: string; count: number }[] {
  return [];
}

export function getDepartments(store: NtaDataStore) {
  return countBy(store.tickets, (t) => t.current_department);
}

export function getIssues(store: NtaDataStore, page: number, limit: number) {
  const sorted = [...store.tickets].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const total = sorted.length;
  const start = (page - 1) * limit;
  return { data: sorted.slice(start, start + limit), total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export function searchTickets(store: NtaDataStore, filters: NtaSearchFilters): NtaTicket[] {
  const contains = (hay: string, needle: string) => (hay || '').toLowerCase().includes(needle.toLowerCase());
  const anyOf = (hay: string, list: string) => list.split(',').filter(Boolean).some((v) => contains(hay, v));

  let results = store.tickets;
  if (filters.key)            results = results.filter((t) => contains(t.key, filters.key!));
  if (filters.summary)        results = results.filter((t) => contains(t.summary, filters.summary!));
  if (filters.status)         results = results.filter((t) => contains(t.status.name, filters.status!));
  if (filters.priority)       results = results.filter((t) => contains(t.priority, filters.priority!));
  if (filters.customer)       results = results.filter((t) => contains(t.customerName || '', filters.customer!));
  if (filters.assignee)       results = results.filter((t) => anyOf(t.assignee.displayName, filters.assignee!));
  if (filters.reporter)       results = results.filter((t) => anyOf(t.reporter.displayName, filters.reporter!));
  if (filters.projectManager) results = results.filter((t) => anyOf(t.projectManager || '', filters.projectManager!));
  if (filters.department)     results = results.filter((t) => anyOf(t.current_department, filters.department!));
  if (filters.createdFrom)    results = results.filter((t) => t.createdAt && t.createdAt >= filters.createdFrom!);
  if (filters.createdTo)      results = results.filter((t) => t.createdAt && t.createdAt <= filters.createdTo!);

  return [...results].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export interface NtaTrendBucket {
  key: string;
  label: string;
  total: number;
  todo: number;
  inProgress: number;
  done: number;
}

export function getTrends(store: NtaDataStore, groupBy: 'week' | 'month', filters: NtaSearchFilters): NtaTrendBucket[] {
  const filtered = searchTickets(store, filters);
  const buckets = new Map<string, NtaTrendBucket>();

  for (const t of filtered) {
    if (!t.createdAt) continue;
    const d = new Date(t.createdAt);
    let key: string;
    let label: string;
    if (groupBy === 'week') {
      const day = d.getUTCDay();
      const diff = (day === 0 ? -6 : 1) - day; // Monday of that week
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() + diff);
      monday.setUTCHours(0, 0, 0, 0);
      key = monday.toISOString().slice(0, 10);
      label = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
    if (!buckets.has(key)) buckets.set(key, { key, label, total: 0, todo: 0, inProgress: 0, done: 0 });
    const b = buckets.get(key)!;
    b.total++;
    if (t.status.category === 'todo') b.todo++;
    else if (t.status.category === 'in-progress') b.inProgress++;
    else b.done++;
  }

  return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
}
