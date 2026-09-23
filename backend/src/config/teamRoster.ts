// Mirrors ENGINEER_ASSIGNMENTS / SEGMENT_HIERARCHY from frontend/src/lib/segments.ts.
// The backend can't import frontend TS files, so this is intentionally duplicated --
// keep the two in sync if the team roster changes (segments.ts is the source of truth
// the manager-dashboard UI displays).
// 2026-09-23: rebuilt to actually match frontend/src/lib/segments.ts -- this had drifted
// (Raghu, Sravan, and Abhishikth existed here as managers with no equivalent in segments.ts
// at all, misrouting SLA escalations for anyone under them). Raghu, Sravan, Sai Kumar, and
// Pallavi are dropped entirely (product decision); Abhishikth's former reports now sit
// under Meghana Chowdada, same as segments.ts.
const ENGINEER_ASSIGNMENTS: Record<string, string[]> = {
  'Pranavi':          ['Arun', 'Manoj', 'Vainateya', 'Tanmai', 'Chandra Mouli', 'Swaroop'],
  'Lakshmi Prasanna': ['Chaitanya Gupta', 'Harshith', 'Lakshma Reddy', 'Ganesh Kondameedi', 'Davidraj'],
  'Meghana Chowdada': ['Amulya', 'Ranadeep', 'Habeebunnisa', 'Neelima', 'Vijendar'],
  'Harika':           ['Meena Lakshmi Triveni', 'Ravi Hemanth', 'Siva Kota', 'Ambika'],
  'Sriram':           ['Dathu', 'Ramana Reddy', 'Vineetha', 'Sanjana'],
  'Ajay Singh':       ['Nithish'],
};

const SEGMENT_HIERARCHY: { lead: string; managers: string[] }[] = [
  { lead: 'Abhishek',   managers: ['Lakshmi Prasanna', 'Pranavi'] },
  { lead: 'Ajay Singh', managers: ['Harika', 'Meghana Chowdada', 'Sriram'] },
];

const TOP_LEVEL_LEADS = ['Abhishek', 'Ajay Singh'];

// Mirrors SEGMENT_CONFIG from frontend/src/lib/segments.ts -- used to classify a
// project_manager string as ENT/SMB when the project's own `segment` column is unset
// (true for any project created before that field existed).
const SEGMENT_CONFIG: { label: 'ENT' | 'SMB'; managers: string[] }[] = [
  { label: 'ENT', managers: ['Abhishek', 'Lakshmi Prasanna', 'Pranavi'] },
  { label: 'SMB', managers: ['Ajay Singh', 'Harika', 'Meghana Chowdada', 'Sriram'] },
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
