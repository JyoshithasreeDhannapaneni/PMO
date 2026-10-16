'use client';

import { Suspense } from 'react';
import { TrackerShell } from '@/components/accountTracker/TrackerShell';
import { Spinner } from '@/components/accountTracker/ui';

export default function AccountTrackerLayout({ children }: { children: React.ReactNode }) {
  return (
    <TrackerShell>
      <Suspense fallback={<Spinner />}>{children}</Suspense>
    </TrackerShell>
  );
}
