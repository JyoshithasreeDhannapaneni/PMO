'use client';

import { useContext } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { TrackerContext } from '@/components/accountTracker/TrackerShell';
import { AiTag, ErrorNote, HubSpotButton, ProbabilityBadge, Spinner, td, th } from '@/components/accountTracker/ui';
import { Card } from '@/components/ui/Card';
import { useTrackerTop20 } from '@/hooks/useProjects';
import { cn } from '@/lib/utils';
import { TRACKER_BASE, num, orDash } from '@/lib/accountTracker';

function Stat({ label, value, sub, to }: { label: string; value: string | null; sub?: string | null; to?: string | null }) {
  const body = (
    <>
      <span className="text-xs text-gray-500">{label}</span>
      <span className="truncate text-2xl font-bold text-blue-700">{value ?? '—'}</span>
      {sub && <span className="truncate text-[11px] text-gray-400">{sub}</span>}
    </>
  );
  const cls = 'flex min-w-0 flex-col gap-1 rounded-xl border border-white bg-blue-50 p-4';
  return to ? <Link className={cn(cls, 'transition hover:brightness-95')} href={to}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Top 20 companies and MSPs — ranked by revenue on file, then by size. */
export default function Top20Page() {
  const ws = useContext(TrackerContext)!;
  const router = useRouter();
  const params = useSearchParams();
  const type = params?.get('list') === 'msps' ? 'msps' : 'companies';
  const { data, error, isLoading } = useTrackerTop20(ws.owner, type);
  const rows = data?.rows ?? [];
  const stats = data?.stats;
  const tabCls = (on: boolean) => cn('-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition',
    on ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200" role="tablist" aria-label="Top 20 lists">
        <Link href={`${TRACKER_BASE}/top-20`} replace className={tabCls(type === 'companies')}>Companies</Link>
        <Link href={`${TRACKER_BASE}/top-20?list=msps`} replace className={tabCls(type === 'msps')}>MSPs <AiTag /></Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Highest revenue on file" value={stats?.highestRevenue ?? null} sub={stats?.highestRevenueCompany}
          to={stats?.highestRevenueCompanyId ? `${TRACKER_BASE}/companies/${stats.highestRevenueCompanyId}` : null} />
        <Stat label="Average employees" value={stats?.averageEmployees != null ? num(stats.averageEmployees) : null} />
        <Stat label="High connect probability" value={stats ? String(stats.highProbabilityCount) : null} sub={stats ? `of ${rows.length}` : null} />
      </div>
      {type === 'msps' && ws.ai && (ws.ai.running || ws.ai.analysed < (ws.status?.counts.companies ?? 0)) && (
        <p className="text-xs text-gray-500">
          MSPs are identified by the AI from each company&apos;s HubSpot record and web research — this list fills in as companies are analysed.
        </p>
      )}
      <ErrorNote error={error} />
      {isLoading && !data ? <Spinner /> : rows.length === 0 ? (
        <Card className="p-10 text-center text-sm text-gray-400">{type === 'msps' ? 'No MSPs identified yet.' : 'No companies ranked yet.'}</Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className={th}>Rank</th><th className={th}>Company</th><th className={th}>Industry</th><th className={th}>Country</th>
                  <th className={`${th} text-right`}>Employees</th><th className={`${th} text-right`}>Revenue</th><th className={th}>Ranking basis</th>
                  <th className={`${th} text-right`}>Times reached</th><th className={th}>Outreach stage</th><th className={th}>Connect</th>
                  <th className={th}>Primary contact</th><th className={th} aria-label="HubSpot" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.companyId} className="cursor-pointer hover:bg-blue-50/40" onClick={() => router.push(`${TRACKER_BASE}/companies/${r.companyId}`)}>
                    <td className={td}>
                      <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                        r.rank <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500')}>{r.rank}</span>
                    </td>
                    <td className={td}>
                      <Link className="font-semibold text-gray-900 hover:text-blue-600" href={`${TRACKER_BASE}/companies/${r.companyId}`} onClick={(e) => e.stopPropagation()}>{r.company}</Link>
                    </td>
                    <td className={td}>{orDash(r.industry)}</td>
                    <td className={td}>{orDash(r.country)}</td>
                    <td className={`${td} text-right tabular-nums`}>{num(r.employees)}</td>
                    <td className={`${td} text-right tabular-nums`}>{orDash(r.annualRevenue)}</td>
                    <td className={`${td} text-xs text-gray-400`}>{orDash(r.rankingBasis)}</td>
                    <td className={`${td} text-right tabular-nums`}>{num(r.timesReachedOut)}</td>
                    <td className={td}>{orDash(r.outreachStage)}</td>
                    <td className={td}><ProbabilityBadge value={r.probability} /></td>
                    <td className={td}>{orDash(r.primaryContactName)}</td>
                    <td className={`${td} text-right`}><HubSpotButton url={r.hubspotLink} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
