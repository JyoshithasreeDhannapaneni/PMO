// Mirrors ENGINEER_ASSIGNMENTS / SEGMENT_HIERARCHY from frontend/src/lib/segments.ts.
// The backend can't import frontend TS files, so this is intentionally duplicated --
// keep the two in sync if the team roster changes (segments.ts is the source of truth
// the manager-dashboard UI displays).
const ENGINEER_ASSIGNMENTS: Record<string, string[]> = {
  'Pranavi':          ['Arun', 'Manoj', 'Pallavi'],
  'Lakshmi Prasanna': ['Chaitanya Gupta', 'Harshith', 'Lakshma Reddy', 'Ganesh Kondameedi', 'Davidraj'],
  'Abhishikth':       ['Amulya', 'Ranadeep', 'Habeebunnisa', 'Neelima', 'Vijendar'],
  'Harika':           ['Meena Lakshmi Triveni', 'Ravi Hemanth', 'Siva Kota'],
  'Raghu':            ['Vineetha', 'Ramana Reddy'],
  'Sravan':           ['Swaroop', 'Dathu', 'Saikumar'],
};

const SEGMENT_HIERARCHY: { lead: string; managers: string[] }[] = [
  { lead: 'Abhishek',   managers: ['Lakshmi Prasanna', 'Pranavi'] },
  { lead: 'Ajay Singh', managers: ['Harika', 'Sravan', 'Raghu', 'Abhishikth', 'Sriram', 'Chandra Mouli', 'Meghana Chowdada'] },
];

const TOP_LEVEL_LEADS = ['Abhishek', 'Ajay Singh'];

// Mirrors SEGMENT_CONFIG from frontend/src/lib/segments.ts -- used to classify a
// project_manager string as ENT/SMB when the project's own `segment` column is unset
// (true for any project created before that field existed).
const SEGMENT_CONFIG: { label: 'ENT' | 'SMB'; managers: string[] }[] = [
  { label: 'ENT', managers: ['Abhishek', 'Lakshmi Prasanna', 'Pranavi'] },
  { label: 'SMB', managers: ['Ajay Singh', 'Harika', 'Neelima', 'Meghana Chowdada', 'Sriram'] },
];

export function segmentOfManager(rawName: string | null | undefined): 'ENT' | 'SMB' | null {
  if (!rawName) return null;
  const found = SEGMENT_CONFIG.find((s) => s.managers.some((m) => nameMatches(rawName, m)));
  return found ? found.label : null;
}

// Same "canonical name + anything" tolerance as frontend/src/lib/segments.ts's
// managerNameMatches — real records store full names ("Raghu Yellani", "Abhishek sakala").
export function nameMatches(rawName: string | null | undefined, canonicalName: string): boolean {
  if (!rawName) return false;
  const dn = rawName.trim().toLowerCase();
  const cn = canonicalName.trim().toLowerCase();
  return dn === cn || dn.startsWith(cn + ' ') || cn.startsWith(dn + ' ');
}

// Returns the canonical name of whoever should be escalated to for displayName's SLA
// breach: their segment lead if displayName is itself a segment manager, or their
// manager if displayName is a listed engineer. Returns null if displayName is a
// top-level lead (no one above them in this roster) or isn't found at all.
export function resolveManagerCanonicalName(displayName: string): string | null {
  if (TOP_LEVEL_LEADS.some((lead) => nameMatches(displayName, lead))) return null;

  for (const { lead, managers } of SEGMENT_HIERARCHY) {
    if (managers.some((m) => nameMatches(displayName, m))) return lead;
  }
  for (const [manager, engineers] of Object.entries(ENGINEER_ASSIGNMENTS)) {
    if (engineers.some((e) => nameMatches(displayName, e))) return manager;
  }
  return null;
}
