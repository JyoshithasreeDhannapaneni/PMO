'use client';

import { useContext } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { TrackerContext } from '@/components/accountTracker/TrackerShell';
import { ErrorNote, Spinner, td, th } from '@/components/accountTracker/ui';
import { Card } from '@/components/ui/Card';
import { useTrackerInsights } from '@/hooks/useProjects';
import { cn } from '@/lib/utils';
import { TRACKER_BASE, num, orDash } from '@/lib/accountTracker';
import type { TrackerInsights } from '@/types/accountTracker';

const ACTIVITY = /^(logged |notes)/i;
const HIDDEN = /^owner$/i; // already shown in the header

/** "3034" -> "3,034"; other text unchanged. */
const pretty = (v: string | null | undefined) => (/^\d+$/.test(String(v ?? '').trim()) ? num(v) : orDash(v));

/** Where each card's number is listed (by the card's title). */
const DRILL: [RegExp, string][] = [
  [/^total companies$/i, TRACKER_BASE],
  [/^total contacts$/i, `${TRACKER_BASE}/contacts`],
  [/^companies reached out$/i, `${TRACKER_BASE}?stat=reached`],
  [/^msps$/i, `${TRACKER_BASE}?stat=msps`],
  [/^open deals$/i, `${TRACKER_BASE}?stat=open-deals`],
  [/^avg days since last contact$/i, `${TRACKER_BASE}?stat=avg-days`],
  [/^logged calls$/i, `${TRACKER_BASE}?stat=calls`],
  [/^logged emails$/i, `${TRACKER_BASE}?stat=emails`],
  [/^logged meetings$/i, `${TRACKER_BASE}?stat=meetings`],
  [/^notes$/i, `${TRACKER_BASE}?stat=notes`],
];

function StatCard({ s }: { s: TrackerInsights['stats'][number] }) {
  const value = String(s.statValue ?? '');
  const part = value.match(/^(\d+) of (\d+)$/); // "544 of 936"
  const drill = DRILL.find(([re]) => re.test(s.metric ?? ''));
  const to = drill ? drill[1] : null;
  const missing = part ? Number(part[2]) - Number(part[1]) : 0;
  const whole = to && !part; // a card with two destinations stays a plain box with two links
  const cls = cn('flex min-w-0 flex-col gap-1 rounded-xl border border-white bg-blue-50 p-4', whole && 'transition hover:brightness-95');
  const body = (
    <>
      <span className="text-xs text-gray-500">{s.metric}</span>
      {part ? (
        <>
          <span className="text-2xl font-bold text-blue-700">{num(part[1])}<span className="text-sm font-medium text-gray-400"> of {num(part[2])}</span></span>
          <div className="h-1.5 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.round((Number(part[1]) / Math.max(1, Number(part[2]))) * 100)}%` }} />
          </div>
        </>
      ) : <span className="truncate text-2xl font-bold text-blue-700">{pretty(value)}</span>}
      <span className="text-[11px] text-gray-400">{s.note}</span>
      {whole && <span className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-600">View list <ChevronRight className="h-3.5 w-3.5" /></span>}
      {to && part && (
        <span className="flex flex-wrap gap-3 text-xs font-medium">
          <Link className="inline-flex items-center gap-0.5 text-blue-600 hover:underline" href={to}>View list <ChevronRight className="h-3.5 w-3.5" /></Link>
          {missing > 0 && <Link className="text-red-600 hover:underline" href={`${TRACKER_BASE}?stat=not-reached`}>{num(missing)} not reached yet</Link>}
        </span>
      )}
    </>
  );
  return whole ? <Link href={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Stats({ stats }: { stats: TrackerInsights['stats'] }) {
  const shown = stats.filter((s) => !HIDDEN.test(s.metric ?? ''));
  const activity = shown.filter((s) => ACTIVITY.test(s.metric ?? ''));
  const portfolio = shown.filter((s) => !activity.includes(s));
  if (shown.length === 0) return <Card className="p-10 text-center text-sm text-gray-400">No stats yet.</Card>;
  const groups: [string, TrackerInsights['stats']][] = [['Portfolio', portfolio], ['Logged activity', activity]];
  return (
    <div className="space-y-5">
      {groups.filter(([, list]) => list.length > 0).map(([title, list]) => (
        <section key={title} className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {list.map((s) => <StatCard key={s.id} s={s} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

const TABS = [
  { key: '', label: 'Portfolio stats' },
  { key: 'quality', label: 'Data quality' },
  { key: 'methodology', label: 'Methodology' },
] as const;

/** Portfolio stats, data-quality notes and how every field is calculated. */
export default function InsightsPage() {
  const ws = useContext(TrackerContext)!;
  const params = useSearchParams();
  const tab = TABS.some((t) => t.key === params?.get('tab')) ? (params?.get('tab') as string) : '';
  const { data, error, isLoading } = useTrackerInsights(ws.owner);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-gray-200" role="tablist" aria-label="Data sections">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <Link key={t.key} href={t.key ? `${TRACKER_BASE}/insights?tab=${t.key}` : `${TRACKER_BASE}/insights`} replace role="tab" aria-selected={on}
              className={cn('-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition',
                on ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700')}>
              {t.label}
              {t.key === 'quality' && data && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-semibold', on ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500')}>{num(data.dataQuality.length)}</span>
              )}
            </Link>
          );
        })}
      </div>

      <ErrorNote error={error} />
      {isLoading && !data ? <Spinner /> : data && (
        <>
          {tab === '' && <Stats stats={data.stats} />}
          {tab === 'quality' && (data.dataQuality.length === 0
            ? <Card className="p-10 text-center text-sm text-gray-400">No data-quality issues found.</Card>
            : (
              <Card padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50"><tr><th className={th}>Company / domain</th><th className={th}>Issue</th><th className={th}>What to do</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.dataQuality.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className={td}>
                            {r.companyId
                              ? <Link className="font-semibold text-gray-900 hover:text-blue-600" href={`${TRACKER_BASE}/companies/${r.companyId}`}>{r.subject}</Link>
                              : <span className="font-semibold text-gray-900">{orDash(r.subject)}</span>}
                          </td>
                          <td className={td}>{orDash(r.issue)}</td>
                          <td className={`${td} text-gray-500`}>{orDash(r.recommendation)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          {tab === 'methodology' && (
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50"><tr><th className={th}>Field</th><th className={th}>How it is calculated</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.methodology.map((m) => (
                      <tr key={m.id}>
                        <td className={`${td} w-1/3 font-semibold text-gray-800`}>{orDash(m.field)}</td>
                        <td className={`${td} text-gray-600`}>{orDash(m.note)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
