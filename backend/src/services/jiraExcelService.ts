import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger";

const EXCEL_DATA_FILE = path.join(process.cwd(), ".jira-excel-data.json");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedTicket {
  key: string;
  summary: string;
  assignee: string;
  projectManager: string;
  customer: string;
  status: string;
  created: string;
  updated: string;
  frBreached: boolean;
  resBreached: boolean;
}

export interface ExcelDataStore {
  uploadedAt: string;
  filename: string;
  ticketCount: number;
  columnMap: Record<string, string>;
  tickets: ParsedTicket[];
}

export interface ExcelSlaResult {
  manager: string;
  period: { startDate: string; endDate: string };
  projects: {
    customerName: string;
    totalTickets: number;
    breachCount: number;
    breachRate: number;
    firstResponseBreaches: number;
    resolutionBreaches: number;
    tickets: ParsedTicket[];
  }[];
  totalTickets: number;
  totalBreaches: number;
  overallBreachRate: number;
  allTickets: ParsedTicket[];
  source: "excel";
}

export interface EngineerHygiene {
  engineerName: string;
  totalTickets: number;
  resolvedTickets: number;
  breachedTickets: number;
  breachRate: number;
  hygieneScore: number;
  tickets: ParsedTicket[];
}

export interface ExcelEngineersByManagerResult {
  managers: { manager: string; engineers: EngineerHygiene[] }[];
  source: "excel";
}

export interface ExcelEngineerResult {
  period: { startDate: string; endDate: string };
  engineers: {
    engineerName: string;
    totalTickets: number;
    breachedTickets: number;
    breachRate: number;
    tickets: ParsedTicket[];
  }[];
  totalTickets: number;
  totalBreached: number;
  source: "excel";
}

// ── Column detection ──────────────────────────────────────────────────────────

// Strip everything outside printable ASCII range, collapse whitespace, lowercase
function cleanHeader(h: any): string {
  return String(h == null ? "" : h)
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findColIdx(headers: string[], ...candidates: string[]): number {
  const cleaned = headers.map(cleanHeader);

  // 1. Exact match
  for (const c of candidates) {
    const lc = cleanHeader(c);
    const idx = cleaned.findIndex((h) => h === lc);
    if (idx !== -1) return idx;
  }

  // 2. Header contains candidate (e.g. "Project Manager Name" contains "Project Manager")
  for (const c of candidates) {
    const lc = cleanHeader(c);
    if (lc.length <= 3) continue;
    const idx = cleaned.findIndex((h) => h.includes(lc));
    if (idx !== -1) return idx;
  }

  return -1;
}

function cellStr(row: any[], idx: number): string {
  if (idx < 0 || idx >= row.length) return "";
  const v = row[idx];
  if (v == null) return "";
  return String(v).trim();
}

// Handles boolean Yes/No columns, Jira time "-0h 30m (Breached)", plain "Breached"
function isBreached(value: any): boolean {
  if (value == null) return false;
  const s = String(value).toLowerCase().trim();
  if (s === "" || s === "n/a" || s === "-" || s === "no" || s === "false" || s === "0") return false;
  if (s === "yes" || s === "true" || s === "1") return true;
  if (s.includes("breach")) return true;
  if (s.startsWith("-") && s.length > 1) return true;
  return false;
}

// ── Parse ─────────────────────────────────────────────────────────────────────

export function parseJiraExcel(buffer: Buffer, filename: string): ExcelDataStore {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (rows.length < 2) throw new Error("Excel file appears empty — no data rows found.");

  // Strip BOM and whitespace from every header cell
  const rawHeaders: string[] = rows[0].map((h: any) =>
    String(h == null ? "" : h).replace(/[^\x20-\x7E]/g, "").trim()
  );

  logger.info(`[Excel] All headers (${rawHeaders.length}): ${rawHeaders.join(" | ")}`);

  const idxKey      = findColIdx(rawHeaders, "Key", "Issue Key", "Issue key", "issue key", "Ticket Key", "Issue id", "Issue ID");
  const idxSummary  = findColIdx(rawHeaders, "Summary");
  const idxAssignee = findColIdx(rawHeaders, "Assignee");
  const idxPm       = findColIdx(rawHeaders, "Project Manager", "PM", "Project manager", "project manager");
  const idxCust     = findColIdx(rawHeaders, "Customer Name", "Customer", "customer name", "customer", "Account Name", "Client");
  const idxStatus   = findColIdx(rawHeaders, "Status");
  const idxCreated  = findColIdx(rawHeaders, "Created");
  const idxUpdated  = findColIdx(rawHeaders, "Updated");
  const idxFrSla    = findColIdx(rawHeaders, "First Response SLA Breach", "First Response Breach", "FR Breach", "FR SLA Breach");
  const idxResSla   = findColIdx(rawHeaders, "Resolution SLA Breach", "Resolution Breach", "Res Breach", "Res SLA Breach");

  const columnMap: Record<string, string> = {
    key:      idxKey >= 0      ? rawHeaders[idxKey]      : "NOT FOUND",
    summary:  idxSummary >= 0  ? rawHeaders[idxSummary]  : "NOT FOUND",
    assignee: idxAssignee >= 0 ? rawHeaders[idxAssignee] : "NOT FOUND",
    pm:       idxPm >= 0       ? rawHeaders[idxPm]       : "NOT FOUND",
    customer: idxCust >= 0     ? rawHeaders[idxCust]     : "NOT FOUND",
    frSla:    idxFrSla >= 0    ? rawHeaders[idxFrSla]    : "NOT FOUND",
    resSla:   idxResSla >= 0   ? rawHeaders[idxResSla]   : "NOT FOUND",
    allHeaders: rawHeaders.slice(0, 30).join(" | "),
  };

  logger.info(`[Excel] Detected columns: ${JSON.stringify(columnMap)}`);

  const tickets: ParsedTicket[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    if (row.every((c: any) => c === "" || c == null)) continue;

    const ticket: ParsedTicket = {
      key:            cellStr(row, idxKey),
      summary:        cellStr(row, idxSummary),
      assignee:       cellStr(row, idxAssignee) || "Unassigned",
      projectManager: cellStr(row, idxPm),
      customer:       cellStr(row, idxCust) || "Unknown",
      status:         cellStr(row, idxStatus),
      created:        cellStr(row, idxCreated),
      updated:        cellStr(row, idxUpdated),
      frBreached:     idxFrSla >= 0  ? isBreached(row[idxFrSla])  : false,
      resBreached:    idxResSla >= 0 ? isBreached(row[idxResSla]) : false,
    };

    if (ticket.key || ticket.summary) tickets.push(ticket);
  }

  logger.info(`[Excel] Parsed ${tickets.length} tickets from "${filename}"`);

  return {
    uploadedAt:  new Date().toISOString(),
    filename,
    ticketCount: tickets.length,
    columnMap,
    tickets,
  };
}

// ── Persistence ───────────────────────────────────────────────────────────────

export function saveExcelData(data: ExcelDataStore): void {
  fs.writeFileSync(EXCEL_DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

export function loadExcelData(): ExcelDataStore | null {
  try {
    if (fs.existsSync(EXCEL_DATA_FILE)) {
      return JSON.parse(fs.readFileSync(EXCEL_DATA_FILE, "utf8"));
    }
  } catch (e: any) {
    logger.error(`[Excel] Failed to load data: ${e.message}`);
  }
  return null;
}

export function clearExcelData(): void {
  if (fs.existsSync(EXCEL_DATA_FILE)) fs.unlinkSync(EXCEL_DATA_FILE);
}

export function isExcelDataAvailable(): boolean {
  return fs.existsSync(EXCEL_DATA_FILE);
}

// ── PM name matching ──────────────────────────────────────────────────────────

function pmMatches(jiraValue: string, configuredName: string): boolean {
  if (!jiraValue) return false;
  const jv = jiraValue.toLowerCase().trim();
  const cn = configuredName.toLowerCase().trim();
  if (jv === cn) return true;
  const emailUser = jv.split("@")[0].replace(/[._]/g, " ");
  if (emailUser === cn) return true;
  const jvFirst = jv.split(/\s+/)[0];
  const cnFirst = cn.split(/\s+/)[0];
  if (jvFirst.length > 2 && jvFirst === cnFirst) return true;
  if (jv.includes(cn) || cn.includes(jv)) return true;
  return false;
}

// ── Customer name normalisation ───────────────────────────────────────────────

// Strip spaces/underscores/hyphens and lowercase so "PDFSolution", "PDF Solution",
// "pdf_solution", "PDF-Solution" all collapse to the same key.
export function normalizeCustomer(name: string): string {
  return name.toLowerCase().replace(/[\s_\-]+/g, "");
}

// ── SLA computation ───────────────────────────────────────────────────────────

export function getExcelSlaByManager(managerName: string, store: ExcelDataStore): ExcelSlaResult {
  const period = {
    startDate: store.uploadedAt.slice(0, 10),
    endDate:   store.uploadedAt.slice(0, 10),
  };

  const pmValues = new Set(store.tickets.map((t) => t.projectManager).filter(Boolean));
  logger.info(`[Excel] Distinct PM values: ${Array.from(pmValues).join(" | ")}`);

  const managerTickets = store.tickets.filter((t) => pmMatches(t.projectManager, managerName));
  logger.info(`[Excel] ${managerTickets.length}/${store.tickets.length} tickets matched PM "${managerName}"`);

  // Group by normalised key; remember the first display name seen for that key
  const grouped: Record<string, { displayName: string; total: number; frBreaches: number; resBreaches: number; tickets: ParsedTicket[] }> = {};
  for (const t of managerTickets) {
    const raw  = t.customer || "Unknown";
    const key  = normalizeCustomer(raw);
    if (!grouped[key]) grouped[key] = { displayName: raw, total: 0, frBreaches: 0, resBreaches: 0, tickets: [] };
    grouped[key].total++;
    grouped[key].tickets.push(t);
    if (t.frBreached)  grouped[key].frBreaches++;
    if (t.resBreached) grouped[key].resBreaches++;
  }

  const projects = Object.entries(grouped)
    .map(([, s]) => {
      const breachCount  = s.frBreaches + s.resBreaches;
      const maxPossible  = s.total * 2;
      return {
        customerName:          s.displayName,
        totalTickets:          s.total,
        breachCount,
        breachRate:            maxPossible > 0 ? parseFloat(((breachCount / maxPossible) * 100).toFixed(1)) : 0,
        firstResponseBreaches: s.frBreaches,
        resolutionBreaches:    s.resBreaches,
        tickets:               s.tickets,
      };
    })
    .sort((a, b) => b.totalTickets - a.totalTickets);

  const totalTickets  = projects.reduce((n, p) => n + p.totalTickets, 0);
  const totalBreaches = projects.reduce((n, p) => n + p.breachCount, 0);
  const maxTotal      = totalTickets * 2;

  return {
    manager: managerName,
    period,
    projects,
    totalTickets,
    totalBreaches,
    overallBreachRate: maxTotal > 0 ? parseFloat(((totalBreaches / maxTotal) * 100).toFixed(1)) : 0,
    allTickets: managerTickets,
    source: "excel",
  };
}

// ── Board view — all tickets grouped by PM ────────────────────────────────────

export interface BoardPmEntry {
  pmName: string;
  totalTickets: number;
  breachedTickets: number;
  breachRate: number;
  tickets: ParsedTicket[];
}

export interface BoardResult {
  managers: BoardPmEntry[];
  totalTickets: number;
  totalBreached: number;
  uploadedAt: string;
  source: 'excel';
}

export function getBoardData(store: ExcelDataStore): BoardResult {
  const grouped: Record<string, { total: number; breached: number; tickets: ParsedTicket[] }> = {};

  for (const t of store.tickets) {
    const name = t.projectManager || 'Unassigned';
    if (!grouped[name]) grouped[name] = { total: 0, breached: 0, tickets: [] };
    grouped[name].total++;
    grouped[name].tickets.push(t);
    if (t.frBreached || t.resBreached) grouped[name].breached++;
  }

  const managers = Object.entries(grouped)
    .map(([pmName, s]) => ({
      pmName,
      totalTickets: s.total,
      breachedTickets: s.breached,
      breachRate: s.total > 0 ? parseFloat(((s.breached / s.total) * 100).toFixed(1)) : 0,
      tickets: s.tickets,
    }))
    .sort((a, b) => b.totalTickets - a.totalTickets);

  return {
    managers,
    totalTickets: managers.reduce((n, m) => n + m.totalTickets, 0),
    totalBreached: managers.reduce((n, m) => n + m.breachedTickets, 0),
    uploadedAt: store.uploadedAt,
    source: 'excel',
  };
}

// Jira exports use several terminal status names; treat all as resolved.
function isResolvedStatus(status: string): boolean {
  const s = status.toLowerCase().trim();
  return s === "resolved" || s === "done" || s === "closed" || s === "completed";
}

// Engineer hygiene = SLA cleanliness of their tickets (100 - breach rate).
// Placeholder until a dedicated engineer-hygiene formula is supplied.
function buildEngineerHygiene(name: string, tickets: ParsedTicket[]): EngineerHygiene {
  const breachedTickets = tickets.filter((t) => t.frBreached || t.resBreached).length;
  const resolvedTickets = tickets.filter((t) => isResolvedStatus(t.status)).length;
  const breachRate = tickets.length > 0
    ? parseFloat(((breachedTickets / tickets.length) * 100).toFixed(1))
    : 0;
  return {
    engineerName: name,
    totalTickets: tickets.length,
    resolvedTickets,
    breachedTickets,
    breachRate,
    hygieneScore: Math.max(0, Math.round(100 - breachRate)),
    tickets,
  };
}

/**
 * Groups engineers (Assignee) under the Project Manager on their tickets.
 * An engineer working for two PMs appears under both, scoped to that PM's tickets.
 */
export function getExcelEngineersByManager(store: ExcelDataStore): ExcelEngineersByManagerResult {
  const byManager: Record<string, Record<string, ParsedTicket[]>> = {};

  for (const t of store.tickets) {
    const pm = (t.projectManager || "").trim();
    if (!pm) continue;
    const engineer = (t.assignee || "").trim() || "Unassigned";
    if (!byManager[pm]) byManager[pm] = {};
    if (!byManager[pm][engineer]) byManager[pm][engineer] = [];
    byManager[pm][engineer].push(t);
  }

  const managers = Object.entries(byManager).map(([manager, engineerMap]) => ({
    manager,
    engineers: Object.entries(engineerMap)
      .map(([name, tickets]) => buildEngineerHygiene(name, tickets))
      .sort((a, b) => b.totalTickets - a.totalTickets),
  }));

  return { managers, source: "excel" };
}

export function getExcelEngineerStats(store: ExcelDataStore): ExcelEngineerResult {
  const period = {
    startDate: store.uploadedAt.slice(0, 10),
    endDate:   store.uploadedAt.slice(0, 10),
  };

  const grouped: Record<string, { total: number; breached: number; tickets: ParsedTicket[] }> = {};
  for (const t of store.tickets) {
    const name = t.assignee || "Unassigned";
    if (!grouped[name]) grouped[name] = { total: 0, breached: 0, tickets: [] };
    grouped[name].total++;
    grouped[name].tickets.push(t);
    if (t.frBreached || t.resBreached) grouped[name].breached++;
  }

  const engineers = Object.entries(grouped)
    .map(([engineerName, s]) => ({
      engineerName,
      totalTickets:    s.total,
      breachedTickets: s.breached,
      breachRate:      s.total > 0 ? parseFloat(((s.breached / s.total) * 100).toFixed(1)) : 0,
      tickets:         s.tickets,
    }))
    .sort((a, b) => b.totalTickets - a.totalTickets);

  return {
    period,
    engineers,
    totalTickets:  engineers.reduce((n, e) => n + e.totalTickets, 0),
    totalBreached: engineers.reduce((n, e) => n + e.breachedTickets, 0),
    source: "excel",
  };
}
