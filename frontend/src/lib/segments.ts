export type Segment = 'ENT' | 'SMB';

export const SEGMENT_CONFIG: { label: Segment; managers: string[] }[] = [
  { label: 'ENT', managers: ['Abhishek', 'Lakshmi Prasanna', 'Pranavi'] },
  { label: 'SMB', managers: ['Ajay Singh', 'Abhishikth', 'Harika', 'Sravan', 'Raghu'] },
];

// Reporting hierarchy per segment. The lead row shows the rolled-up totals of
// its own projects plus every manager beneath it.
export const SEGMENT_HIERARCHY: { label: Segment; lead: string; managers: string[] }[] = [
  { label: 'ENT', lead: 'Abhishek',   managers: ['Lakshmi Prasanna', 'Pranavi'] },
  { label: 'SMB', lead: 'Ajay Singh', managers: ['Harika', 'Sravan', 'Raghu', 'Abhishikth'] },
];

// When a manager's tickets are split across multiple PM names in NTA, list all
// names here (comma-separated). The API uses exact matching for comma lists.
export const MANAGER_QUERY_NAMES: Record<string, string> = {
  'Abhishek': 'Abhishek,Chandra Mouli',
  'Raghu':    'Raghu,Sri Ram',
};

// Hardcoded engineer assignments. Shared engineers appear under both managers.
export const ENGINEER_ASSIGNMENTS: Record<string, string[]> = {
  'Abhishek':         ['Arun', 'Chandramouli', 'Manoj', 'Pallavi'],
  'Pranavi':          ['Arun', 'Chandramouli', 'Manoj', 'Pallavi'],
  'Lakshmi Prasanna': ['Chaitanya Gupta', 'Harshith', 'Lakshma Reddy', 'Ganesh Kondameedi', 'Davidraj'],
  'Ajay Singh':       ['Amulya', 'Ranadeep', 'Habeebunnisa', 'Neelima', 'Vijendar'],
  'Abhishikth':       ['Amulya', 'Ranadeep', 'Habeebunnisa', 'Neelima', 'Vijendar'],
  'Harika':           ['Meena Lakshmi Triveni', 'Ravi Hemanth', 'Siva Kota'],
  'Raghu':            ['Sriram', 'Vineetha', 'Ramana Reddy'],
  'Sravan':           ['Swaroop', 'Dathu', 'Saikumar'],
};

export function segmentOfManager(name: string | null | undefined): Segment | null {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  const found = SEGMENT_CONFIG.find((s) =>
    s.managers.some((m) => m.toLowerCase() === normalized)
  );
  return found ? found.label : null;
}

// Prefer the project's own `segment` field (set directly, e.g. via the project
// form) — fall back to guessing from the PM name only for legacy projects
// that predate the field and were never tagged.
export function projectSegment(project: { segment?: string | null; projectManager?: string | null }): Segment | null {
  if (project.segment === 'ENT' || project.segment === 'SMB') return project.segment;
  return segmentOfManager(project.projectManager);
}
