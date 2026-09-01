export type Segment = 'ENT' | 'SMB';

export const SEGMENT_CONFIG: { label: Segment; managers: string[] }[] = [
  { label: 'ENT', managers: ['Abhishek', 'Lakshmi Prasanna', 'Pranavi'] },
  { label: 'SMB', managers: ['Ajay Singh', 'Harika', 'Neelima', 'Meghana Chowdada', 'Sriram'] },
];

// Reporting hierarchy per segment. The lead row shows the rolled-up totals of
// its own projects plus every manager beneath it.
export const SEGMENT_HIERARCHY: { label: Segment; lead: string; managers: string[] }[] = [
  { label: 'ENT', lead: 'Abhishek',   managers: ['Lakshmi Prasanna', 'Pranavi'] },
  { label: 'SMB', lead: 'Ajay Singh', managers: ['Harika', 'Neelima', 'Meghana Chowdada', 'Sriram'] },
];

// When a manager's tickets/projects are split across multiple PM names, list
// all names here (comma-separated) — the API uses exact matching for comma
// lists.
export const MANAGER_QUERY_NAMES: Record<string, string> = {
  'Sriram': 'Sriram,Sri Ram',
};

// Hardcoded engineer assignments. Shared engineers appear under both managers.
// Leads (Abhishek / Ajay Singh) manage sub-managers only — no direct engineer list.
export const ENGINEER_ASSIGNMENTS: Record<string, string[]> = {
  'Pranavi':          ['Arun', 'Manoj', 'Pallavi'],
  // Spellings here must match LMS_SCORES/AUDIO_PERCENTAGES/ticket-export assignee
  // names exactly (or at least share a full first word) — the fuzzy matcher those
  // helpers use can't bridge a mid-word letter difference like "Ranadep" vs
  // "Ranadeep", only prefix/substring variants. "Davidraj" -> "David" is the same
  // class of bug: it's not a real prefix of "David Dumpala" the way "Harshith" is
  // a prefix of "Harshith Kaduluri", so it silently matched nobody. Corrected
  // 2026-09: Habeebunisa -> Habeebunnisa, Vijendra -> Vijendar, Ranadep ->
  // Ranadeep, Vineeta -> Vineetha, Davidraj -> David — all were silently missing
  // their LMS/Audio %/ticket-based stats, not just one metric.
  'Lakshmi Prasanna': ['Chaitanya Gupta', 'Harshith', 'Lakshma Reddy', 'Ganesh Kondameedi', 'David'],
  'Meghana Chowdada': ['Amulya', 'Habeebunnisa', 'Vijendar', 'Ranadeep', 'Nithish'],
  'Harika':           ['Ravi Hemanth', 'Meena', 'Siva Kotta', 'Ambika'],
  'Sriram':           ['Dathu', 'Ramana', 'Vineetha', 'Sanjana'],
};

export const LMS_SCORES: { name: string; score: number }[] = [
  { name: 'Siva Kota',                       score: 8  },
  { name: 'Pallavi Kosuvaripalli',            score: 9  },
  { name: 'Abhishek Sakala',                  score: 10 },
  { name: 'Abhishikth Yenugula',              score: 10 },
  { name: 'Ajay Singh',                       score: 10 },
  { name: 'Amulya Anapuram',                  score: 10 },
  { name: 'Arun Kandula',                     score: 10 },
  { name: 'Chaitanya Gupta',                  score: 10 },
  { name: 'Davidraj Dumpala',                 score: 10 },
  { name: 'Ganesh Kondameedi',                score: 10 },
  { name: 'Habeebunnisa Begum',               score: 10 },
  { name: 'Harika Velidi',                    score: 10 },
  { name: 'Harshith Kaduluri',                score: 10 },
  { name: 'Krotta Neelima',                   score: 10 },
  { name: 'Lakshma Reddy Naredla',            score: 10 },
  { name: 'Lakshmi Triveni',                  score: 10 },
  { name: 'Manoj Bathula',                    score: 10 },
  { name: 'Raghu Yellani',                    score: 10 },
  { name: 'Ramana Alamuru',                   score: 10 },
  { name: 'Ranadeep Muddam',                  score: 10 },
  { name: 'Ravi Hemanth Chinthala',           score: 10 },
  { name: 'Sai Dathu Kaluvala',               score: 10 },
  { name: 'Sai kumar Kustapuram',             score: 9  },
  { name: 'Sravan Kesaram',                   score: 10 },
  { name: 'Sriram Ramakrishnan',              score: 10 },
  { name: 'Swaroop B',                        score: 10 },
  { name: 'V S Chandra Mouli Bhamidipati',    score: 10 },
  { name: 'Vijendar Burgula',                 score: 10 },
  { name: 'Vineetha Yenti',                   score: 10 },
];

export const LMS_MAX = 10;

// 5 meetings held so far (7/13, 7/21, 7/24, 7/27, 7/31).
// "Harishtha" in source is a typo for "Harshith" — corrected here.
export const MEETING_ATTENDANCE: { name: string; attended: number; total: number }[] = [
  { name: 'Ranadeep',       attended: 5, total: 5 },
  { name: 'David raj',      attended: 5, total: 5 },
  { name: 'Sri Ramkrishna', attended: 4, total: 5 },
  { name: 'Pallavi',        attended: 5, total: 5 },
  { name: 'Sai Kumar',      attended: 5, total: 5 },
  { name: 'Vijendar',       attended: 5, total: 5 },
  { name: 'Neelima',        attended: 3, total: 5 },
  { name: 'Raghu',          attended: 5, total: 5 },
  { name: 'Sravan',         attended: 4, total: 5 },
  { name: 'Swaroop',        attended: 2, total: 5 },
  { name: 'Siva Kota',      attended: 4, total: 5 },
  { name: 'Meena Lakshmi',  attended: 5, total: 5 },
  { name: 'Ravi H',         attended: 5, total: 5 },
  { name: 'Amulya',         attended: 3, total: 5 },
  { name: 'Ganesha',        attended: 4, total: 5 },
  { name: 'Lakshmi prasanna', attended: 2, total: 5 },
  { name: 'Chaitanya',      attended: 4, total: 5 },
  { name: 'Abhishek',       attended: 5, total: 5 },
  { name: 'Abhishikth',     attended: 5, total: 5 },
  { name: 'Harika',         attended: 3, total: 5 },
  { name: 'Vineetha',       attended: 4, total: 5 },
  { name: 'Chandra Mouli',  attended: 4, total: 5 },
  { name: 'Arun',           attended: 4, total: 5 },
  { name: 'Manoj',          attended: 3, total: 5 },
  { name: 'Harshith',       attended: 3, total: 5 },
  { name: 'Habeeb',         attended: 4, total: 5 },
  { name: 'Dathu',          attended: 5, total: 5 },
  { name: 'Ajay Singh',     attended: 5, total: 5 },
  { name: 'Ramana',         attended: 5, total: 5 },
];

// Avg. check-in delay in minutes per person.
// Stored with names close to canonical for easy matching.
// "Lakshmi Prasanna" entry corresponds to "Lakshmi Adabala" in the attendance system.
export const CHECKIN_DELAYS: { name: string; delayMin: number }[] = [
  { name: 'Ranadeep',         delayMin: 19.8 },
  { name: 'David Raj',        delayMin: 10.0 },
  { name: 'Sri Ramkrishna',   delayMin: 6.7  },
  { name: 'Pallavi',          delayMin: 34.9 },
  { name: 'Sai Kumar',        delayMin: 16.7 },
  { name: 'Vijendar',         delayMin: 0.5  },
  { name: 'Neelima',          delayMin: 1.2  },
  { name: 'Raghu Yellani',    delayMin: 15.0 },
  { name: 'Sravan',           delayMin: 20.0 },
  { name: 'Swaroop',          delayMin: 15.0 },
  { name: 'Siva Kota',        delayMin: 15.2 },
  { name: 'Meena Lakshmi',    delayMin: 14.9 },
  { name: 'Amulya',           delayMin: 21.5 },
  { name: 'Ganesha',          delayMin: 21.9 },
  { name: 'Lakshmi Prasanna', delayMin: 18.7 },
  { name: 'Chaitanya',        delayMin: 7.3  },
  { name: 'Abhishek',         delayMin: 15.0 },
  { name: 'Abhishikth',       delayMin: 20.0 },
  { name: 'Harika',           delayMin: 17.0 },
  { name: 'Vineetha',         delayMin: 16.9 },
  { name: 'Chandra Mouli',    delayMin: 21.7 },
  { name: 'Arun',             delayMin: 28.0 },
  { name: 'Manoj',            delayMin: 18.4 },
  { name: 'Habeeb',           delayMin: 4.7  },
  { name: 'Dathu',            delayMin: 10.4 },
  { name: 'Ajay Singh',       delayMin: 15.0 },
  { name: 'Ramana',           delayMin: 17.1 },
  { name: 'Lakshma Reddy',    delayMin: 18.5 },
  { name: 'Ravi Hemanth',    delayMin: 18.6 },
  { name: 'Harshith',        delayMin: 14.8 },
];

// Audio % per engineer — manually entered (no automated source for this yet),
// same pattern as LMS_SCORES/MEETING_ATTENDANCE/CHECKIN_DELAYS above. Add an
// entry here for each person as their real number comes in; anyone missing
// from this list just shows "—" in the Team table.
export const AUDIO_PERCENTAGES: { name: string; pct: number }[] = [
  { name: 'Dathu Kaluvala',        pct: 71  },
  { name: 'Amulya Anapuram',      pct: 83  },
  { name: 'Harika Velidi',        pct: 82  },
  { name: 'Vijendar Burgula',     pct: 99  },
  { name: 'Ramana Reddy',         pct: 60  },
  { name: 'Sanjana Nerella',      pct: 100 },
  { name: 'Tanmai Arangi',        pct: 63  },
  { name: 'Lavanya Gopasana',     pct: 100 },
  { name: 'Davidraj Dumpala',     pct: 97  },
  { name: 'Ravi Hemanth',         pct: 66  },
  { name: 'Vineetha Yenti',       pct: 87  },
  { name: 'Chaitanya Gupta',      pct: 88  },
  { name: 'Saikumar Kustapuram',  pct: 94  },
  { name: 'Ganesh Kondameedi',    pct: 98  },
  { name: 'Nitesh',               pct: 0   },
  { name: 'Lakshmi Prasanna',     pct: 88  },
  { name: 'Purushotham Kurva',    pct: 0   },
  { name: 'Chandra Mouli',        pct: 63  },
  { name: 'Sriram Ramakrishnan',  pct: 28  },
  { name: 'Nithish Bunne',        pct: 87  },
  { name: 'Neelima Krotta',       pct: 67  },
  { name: 'Abhishikth Yenugula',  pct: 97  },
  { name: 'Abhishek Sakala',      pct: 85  },
  { name: 'Habeebunnisa Begum',   pct: 83  },
  { name: 'Arun',                 pct: 91  },
  { name: 'Siva Kota',            pct: 99  },
  { name: 'Manoj Bathula',        pct: 79  },
  { name: 'Venkatesh Kudukala',   pct: 0   },
  { name: 'Swaroop',              pct: 100 },
  { name: 'Pravallika Punumalli', pct: 100 },
  { name: 'Harshith Kaduluri',    pct: 98  },
  { name: 'Ajay Singh',           pct: 88  },
  { name: 'Ambika Patil',         pct: 100 },
  { name: 'Suditya Nimmala',      pct: 100 },
  { name: 'Vainateya Rasala',     pct: 65  },
  { name: 'Meena Lakshmi',        pct: 70  },
  { name: 'Ranadeep Muddam',      pct: 88  },
  { name: 'Meghana Chowdada',     pct: 99  },
  { name: 'Pallavi Kosuvaripalli', pct: 83 },
  { name: 'Pranavi',              pct: 44  },
];

// Some data sources (manual entry, imports) store a manager's full name
// ("Raghu Yellani", "Sriram Ramakrishnan", "Abhishek sakala") while segments.ts
// uses short canonical first names ("Raghu", "Sriram", "Abhishek"). Treat
// "canonical name + anything" as the same person -- confirmed identities:
// Abhishek = Abhishek sakala, Sriram = Sriram Ramakrishnan, Raghu = Raghu Yellani.
export function managerNameMatches(rawName: string | null | undefined, canonicalName: string): boolean {
  if (!rawName) return false;
  const dn = rawName.trim().toLowerCase();
  const cn = canonicalName.trim().toLowerCase();
  return dn === cn || dn.startsWith(cn + ' ') || cn.startsWith(dn + ' ');
}

// True if rawName resolves to any manager in SEGMENT_CONFIG (either segment).
export function isNamedManager(rawName: string | null | undefined): boolean {
  if (!rawName) return false;
  return SEGMENT_CONFIG.some((s) => s.managers.some((m) => managerNameMatches(rawName, m)));
}

export function segmentOfManager(name: string | null | undefined): Segment | null {
  if (!name) return null;
  const found = SEGMENT_CONFIG.find((s) =>
    s.managers.some((m) => managerNameMatches(name, m))
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
