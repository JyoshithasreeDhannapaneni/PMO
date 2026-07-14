export interface CaseStudySection {
  id: string;
  title: string;
  description: string;
  placeholder: string;
  required: boolean;
  icon?: string;
  iconColor?: string;
  fields?: string[];
}

// The single case study template. Customer, PM/AM, platforms and dates
// auto-fill from the linked project — sections only capture what the tracker
// doesn't already know. The Issues & Resolutions blocks map 1:1 to KB articles.
export const DEFAULT_CS_SECTIONS: CaseStudySection[] = [
  {
    id: 'project_snapshot',
    title: 'Project Snapshot',
    description: 'One line per field — the quick facts of the migration',
    placeholder: 'Industry:\nMigration (Source → Target):\nData Volume / Users:\nOutcome in one line:',
    required: true,
    icon: '🔵',
    iconColor: '#3b82f6',
  },
  {
    id: 'challenge',
    title: 'Challenge',
    description: 'Why the customer migrated — 2-3 bullets',
    placeholder: '• Business pain (why migrate):\n• Technical blockers / constraints:\n• Success criteria:',
    required: true,
    icon: '⚠️',
    iconColor: '#f59e0b',
  },
  {
    id: 'solution',
    title: 'Solution & Approach',
    description: 'What CloudFuze did — 4-5 bullets max',
    placeholder: '• Approach (Big Bang / Phased / Hybrid):\n• Workloads migrated:\n• Special handling (permissions, metadata, delta):',
    required: true,
    icon: '💡',
    iconColor: '#10b981',
  },
  {
    id: 'issues_resolutions',
    title: 'Issues & Resolutions',
    description: 'One block per issue — each block is a ready-made KB article',
    placeholder: 'Issue 1:\n- Issue / error message:\n- Root cause:\n- Fix / workaround (steps):\n- How to prevent or detect early:',
    required: true,
    icon: '🛠️',
    iconColor: '#ef4444',
  },
  {
    id: 'results',
    title: 'Results & Metrics',
    description: 'Numbers only — no narrative',
    placeholder: '• Data migrated & success rate:\n• Downtime:\n• Delivered on time? (delay + reason if not):\n• CSAT score:',
    required: true,
    icon: '📊',
    iconColor: '#0ea5e9',
  },
  {
    id: 'lessons_kb',
    title: 'Lessons & KB Takeaways',
    description: 'Reusable knowledge for the next similar migration',
    placeholder: '• Do again / avoid next time:\n• Pre-migration checks for similar projects:\n• Reusable steps, settings or scripts:',
    required: true,
    icon: '📖',
    iconColor: '#14b8a6',
  },
  {
    id: 'client_testimonial',
    title: 'Client Testimonial',
    description: 'Optional quote or feedback from the client',
    placeholder: '"[Client quote]"\n\n— Client Name, Title, Company',
    required: false,
    icon: '💬',
    iconColor: '#ec4899',
  },
];

// Template management UI was removed — the template above is the single
// source of truth, so saved localStorage overrides are intentionally ignored.
export function useCaseStudyTemplate() {
  return { sections: DEFAULT_CS_SECTIONS, isLoaded: true };
}
