'use client';

import { ReactNode, useContext, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Calendar, CheckCircle2, FileText, Mail, Phone, RefreshCw, StickyNote } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTrackerActivity } from '@/hooks/useProjects';
import { cn } from '@/lib/utils';
import { RANGES, dayTime, duration, fromNow, inRange, num, rangeDates, relativeTime } from '@/lib/accountTracker';
import type { ActivityItem, ActivityType } from '@/types/accountTracker';
import { TrackerContext } from './TrackerShell';
import { ErrorNote, Section, Spinner, Tag, WarnNote, btn } from './ui';

export const ACTIVITY_TYPES: { key: ActivityType; label: string; one: string }[] = [
  { key: 'call', label: 'Calls', one: 'Call' },
  { key: 'note', label: 'Notes', one: 'Note' },
  { key: 'meeting', label: 'Meetings', one: 'Meeting' },
  { key: 'email', label: 'Emails', one: 'Email' },
  { key: 'task', label: 'Tasks', one: 'Task' },
];
const ONE: Record<string, string> = Object.fromEntries(ACTIVITY_TYPES.map((t) => [t.key, t.one]));
/** Server-side type names ("calls") to item types ("call"). */
const PLURAL: Record<string, ActivityType> = { calls: 'call', notes: 'note', meetings: 'meeting', emails: 'email', tasks: 'task' };
const TYPE_ICON: Record<ActivityType, LucideIcon> = { call: Phone, note: StickyNote, meeting: Calendar, email: Mail, task: CheckCircle2 };
const TYPE_TINT: Record<ActivityType, string> = {
  call: 'bg-green-50 text-green-600', note: 'bg-amber-50 text-amber-600', meeting: 'bg-violet-50 text-violet-600',
  email: 'bg-blue-50 text-blue-600', task: 'bg-slate-100 text-slate-600',
};
const PERIODS = RANGES.filter((r) => r.key !== 'custom');

function Expandable({ text, limit = 420 }: { text: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  if (text.length <= limit) return <p className="whitespace-pre-line text-sm text-gray-700">{text}</p>;
  return (
    <>
      <p className="whitespace-pre-line text-sm text-gray-700">{open ? text : `${text.slice(0, limit).trimEnd()}…`}</p>
      <button type="button" className="text-xs font-medium text-blue-600 hover:underline" onClick={() => setOpen((o) => !o)}>
        {open ? 'Show less' : 'Show more'}
      </button>
    </>
  );
}

function Meta({ i }: { i: ActivityItem }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
      <span>{ONE[i.type]}</span>
      {i.direction && <span>{i.direction}</span>}
      {duration(i.durationSeconds) && <span>{duration(i.durationSeconds)}</span>}
      {i.ownerName && <span>by {i.ownerName}</span>}
      <span title={dayTime(i.timestamp)}>{dayTime(i.timestamp)} · {fromNow(i.timestamp)}</span>
    </div>
  );
}

function TimelineItem({ item: i }: { item: ActivityItem }) {
  const I = TYPE_ICON[i.type] ?? FileText;
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span className={cn('z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full', TYPE_TINT[i.type])} aria-hidden="true">
        <I className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-gray-900">{i.title || ONE[i.type]}</span>
          {i.outcome && <Tag>{i.outcome}</Tag>}
          {i.priority && i.priority !== 'None' && <Tag>{i.priority} priority</Tag>}
        </div>
        <Meta i={i} />
        {i.body ? <Expandable text={i.body} /> : <p className="text-xs text-gray-400">No notes written.</p>}
      </div>
    </li>
  );
}

/** Full activity tab: the AI conversation summary on top, then the timeline filtered by type, period and person (in the URL). */
export function ActivityFeed({ companyId, ownerId, summary }: { companyId: string; ownerId: string | null; summary?: ReactNode }) {
  const ws = useContext(TrackerContext);
  const [nonce, setNonce] = useState(0);
  const { data, error, isLoading, isFetching } = useTrackerActivity(ws?.owner ?? null, companyId, nonce);
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const params = useSearchParams();
  const type = ACTIVITY_TYPES.some((t) => t.key === params?.get('type')) ? (params?.get('type') as ActivityType) : '';
  const period = PERIODS.some((r) => r.key === params?.get('period')) ? (params?.get('period') as string) : 'all';
  const mineOnly = params?.get('mine') === '1';
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params?.toString() ?? '');
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  const items = useMemo(() => data?.items ?? [], [data]);
  const range = rangeDates(period);
  const inPeriod = useMemo(() => items.filter((i) => inRange(i.timestamp, range)), [items, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const people = mineOnly ? inPeriod.filter((i) => i.ownerId === ownerId) : inPeriod;
  const shown = type ? people.filter((i) => i.type === type) : people;
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    people.forEach((i) => { m[i.type] = (m[i.type] ?? 0) + 1; });
    return m;
  }, [people]);

  if (isLoading && !data) return <Spinner label="Reading activity from HubSpot…" />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;

  const truncated = Object.entries(data.totals ?? {}).filter(([k, n]) => n > items.filter((i) => i.type === PLURAL[k]).length);
  const chip = (on: boolean) => cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
    on ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50');

  return (
    <div className="space-y-4">
      {summary}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Activity type">
          <button type="button" className={chip(type === '')} onClick={() => setFilter('type', '')}>
            All <span className="opacity-70">{num(people.length)}</span>
          </button>
          {ACTIVITY_TYPES.map((t) => (
            <button key={t.key} type="button" className={chip(type === t.key)} onClick={() => setFilter('type', type === t.key ? '' : t.key)}>
              {t.label} <span className="opacity-70">{num(counts[t.key] ?? 0)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={period} onChange={(e) => setFilter('period', e.target.value === 'all' ? '' : e.target.value)} aria-label="Period">
            {PERIODS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          {ownerId && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" className="accent-blue-600" checked={mineOnly} onChange={(e) => setFilter('mine', e.target.checked ? '1' : '')} />
              Only the account owner&apos;s
            </label>
          )}
          <button type="button" className={btn.ghost} onClick={() => setNonce((n) => n + 1)} disabled={isFetching} title="Read again from HubSpot">
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} /> {relativeTime(data.fetchedAt)}
          </button>
        </div>
      </div>

      {data.unavailable.length > 0 && (
        <WarnNote>{data.unavailable.map((u) => <div key={u.type}>{u.reason}</div>)}</WarnNote>
      )}

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
          {items.length === 0 ? 'No activity logged yet.' : 'Nothing matches these filters.'}
        </div>
      ) : (
        <ol className="relative before:absolute before:bottom-2 before:left-4 before:top-2 before:w-px before:bg-gray-200">
          {shown.map((i) => <TimelineItem key={`${i.type}-${i.id}`} item={i} />)}
        </ol>
      )}
      {truncated.length > 0 && (
        <p className="text-xs text-gray-400">
          Showing the latest {truncated.map(([k, n]) => `${items.filter((i) => i.type === PLURAL[k]).length} of ${num(n)} ${k}`).join(', ')}. Older items are in HubSpot.
        </p>
      )}
    </div>
  );
}

/** Overview card: the most recent call and what was written about it. */
export function LastCall({ companyId, activityHref }: { companyId: string; activityHref: string }) {
  const ws = useContext(TrackerContext);
  const { data, error, isLoading } = useTrackerActivity(ws?.owner ?? null, companyId, 0);
  const call = data?.items.find((i) => i.type === 'call');
  const latest = data?.items[0];
  return (
    <Section title="Last call" right={<Link className="text-xs font-medium text-blue-600 hover:underline" href={activityHref}>All activity</Link>}>
      {isLoading && !data ? <Spinner /> : error ? <ErrorNote error={error} /> : !call ? (
        <p className="text-sm text-gray-500">
          {data?.unavailable.some((u) => u.type === 'calls') ? 'Calls can’t be read with the current HubSpot token.' : 'No calls logged on this company yet.'}
          {latest && <> Latest activity: {ONE[latest.type].toLowerCase()} {fromNow(latest.timestamp)}.</>}
        </p>
      ) : (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">{call.title || 'Call'}</span>
            {call.outcome && <Tag>{call.outcome}</Tag>}
          </div>
          <Meta i={call} />
          {call.body ? <Expandable text={call.body} limit={600} /> : <p className="text-xs text-gray-400">No call notes were written.</p>}
        </div>
      )}
    </Section>
  );
}
