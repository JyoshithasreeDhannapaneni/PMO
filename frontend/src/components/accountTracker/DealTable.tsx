'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { TRACKER_BASE, day, fromNow, money } from '@/lib/accountTracker';
import type { DealRow } from '@/types/accountTracker';
import { Pager, SortHeader, td, th } from './ui';

const PAGE = 50;
const STATUS_CLASS: Record<string, string> = {
  OPEN: 'bg-blue-50 text-blue-700',
  WON: 'bg-green-100 text-green-700',
  LOST: 'bg-gray-100 text-gray-500',
};
const STATUS_LABEL: Record<string, string> = { OPEN: 'Open', WON: 'Won', LOST: 'Lost' };

const COLS: { key: string; label: string; num?: boolean; get: (r: DealRow) => string | number }[] = [
  { key: 'name', label: 'Deal', get: (r) => r.deal.name?.toLowerCase() ?? '' },
  { key: 'amount', label: 'Amount', num: true, get: (r) => r.deal.amount ?? -1 },
  { key: 'stage', label: 'Stage', get: (r) => r.deal.stageLabel?.toLowerCase() ?? '' },
  { key: 'close', label: 'Close date', get: (r) => r.deal.closeDate ?? '' },
  { key: 'created', label: 'Created', get: (r) => r.deal.createDate ?? '' },
];

/** Sortable deal list (50 per page). compact: no paging, company, created or pipeline columns (company page). */
export function DealTable({ rows, page = 1, onPage, compact = false }: {
  rows: DealRow[]; page?: number; onPage?: (p: number) => void; compact?: boolean;
}) {
  const [sort, setSort] = useState<{ key: string | null; dir: 1 | -1 }>({ key: null, dir: 1 });
  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const col = COLS.find((c) => c.key === sort.key);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const x = col.get(a);
      const y = col.get(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const current = Math.min(page, pages);
  const shown = compact ? sorted : sorted.slice((current - 1) * PAGE, current * PAGE);

  if (rows.length === 0) return <Card className="p-10 text-center text-sm text-gray-400">No deals match these filters.</Card>;
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              {COLS.filter((c) => !compact || c.key !== 'created').map((c) => (
                <SortHeader key={c.key} label={c.label} numeric={c.num} active={sort.key === c.key} dir={sort.dir}
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.num ? -1 : 1 }))} />
              ))}
              {!compact && <th className={th}>Pipeline</th>}
              <th className={th} aria-label="Open in HubSpot" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map(({ deal: d, companyId }) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className={td}>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-gray-900">{d.name}</span>
                    {!compact && d.companyName && (
                      <span className="text-xs text-gray-500">
                        {companyId ? <Link className="text-blue-600 hover:underline" href={`${TRACKER_BASE}/companies/${companyId}`}>{d.companyName}</Link> : d.companyName}
                      </span>
                    )}
                    {d.dealType && <span className="text-xs text-gray-400">{d.dealType}</span>}
                    {d.mine === false && (
                      <span className="w-fit rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Owner: {d.dealOwnerName ?? 'a colleague'}</span>
                    )}
                  </div>
                </td>
                <td className={`${td} whitespace-nowrap text-right font-semibold tabular-nums`}>{money(d.amount, d.currency, false)}</td>
                <td className={td}>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_CLASS[d.status ?? ''] ?? 'bg-gray-100 text-gray-500')}>
                    {STATUS_LABEL[d.status ?? ''] ?? '—'}
                  </span>
                  <div className="mt-1 text-xs text-gray-700">{d.stageLabel ?? '—'}</div>
                  {d.status === 'LOST' && d.lostReason && <div className="text-xs text-gray-400">Reason: {d.lostReason}</div>}
                  {d.status === 'OPEN' && d.nextStep && <div className="text-xs text-gray-400">Next: {d.nextStep}</div>}
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {day(d.closeDate)}
                  {d.status === 'OPEN' && d.closeDate && <div className="text-xs text-gray-400">{fromNow(d.closeDate)}</div>}
                </td>
                {!compact && <td className={`${td} whitespace-nowrap`}>{day(d.createDate)}</td>}
                {!compact && <td className={`${td} text-xs text-gray-600`}>{d.pipelineLabel ?? '—'}</td>}
                <td className={`${td} text-right`}>
                  {d.hubspotLink && (
                    <a className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600" href={d.hubspotLink}
                      target="_blank" rel="noopener noreferrer" title="Open deal in HubSpot" aria-label={`Open ${d.name} in HubSpot`}>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!compact && onPage && pages > 1 && <Pager page={current} pages={pages} total={sorted.length} size={PAGE} onPage={onPage} />}
    </Card>
  );
}
