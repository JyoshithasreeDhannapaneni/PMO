export type Segment = 'ENT' | 'SMB';

export const SEGMENT_CONFIG: { label: Segment; managers: string[] }[] = [
  { label: 'ENT', managers: ['Abhishek Sakala', 'Lakshmi Prasanna'] },
  { label: 'SMB', managers: ['Ajay Singh', 'Abhishikth', 'Harika', 'Sravan', 'Raghu Yellani'] },
];

export function segmentOfManager(name: string | null | undefined): Segment | null {
  if (!name) return null;
  const found = SEGMENT_CONFIG.find((s) => s.managers.includes(name));
  return found ? found.label : null;
}

// Prefer the project's own `segment` field (set directly, e.g. via the project
// form) — fall back to guessing from the PM name only for legacy projects
// that predate the field and were never tagged.
export function projectSegment(project: { segment?: string | null; projectManager?: string | null }): Segment | null {
  if (project.segment === 'ENT' || project.segment === 'SMB') return project.segment;
  return segmentOfManager(project.projectManager);
}
