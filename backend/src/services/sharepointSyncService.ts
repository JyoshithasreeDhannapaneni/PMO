import * as XLSX from 'xlsx';
import axios from 'axios';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { graphClient } from './teamConversationTimeline';

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The MS_GRAPH_* app (PMO-Tracker-Mail-Integration) only has Mail.Read; Sites.Read.All is
// granted on the MICROSOFT_* app (SSO + Mail.Send), so SharePoint reads use that one.
// MICROSOFT_TENANT_ID is "common" for multi-tenant sign-in, which client-credentials
// can't use — fall back to the real tenant GUID from MS_GRAPH_TENANT_ID.
function sharepointCreds(): { tenant: string; clientId: string; secret: string } | null {
  const e = process.env;
  const clientId = e.SHAREPOINT_CLIENT_ID || e.MICROSOFT_CLIENT_ID;
  const secret = e.SHAREPOINT_CLIENT_SECRET || e.MICROSOFT_CLIENT_SECRET;
  const tenant = [e.SHAREPOINT_TENANT_ID, e.MICROSOFT_TENANT_ID, e.MS_GRAPH_TENANT_ID].find((t) => t && GUID_RE.test(t));
  if (!clientId || !secret || !tenant || clientId.startsWith('PASTE_') || secret.startsWith('PASTE_')) return null;
  return { tenant, clientId, secret };
}

function isGraphConfigured(): boolean {
  return sharepointCreds() !== null;
}

async function getAccessToken(): Promise<string> {
  const c = sharepointCreds();
  if (!c) throw new Error('SharePoint Graph credentials are not configured.');
  const res = await axios.post(
    `https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/token`,
    new URLSearchParams({ client_id: c.clientId, client_secret: c.secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );
  return res.data.access_token as string;
}

const DEFAULT_SITE_PATH = 'cloudfuzecom.sharepoint.com:/sites/MigrationPractice';
const DEFAULT_LIST_NAME = 'Migration Projects Tracker';

// Exact mirror of one SharePoint list row: column display name → the text SharePoint shows.
export interface MirrorRow {
  key: string;
  values: Record<string, string>;
}

export interface MirrorSnapshot {
  columns: string[];
  rows: MirrorRow[];
}

export interface SyncReport {
  source: 'GRAPH' | 'FILE';
  keyMode: 'ID' | 'NAME';
  totalRows: number;
  columns: number;
  inserted: number;
  updated: number;
  markedRemoved: number;
}

export function normalizeKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const NAME_COLUMN_CANDIDATES = ['projectcustomername', 'title', 'projectname', 'customername'];

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(cellText).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return cellText(obj.LookupValue ?? obj.displayName ?? obj.Email ?? obj.Label ?? '');
  }
  return '';
}

// Rows are keyed by the SharePoint item ID when the export includes an "ID" column (same
// key the Graph sync uses, so a later live sync updates these rows in place). Without one,
// the project/customer name + its occurrence number is the best stable identity available —
// the list genuinely repeats names (e.g. three "LegitScript" rows), hence the #n.
export function buildSnapshot(header: string[], body: string[][]): MirrorSnapshot & { keyMode: 'ID' | 'NAME' } {
  const cols = header.map((h, i) => ({ name: h.replace(/^﻿/, '').trim(), i })).filter((c) => c.name);
  const idCol = cols.find((c) => normalizeKey(c.name) === 'id');
  const nameCol = cols.find((c) => NAME_COLUMN_CANDIDATES.includes(normalizeKey(c.name))) ?? cols[0];
  const seen = new Map<string, number>();
  const rows: MirrorRow[] = [];

  for (const line of body) {
    const values: Record<string, string> = {};
    let hasData = false;
    for (const c of cols) {
      const text = line[c.i] ?? '';
      values[c.name] = text;
      if (text.trim()) hasData = true;
    }
    if (!hasData) continue;

    let key: string;
    const id = idCol ? (line[idCol.i] ?? '').trim() : '';
    if (id) {
      key = `sp:${id}`;
    } else {
      const base = nameCol ? normalizeKey(line[nameCol.i] ?? '') || 'blank' : 'blank';
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      key = `name:${base.slice(0, 200)}#${n}`;
    }
    rows.push({ key, values });
  }

  return { columns: cols.map((c) => c.name), rows, keyMode: idCol ? 'ID' : 'NAME' };
}

// raw:true keeps CSV cells as the exact text in the file (no "38.02" → number or
// "January 01" → date coercion); raw:false then returns each .xlsx cell's displayed text.
export function parseSpreadsheet(buffer: Buffer): MirrorSnapshot & { keyMode: 'ID' | 'NAME' } {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { columns: [], rows: [], keyMode: 'NAME' };
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false, blankrows: false });
  const [header = [], ...body] = grid.map((r) => r.map((v) => cellText(v)));
  return buildSnapshot(header, body);
}

interface GraphColumn {
  name: string;
  displayName: string;
  hidden?: boolean;
  readOnly?: boolean;
  personOrGroup?: object;
  lookup?: object;
  calculated?: object;
  dateTime?: { format?: string; displayAs?: string };
  boolean?: object;
}

// Graph v1.0 can't read a list view's column order, so a Graph sync leads with the
// "All Items" view's visible order (Plan / Delay Status / Delay Days sit right after the
// managers there) and appends the remaining columns in list order. A CSV import replaces
// this with the export's exact header order.
const VIEW_LEADING_COLUMNS = [
  'Project / Customer Name', 'Project Manager', 'Account Manager', 'Plan', 'Delay Status',
  'Delay Days', 'Current Phase', 'SOW Start Date', 'Active/On-Hold', 'Source Platform', 'Target Platform',
];

function orderColumns(names: string[]): string[] {
  const leading = (process.env.SHAREPOINT_COLUMN_ORDER?.split(',').map((s) => s.trim()).filter(Boolean)) ?? VIEW_LEADING_COLUMNS;
  const first = leading.filter((n) => names.includes(n));
  return [...first, ...names.filter((n) => !first.includes(n))];
}

function formatDate(value: unknown, dateOnly: boolean): string {
  const text = cellText(value);
  const d = new Date(text);
  if (!text || isNaN(d.getTime())) return text;
  const timeZone = process.env.SHAREPOINT_TIMEZONE || 'Asia/Kolkata';
  const dateText = d.toLocaleDateString('en-US', { timeZone, year: 'numeric', month: 'long', day: 'numeric' });
  if (dateOnly) return dateText;
  const time = d.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  // SharePoint's "friendly" display hides a midnight time on date+time columns.
  return time === '12:00 AM' ? dateText : `${dateText} ${time}`;
}

async function fetchListSnapshot(): Promise<MirrorSnapshot> {
  const sitePath = process.env.SHAREPOINT_SITE_PATH || DEFAULT_SITE_PATH;
  const listName = process.env.SHAREPOINT_LIST_NAME || DEFAULT_LIST_NAME;
  const client = graphClient(await getAccessToken());
  try {
    const siteId = (await client.get(`/sites/${sitePath}`)).data.id as string;
    const listId = (await client.get(`/sites/${siteId}/lists/${encodeURIComponent(listName)}`)).data.id as string;

    const allColumns = ((await client.get(`/sites/${siteId}/lists/${listId}/columns`)).data.value ?? []) as GraphColumn[];
    // Calculated columns (Plan, Delay Status, Delay Days, Total Cost…) are read-only but
    // are real list data shown in the view; other read-only columns are SharePoint system
    // fields (ID, Created, Version, compliance labels…) that the view doesn't show.
    const listColumns = allColumns.filter((c) =>
      !c.hidden && (c.name === 'Title' || !c.readOnly || !!c.calculated) &&
      !['ContentType', 'Attachments'].includes(c.name) && !c.name.startsWith('_'));

    const items: Array<{ id: string; fields: Record<string, unknown> }> = [];
    let url: string | undefined = `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=200`;
    while (url) {
      const res = await client.get(url);
      for (const item of (res.data.value ?? []) as Array<{ id: string; fields?: Record<string, unknown> }>) {
        items.push({ id: item.id, fields: item.fields ?? {} });
      }
      url = res.data['@odata.nextLink'] as string | undefined;
    }

    // This list keeps the default Title column but never fills it ("Project / Customer
    // Name" is the real name column), so it's dropped when empty on every row.
    const columns = listColumns.filter((c) =>
      c.name !== 'Title' || items.some((it) => cellText(it.fields.Title).trim() !== ''));

    // Person columns come back as "<name>LookupId" only — resolve to the display name
    // SharePoint shows via the site's hidden User Information List.
    const personNames = new Map<string, string>();
    const personIds = new Set<string>();
    for (const c of columns.filter((col) => col.personOrGroup)) {
      for (const item of items) {
        const id = item.fields[`${c.name}LookupId`];
        if (id !== undefined && id !== null && id !== '') personIds.add(String(id));
      }
    }
    for (const id of personIds) {
      try {
        const u = await client.get(`/sites/${siteId}/lists/${encodeURIComponent('User Information List')}/items/${id}?expand=fields($select=Title,EMail)`);
        const f = (u.data.fields ?? {}) as { Title?: string; EMail?: string };
        if (f.Title || f.EMail) personNames.set(id, (f.Title || f.EMail) as string);
      } catch (err) {
        logger.warn(`[SharePointSync] Could not resolve person ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const rows: MirrorRow[] = items.map((item) => {
      const values: Record<string, string> = {};
      for (const c of columns) {
        let raw: unknown = item.fields[c.name];
        if ((raw === undefined || raw === null) && (c.personOrGroup || c.lookup)) {
          const id = item.fields[`${c.name}LookupId`];
          raw = id !== undefined && id !== null ? (personNames.get(String(id)) ?? String(id)) : '';
        }
        // "friendly" date columns show only the date in the SharePoint view, time or not.
        if (c.dateTime) values[c.displayName] = formatDate(raw, c.dateTime.format !== 'dateTime' || c.dateTime.displayAs === 'friendly');
        else if (c.boolean) values[c.displayName] = raw === true ? 'Yes' : raw === false ? 'No' : '';
        else values[c.displayName] = cellText(raw);
      }
      return { key: `sp:${item.id}`, values };
    });

    return { columns: orderColumns(columns.map((c) => c.displayName)), rows };
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status === 401 || status === 403) {
      throw new Error(`Microsoft Graph denied access to the SharePoint list (HTTP ${status}). The MICROSOFT_* app needs the Sites.Read.All application permission with admin consent.`);
    }
    if (status === 404) {
      throw new Error(`SharePoint site or list not found (site "${sitePath}", list "${listName}"). Check SHAREPOINT_SITE_PATH / SHAREPOINT_LIST_NAME.`);
    }
    throw err;
  }
}

async function saveColumns(columns: string[], replaceOrder: boolean): Promise<void> {
  const existing = await query(`SELECT display_name, position FROM sharepoint_list_columns`);
  const known = new Map((existing.rows as Array<{ display_name: string; position: number }>).map((r) => [r.display_name, r.position]));
  let next = known.size ? Math.max(...known.values()) + 1 : 0;
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (replaceOrder) {
      await query(
        `INSERT INTO sharepoint_list_columns (display_name, position) VALUES (?, ?)
         ON CONFLICT (display_name) DO UPDATE SET position = EXCLUDED.position, updated_at = NOW()`,
        [col, i]
      );
    } else if (!known.has(col)) {
      await query(`INSERT INTO sharepoint_list_columns (display_name, position) VALUES (?, ?)`, [col, next++]);
    }
  }
  // A CSV sets the list's exact view order; columns not in it (e.g. from an older export)
  // keep their data but move after the current ones.
  if (replaceOrder) {
    let tail = columns.length;
    for (const [col] of known) {
      if (!columns.includes(col)) await query(`UPDATE sharepoint_list_columns SET position = ? WHERE display_name = ?`, [tail++, col]);
    }
  }
}

async function saveSnapshot(snapshot: MirrorSnapshot, source: 'GRAPH' | 'FILE', keyMode: 'ID' | 'NAME'): Promise<SyncReport> {
  const report: SyncReport = {
    source, keyMode, totalRows: snapshot.rows.length, columns: snapshot.columns.length,
    inserted: 0, updated: 0, markedRemoved: 0,
  };

  const csvOrderExists = source === 'GRAPH' && (await query(
    `SELECT 1 FROM sharepoint_sync_runs WHERE source = 'FILE' AND status = 'SUCCESS' LIMIT 1`
  )).rows.length > 0;
  await saveColumns(snapshot.columns, source === 'FILE' || !csvOrderExists);

  for (let i = 0; i < snapshot.rows.length; i++) {
    const row = snapshot.rows[i];
    const res = await query(
      `INSERT INTO sharepoint_list_items (item_key, item_values, source, row_order) VALUES (?, ?, ?, ?)
       ON CONFLICT (item_key) DO UPDATE SET
         item_values = EXCLUDED.item_values, source = EXCLUDED.source, row_order = EXCLUDED.row_order,
         last_synced_at = NOW(), removed_at = NULL
       RETURNING (xmax = 0) AS inserted`,
      [row.key, JSON.stringify(row.values), source, i]
    );
    if ((res.rows[0] as { inserted?: boolean } | undefined)?.inserted) report.inserted++;
    else report.updated++;
  }

  const keys = snapshot.rows.map((r) => r.key);
  const prefix = keyMode === 'ID' ? 'sp:%' : 'name:%';
  const removed = await query(
    `UPDATE sharepoint_list_items SET removed_at = NOW()
     WHERE removed_at IS NULL AND item_key LIKE ? AND NOT (item_key = ANY(?))`,
    [prefix, keys]
  );
  report.markedRemoved = removed.rowCount ?? 0;

  // Once rows are keyed by real SharePoint IDs, earlier name-keyed copies from an ID-less
  // CSV are the same records under a weaker key — drop them so each row appears once.
  if (keyMode === 'ID') {
    await query(`DELETE FROM sharepoint_list_items WHERE item_key LIKE 'name:%'`);
  }

  // Drop column headers that this sync no longer returns AND that hold no value on any
  // stored row — pure empty headers (e.g. the unused Title column). Columns with history
  // data are kept even if SharePoint later deletes them.
  await query(
    `DELETE FROM sharepoint_list_columns c
     WHERE NOT (c.display_name = ANY(?))
       AND NOT EXISTS (
         SELECT 1 FROM sharepoint_list_items i
         WHERE COALESCE(i.item_values->>c.display_name, '') <> ''
       )`,
    [snapshot.columns]
  );
  return report;
}

let running = false;

async function recordRun(source: 'GRAPH' | 'FILE', triggeredBy: string, work: () => Promise<SyncReport>): Promise<SyncReport> {
  if (running) throw new Error('A SharePoint sync is already running. Try again in a minute.');
  running = true;
  const run = await query(
    `INSERT INTO sharepoint_sync_runs (source, triggered_by, status) VALUES (?, ?, 'RUNNING') RETURNING id`,
    [source, triggeredBy]
  );
  const runId = (run.rows[0] as { id: string }).id;
  try {
    const report = await work();
    await query(
      `UPDATE sharepoint_sync_runs SET status = 'SUCCESS', report = ?, finished_at = NOW() WHERE id = ?`,
      [JSON.stringify(report), runId]
    );
    logger.info(`[SharePointSync] ${source} by ${triggeredBy}: ${report.totalRows} rows, ${report.inserted} new, ${report.updated} updated, ${report.markedRemoved} marked removed`);
    return report;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await query(
      `UPDATE sharepoint_sync_runs SET status = 'FAILED', error = ?, finished_at = NOW() WHERE id = ?`,
      [message, runId]
    ).catch(() => undefined);
    logger.error(`[SharePointSync] ${source} by ${triggeredBy} failed: ${message}`);
    throw err;
  } finally {
    running = false;
  }
}

export const sharepointSyncService = {
  isConfigured: isGraphConfigured,

  async syncFromGraph(triggeredBy: string): Promise<SyncReport> {
    if (!isGraphConfigured()) {
      throw new Error('SharePoint access is not configured (needs MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET plus a tenant GUID in MS_GRAPH_TENANT_ID, or SHAREPOINT_* overrides, in backend/.env).');
    }
    return recordRun('GRAPH', triggeredBy, async () => saveSnapshot(await fetchListSnapshot(), 'GRAPH', 'ID'));
  },

  async importFile(buffer: Buffer, triggeredBy: string): Promise<SyncReport> {
    return recordRun('FILE', triggeredBy, async () => {
      const snapshot = parseSpreadsheet(buffer);
      if (snapshot.rows.length === 0) throw new Error('The uploaded file has no data rows.');
      return saveSnapshot(snapshot, 'FILE', snapshot.keyMode);
    });
  },

  async getItems(opts: { search?: string; includeRemoved?: boolean; page: number; limit: number }) {
    const limit = Math.min(Math.max(opts.limit, 1), 5000);
    const offset = (Math.max(opts.page, 1) - 1) * limit;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (!opts.includeRemoved) conditions.push('removed_at IS NULL');
    if (opts.search) { conditions.push('item_values::text ILIKE ?'); params.push(`%${opts.search}%`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [cols, count, items, removedCount] = await Promise.all([
      query(`SELECT display_name FROM sharepoint_list_columns ORDER BY position ASC`),
      query(`SELECT COUNT(*) AS total FROM sharepoint_list_items ${where}`, params),
      query(
        `SELECT id, item_values, removed_at, last_synced_at FROM sharepoint_list_items ${where}
         ORDER BY (removed_at IS NOT NULL), row_order ASC, first_seen_at ASC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      query(`SELECT COUNT(*) AS n FROM sharepoint_list_items WHERE removed_at IS NOT NULL`),
    ]);
    const total = parseInt((count.rows[0] as { total: string }).total || '0');
    return {
      columns: (cols.rows as Array<{ display_name: string }>).map((c) => c.display_name),
      items: (items.rows as Array<{ id: string; item_values: Record<string, string>; removed_at: string | null; last_synced_at: string }>).map((r) => ({
        id: r.id, values: r.item_values, removedAt: r.removed_at, lastSyncedAt: r.last_synced_at,
      })),
      total,
      removedTotal: parseInt((removedCount.rows[0] as { n: string }).n || '0'),
      page: Math.max(opts.page, 1),
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async getLastRun() {
    const res = await query(
      `SELECT id, source, triggered_by, status, report, error, started_at, finished_at
       FROM sharepoint_sync_runs ORDER BY started_at DESC LIMIT 1`
    );
    const r = res.rows[0] as
      | { id: string; source: string; triggered_by: string | null; status: string; report: SyncReport; error: string | null; started_at: string; finished_at: string | null }
      | undefined;
    if (!r) return null;
    return {
      id: r.id, source: r.source, triggeredBy: r.triggered_by, status: r.status,
      report: r.report, error: r.error, startedAt: r.started_at, finishedAt: r.finished_at,
    };
  },
};
