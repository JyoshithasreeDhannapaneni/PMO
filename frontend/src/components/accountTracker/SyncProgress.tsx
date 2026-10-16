'use client';

import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { key: 'Reading companies', label: 'Companies' },
  { key: 'Reading contacts', label: 'Contacts' },
  { key: 'Counting', label: 'Calls, emails, meetings & notes' },
  { key: 'Reading deals', label: 'Deals' },
  { key: 'Saving', label: 'Saving' },
];

/** Step list (first load) or a slim banner (later syncs), driven by the backend's progress text. */
export function SyncProgress({ progress, compact = false }: { progress: string | null; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-700" role="status">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Syncing from HubSpot — {progress ?? 'starting'}…</span>
      </div>
    );
  }
  const current = Math.max(0, STEPS.findIndex((s) => progress?.startsWith(s.key)));
  return (
    <ol className="mx-auto flex w-full max-w-sm flex-col gap-2 text-left" role="status">
      {STEPS.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'now' : 'todo';
        return (
          <li key={s.key} className="flex items-start gap-3">
            <span className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold',
              state === 'done' ? 'bg-green-100 text-green-700' : state === 'now' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400')}>
              {state === 'done' ? <Check className="h-3.5 w-3.5" /> : state === 'now' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : i + 1}
            </span>
            <span className={cn('flex flex-col text-sm', state === 'todo' ? 'text-gray-400' : 'text-gray-700')}>
              {s.label}
              {state === 'now' && progress && <span className="text-xs text-gray-400">{progress}…</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
