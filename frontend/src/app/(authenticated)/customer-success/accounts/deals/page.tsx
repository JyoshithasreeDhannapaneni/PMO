'use client';

import { useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Briefcase, Loader2, RefreshCw, Search } from 'lucide-react';
import { DealTable } from '@/components/accountTracker/DealTable';
import { TrackerContext } from '@/components/accountTracker/TrackerShell';
import {
  AiFooter, AiPending, AiTag, EmptyState, ErrorNote, FieldLabel, Section, Spinner, WarnNote, btn,
} from '@/components/accountTracker/ui';
import { Card } from '@/components/ui/Card';
import { useTrackerDeals } from '@/hooks/useProjects';
import { cn } from '@/lib/utils';
import { RANGES, TRACKER_BASE, money, num, rangeDates, rangeLabel } from '@/lib/accountTracker';
import type { AiDealInsights, DealQueryParams, TrackerAiStatus, WonBucket } from '@/types/accountTracker';

/** AI review of the whole pipeline: what wins, what loses, what is at risk, what to do next. */
function DealInsightsCard({ insights, ai }: { insights: AiDealInsights | null; ai: TrackerAiStatus | undefined }) {
  return (
    <Section title="Deal insights" right={<AiTag />}>
      {!insights ? <AiPending ai={ai} what="these deals" /> : (
        <div className="space-y-4">
          <p className="text-sm font-medium text-gray-800">{insights.headline}</p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl bg-green-50 p-3">
              <FieldLabel>Why deals are won</FieldLabel>
              {insights.wins.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700">{insights.wins.map((w) => <li key={w}>{w}</li>)}</ul>
              ) : <p className="mt-1 text-sm text-gray-400">Not enough won deals to see a pattern.</p>}
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <FieldLabel>Why deals are lost</FieldLabel>
              {insights.losses.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700">{insights.losses.map((l) => <li key={l}>{l}</li>)}</ul>
              ) : <p className="mt-1 text-sm text-gray-400">Not enough lost deals to see a pattern.</p>}
            </div>
          </div>
          {insights.atRisk.length > 0 && (
            <div>
              <FieldLabel>Open deals at risk</FieldLabel>
              <ul className="mt-1 divide-y divide-gray-100 rounded-xl border border-amber-100 bg-amber-50/40">
                {insights.atRisk.map((r) => (
                  <li key={`${r.deal}-${r.reason}`} className="px-3 py-2 text-sm">
                    <span className="font-semibold text-gray-900">{r.deal}</span>
                    <span className="text-gray-600"> — {r.reason}</span>
                    <div className="text-xs text-amber-800">Do: {r.action}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {insights.nextBestActions.length > 0 && (
            <div>
              <FieldLabel>Next best actions</FieldLabel>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-gray-700">
                {insights.nextBestActions.map((a) => <li key={`${a.deal}-${a.action}`}><span className="font-semibold">{a.deal}:</span> {a.action}</li>)}
              </ol>
            </div>
          )}
          <AiFooter generatedAt={insights.generatedAt} />
        </div>
      )}
    </Section>
  );
}

const STATUSES = [
  { key: '', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
] as const;

const selectCls = 'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500';

function Segmented({ value, options, onChange, label }: { value: string; options: [string, string][]; onChange: (v: string) => void; label: string }) {
  return (
    <div className="flex gap-1 rounded-xl bg-gray-100 p-1" role="radiogroup" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={cn('rounded-lg px-3 py-1.5 text-xs font-medium transition', value === k ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Deals connected to the viewed person in HubSpot: totals, won over time, top customers and the full list. */
export default function DealsPage() {
  const ws = useContext(TrackerContext)!;
  const router = useRouter();
  const pathname = usePathname() ?? `${TRACKER_BASE}/deals`;
  const params = useSearchParams() ?? new URLSearchParams();
  const range = params.get('range') || 'all';
  const dateBy = params.get('date') === 'created' ? 'created' : 'close';
  const status = params.get('status') || '';
  const pipeline = params.get('pipeline') || '';
  const owner = ['mine', 'others'].includes(params.get('dealOwner') ?? '') ? (params.get('dealOwner') as string) : '';
  const q = params.get('q') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { from, to } = rangeDates(range, params.get('from'), params.get('to'));
  const [search, setSearch] = useState(q);

  const set = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in changes)) next.delete('page');
    router.push(`${pathname}${next.toString() ? `?${next}` : ''}`, { scroll: false });
  };

  useEffect(() => {
    if (search === q) return undefined;
    const t = setTimeout(() => set({ q: search.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const query: DealQueryParams = {
    ...(from ? { from } : {}), ...(to ? { to } : {}), date: dateBy,
    ...(status ? { status } : {}), ...(pipeline ? { pipeline } : {}), ...(q ? { search: q } : {}), ...(owner ? { dealOwner: owner } : {}),
  };
  const { data, error, isLoading, isFetching } = useTrackerDeals(ws.owner, query);

  const mine = !ws.owner || ws.owner === ws.me.hubspotOwnerId;
  const ownerName = ws.status?.ownerName;
  const title = mine ? 'My deals' : `${ownerName ?? 'Their'}’s deals`;

  if (isLoading && !data) return <Spinner />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;

  if (data.totalDeals === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        <EmptyState icon={<Briefcase className="h-10 w-10" />} title="No deals yet">
          {ws.me.role !== 'VIEWER' && (
            <button type="button" className={btn.primary} onClick={ws.sync} disabled={ws.running}>
              {ws.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {ws.running ? 'Syncing…' : 'Sync now'}
            </button>
          )}
        </EmptyState>
      </div>
    );
  }

  const s = data.summary;
  const cur = s.currency;
  const counts: Record<string, number> = { '': data.counts.all, open: data.counts.open, won: data.counts.won, lost: data.counts.lost };
  const who = mine ? 'you are' : `${ownerName ?? 'this person'} is`;
  const kpi = 'flex flex-col gap-1 rounded-xl border p-4 text-left transition';

  return (
    <div className={cn('space-y-4', isFetching && 'transition-opacity')}>
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>

      <Card padding="sm" className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <FieldLabel>Period</FieldLabel>
          <select className={selectCls} value={range} onChange={(e) => set({ range: e.target.value === 'all' ? '' : e.target.value, from: '', to: '' })}>
            {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        {range === 'custom' && (
          <>
            <label className="flex flex-col gap-1">
              <FieldLabel>From</FieldLabel>
              <input className={selectCls} type="date" value={params.get('from') ?? ''} max={params.get('to') ?? undefined}
                onChange={(e) => set({ range: 'custom', from: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <FieldLabel>To</FieldLabel>
              <input className={selectCls} type="date" value={params.get('to') ?? ''} min={params.get('from') ?? undefined}
                onChange={(e) => set({ range: 'custom', to: e.target.value })} />
            </label>
          </>
        )}
        <div className="flex flex-col gap-1">
          <FieldLabel>Date by</FieldLabel>
          <Segmented label="Which date the period uses" value={dateBy} onChange={(v) => set({ date: v === 'created' ? 'created' : '' })}
            options={[['close', 'Close date'], ['created', 'Created']]} />
        </div>
        {data.othersCount > 0 && (
          <div className="flex flex-col gap-1">
            <FieldLabel>Deal owner</FieldLabel>
            <Segmented label="Deal owner" value={owner} onChange={(v) => set({ dealOwner: v })}
              options={[['', 'All'], ['mine', mine ? 'Mine' : 'Theirs'], ['others', 'Colleagues’']]} />
          </div>
        )}
        {data.pipelines.length > 1 && (
          <label className="flex flex-col gap-1">
            <FieldLabel>Pipeline</FieldLabel>
            <select className={selectCls} value={pipeline} onChange={(e) => set({ pipeline: e.target.value })}>
              <option value="">All pipelines</option>
              {data.pipelines.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        )}
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
          <FieldLabel>Search</FieldLabel>
          <span className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition focus-within:border-blue-500 focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]">
            <Search className="h-4 w-4 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Deal, company or stage" aria-label="Search deals"
              className="w-full border-0 bg-transparent p-0 text-sm focus:outline-none focus:!border-transparent focus:!shadow-none focus:!ring-0" />
          </span>
        </label>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button type="button" onClick={() => set({ status: status === 'won' ? '' : 'won' })}
          className={cn(kpi, 'bg-green-50 hover:brightness-95', status === 'won' ? 'border-green-300 ring-2 ring-green-200' : 'border-white')}>
          <span className="text-xs text-gray-500">Won</span>
          <span className="text-2xl font-bold text-green-700">{money(s.wonAmount, cur)}</span>
          <span className="text-[11px] text-gray-400">{num(s.wonCount)} deal{s.wonCount === 1 ? '' : 's'} · {rangeLabel(range).toLowerCase()}</span>
        </button>
        <button type="button" onClick={() => set({ status: status === 'open' ? '' : 'open' })}
          className={cn(kpi, 'bg-blue-50 hover:brightness-95', status === 'open' ? 'border-blue-300 ring-2 ring-blue-200' : 'border-white')}>
          <span className="text-xs text-gray-500">Open pipeline</span>
          <span className="text-2xl font-bold text-blue-700">{money(s.openAmount, cur)}</span>
          <span className="text-[11px] text-gray-400">{num(s.openCount)} open · weighted {money(s.weightedOpen, cur)}</span>
        </button>
        <div className={cn(kpi, 'border-white bg-indigo-50')}>
          <span className="text-xs text-gray-500">Win rate</span>
          <span className="text-2xl font-bold text-indigo-700">{s.winRate == null ? '—' : `${Math.round(s.winRate * 100)}%`}</span>
          <span className="text-[11px] text-gray-400">{num(s.wonCount)} won of {num(s.wonCount + s.lostCount)} closed</span>
        </div>
        <button type="button" onClick={() => set({ status: status === 'won' ? '' : 'won' })}
          className={cn(kpi, 'bg-amber-50 hover:brightness-95', status === 'won' ? 'border-amber-300 ring-2 ring-amber-200' : 'border-white')}>
          <span className="text-xs text-gray-500">Average won deal</span>
          <span className="text-2xl font-bold text-amber-700">{s.avgWonAmount == null ? '—' : money(s.avgWonAmount, cur)}</span>
          <span className="text-[11px] text-gray-400">{s.avgDaysToClose == null ? 'No won deals in this period' : `${num(s.avgDaysToClose)} days to close on average`}</span>
        </button>
      </div>
      {data.othersCount > 0 && (
        <p className="text-xs text-gray-500">
          {data.totalsScope === 'others'
            ? <>Totals count the {num(data.othersCount)} colleague deal{data.othersCount === 1 ? '' : 's'} on {mine ? 'your' : 'their'} companies.</>
            : <>Totals count the {num(data.mineCount)} deal{data.mineCount === 1 ? '' : 's'} where {who} the Deal owner.
              {' '}The list also shows {num(data.othersCount)} colleague deal{data.othersCount === 1 ? '' : 's'} on {mine ? 'your' : 'their'} companies.</>}
        </p>
      )}
      {s.mixedCurrencies && <WarnNote>Deals use more than one currency; totals add the amounts as entered in HubSpot.</WarnNote>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <WonChart buckets={s.wonOverTime ?? []} unit={s.granularity ?? 'month'} currency={cur} dateBy={dateBy}
            onPick={(b) => set({ range: 'custom', from: b.from, to: b.to, status: 'won' })} />
        </div>
        <div className="space-y-4">
          <Section title="Top customers">
            {s.topCompanies.length === 0 ? <p className="text-sm text-gray-400">No won deals in this period.</p> : (
              <ol className="space-y-2">
                {s.topCompanies.map((c, i) => (
                  <li key={`${c.name}-${c.companyId ?? i}`} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-xs font-bold text-gray-300">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-gray-800">
                      {c.companyId ? <Link className="hover:text-blue-600" href={`${TRACKER_BASE}/companies/${c.companyId}`}>{c.name}</Link> : c.name}
                    </span>
                    <span className="font-semibold tabular-nums text-green-700">{money(c.amount, cur)}</span>
                    <span className="w-14 text-right text-xs text-gray-400">{c.count} deal{c.count === 1 ? '' : 's'}</span>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </div>

      <DealInsightsCard insights={data.insights} ai={ws.ai} />

      <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-gray-200" role="tablist" aria-label="Deal status">
        {STATUSES.map((t) => {
          const on = status === t.key;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => set({ status: t.key })}
              className={cn('-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition',
                on ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700')}>
              {t.label}
              <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-semibold', on ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500')}>{num(counts[t.key])}</span>
            </button>
          );
        })}
      </div>

      <DealTable rows={data.deals} page={page} onPage={(p) => set({ page: p > 1 ? String(p) : '' })} />
    </div>
  );
}

/* ---------- won over time ---------- */
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short' });
const LONG = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

/** Bar label, the year shown under it (on the first bar and when the year changes), and the tooltip name. */
function describe(b: WonBucket, unit: string, i: number, all: WonBucket[]) {
  const d = new Date(`${b.from}T00:00:00`);
  const year = d.getFullYear();
  const newYear = i === 0 || new Date(`${all[i - 1].from}T00:00:00`).getFullYear() !== year;
  if (unit === 'year') return { label: String(year), year: null, name: String(year) };
  if (unit === 'quarter') {
    const q = `Q${Math.floor(d.getMonth() / 3) + 1}`;
    return { label: q, year: newYear ? year : null, name: `${q} ${year}` };
  }
  return { label: MONTH.format(d), year: newYear ? year : null, name: LONG.format(d) };
}

/** Won amount over time; each bar opens that period's won deals. */
function WonChart({ buckets, unit, currency, dateBy, onPick }: {
  buckets: WonBucket[]; unit: string; currency: string | null; dateBy: string; onPick: (b: WonBucket) => void;
}) {
  const max = Math.max(0, ...buckets.map((b) => b.amount));
  const total = buckets.reduce((a, b) => a + b.amount, 0);
  return (
    <Section title={`Won by ${unit}`} right={<span className="text-xs text-gray-400">{money(total, currency)} · by {dateBy === 'created' ? 'created' : 'close'} date</span>}>
      {max === 0 ? <p className="py-10 text-center text-sm text-gray-400">No won deals in this period.</p> : (
        <div className="flex h-56 items-end gap-1 overflow-x-auto pb-1" role="img" aria-label={`Won amount per ${unit}`}>
          {buckets.map((b, i) => {
            const t = describe(b, unit, i, buckets);
            return (
              <button type="button" key={b.key} disabled={b.count === 0} onClick={() => onPick(b)}
                title={`${t.name}: ${money(b.amount, currency, false)} · ${b.count} deal${b.count === 1 ? '' : 's'}`}
                className="group flex h-full min-w-[1.75rem] flex-1 flex-col items-center justify-end gap-1 disabled:cursor-default">
                <span className="text-[10px] font-medium text-gray-500">{b.amount > 0 ? money(b.amount, currency) : ''}</span>
                <div className="flex w-full flex-1 items-end">
                  <div className="w-full rounded-t-md bg-blue-500 transition group-hover:bg-blue-600 group-disabled:bg-gray-200"
                    style={{ height: `${Math.max(b.amount > 0 ? 3 : 0, (b.amount / max) * 100)}%` }} />
                </div>
                <span className="text-[10px] text-gray-500">{t.label}</span>
                <span className="h-3 text-[10px] font-semibold text-gray-400">{t.year ?? ''}</span>
              </button>
            );
          })}
        </div>
      )}
    </Section>
  );
}
