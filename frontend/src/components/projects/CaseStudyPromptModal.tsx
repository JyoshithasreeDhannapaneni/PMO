'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { CASE_STUDY_DUE_EVENT, CaseStudyDueDetail } from '@/services/api';

// Asks for the case study the moment a project is moved to COMPLETED (no email is sent).
// "Later" leaves the project on the Case Studies page's "Awaiting case study" list.
export function CaseStudyPromptModal() {
  const [detail, setDetail] = useState<CaseStudyDueDetail | null>(null);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    const onDue = (e: Event) => setDetail((e as CustomEvent<CaseStudyDueDetail>).detail);
    window.addEventListener(CASE_STUDY_DUE_EVENT, onDue);
    return () => window.removeEventListener(CASE_STUDY_DUE_EVENT, onDue);
  }, []);

  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetail(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail]);

  // Viewers cannot create case studies (the New page sends them back).
  if (!detail || user?.role === 'VIEWER') return null;

  const close = () => setDetail(null);
  const create = () => {
    const id = detail.projectId;
    setDetail(null);
    router.push(`/case-studies/new?projectId=${encodeURIComponent(id)}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-study-prompt-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="case-study-prompt-title" className="text-lg font-semibold text-slate-800">Project completed: add its case study</h2>
        <p className="mt-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">{detail.projectName}</span>
          {detail.customerName ? <> for <span className="font-medium text-slate-800">{detail.customerName}</span></> : null}
          {' '}is now completed and archived. Please write its case study while the details are fresh.
          You can generate a first draft from the project details and edit it.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Choosing Later keeps it on the Case Studies page under &ldquo;Awaiting case study&rdquo;. Completed projects without a case study lower PMO hygiene after 30 days.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>Later</Button>
          <Button type="button" onClick={create}>Create case study now</Button>
        </div>
      </div>
    </div>
  );
}
