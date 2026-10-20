// Pre-fills the case study "Project Snapshot" section from what the PM already entered on
// the project, so it is not retyped. Source → Target comes from the migration combinations
// ("Box - SharePoint"): the project form saves sourcePlatform/targetPlatform empty, so those
// are only a fallback for older projects. Data volume is the project's Project Size.

export interface SnapshotProject {
  sourcePlatform?: string | null;
  targetPlatform?: string | null;
  migrationTypes?: string | null;
  projectMemory?: string | null;
}

export function migrationLine(p: SnapshotProject): string {
  const combos = (p.migrationTypes || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/\s+-\s+/, ' → '));
  if (combos.length > 0) return combos.join(', ');
  const source = p.sourcePlatform?.trim();
  const target = p.targetPlatform?.trim();
  return source && target ? `${source} → ${target}` : '';
}

/** Null when the project has neither a migration nor a size to contribute. */
export function snapshotLines(p: SnapshotProject): string[] | null {
  const migration = migrationLine(p);
  const volume = p.projectMemory?.trim() || '';
  if (!migration && !volume) return null;
  return [
    'Industry: ',
    `Migration (Source → Target): ${migration}`,
    `Data Volume / Users: ${volume}`,
    'Outcome in one line: ',
  ];
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function snapshotHtml(p: SnapshotProject): string | null {
  const lines = snapshotLines(p);
  return lines ? lines.map((l) => `<div>${escapeHtml(l)}</div>`).join('') : null;
}

export function isBlankSection(content: string | undefined): boolean {
  return !content || content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().length === 0;
}
