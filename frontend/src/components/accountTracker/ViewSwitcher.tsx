'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useTrackerOwners } from '@/hooks/useProjects';
import { cn } from '@/lib/utils';
import { errorInfo } from '@/lib/accountTracker';
import type { TrackerOwner } from '@/types/accountTracker';

const MENU_WIDTH = 340;

const byName =(a: TrackerOwner, b: TrackerOwner) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

function Person({ v, on, onPick }: { v: TrackerOwner; on: boolean; onPick: (id: string) => void }) {
  return (
    <button type="button" role="option" aria-selected={on} onClick={() => onPick(v.id)}
      className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-blue-50', on && 'bg-blue-50')}>
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700" aria-hidden="true">
        {v.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-800">{v.name}</span>
        {v.email && <span className="block truncate text-xs text-gray-400">{v.email}</span>}
      </span>
      {on ? <Check className="h-4 w-4 text-blue-600" /> : <ChevronRight className="h-4 w-4 text-gray-300" />}
    </button>
  );
}

/** Admin-only: pick whose HubSpot book to look at. People already loaded are listed first. */
export function ViewSwitcher({ view, viewName, onChange, large = false }: {
  view: string | null; viewName?: string | null; onChange: (id: string) => void; large?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false);
  const [q, setQ] = useState('');
  const owners = useTrackerOwners(true);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const items = useMemo(() => owners.data ?? [], [owners.data]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((v) => `${v.name} ${v.email ?? ''}`.toLowerCase().includes(s)) : items;
  }, [items, q]);
  const loaded = useMemo(() => shown.filter((v) => v.synced).sort(byName), [shown]);
  const others = useMemo(() => shown.filter((v) => !v.synced).sort(byName), [shown]);
  const label = items.find((v) => v.id === view)?.name ?? viewName ?? 'Choose a person';

  const pick = (id: string) => {
    setOpen(false);
    setQ('');
    onChange(id);
  };

  const list = (
    <div className={cn('flex flex-col gap-2', large ? 'w-full' : 'w-80')}>
      {items.length > 6 && (
        <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition focus-within:border-blue-500 focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]">
          <Search className="h-4 w-4 text-gray-400" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${items.length} people…`}
            className="w-full border-0 bg-transparent p-0 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:!border-transparent focus:!shadow-none focus:!ring-0"
            onKeyDown={(e) => {
              const first = loaded[0] ?? others[0];
              if (e.key === 'Enter' && first) pick(first.id);
            }} />
        </label>
      )}
      <div className={cn('overflow-y-auto', large ? 'max-h-[60vh]' : 'max-h-80')} role="listbox">
        {owners.isLoading && <div className="px-3 py-2 text-sm text-gray-400">Loading…</div>}
        {owners.error && <div className="px-3 py-2 text-sm text-red-600">{errorInfo(owners.error)?.detail ?? errorInfo(owners.error)?.message}</div>}
        {owners.data && shown.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">No one matches “{q}”.</div>}
        {loaded.length > 0 && (
          <>
            <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Loaded</div>
            {loaded.map((v) => <Person key={v.id} v={v} on={v.id === view} onPick={pick} />)}
          </>
        )}
        {others.length > 0 && (
          <>
            {loaded.length > 0 && <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Not loaded yet</div>}
            {others.map((v) => <Person key={v.id} v={v} on={v.id === view} onPick={pick} />)}
          </>
        )}
      </div>
    </div>
  );

  // The menu normally opens leftwards from the button's right edge; when the header wraps and the button sits near
  // the sidebar, that would slide it underneath, so open rightwards instead.
  const toggle = () => {
    if (!open && box.current) {
      const r = box.current.getBoundingClientRect();
      const edge = box.current.closest('main')?.getBoundingClientRect().left ?? 0;
      setAlignLeft(r.right - MENU_WIDTH < edge + 8);
    }
    setOpen((o) => !o);
  };

  if (large) return list;
  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={toggle} aria-expanded={open}
        className="inline-flex max-w-[16rem] items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-blue-50">
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className={cn('absolute z-40 mt-2 rounded-xl border border-gray-100 bg-white p-2 shadow-xl', alignLeft ? 'left-0' : 'right-0')}>
          {list}
        </div>
      )}
    </div>
  );
}
