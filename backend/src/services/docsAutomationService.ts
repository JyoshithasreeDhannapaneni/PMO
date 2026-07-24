import pdfParse from 'pdf-parse';
import { query } from '../config/database';
import * as docsService from './docsService';
import { projectService } from './projectService';
import { logger } from '../utils/logger';

// ── Platform detection ────────────────────────────────────────────────────────

const PLATFORM_MAP: [string, string[]][] = [
  ['Google Drive',  ['google drive', 'gdrive', 'google workspace', 'mydrive', 'sharedrive', 'google mydrive', 'google shared', 'mydrives']],
  ['Gmail',         ['gmail']],
  ['Box',           ['box']],
  ['OneDrive',      ['onedrive', 'one drive']],
  ['SharePoint',    ['sharepoint', 'share point']],
  ['Dropbox',       ['dropbox']],
  ['Egnyte',        ['egnyte']],
  ['Outlook',       ['outlook', 'exchange online']],
  ['Exchange',      ['exchange']],
  ['Slack',         ['slack']],
  ['Teams',         ['microsoft teams', ' teams']],
  ['Google Chat',   ['google chat', 'gchat', 'hangouts chat']],
  ['Workplace',     ['workplace', 'meta workplace']],
  ['Zoom',          ['zoom']],
  ['WebEx',         ['webex']],
];

function detectPlatform(text: string): string {
  const lower = text.toLowerCase();
  for (const [name, keywords] of PLATFORM_MAP) {
    if (keywords.some(k => lower.includes(k))) return name;
  }
  return text.trim();
}

// ── PDF Parsing ───────────────────────────────────────────────────────────────

interface MigrationCombo {
  raw: string;
  source: string;
  target: string;
  scope: 'email' | 'content' | 'chat' | 'other';
}

interface ServerEntry {
  count: number;
  size: string;
  scope: string;
  description: string;
}

interface CPQParsed {
  company: string | null;
  migrations: MigrationCombo[];
  servers: ServerEntry[];
  sowStart: Date | null;
  sowEnd: Date | null;
  totalCost: number | null;
  notes: string[];
}

function classifyScope(platformText: string): 'email' | 'content' | 'chat' | 'other' {
  const lower = platformText.toLowerCase();
  if (['gmail', 'outlook', 'exchange', 'mail'].some(k => lower.includes(k))) return 'email';
  if (['slack', 'teams', 'google chat', 'workplace', 'zoom', 'webex'].some(k => lower.includes(k))) return 'chat';
  if (['drive', 'box', 'onedrive', 'sharepoint', 'dropbox', 'egnyte', 'mydrive', 'sharedrive'].some(k => lower.includes(k))) return 'content';
  return 'other';
}

function parseMigrationLine(raw: string): MigrationCombo | null {
  raw = raw.trim();
  if (!raw || raw.length < 4) return null;

  // "X To Y" (case-insensitive)
  const toMatch = raw.match(/^(.+?)\s+To\s+(.+)$/i);
  if (toMatch) {
    const src = toMatch[1].trim();
    const tgt = toMatch[2].trim();
    return { raw, source: detectPlatform(src), target: detectPlatform(tgt), scope: classifyScope(src + ' ' + tgt) };
  }

  // "X → Y" or "X -> Y"
  const arrowMatch = raw.match(/^(.+?)\s*(?:→|->)\s*(.+)$/);
  if (arrowMatch) {
    const src = arrowMatch[1].trim();
    const tgt = arrowMatch[2].trim();
    return { raw, source: detectPlatform(src), target: detectPlatform(tgt), scope: classifyScope(src + ' ' + tgt) };
  }

  // "X-Y" where X is a known platform (hyphen separator without spaces)
  // e.g. "Google MyDrive & ShareDrive-Google MyDrive& ShareDrive"
  // Split on first "-" that is NOT preceded/followed by a letter (word boundary)
  const hyphenMatch = raw.match(/^([^-]+?)\s*-\s*([^-].+)$/);
  if (hyphenMatch) {
    const src = hyphenMatch[1].trim();
    const tgt = hyphenMatch[2].trim();
    if (src.length > 3 && tgt.length > 3) {
      return { raw, source: detectPlatform(src), target: detectPlatform(tgt), scope: classifyScope(src + ' ' + tgt) };
    }
  }

  return null;
}

async function parseCPQPdf(fileData: string): Promise<CPQParsed> {
  const buffer = Buffer.from(fileData, 'base64');
  const parsed = await pdfParse(buffer);
  const text = parsed.text;

  // ── Company name ──────────────────────────────────────────────────────────
  // Cap at 80 chars; stop at newline, "This agreement", comma, or a closing word boundary
  const companyMatch = text.match(/Purchase Agreement for\s+([A-Za-z0-9\s&.,'\-]{1,80}?)(?:\r?\n|\r|This agreement|\s{2,}|$)/i);
  const company = companyMatch?.[1]?.trim().slice(0, 200) ?? null;

  // ── SOW dates: "Initial Service Term: 07/22/2026 till 08/22/2026" ─────────
  // PDF text extraction can introduce newlines/spaces between tokens, so use [\s\S]{0,30}
  const dateRe = /(\d{1,2}\/\d{1,2}\/\d{4})/g;
  const sowMatch = text.match(/Initial Service Term[\s\S]{0,10}(\d{1,2}\/\d{1,2}\/\d{4})[\s\S]{0,30}till[\s\S]{0,10}(\d{1,2}\/\d{1,2}\/\d{4})/i);

  function parseMDY(s: string): Date | null {
    const p = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!p) return null;
    const d = new Date(parseInt(p[3], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    return isNaN(d.getTime()) ? null : d;
  }

  let sowStart: Date | null = null;
  let sowEnd: Date | null = null;
  if (sowMatch) {
    sowStart = parseMDY(sowMatch[1]);
    sowEnd   = parseMDY(sowMatch[2]);
    logger.info(`[DocsAuto] SOW dates from PDF: ${sowMatch[1]} → ${sowMatch[2]}`);
  } else {
    // Fallback: find any two dates near "Service Term" or "SOW" in the text
    const allDates = [...text.matchAll(dateRe)].map(r => r[1]);
    if (allDates.length >= 2) {
      logger.warn(`[DocsAuto] SOW regex not matched; using first two dates found: ${allDates[0]}, ${allDates[1]}`);
    }
  }
  // Suppress unused variable warning
  void dateRe;

  // ── Migration combos ──────────────────────────────────────────────────────
  // Only match lines where BOTH sides are known platform names.
  // "Gmail To Gmail" ✓   "Up To 29 Users" ✗   "Valid for 1 Months" ✗
  const PLATFORM_KEYWORDS = [
    'gmail', 'outlook', 'exchange', 'drive', 'mydrive', 'sharedrive',
    'box', 'onedrive', 'sharepoint', 'dropbox', 'egnyte',
    'slack', 'teams', 'google chat', 'gchat', 'workplace', 'zoom', 'webex',
  ];

  function looksLikePlatform(text: string): boolean {
    const lower = text.toLowerCase();
    return PLATFORM_KEYWORDS.some(k => lower.includes(k));
  }

  const migrations: MigrationCombo[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;

  // "X To Y" — strict: both sides must contain a known platform keyword
  // Anchored to word boundaries so "Up To" doesn't match
  const toRe = /\b([A-Za-z][A-Za-z0-9&\s]{2,50}?)\s+To\s+([A-Za-z][A-Za-z0-9&\s]{2,50}?)\b(?=\s*[-\n\r$,]|$)/g;
  while ((m = toRe.exec(text)) !== null) {
    const src = m[1].trim();
    const tgt = m[2].trim();
    if (!looksLikePlatform(src) || !looksLikePlatform(tgt)) continue;
    const raw = `${src} To ${tgt}`;
    const key = raw.toLowerCase().replace(/\s+/g, ' ');
    if (!seen.has(key)) {
      seen.add(key);
      const combo = parseMigrationLine(raw);
      if (combo) migrations.push(combo);
    }
  }

  // "X-Y" hyphen-separated on its own line (PDF table cell format)
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 5 || trimmed.length > 150) continue;
    if (trimmed.includes(' To ') || trimmed.includes('→')) continue;
    if (!trimmed.includes('-')) continue;
    if (!looksLikePlatform(trimmed)) continue;
    const combo = parseMigrationLine(trimmed);
    if (combo) {
      const key = combo.raw.toLowerCase().replace(/\s+/g, ' ');
      if (!seen.has(key)) {
        seen.add(key);
        migrations.push(combo);
      }
    }
  }

  // ── Server instances: "N X Size server for {scope} migration {description}" ─
  const servers: ServerEntry[] = [];
  const serverRe = /(\d+)\s*[Xx]\s*(\w+)\s+server\s+for\s+(\w+)\s+migration\s*([^\n\r]*)/gi;
  while ((m = serverRe.exec(text)) !== null) {
    servers.push({
      count: parseInt(m[1], 10),
      size: m[2],
      scope: m[3],
      description: m[4].trim(),
    });
  }

  // ── Total cost ────────────────────────────────────────────────────────────
  // Strip per-unit rates ("$X per User", "$X per GB", "$X per server per month")
  // then sum remaining dollar amounts (main line item prices)
  const textForCosts = text.replace(/\$[\d,]+\.?\d*\s+per\s+[\w\s]+/gi, '');
  const costMatches = [...textForCosts.matchAll(/\$([\d,]+\.?\d*)/g)];
  const costs = costMatches
    .map(c => parseFloat(c[1].replace(/,/g, '')))
    .filter(n => n > 0 && n < 1_000_000);
  const totalCost = costs.length > 0 ? Math.round(costs.reduce((a, b) => a + b, 0) * 100) / 100 : null;

  // ── Notes lines ───────────────────────────────────────────────────────────
  const notes: string[] = [];
  if (migrations.length > 0) {
    notes.push('Migration scopes:');
    migrations.forEach(mg => notes.push(`  • ${mg.source} → ${mg.target} (${mg.scope})`));
  }
  if (servers.length > 0) {
    notes.push('Servers:');
    servers.forEach(s => notes.push(`  • ${s.count}× ${s.size} — ${s.scope} migration${s.description ? ` (${s.description})` : ''}`));
  }

  return { company, migrations, servers, sowStart, sowEnd, totalCost, notes };
}

// ── Duplicate check ───────────────────────────────────────────────────────────

async function isAlreadyProcessed(docId: string): Promise<string | null> {
  const res = await query('SELECT id FROM projects WHERE zenop_doc_id = $1 LIMIT 1', [docId]);
  return res.rows[0]?.id ?? null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ProcessResult {
  docId: string;
  status: 'created' | 'skipped' | 'error';
  projectId?: string;
  projectName?: string;
  existingProjectId?: string;
  error?: string;
}

export async function processDocument(docId: string, projectManagerName: string): Promise<ProcessResult> {
  try {
    const existing = await isAlreadyProcessed(docId);
    if (existing) {
      return { docId, status: 'skipped', existingProjectId: existing };
    }

    // Fetch document (includes base64 fileData)
    const doc = await docsService.getDocument(docId);

    // Parse PDF if fileData available, otherwise fall back to API structured fields
    let parsed: CPQParsed | null = null;
    if (doc.fileData) {
      try {
        parsed = await parseCPQPdf(doc.fileData);
        logger.info(`[DocsAuto] PDF parsed for doc ${docId}: company="${parsed.company}", migrations=${parsed.migrations.length}, sowStart=${parsed.sowStart}, sowEnd=${parsed.sowEnd}`);
      } catch (pdfErr: any) {
        logger.warn(`[DocsAuto] PDF parse failed for ${docId}, falling back to API fields: ${pdfErr.message}`);
      }
    }

    const trunc = (s: string | null | undefined, max = 240) => s?.trim().slice(0, max) || null;

    // Resolve company name (PDF first, then API fields)
    const company = trunc(parsed?.company || doc.company);
    const clientContact = trunc(doc.clientName);

    // Resolve dates — PDF SOW dates are the source of truth.
    // API structured dates (projectStartDate, quoteExpiryDate) are unreliable; only use as
    // a last resort when PDF parsing produced no dates at all.
    const fallbackStart = new Date();
    const fallbackEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const plannedStart = parsed?.sowStart ?? fallbackStart;
    const plannedEnd   = parsed?.sowEnd   ?? fallbackEnd;

    // Resolve cost (PDF total first, then API field)
    const estimatedCost = parsed?.totalCost ?? doc.metadata?.totalCost ?? null;

    // Resolve source/target platforms from PDF migrations
    const primaryMigration = parsed?.migrations[0] ?? null;
    const sourcePlatform = primaryMigration?.source ?? null;
    const targetPlatform = primaryMigration?.target ?? null;

    // Build migration types string (comma-separated scope labels)
    const migrationTypes = parsed && parsed.migrations.length > 0
      ? [...new Set(parsed.migrations.map(mg => mg.scope.toUpperCase()))].join(',')
      : (doc.metadata?.migrationType ?? null);

    // Build project name — keep unique scopes only, cap at 240 chars (VARCHAR 255 limit)
    const uniqueMigrations = parsed ? [...new Map(parsed.migrations.map(mg => [`${mg.source}→${mg.target}`, mg])).values()] : [];
    const scopeSummary = uniqueMigrations.length > 0
      ? uniqueMigrations.slice(0, 3).map(mg => `${mg.source} → ${mg.target}`).join(' | ')
      : null;
    const rawName = company
      ? `${company}${scopeSummary ? ` — ${scopeSummary}` : ' Migration'}`
      : doc.fileName?.replace(/\.[^/.]+$/, '') ?? `CPQ Doc ${docId.slice(0, 8)}`;
    const projectName = rawName.length > 240 ? rawName.slice(0, 237) + '...' : rawName;

    // Build notes
    const notesLines = [
      `Imported from CPQ document (${docId})`,
      ...(parsed?.notes ?? []),
      doc.templateName ? `Template: ${doc.templateName}` : null,
      doc.quoteId ? `Quote ID: ${doc.quoteId}` : null,
    ].filter(Boolean) as string[];

    const createPayload = {
      name: trunc(projectName) ?? 'CPQ Import',
      customerName: trunc(clientContact ?? company) ?? 'CPQ Import',
      projectManager: trunc(projectManagerName) ?? 'Unassigned',
      accountManager: 'Unassigned',
      clientName: trunc(company),
    };
    logger.info(`[DocsAuto] v2 create payload lengths — name:${createPayload.name.length} customer:${createPayload.customerName.length} pm:${createPayload.projectManager.length} client:${(createPayload.clientName ?? '').length}`);

    const project = await projectService.create({
      ...createPayload,
      sourcePlatform: trunc(sourcePlatform, 490),
      targetPlatform: trunc(targetPlatform, 490),
      migrationTypes: trunc(migrationTypes, 490),
      estimatedCost,
      plannedStart,
      plannedEnd,
      status: 'ACTIVE',
      phase: 'KICKOFF',
      notes: notesLines.join('\n'),
      zenopDocId: docId,
    });

    logger.info(`[DocsAuto] PM "${projectManagerName}" created project "${project.name}" (${project.id}) from CPQ doc ${docId}`);
    return { docId, status: 'created', projectId: project.id, projectName: project.name };

  } catch (err: any) {
    logger.error(`[DocsAuto] processDocument(${docId}) failed: ${err.message}`);
    return { docId, status: 'error', error: err.message };
  }
}
