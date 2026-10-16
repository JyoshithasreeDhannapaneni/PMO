'use client';

import { useContext } from 'react';
import { Target } from 'lucide-react';
import { CompanyTable } from '@/components/accountTracker/CompanyTable';
import { TrackerContext } from '@/components/accountTracker/TrackerShell';
import { ErrorNote, Spinner } from '@/components/accountTracker/ui';
import { useTrackerPriority } from '@/hooks/useProjects';
import { num } from '@/lib/accountTracker';

/** Who to reach out to next: not reached out yet (plus high-probability MSPs once estimated fields are on). */
export default function PriorityPage() {
  const ws = useContext(TrackerContext)!;
  const { data, error, isLoading } = useTrackerPriority(ws.owner);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-800">Priority outreach</h2>
        {data && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
            <Target className="h-4 w-4" /> {num(data.length)} to contact
          </span>
        )}
      </div>
      <ErrorNote error={error} />
      {isLoading && !data ? <Spinner /> : (
        <CompanyTable rows={data ?? []} columns={['company', 'reason', 'industry', 'country', 'employees', 'lastContact', 'probability']}
          emptyText="Nothing to prioritise — every account has been reached." />
      )}
    </div>
  );
}
