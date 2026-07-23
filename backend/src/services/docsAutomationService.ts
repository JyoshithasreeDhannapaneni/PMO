import { query } from '../config/database';
import * as docsService from './docsService';
import { projectService } from './projectService';
import { logger } from '../utils/logger';

// ── Platform detection ────────────────────────────────────────────────────────

const PLATFORM_MAP: [string, string[]][] = [
  ['Box',           ['box']],
  ['OneDrive',      ['onedrive', 'one drive']],
  ['SharePoint',    ['sharepoint', 'share point']],
  ['Google Drive',  ['google drive', 'gdrive', 'google workspace']],
  ['Dropbox',       ['dropbox']],
  ['Egnyte',        ['egnyte']],
  ['Gmail',         ['gmail']],
  ['Outlook',       ['outlook', 'exchange online']],
  ['Exchange',      ['exchange']],
  ['Slack',         ['slack']],
  ['Teams',         ['microsoft teams', ' teams']],
  ['Google Chat',   ['google chat', 'gchat', 'hangouts chat']],
  ['Workplace',     ['workplace', 'meta workplace']],
  ['Zoom',          ['zoom']],
  ['WebEx',         ['webex']],
];

function detectPlatform(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [name, keywords] of PLATFORM_MAP) {
    if (keywords.some(k => lower.includes(k))) return name;
  }
  return null;
}

function parsePlatforms(migrationType: string | null | undefined): { source: string | null; target: string | null } {
  if (!migrationType) return { source: null, target: null };
  const m = migrationType.match(/^(.+?)\s*(?:to|→|->|>)\s*(.+)$/i);
  if (m) {
    return {
      source: detectPlatform(m[1]) ?? m[1].trim(),
      target: detectPlatform(m[2]) ?? m[2].trim(),
    };
  }
  return { source: detectPlatform(migrationType) ?? migrationType, target: null };
}

// ── Duplicate check ───────────────────────────────────────────────────────────

async function isAlreadyProcessed(docId: string): Promise<string | null> {
  const res = await query('SELECT id, name FROM projects WHERE zenop_doc_id = $1 LIMIT 1', [docId]);
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

    const doc = await docsService.getDocument(docId);

    const migrationType = doc.metadata?.migrationType ?? null;
    const { source, target } = parsePlatforms(migrationType);

    const company = doc.company?.trim() || null;
    const clientContact = doc.clientName?.trim() || null;
    const totalCost = doc.metadata?.totalCost ?? null;
    const numUsers = doc.metadata?.numberOfUsers ?? null;
    const sowStart = doc.dates?.projectStartDate ?? null;
    const sowEnd = doc.dates?.quoteExpiryDate ?? doc.dates?.effectiveDate ?? null;

    const projectName = company
      ? `${company}${migrationType ? ` — ${migrationType}` : ''}`
      : doc.fileName?.replace(/\.[^/.]+$/, '') ?? `Zenop Doc ${docId.slice(0, 8)}`;

    const fallbackStart = new Date();
    const fallbackEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    const notesLines = [
      `Imported from Zenop CPQ document (${docId})`,
      numUsers ? `Users: ${numUsers}` : null,
      doc.templateName ? `Template: ${doc.templateName}` : null,
      doc.quoteId ? `Quote ID: ${doc.quoteId}` : null,
    ].filter(Boolean).join('\n');

    const project = await projectService.create({
      name: projectName,
      customerName: clientContact ?? company ?? 'Zenop Import',
      projectManager: projectManagerName,
      accountManager: 'Unassigned',
      clientName: company,
      sourcePlatform: source,
      targetPlatform: target,
      migrationTypes: migrationType,
      estimatedCost: totalCost,
      plannedStart: sowStart ? new Date(sowStart) : fallbackStart,
      plannedEnd: sowEnd ? new Date(sowEnd) : fallbackEnd,
      status: 'ACTIVE',
      phase: 'KICKOFF',
      notes: notesLines,
      zenopDocId: docId,
    });

    logger.info(`[DocsAuto] PM "${projectManagerName}" created project "${project.name}" (${project.id}) from zenop doc ${docId}`);
    return { docId, status: 'created', projectId: project.id, projectName: project.name };

  } catch (err: any) {
    logger.error(`[DocsAuto] processDocument(${docId}) failed: ${err.message}`);
    return { docId, status: 'error', error: err.message };
  }
}
