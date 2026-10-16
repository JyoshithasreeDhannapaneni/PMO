'use client';

import { ReactNode, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { TRACKER_BASE, num, orDash } from '@/lib/accountTracker';
import type { CompanyRow } from '@/types/accountTracker';
import { HubSpotButton, Pager, ProbabilityBadge, SortHeader, Tag, td, th } from './ui';

const PROB_ORDER: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
const TIER_ORDER: Record<string, number> = { Enterprise: 3, Mid: 2, Small: 1 };
const PAGE_SIZE = 50;
const BASIS_TITLE: Record<string, string> = {
  hubspot: 'From HubSpot',
  activity: 'Measured from real replies to outreach',
  timezone: 'Estimated from time-zone overlap (too little activity to measure)',
};

const companyHref = (id: number, tab?: string) => `${TRACKER_BASE}/companies/${id}${tab ? `?tab=${tab}` : ''}`;

/** A number that opens the related tab of the company (the row itself opens its overview). */
const tabLink = (r: CompanyRow, tab: string, text: ReactNode, active: boolean) => (active
  ? <Link className="text-blue-600 hover:underline" href={companyHref(r.id, tab)} onClick={(e) => e.stopPropagation()}>{text}</Link>
  : text);

interface Column { label: string; num?: boolean; sort: (r: CompanyRow) => string | number; render?: (r: CompanyRow) => ReactNode }

const COLUMNS: Record<string, Column> = {
  company: { label: 'Company', sort: (r) => r.company?.toLowerCase() ?? '' },
  industry: { label: 'Industry', sort: (r) => r.industry?.toLowerCase() ?? '', render: (r) => orDash(r.industry) },
  country: { label: 'Country', sort: (r) => r.country?.toLowerCase() ?? '', render: (r) => orDash(r.country) },
  employees: { label: 'Employees', num: true, sort: (r) => r.employees ?? -1, render: (r) => num(r.employees) },
  tier: { label: 'Size', sort: (r) => TIER_ORDER[r.tier ?? ''] ?? 0, render: (r) => (r.tier ? <Tag>{r.tier}</Tag> : '—') },
  openDeals: { label: 'Open deals', num: true, sort: (r) => r.openDeals ?? -1, render: (r) => tabLink(r, 'deals', num(r.openDeals), (r.openDeals ?? 0) > 0) },
  days: { label: 'Days since contact', num: true, sort: (r) => r.daysSinceLastContact ?? -1, render: (r) => num(r.daysSinceLastContact) },
  stage: { label: 'Outreach stage', sort: (r) => r.timesReachedOut ?? -1, render: (r) => orDash(r.outreachStage) },
  lastContact: {
    label: 'Last contact', sort: (r) => r.lastContactDate ?? '',
    render: (r) => <span className="whitespace-nowrap">{tabLink(r, 'activity', orDash(r.lastContactDate), !!r.lastContactDate)}</span>,
  },
  calls: { label: 'Calls', num: true, sort: (r) => r.callsCount ?? -1, render: (r) => tabLink(r, 'activity&type=call', num(r.callsCount), (r.callsCount ?? 0) > 0) },
  emails: { label: 'Emails', num: true, sort: (r) => r.emailsCount ?? -1, render: (r) => tabLink(r, 'activity&type=email', num(r.emailsCount), (r.emailsCount ?? 0) > 0) },
  meetings: { label: 'Meetings', num: true, sort: (r) => r.meetingsCount ?? -1, render: (r) => tabLink(r, 'activity&type=meeting', num(r.meetingsCount), (r.meetingsCount ?? 0) > 0) },
  notes: { label: 'Notes', num: true, sort: (r) => r.notesCount ?? -1, render: (r) => tabLink(r, 'activity&type=note', num(r.notesCount), (r.notesCount ?? 0) > 0) },
  reason: { label: 'Why', sort: (r) => r.priorityReason ?? '', render: (r) => <Tag accent>{r.priorityReason}</Tag> },
  probability: {
    label: 'Connect', sort: (r) => PROB_ORDER[r.probability ?? ''] ?? 0,
    render: (r) => <span title={r.connectBasis ? BASIS_TITLE[r.connectBasis] : undefined}><ProbabilityBadge value={r.probability} /></span>,
  },
};

const DEFAULT_COLUMNS = ['company', 'industry', 'country', 'employees', 'tier', 'openDeals', 'stage', 'lastContact', 'probability'];

/** Sortable, paged company table. Rows open the company page; the page number lives in the URL (?page=). */
export function CompanyTable({ rows, columns: requested = DEFAULT_COLUMNS, emptyText = 'No companies match.' }: {
  rows: CompanyRow[]; columns?: string[]; emptyText?: string;
}) {
  const columns = requested;
  const [sort, setSort] = useState<{ key: string | null; dir: 1 | -1 }>({ key: null, dir: 1 });
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const params = useSearchParams();

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const get = COLUMNS[sort.key].sort;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(params?.get('page')) || 1));
  const shown = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const goPage = (p: number) => {
    const next = new URLSearchParams(params?.toString() ?? '');
    if (p <= 1) next.delete('page');
    else next.set('page', String(p));
    router.push(`${pathname}${next.toString() ? `?${next}` : ''}`);
  };
  const toggle = (key: string) =>
    setSort((s) => (s.key !== key ? { key, dir: key === 'company' ? 1 : -1 } : s.dir === -1 ? { key, dir: 1 } : { key: null, dir: 1 }));

  if (!rows.length) return <Card className="p-10 text-center text-sm text-gray-400">{emptyText}</Card>;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              {columns.map((k) => (
                <SortHeader key={k} label={COLUMNS[k].label} numeric={COLUMNS[k].num} active={sort.key === k} dir={sort.dir} onClick={() => toggle(k)} />
              ))}
              <th className={th} aria-label="HubSpot" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map((r) => (
              <tr key={r.id} className="cursor-pointer transition hover:bg-blue-50/40" onClick={() => router.push(companyHref(r.id))}>
                {columns.map((k) => (
                  <td key={k} className={`${td} ${COLUMNS[k].num ? 'text-right tabular-nums' : ''}`}>
                    {k === 'company'
                      ? <Link className="font-semibold text-gray-900 hover:text-blue-600" href={companyHref(r.id)} onClick={(e) => e.stopPropagation()}>{r.company}</Link>
                      : COLUMNS[k].render?.(r)}
                  </td>
                ))}
                <td className={`${td} text-right`}><HubSpotButton url={r.hubspotLink} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} total={sorted.length} size={PAGE_SIZE} onPage={goPage} />
    </Card>
  );
}
