'use client';

import { ReactNode, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EMPTY_FILTERS } from '@/lib/accountTracker';
import type { CompanyFilters, FilterOptions } from '@/types/accountTracker';
import { SidePanel, btn } from './ui';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-sm text-gray-700">
      <span>{label}</span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-5 w-9 rounded-full bg-gray-200 transition peer-checked:bg-blue-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4" />
    </label>
  );
}

function RangeSlider({ max, value, onChange }: { max: number; value: [number, number] | null; onChange: (v: [number, number] | null) => void }) {
  const [lo, hi] = value ?? [0, max];
  const step = max > 10000 ? 50 : max > 1000 ? 10 : 1;
  const set = (a: number, b: number) => onChange(a <= 0 && b >= max ? null : [a, b]);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Minimum
          <input type="range" min={0} max={max} step={step} value={lo} aria-label="Minimum employees"
            onChange={(e) => set(Math.min(Number(e.target.value), hi), hi)} className="accent-blue-600" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Maximum
          <input type="range" min={0} max={max} step={step} value={hi} aria-label="Maximum employees"
            onChange={(e) => set(lo, Math.max(Number(e.target.value), lo))} className="accent-blue-600" />
        </label>
      </div>
      <div className="flex justify-between text-xs font-medium text-gray-600">
        <span>{lo.toLocaleString()}</span>
        <span>{hi.toLocaleString()}</span>
      </div>
    </div>
  );
}

function MultiSelect({ options, selected, onChange, placeholder }: {
  options: string[]; selected: string[]; onChange: (v: string[]) => void; placeholder: string;
}) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.toLowerCase().includes(s)) : options;
  }, [options, q]);
  const toggle = (o: string) => onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5 transition focus-within:border-blue-500 focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]">
        <Search className="h-3.5 w-3.5 text-gray-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="w-full border-0 bg-transparent p-0 text-sm focus:outline-none focus:!border-transparent focus:!shadow-none focus:!ring-0" />
      </label>
      <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-gray-100 p-1">
        {shown.length === 0 && <div className="px-2 py-1.5 text-xs text-gray-400">No matches</div>}
        {shown.map((o) => (
          <label key={o} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm text-gray-700 hover:bg-gray-50">
            <input type="checkbox" className="accent-blue-600" checked={selected.includes(o)} onChange={() => toggle(o)} />
            <span>{o}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Filters open in a side panel and only apply on "Apply" (which closes the panel) — the list stays uncluttered. */
export function FilterPanel({ filters, options, onApply, onClose }: {
  filters: CompanyFilters; options: FilterOptions | undefined;
  onApply: (f: CompanyFilters) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<CompanyFilters>(filters);
  const set = (patch: Partial<CompanyFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const maxEmp = options?.maxEmployees ?? 0;

  return (
    <SidePanel open title="Filters" onClose={onClose}
      footer={(
        <>
          <button type="button" className={btn.ghost} onClick={() => setDraft({ ...EMPTY_FILTERS, search: draft.search })}>Reset</button>
          <button type="button" className={btn.primary} onClick={() => onApply(draft)}>Apply filters</button>
        </>
      )}>
      <Group title="Company size">
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-gray-100 p-1">
          {['All', 'Small', 'Mid', 'Enterprise'].map((t) => (
            <button key={t} type="button" onClick={() => set({ tier: t })}
              className={cn('rounded-lg px-2 py-1.5 text-xs font-medium transition', draft.tier === t ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              {t}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Deals & type">
        <Toggle label="Has open deals" checked={draft.openDeals} onChange={(v) => set({ openDeals: v })} />
        <Toggle label="MSPs only (AI classification)" checked={draft.msp} onChange={(v) => set({ msp: v })} />
      </Group>

      <Group title="Employees">
        {maxEmp > 0 ? <RangeSlider max={maxEmp} value={draft.empRange} onChange={(v) => set({ empRange: v })} />
          : <div className="text-xs text-gray-400">No employee counts on file</div>}
      </Group>

      <Group title="Connect probability">
        <div className="flex flex-wrap gap-2">
          {['High', 'Medium', 'Low'].map((p) => {
            const on = draft.probabilities.includes(p);
            return (
              <button key={p} type="button"
                className={cn('rounded-full border px-3 py-1 text-xs font-medium transition', on ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}
                onClick={() => set({ probabilities: on ? draft.probabilities.filter((x) => x !== p) : [...draft.probabilities, p] })}>
                {p}
              </button>
            );
          })}
        </div>
      </Group>

      <Group title={`Country${draft.countries.length ? ` · ${draft.countries.length}` : ''}`}>
        <MultiSelect options={options?.countries ?? []} selected={draft.countries} onChange={(v) => set({ countries: v })} placeholder="Search countries…" />
      </Group>

      <Group title={`Industry group${draft.industryGroups.length ? ` · ${draft.industryGroups.length}` : ''}`}>
        <MultiSelect options={options?.industryGroups ?? []} selected={draft.industryGroups} onChange={(v) => set({ industryGroups: v })} placeholder="Search industry groups…" />
      </Group>
    </SidePanel>
  );
}
