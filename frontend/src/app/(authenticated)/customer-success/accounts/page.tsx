'use client';

import { useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { CompanyTable } from '@/components/accountTracker/CompanyTable';
import { FilterPanel } from '@/components/accountTracker/FilterPanel';
import { TrackerContext } from '@/components/accountTracker/TrackerShell';
import { ErrorNote, Spinner, btn } from '@/components/accountTracker/ui';
import { useTrackerCompanies, useTrackerFilterOptions, useTrackerMetrics, useTrackerStat } from '@/hooks/useProjects';
import { cn } from '@/lib/utils';
import {
  EMPTY_FILTERS, METRICS, STAT_COLUMNS, STAT_TITLES, TRACKER_BASE, activeChips, apiParams, filtersFromParams, num, paramsFromFilters,
} from '@/lib/accountTracker';
import type { CompanyFilters } from '@/types/accountTracker';

const KPI_TINT = ['bg-blue-50 text-blue-600', 'bg-violet-50 text-violet-600', 'bg-red-50 text-red-600', 'bg-amber-50 text-amber-600', 'bg-green-50 text-green-600'];

/** Companies — KPIs, search, filters (side panel) and the company list. Everything lives in the URL. */
export default function CompaniesPage() {
  const ws = useContext(TrackerContext)!;
  const router = useRouter();
  const pathname = usePathname() ?? TRACKER_BASE;
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams?.toString() ?? '');
  const stat = params.get('stat');
  const filters = filtersFromParams(params);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState(filters.search);

  const metrics = useTrackerMetrics(ws.owner);
  const options = useTrackerFilterOptions(ws.owner);
  const statList = useTrackerStat(ws.owner, stat);
  const companies = useTrackerCompanies(ws.owner, apiParams(filters), !stat);
  const list = stat ? statList : companies;
  const rows = (stat ? statList.data?.rows : companies.data) ?? [];

  const go = (p: URLSearchParams, replace = false) => {
    const url = `${pathname}${p.toString() ? `?${p}` : ''}`;
    if (replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  };

  // the search box writes to the URL after a short pause
  useEffect(() => {
    if (search === filters.search) return undefined;
    const t = setTimeout(() => go(paramsFromFilters({ ...filters, search }, params), true), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const apply = (f: CompanyFilters) => {
    go(paramsFromFilters(f, params));
    setFiltersOpen(false);
  };
  const chips = stat ? [] : activeChips(filters);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {METRICS.map((m, i) => {
          const v = metrics.data?.[m.field];
          const pending = m.key === 'msps' ? metrics.data?.mspPending ?? 0 : 0;
          const hint = pending > 0 ? `${num(pending)} still being analysed` : m.hint;
          const active = m.key === 'total' ? !stat : stat === m.key;
          return (
            <Link key={m.key} href={m.key === 'total' ? TRACKER_BASE : `${TRACKER_BASE}?stat=${m.key}`}
              className={cn('flex flex-col gap-1 rounded-xl border p-4 transition hover:brightness-95', KPI_TINT[i].split(' ')[0],
                active ? 'border-blue-300 ring-2 ring-blue-200' : 'border-white')}>
              <span className="text-xs text-gray-500">{m.label}</span>
              <span className={cn('text-2xl font-bold', m.alert && (v ?? 0) > 0 ? 'text-red-600' : KPI_TINT[i].split(' ')[1])}>
                {metrics.isLoading && !metrics.data ? '…' : v == null ? '—' : num(v)}
              </span>
              {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn.secondary} onClick={() => setFiltersOpen(true)} disabled={!!stat}>
          <SlidersHorizontal className="h-4 w-4" /> Filters
          {chips.length > 0 && <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-700">{chips.length}</span>}
        </button>
        <label className="flex min-w-[16rem] flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 transition focus-within:border-blue-500 focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]">
          <Search className="h-4 w-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies…" aria-label="Search companies"
            disabled={!!stat} className="w-full border-0 bg-transparent p-0 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:!border-transparent focus:!shadow-none focus:!ring-0 disabled:cursor-not-allowed" />
          {search && !stat && (
            <button type="button" onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600" aria-label="Clear search"><X className="h-4 w-4" /></button>
          )}
        </label>
      </div>

      {(chips.length > 0 || stat) && (
        <div className="flex flex-wrap items-center gap-2">
          {stat && (
            <Link href={TRACKER_BASE} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200">
              Showing: {STAT_TITLES[stat] ?? stat} <X className="h-3 w-3" />
            </Link>
          )}
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={() => go(paramsFromFilters({ ...filters, ...c.remove }, params))}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200">
              {c.label} <X className="h-3 w-3" />
            </button>
          ))}
          {chips.length > 1 && (
            <button type="button" className="text-xs text-gray-500 hover:text-red-600"
              onClick={() => go(paramsFromFilters({ ...EMPTY_FILTERS, search: filters.search }, params))}>
              Clear all
            </button>
          )}
        </div>
      )}

      <ErrorNote error={list.error} />
      <div className="text-xs text-gray-500">
        {list.isLoading && !list.data ? '' : `${num(rows.length)} ${rows.length === 1 ? 'company' : 'companies'}`}
      </div>
      {list.isLoading && !list.data ? <Spinner /> : (
        <div className={cn(list.isFetching && 'opacity-60 transition-opacity')}>
          <CompanyTable rows={rows} columns={stat ? STAT_COLUMNS[stat] : undefined}
            emptyText={stat ? 'No companies for this metric.' : 'No companies match these filters.'} />
        </div>
      )}

      {filtersOpen && (
        <FilterPanel filters={filters} options={options.data} onApply={apply} onClose={() => setFiltersOpen(false)} />
      )}
    </div>
  );
}
