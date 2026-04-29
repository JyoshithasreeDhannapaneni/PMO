'use client';

import { useState, useEffect, useCallback } from 'react';

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

// Default sections — used when no custom template has been saved
export const DEFAULT_CS_SECTIONS: CaseStudySection[] = [
  {
    id: 'executive_summary',
    title: 'Executive Summary',
    description: 'Brief overview of the project and its outcomes',
    placeholder: 'Provide a 2-3 paragraph summary of the project including the key objectives, approach and outcomes. Highlight the value delivered to the client.',
    required: true,
    icon: '📄',
    iconColor: '#3b82f6',
  },
  {
    id: 'client_background',
    title: 'Client Background',
    description: 'Information about the client and their business',
    placeholder: "Describe the client's business, industry, size, and the context behind their need for this project.",
    required: true,
    icon: '👤',
    iconColor: '#8b5cf6',
  },
  {
    id: 'challenge',
    title: 'Challenge',
    description: 'The problems or challenges the client faced',
    placeholder: 'Describe the specific challenges or pain points the client was experiencing before this project.',
    required: true,
    icon: '⚠️',
    iconColor: '#f59e0b',
  },
  {
    id: 'solution',
    title: 'Solution',
    description: 'The solution provided and how it addressed the challenges',
    placeholder: "Explain the solution that was implemented, why it was chosen, and how it addressed the client's challenges.",
    required: true,
    icon: '💡',
    iconColor: '#10b981',
  },
  {
    id: 'implementation_process',
    title: 'Implementation Process',
    description: 'Steps and approach followed during implementation',
    placeholder: 'Describe the step-by-step process used to implement the solution, including key phases and milestones.',
    required: false,
    icon: '⚙️',
    iconColor: '#6366f1',
  },
  {
    id: 'results_benefits',
    title: 'Results & Benefits',
    description: 'Key results achieved and benefits delivered to the client',
    placeholder: 'Quantify the results achieved and describe the tangible benefits delivered to the client.',
    required: true,
    icon: '📊',
    iconColor: '#0ea5e9',
  },
  {
    id: 'lessons_learned',
    title: 'Lessons Learned',
    description: 'Key learnings from the project',
    placeholder: 'Share insights, lessons learned, and best practices discovered during this project.',
    required: false,
    icon: '📖',
    iconColor: '#14b8a6',
  },
  {
    id: 'client_testimonial',
    title: 'Client Testimonial',
    description: 'Quote or feedback from the client',
    placeholder: '"[Insert client testimonial or feedback quote here]"\n\n— Client Name, Title, Company',
    required: false,
    icon: '💬',
    iconColor: '#ec4899',
  },
];

const STORAGE_KEY = 'pmoSettings';

/**
 * Loads the case study template sections from localStorage (saved by the
 * Template Management admin page). Falls back to DEFAULT_CS_SECTIONS.
 *
 * Returns the current sections and a `reload` callback so callers can
 * re-read localStorage after a save (e.g. after the admin updates the template
 * in the same browser tab via a BroadcastChannel or storage event).
 */
export function useCaseStudyTemplate() {
  const [sections, setSections] = useState<CaseStudySection[]>(DEFAULT_CS_SECTIONS);
  const [isLoaded, setIsLoaded] = useState(false);

  const load = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { setSections(DEFAULT_CS_SECTIONS); return; }
      const parsed = JSON.parse(raw);

      // templateSections is saved by the new template management page
      if (Array.isArray(parsed.templateSections) && parsed.templateSections.length > 0) {
        // Map from TemplateSection (template page) → CaseStudySection (editor)
        const mapped: CaseStudySection[] = parsed.templateSections.map((s: any) => ({
          id: s.id,
          title: s.title,
          description: s.description || '',
          placeholder: Array.isArray(s.fields) ? s.fields.join('\n') : (s.placeholder || ''),
          required: s.required ?? true,
          icon: s.icon || '📄',
          iconColor: s.iconColor || '#6366f1',
          fields: s.fields,
        }));
        setSections(mapped);
        return;
      }

      // Legacy: template.sections saved by old editor
      if (Array.isArray(parsed.template?.sections) && parsed.template.sections.length > 0) {
        setSections(parsed.template.sections);
        return;
      }
    } catch {}
    setSections(DEFAULT_CS_SECTIONS);
  }, []);

  useEffect(() => {
    load();
    setIsLoaded(true);

    // Re-sync if another tab saves the template
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) load();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [load]);

  return { sections, isLoaded, reload: load };
}
