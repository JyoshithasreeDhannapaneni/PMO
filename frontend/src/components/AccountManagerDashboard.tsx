'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, AlertCircle, X, ExternalLink } from 'lucide-react';
import { useProjects, useManagerStats, useHubspotSignals, useAllArchivedProjects } from '@/hooks/useProjects';
import { useSettings } from '@/context/SettingsContext';
import { segmentOfManager } from '@/lib/segments';
import type { Project, HubspotSignalsData } from '@/types';

// Account Manager dashboard — the main Dashboard's "AM Dashboard" view, and an account
// manager's own "My View" when fixedAm is set (2026-10-06). Built from the same live
// project list as All Projects (useProjects — delay status computed on read, archived
// projects excluded) so every count here matches that page; the AM roster comes from the
// dashboard's manager-stats (ACCOUNT_MANAGER users + the baseline AM list), with any other
// account_manager value bucketed as Unassigned, exactly like the main dashboard's AM table.

const OPEN_STATUSES = new Set(['ACTIVE', 'ON_HOLD']);
const UNASSIGNED = 'Unassigned';
const UPCOMING_DAYS = 30;

interface AmRow {
  manager: string;
  customers: number;
  total: number;
  open: number;
  active: number;
  completed: number;
  delayed: number;
  atRisk: number;
  escalated: number;
  overaged: number;
  overageAmount: number;
  renewalsDue: number;
  ent: number;
  smb: number;
  pctOnTime: number | null;
  completionPct: number;
  volumeScore: number;
  compositeScore: number;
}

// The Performance table's columns; in date-range mode they are recomputed per range.
type PerfRow = Pick<AmRow, 'manager' | 'customers' | 'total' | 'active' | 'completed' | 'delayed' | 'escalated' | 'overaged' | 'completionPct'>;

type ArchivedProject = Project & { archivedAt?: string | null };

function toTime(d: string | null | undefined): number | null {
  if (!d) return null;
  const t = new Date(d.length === 10 ? `${d}T00:00:00` : d).getTime();
  return Number.isNaN(t) ? null : t;
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rangePresets(): { label: string; from: string; to: string }[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3) * 3;
  return [
    { label: 'This month', from: isoDay(new Date(y, m, 1)), to: isoDay(now) },
    { label: 'Last month', from: isoDay(new Date(y, m - 1, 1)), to: isoDay(new Date(y, m, 0)) },
    { label: 'This quarter', from: isoDay(new Date(y, q, 1)), to: isoDay(now) },
    { label: 'Year to date', from: isoDay(new Date(y, 0, 1)), to: isoDay(now) },
  ];
}

function accountLabel(p: Project): string {
  return p.clientName?.trim() || p.name?.trim() || 'Unnamed';
}

function normalizeCustomerKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Overaged projects run against their agreed extension; everyone else against SOW end.
function effectiveEnd(p: Project): string | null {
  return (p.isOveraged && p.extendedEndDate) ? p.extendedEndDate : (p.plannedEnd || null);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtDate(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function isRenewalDue(p: Project, today: Date): boolean {
  const end = effectiveEnd(p);
  return OPEN_STATUSES.has(p.status) && !!end && new Date(end) < today;
}

function segmentOf(p: Project): 'ENT' | 'SMB' | null {
  return p.segment ?? segmentOfManager(p.projectManager);
}

function SectionCard({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  ON_HOLD: 'bg-amber-100 text-amber-700',
  INACTIVE: 'bg-slate-100 text-slate-600',
  COMPLETED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};
const DELAY_BADGE: Record<string, string> = {
  DELAYED: 'bg-red-100 text-red-700',
  AT_RISK: 'bg-amber-100 text-amber-700',
  EXTENDED: 'bg-purple-100 text-purple-700',
};
const STATUS_ORDER = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
// Which delay an account row shows when its projects differ: the most serious one.
const DELAY_RANK: Record<string, number> = { DELAYED: 3, EXTENDED: 2, AT_RISK: 1 };

interface AccountGroup {
  key: string;
  label: string;
  projects: (Project & { archivedAt?: string | null })[];
  types: string[];
  migrationTypes: string[];
  pms: string[];
  ams: string[];
  segments: string[];
  phases: string[];
  open: number;
  completed: number;
  worst: Project | null;
  liveCount: number;
  end: string | null;
  escalated: boolean;
  overaged: boolean;
}

// The project's migration types as History Archive shows them (e.g. "Slack to Teams"), one
// entry per comma-separated value.
function migrationTypeList(raw: string | null | undefined): string[] {
  return (raw || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function delayBadge(p: Project): React.ReactNode {
  return DELAY_BADGE[p.delayStatus]
    ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${DELAY_BADGE[p.delayStatus]}`}>{p.delayStatus === 'AT_RISK' ? 'At risk' : `${p.delayDays || 0}d ${p.delayStatus === 'EXTENDED' ? 'extended' : 'late'}`}</span>
    : <span className="text-xs text-gray-400">On time</span>;
}

function statusBadge(status: string): React.ReactNode {
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600'}`}>{status}</span>;
}

function ProjectTable({ projects, columns, empty }: {
  projects: Project[];
  columns: { label: string; render: (p: Project) => React.ReactNode; align?: 'right' }[];
  empty: string;
}) {
  if (projects.length === 0) return <p className="text-sm text-gray-400 py-4 text-center">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 border-b border-gray-100">
            <th className="text-left font-medium py-2 pr-3">Project</th>
            <th className="text-left font-medium py-2 pr-3">Account</th>
            <th className="text-left font-medium py-2 pr-3">Account Manager</th>
            {columns.map((c) => (
              <th key={c.label} className={`font-medium py-2 pr-3 whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {projects.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="py-2 pr-3">
                <Link href={`/projects/${p.id}`} className="text-primary-700 hover:underline inline-flex items-center gap-1">
                  {p.name} <ExternalLink size={11} />
                </Link>
              </td>
              <td className="py-2 pr-3 text-gray-700">{accountLabel(p)}</td>
              <td className="py-2 pr-3 text-gray-600">{p.accountManager || '—'}</td>
              {columns.map((c) => (
                <td key={c.label} className={`py-2 pr-3 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{c.render(p)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// fixedAm locks every section to one account manager (an AM's My View): no switching to
// other AMs, and no cross-AM comparison (other cards, leaderboard).
export default function AccountManagerDashboard({ fixedAm }: { fixedAm?: string } = {}) {
  const { settings } = useSettings();
  const [pickedAm, setPickedAm] = useState<string | null>(null);
  // Whole-team project list (every AM's accounts in one view); not offered in an AM's My View.
  const [teamListOn, setTeamListOn] = useState(false);
  const selectedAm = fixedAm ?? pickedAm;
  const teamList = !fixedAm && !pickedAm && teamListOn;
  const setSelectedAm = (am: string | null) => { if (!fixedAm) setPickedAm(am); };
  const [leaderSegment, setLeaderSegment] = useState<'ALL' | 'ENT' | 'SMB'>('ALL');

  const { data: projectsData, isLoading: projectsLoading } = useProjects({ status: undefined, limit: 500000 });
  const { data: statsData, isLoading: statsLoading } = useManagerStats(undefined, 'am');
  const { data: hubspotResponse } = useHubspotSignals();
  const hubspot = (hubspotResponse?.data ?? null) as HubspotSignalsData | null;

  // Valid AM names, as the dashboard's manager-stats decided them. Its total/completed
  // include archived (finished) projects, which the live project list leaves out — so those
  // two numbers come from here to match the main dashboard's AM table exactly.
  const statsByAm = useMemo(() => new Map(
    ((statsData?.data ?? []) as { manager: string; total: number; completed: number }[]).map((r) => [r.manager, r])
  ), [statsData]);
  const amNames = useMemo(() => new Set<string>([...statsByAm.keys()].filter((m) => m !== UNASSIGNED)), [statsByAm]);

  // Migration projects only (POCs have their own page), each tagged with its resolved AM.
  const allProjects = useMemo(() => {
    const list = ((projectsData?.data ?? []) as Project[]).filter((p) => p.projectType !== 'POC');
    return list.map((p) => ({ ...p, accountManager: p.accountManager && amNames.has(p.accountManager) ? p.accountManager : UNASSIGNED }));
  }, [projectsData, amNames]);

  const today = startOfToday();

  const rows: AmRow[] = useMemo(() => {
    const byAm = new Map<string, Project[]>();
    for (const p of allProjects) {
      if (!byAm.has(p.accountManager)) byAm.set(p.accountManager, []);
      byAm.get(p.accountManager)!.push(p);
    }
    const base = [...byAm.entries()].map(([manager, ps]) => {
      const open = ps.filter((p) => OPEN_STATUSES.has(p.status));
      const delayed = ps.filter((p) => p.delayStatus === 'DELAYED' && OPEN_STATUSES.has(p.status)).length;
      const stat = statsByAm.get(manager);
      const total = stat?.total ?? ps.length;
      const completed = stat?.completed ?? ps.filter((p) => p.status === 'COMPLETED').length;
      const overagedList = ps.filter((p) => p.isOveraged);
      return {
        manager,
        customers: new Set(ps.map((p) => accountLabel(p).toLowerCase())).size,
        total,
        open: open.length,
        active: ps.filter((p) => p.status === 'ACTIVE').length,
        completed,
        delayed,
        atRisk: open.filter((p) => p.isAtRisk || p.delayStatus === 'AT_RISK').length,
        escalated: ps.filter((p) => p.isEscalated).length,
        overaged: overagedList.length,
        overageAmount: overagedList.reduce((s, p) => s + (Number(p.overageAmount) || 0), 0),
        renewalsDue: ps.filter((p) => isRenewalDue(p, today)).length,
        ent: ps.filter((p) => segmentOf(p) === 'ENT').length,
        smb: ps.filter((p) => segmentOf(p) === 'SMB').length,
        pctOnTime: open.length > 0 ? Math.round(((open.length - delayed) / open.length) * 100) : null,
        completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    });
    const maxTotal = Math.max(1, ...base.filter((r) => r.manager !== UNASSIGNED).map((r) => r.total));
    return base.map((r) => {
      const volumeScore = Math.round((r.total / maxTotal) * 100);
      const escalationFree = r.open > 0 ? 100 - Math.round((r.escalated / Math.max(r.open, r.escalated)) * 100) : 100;
      const compositeScore = Math.round(volumeScore * 0.3 + (r.pctOnTime ?? 100) * 0.45 + escalationFree * 0.25);
      return { ...r, volumeScore, compositeScore };
    }).sort((a, b) => b.total - a.total);
  }, [allProjects, statsByAm, today.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const amRows = rows.filter((r) => r.manager !== UNASSIGNED && (!fixedAm || r.manager === fixedAm));
  const unassignedRow = rows.find((r) => r.manager === UNASSIGNED);

  // Performance date range. A project counts when it was running at any point in the range:
  // started on/before the range end, and still open or finished on/after the range start.
  // Archived projects are included, since finished work is archived out of the live list.
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const rangeActive = !!rangeFrom || !!rangeTo;
  // Also loaded while an AM's project list is open: completed projects are archived the
  // moment they finish, so without these the list's Completed filter is always empty.
  // Export waits for the archived list too, so its workbook includes finished projects.
  const [exportPending, setExportPending] = useState(false);
  const { data: archivedData, isLoading: archivedLoading } = useAllArchivedProjects(rangeActive || !!selectedAm || teamList || exportPending);
  const archivedProjects: ArchivedProject[] = useMemo(() => {
    const liveIds = new Set(allProjects.map((p) => p.id));
    return ((archivedData?.projects ?? []) as ArchivedProject[])
      .filter((p) => p.projectType !== 'POC' && !liveIds.has(p.id))
      .map((p) => ({ ...p, accountManager: p.accountManager && amNames.has(p.accountManager) ? p.accountManager : UNASSIGNED }));
  }, [archivedData, allProjects, amNames]);

  const rangeRows: PerfRow[] | null = useMemo(() => {
    if (!rangeActive) return null;
    const fromT = toTime(rangeFrom) ?? -Infinity;
    const toT = rangeTo ? (toTime(rangeTo) as number) + 86400000 - 1 : Infinity;
    const archived = archivedProjects;

    const byAm = new Map<string, { p: ArchivedProject; completedInRange: boolean }[]>();
    for (const p of [...allProjects, ...archived] as ArchivedProject[]) {
      if (p.accountManager === UNASSIGNED || (fixedAm && p.accountManager !== fixedAm)) continue;
      const start = toTime(p.actualStart) ?? toTime(p.plannedStart) ?? toTime(p.createdAt);
      if (start === null || start > toT) continue;
      const open = OPEN_STATUSES.has(p.status);
      const finish = open ? null : (toTime(p.actualEnd) ?? toTime(p.archivedAt) ?? toTime(p.plannedEnd) ?? start);
      if (finish !== null && finish < fromT) continue;
      const completedInRange = p.status === 'COMPLETED' && finish !== null && finish <= toT;
      if (!byAm.has(p.accountManager)) byAm.set(p.accountManager, []);
      byAm.get(p.accountManager)!.push({ p, completedInRange });
    }

    return amRows.map((r) => {
      const items = byAm.get(r.manager) ?? [];
      const ps = items.map((i) => i.p);
      const total = ps.length;
      const completed = items.filter((i) => i.completedInRange).length;
      return {
        manager: r.manager,
        customers: new Set(ps.map((p) => accountLabel(p).toLowerCase())).size,
        total,
        active: ps.filter((p) => p.status === 'ACTIVE').length,
        completed,
        delayed: ps.filter((p) => p.delayStatus === 'DELAYED' && OPEN_STATUSES.has(p.status)).length,
        escalated: ps.filter((p) => p.isEscalated).length,
        overaged: ps.filter((p) => p.isOveraged).length,
        completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    }).sort((a, b) => b.total - a.total);
  }, [rangeActive, rangeFrom, rangeTo, archivedProjects, allProjects, amRows, fixedAm]);

  const perfRows: PerfRow[] = rangeRows ?? amRows;
  const perfLoading = rangeActive && archivedLoading;
  const fmtDay = (d: string) => (d ? fmtDate(`${d}T00:00:00`) : '');
  const rangeLabel = rangeFrom && rangeTo ? `${fmtDay(rangeFrom)} – ${fmtDay(rangeTo)}`
    : rangeFrom ? `from ${fmtDay(rangeFrom)}` : `up to ${fmtDay(rangeTo)}`;

  const scoped = selectedAm ? allProjects.filter((p) => p.accountManager === selectedAm) : allProjects;
  const openScoped = scoped.filter((p) => OPEN_STATUSES.has(p.status));

  // Every project of the selected AM, archived (finished) ones included: open first, then
  // completed (most recent first), then the rest; within a group by account and project name.
  const [amStatusFilter, setAmStatusFilter] = useState<'ALL' | 'OPEN' | 'COMPLETED'>('ALL');
  const statusRank = (s: string) => { const i = STATUS_ORDER.indexOf(s); return i === -1 ? STATUS_ORDER.length : i; };
  // The list shows one AM's projects (a name was clicked) or, in team view, every AM's at once.
  const listSource: ArchivedProject[] | null = selectedAm
    ? [...scoped, ...archivedProjects.filter((p) => p.accountManager === selectedAm)]
    : teamList ? [...allProjects, ...archivedProjects] : null;
  const amProjects: ArchivedProject[] = listSource
    ? listSource.slice().sort((a, b) => {
        const s = statusRank(a.status) - statusRank(b.status);
        if (s !== 0) return s;
        if (a.status === 'COMPLETED') {
          const byEnd = (toTime(b.actualEnd) ?? toTime(b.archivedAt) ?? 0) - (toTime(a.actualEnd) ?? toTime(a.archivedAt) ?? 0);
          if (byEnd !== 0) return byEnd;
        }
        return accountLabel(a).localeCompare(accountLabel(b)) || (a.name || '').localeCompare(b.name || '');
      })
    : [];
  const amOpenCount = amProjects.filter((p) => OPEN_STATUSES.has(p.status)).length;
  const amCompletedCount = amProjects.filter((p) => p.status === 'COMPLETED').length;
  const amProjectsShown = amProjects.filter((p) =>
    amStatusFilter === 'ALL' || (amStatusFilter === 'OPEN' ? OPEN_STATUSES.has(p.status) : p.status === 'COMPLETED'));

  // Clicking a name (card or performance row) brings that AM's project list into view.
  const amProjectsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setAmStatusFilter('ALL');
    setExpandedAccounts(new Set());
    if (pickedAm || teamList) amProjectsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [pickedAm, teamList]);

  const escalations = scoped.filter((p) => p.isEscalated);
  const overages = scoped.filter((p) => p.isOveraged);
  const renewals = scoped.filter((p) => isRenewalDue(p, today)).sort((a, b) => (effectiveEnd(a) ?? '').localeCompare(effectiveEnd(b) ?? ''));
  const delayedProjects = openScoped.filter((p) => p.delayStatus === 'DELAYED').sort((a, b) => (b.delayDays || 0) - (a.delayDays || 0)).slice(0, 15);
  const horizon = new Date(today.getTime() + UPCOMING_DAYS * 86400000);
  const upcoming = openScoped
    .filter((p) => { const e = effectiveEnd(p); return !!e && new Date(e) >= today && new Date(e) <= horizon; })
    .sort((a, b) => (effectiveEnd(a) ?? '').localeCompare(effectiveEnd(b) ?? ''));

  // Same categorisation as the main dashboard's Migration Type Overview.
  const getCategory = useMemo(() => {
    const nameToCategory: Record<string, string> = {};
    (settings.migrationTypes ?? []).forEach((t: { name?: string; category?: string }) => {
      if (t.name && t.category) nameToCategory[t.name.toLowerCase()] = t.category;
    });
    return (migTypes: string): string => {
      if (!migTypes) return 'Content Migration';
      for (const part of migTypes.split(',').map((s) => s.trim())) {
        const cat = nameToCategory[part.toLowerCase()];
        if (cat) return cat;
      }
      const u = migTypes.toUpperCase();
      if (['SLACK', 'TEAMS', 'CHAT', 'META', 'WEBEX', 'SKYPE', 'VIVA'].some((k) => u.includes(k))) return 'Messaging';
      if (['GMAIL', 'OUTLOOK', 'EXCHANGE', 'OFFICE365', 'GOOGLE WORKSPACE', 'LOTUS', 'ZIMBRA'].some((k) => u.includes(k))) return 'Email';
      return 'Content Migration';
    };
  }, [settings.migrationTypes]);

  // The AM's list grouped by customer account (client_name, falling back to the project
  // name: the same key All Projects groups by), one row per account with its projects inside.
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const amAccounts: AccountGroup[] = useMemo(() => {
    const groups = new Map<string, ArchivedProject[]>();
    for (const p of amProjectsShown) {
      const key = accountLabel(p).toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    return [...groups.entries()].map(([key, ps]) => {
      const live = ps.filter((p) => OPEN_STATUSES.has(p.status) || p.status === 'INACTIVE');
      const worst = live.filter((p) => DELAY_BADGE[p.delayStatus]).sort((a, b) =>
        DELAY_RANK[b.delayStatus] - DELAY_RANK[a.delayStatus] || (b.delayDays || 0) - (a.delayDays || 0))[0] ?? null;
      const completed = ps.filter((p) => p.status === 'COMPLETED');
      const latest = (dates: (string | null | undefined)[]) =>
        dates.filter((d): d is string => !!d).sort((a, b) => (toTime(b) ?? 0) - (toTime(a) ?? 0))[0] ?? null;
      return {
        key,
        label: accountLabel(ps[0]),
        projects: ps,
        types: uniq(ps.map((p) => getCategory(p.migrationTypes || '').replace(' Migration', ''))),
        migrationTypes: uniq(ps.flatMap((p) => migrationTypeList(p.migrationTypes))),
        pms: uniq(ps.map((p) => p.projectManager)),
        ams: uniq(ps.map((p) => p.accountManager)),
        segments: uniq(ps.map((p) => segmentOf(p))),
        phases: uniq(live.map((p) => p.phase)),
        open: ps.filter((p) => OPEN_STATUSES.has(p.status)).length,
        completed: completed.length,
        worst,
        liveCount: live.length,
        end: live.length > 0 ? latest(live.map((p) => effectiveEnd(p))) : latest(completed.map((p) => p.actualEnd ?? p.archivedAt)),
        escalated: ps.some((p) => p.isEscalated),
        overaged: ps.some((p) => p.isOveraged),
      };
    }).sort((a, b) => (b.open > 0 ? 1 : 0) - (a.open > 0 ? 1 : 0) || a.label.localeCompare(b.label));
  }, [amProjectsShown, getCategory]);

  const categoryStats = useMemo(() => {
    return [
      { key: 'Content Migration', icon: '📁', cls: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
      { key: 'Messaging', icon: '💬', cls: 'bg-green-50 border-green-200', text: 'text-green-700' },
      { key: 'Email', icon: '📧', cls: 'bg-purple-50 border-purple-200', text: 'text-purple-700' },
    ].map((c) => {
      const ps = scoped.filter((p) => getCategory(p.migrationTypes || '') === c.key);
      return {
        ...c,
        total: ps.length,
        active: ps.filter((p) => p.status === 'ACTIVE').length,
        completed: ps.filter((p) => p.status === 'COMPLETED').length,
        delayed: ps.filter((p) => p.delayStatus === 'DELAYED').length,
        overaged: ps.filter((p) => p.isOveraged).length,
      };
    });
  }, [scoped, getCategory]);

  // HubSpot upsell/cross-sell for the accounts in scope — only when the HubSpot service
  // answers (its backend route is currently not mounted, so this usually stays hidden).
  const upsellDeals = useMemo(() => {
    if (!hubspot?.configured) return null;
    const accounts = new Map<string, { label: string; am: string }>();
    for (const p of scoped) accounts.set(normalizeCustomerKey(accountLabel(p)), { label: accountLabel(p), am: p.accountManager });
    const out: { account: string; am: string; name: string; amount: number | null; stage: string; category: string }[] = [];
    for (const [key, acct] of accounts) {
      const deals = hubspot.customers[key]?.deals ?? [];
      for (const d of deals) {
        if (d.category === 'upsell' || d.category === 'cross_sell') {
          out.push({ account: acct.label, am: acct.am, name: d.name, amount: d.amount ?? null, stage: d.stage, category: d.category });
        }
      }
    }
    return out;
  }, [hubspot, scoped]);

  const leaderboard = amRows
    .filter((r) => leaderSegment === 'ALL' || (leaderSegment === 'ENT' ? r.ent >= r.smb && r.ent > 0 : r.smb > r.ent))
    .slice()
    .sort((a, b) => b.compositeScore - a.compositeScore);
  const leader = leaderboard[0];

  const runExport = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const add = (name: string, data: Record<string, unknown>[]) => {
      if (data.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), name);
    };
    const day = (d: string | null | undefined) => (d ? isoDay(new Date(d)) : '');
    const yesNo = (b: boolean | null | undefined) => (b ? 'Yes' : 'No');
    const exportProjects: ArchivedProject[] = [
      ...scoped,
      ...archivedProjects.filter((p) => !selectedAm || p.accountManager === selectedAm),
    ].sort((a, b) => accountLabel(a).localeCompare(accountLabel(b)) || (a.name || '').localeCompare(b.name || ''));
    const projectRow = (p: ArchivedProject) => ({
      Project: p.name,
      Account: accountLabel(p),
      'Account Manager': p.accountManager,
      'Project Manager': p.projectManager || '',
      'Migration Type': p.migrationTypes || '',
      Category: getCategory(p.migrationTypes || ''),
      Segment: segmentOf(p) ?? '',
      Phase: p.phase || '',
      Status: p.status,
      'Delay Status': p.delayStatus || '',
      'Delay Days': p.delayDays || 0,
      'Start': day(p.actualStart ?? p.plannedStart),
      'SOW End': day(p.plannedEnd),
      'Extended To': day(p.extendedEndDate),
      'Actual End': day(p.actualEnd),
      Escalated: yesNo(p.isEscalated),
      'Escalation Priority': p.isEscalated ? (p.escalationPriority || 'MEDIUM') : '',
      Overaged: yesNo(p.isOveraged),
      'Overage Amount': p.isOveraged ? Number(p.overageAmount) || 0 : '',
      'Renewal Due': yesNo(isRenewalDue(p, today)),
      Archived: p.archivedAt ? day(p.archivedAt) : '',
    });

    const summaryRows = selectedAm ? rows.filter((r) => r.manager === selectedAm) : rows;
    add('Account Managers', summaryRows.map((r) => ({
      'Account Manager': r.manager,
      Accounts: r.customers,
      'Total Projects': r.total,
      Open: r.open,
      Active: r.active,
      Completed: r.completed,
      Delayed: r.delayed,
      'At Risk': r.atRisk,
      Escalated: r.escalated,
      Overaged: r.overaged,
      'Overage Amount': r.overageAmount,
      'Renewals Due': r.renewalsDue,
      ENT: r.ent,
      SMB: r.smb,
      '% On Time': r.pctOnTime ?? '',
      'Completion %': r.completionPct,
      ...(fixedAm ? {} : { Score: r.compositeScore }),
    })));
    if (rangeRows) {
      add(`Performance ${rangeFrom || 'start'} to ${rangeTo || 'today'}`.slice(0, 31), rangeRows.map((r) => ({
        'Account Manager': r.manager,
        Accounts: r.customers,
        Total: r.total,
        Active: r.active,
        'Completed in Range': r.completed,
        Delayed: r.delayed,
        Escalated: r.escalated,
        Overaged: r.overaged,
        'Completion %': r.completionPct,
      })));
    }
    if (!fixedAm && !selectedAm) {
      add('Leaderboard', amRows.slice().sort((a, b) => b.compositeScore - a.compositeScore).map((r, i) => ({
        Rank: i + 1,
        'Account Manager': r.manager,
        Segment: r.ent >= r.smb ? 'ENT' : 'SMB',
        'Volume Score': r.volumeScore,
        '% On Time': r.pctOnTime ?? '',
        Escalated: r.escalated,
        Score: r.compositeScore,
      })));
    }

    const byAccount = new Map<string, ArchivedProject[]>();
    for (const p of exportProjects) {
      const key = accountLabel(p).toLowerCase();
      if (!byAccount.has(key)) byAccount.set(key, []);
      byAccount.get(key)!.push(p);
    }
    const join = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].join(', ');
    add('Accounts', [...byAccount.values()].map((ps) => ({
      Account: accountLabel(ps[0]),
      'Account Manager': join(ps.map((p) => p.accountManager)),
      Projects: ps.length,
      Open: ps.filter((p) => OPEN_STATUSES.has(p.status)).length,
      Completed: ps.filter((p) => p.status === 'COMPLETED').length,
      'Migration Type': join(ps.flatMap((p) => migrationTypeList(p.migrationTypes))),
      'Project Manager': join(ps.map((p) => p.projectManager)),
      Segment: join(ps.map((p) => segmentOf(p))),
      Phases: join(ps.filter((p) => OPEN_STATUSES.has(p.status)).map((p) => p.phase)),
      Delayed: ps.filter((p) => p.delayStatus === 'DELAYED' && OPEN_STATUSES.has(p.status)).length,
      Escalated: yesNo(ps.some((p) => p.isEscalated)),
      Overaged: yesNo(ps.some((p) => p.isOveraged)),
    })));
    add('Projects', exportProjects.map(projectRow));
    add('Migration Types', categoryStats.map((c) => ({
      Category: c.key, Total: c.total, Active: c.active, Completed: c.completed, Delayed: c.delayed, Overaged: c.overaged,
    })));
    add('Escalated', escalations.map(projectRow));
    add('Overaged', overages.map(projectRow));
    add('Renewals Due', renewals.map((p) => {
      const e = effectiveEnd(p);
      return { ...projectRow(p), 'Days Past End': e ? Math.floor((today.getTime() - new Date(e).getTime()) / 86400000) : '' };
    }));
    add('Delayed', openScoped.filter((p) => p.delayStatus === 'DELAYED')
      .sort((a, b) => (b.delayDays || 0) - (a.delayDays || 0)).map(projectRow));
    add('Upcoming Deadlines', upcoming.map(projectRow));
    if (upsellDeals?.length) {
      add('Upsell & Cross-sell', upsellDeals.map((d) => ({
        Account: d.account, 'Account Manager': d.am, Deal: d.name,
        Type: d.category === 'upsell' ? 'Upsell' : 'Cross-sell', Stage: d.stage, Amount: d.amount ?? '',
      })));
    }

    const who = (selectedAm ?? 'all').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    XLSX.writeFile(wb, `am-dashboard-${who}-${isoDay(new Date())}.xlsx`);
  };

  // Runs once the archived list has loaded, so the export never misses finished projects.
  useEffect(() => {
    if (!exportPending || archivedLoading || !archivedData) return;
    setExportPending(false);
    runExport().catch(() => { /* the button simply re-enables */ });
  }, [exportPending, archivedLoading, archivedData]); // eslint-disable-line react-hooks/exhaustive-deps

  if (projectsLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setExportPending(true)}
          disabled={exportPending}
          title={selectedAm ? `Download ${selectedAm}'s dashboard data as Excel` : 'Download the whole AM dashboard as Excel'}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {exportPending && <Loader2 size={14} className="animate-spin" />}
          {exportPending ? 'Preparing export…' : selectedAm ? `Export ${selectedAm}'s data` : 'Export to Excel'}
        </button>
      </div>

      {selectedAm && !fixedAm && (
        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800">
          Showing <strong>{selectedAm}</strong>&apos;s accounts in every section below.
          <button onClick={() => setSelectedAm(null)} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold hover:underline">
            <X size={12} /> Show all account managers
          </button>
        </div>
      )}

      {/* AM overview cards */}
      <SectionCard
        title={fixedAm ? 'My Accounts' : 'Account Managers'}
        subtitle={fixedAm ? `Projects where ${fixedAm} is the Account Manager. Open = Active + On Hold.` : 'Click a card to see all of that account manager\'s projects and focus every section on them, or view the whole team at once. Open = Active + On Hold.'}
        right={fixedAm ? undefined : (
          <button
            type="button"
            onClick={() => { setPickedAm(null); setTeamListOn(!teamList); }}
            className={`text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap ${teamList ? 'bg-primary-600 text-white' : 'bg-white text-primary-700 border border-primary-200 hover:bg-primary-50'}`}
          >
            {teamList ? 'Hide whole team' : 'View whole team'}
          </button>
        )}
      >
        {amRows.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            {fixedAm ? `No projects list ${fixedAm} as Account Manager yet. Ask an admin to assign you on your projects.` : 'No projects are assigned to an account manager yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {amRows.map((r) => {
              const selected = selectedAm === r.manager;
              return (
                <button
                  key={r.manager}
                  onClick={() => setSelectedAm(selected ? null : r.manager)}
                  className={`text-left rounded-xl border p-4 transition ${selected ? 'border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-300' : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.manager}</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.pctOnTime == null ? 'bg-gray-100 text-gray-500' : r.pctOnTime >= 80 ? 'bg-green-100 text-green-700' : r.pctOnTime >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                      {r.pctOnTime == null ? 'No open' : `${r.pctOnTime}% on time`}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{r.customers} accounts · {r.total} projects · ENT {r.ent} / SMB {r.smb}</p>
                  <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                    {([['Open', r.open, 'text-gray-900'], ['Delayed', r.delayed, 'text-red-600'], ['At risk', r.atRisk, 'text-amber-600'], ['Escalated', r.escalated, 'text-orange-600']] as const).map(([label, value, cls]) => (
                      <div key={label}>
                        <div className={`text-lg font-bold ${cls}`}>{value}</div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-500">
                    <span>{r.overaged} overaged</span>
                    <span>{r.renewalsDue} renewal{r.renewalsDue === 1 ? '' : 's'} due</span>
                    <span>{r.completed} completed</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {unassignedRow && !fixedAm && (
          <p className="mt-3 text-xs text-amber-700 flex items-center gap-1.5">
            <AlertCircle size={13} /> {unassignedRow.total} project{unassignedRow.total === 1 ? ' has' : 's have'} no valid account manager and {unassignedRow.total === 1 ? 'is' : 'are'} not counted under anyone.
          </p>
        )}
      </SectionCard>

      {/* Manager performance */}
      <SectionCard
        title="Account Manager Performance"
        subtitle={rangeActive
          ? `Projects running ${rangeLabel}, including archived ones. Completed = finished in this range; completion = completed ÷ total. Delayed, escalated and overaged show each project's current state.`
          : 'All time. Total and completion include finished/archived projects (same as the main dashboard); delayed, escalated and overaged count current projects. Pick a date range to narrow it.'}
      >
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <label className="text-xs text-gray-500">
            <span className="block mb-0.5">From</span>
            <input
              type="date"
              value={rangeFrom}
              max={rangeTo || undefined}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 px-2 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </label>
          <label className="text-xs text-gray-500">
            <span className="block mb-0.5">To</span>
            <input
              type="date"
              value={rangeTo}
              min={rangeFrom || undefined}
              onChange={(e) => setRangeTo(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 px-2 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1">
            {rangePresets().map((p) => (
              <button key={p.label} onClick={() => { setRangeFrom(p.from); setRangeTo(p.to); }}
                className={`h-8 text-xs px-2.5 rounded-full font-medium ${rangeFrom === p.from && rangeTo === p.to ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'}`}>
                {p.label}
              </button>
            ))}
            {rangeActive && (
              <button onClick={() => { setRangeFrom(''); setRangeTo(''); }} className="h-8 inline-flex items-center gap-1 text-xs px-2.5 rounded-full font-medium text-gray-600 hover:bg-gray-100">
                <X size={12} /> All time
              </button>
            )}
          </div>
        </div>
        {perfLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading archived projects for this range...
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                {['Account Manager', 'Accounts', 'Total', 'Active', 'Completed', 'Delayed', 'Escalated', 'Overaged', 'Completion'].map((h, i) => (
                  <th key={h} className={`font-medium py-2 pr-3 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {perfRows.map((r) => (
                <tr key={r.manager} className={`hover:bg-gray-50 ${selectedAm === r.manager ? 'bg-indigo-50/50' : ''}`}>
                  <td className="py-2 pr-3 font-medium text-gray-800">
                    <button onClick={() => setSelectedAm(selectedAm === r.manager ? null : r.manager)} className="hover:underline text-left">{r.manager}</button>
                  </td>
                  {[r.customers, r.total, r.active, r.completed].map((v, i) => <td key={i} className="py-2 pr-3 text-right tabular-nums text-gray-700">{v}</td>)}
                  <td className="py-2 pr-3 text-right tabular-nums text-red-600">{r.delayed}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-orange-600">{r.escalated}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-gray-700">{r.overaged}</td>
                  <td className="py-2 pr-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500" style={{ width: `${r.completionPct}%` }} />
                      </div>
                      <span className="tabular-nums text-gray-700 w-9 text-right">{r.completionPct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </SectionCard>

      {/* All projects of the selected AM, or of the whole team */}
      {(selectedAm || teamList) && (
        <div ref={amProjectsRef} className="scroll-mt-4">
          <SectionCard
            title={selectedAm ? `${selectedAm}'s Projects` : 'Whole Team: All Account Managers\' Projects'}
            subtitle={archivedLoading
              ? 'Loading projects, including completed and archived ones...'
              : `${new Set(amProjects.map((p) => accountLabel(p).toLowerCase())).size} accounts, ${amProjects.length} project${amProjects.length === 1 ? '' : 's'}: ${amOpenCount} open, ${amCompletedCount} completed${amProjects.length - amOpenCount - amCompletedCount > 0 ? `, ${amProjects.length - amOpenCount - amCompletedCount} other (inactive or cancelled)` : ''}. Completed include archived. Click an account to see its projects.`}
            right={
              <div className="flex items-center gap-1">
                {([['ALL', 'All'], ['OPEN', 'Open'], ['COMPLETED', 'Completed']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setAmStatusFilter(key)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${amStatusFilter === key ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'}`}>
                    {label}
                  </button>
                ))}
                {!fixedAm && (
                  <button onClick={() => { setSelectedAm(null); setTeamListOn(false); }} className="ml-1 p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close project list">
                    <X size={14} />
                  </button>
                )}
              </div>
            }
          >
            <div className="max-h-[520px] overflow-y-auto">
              {amAccounts.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                  {amProjects.length === 0 ? `${selectedAm ?? 'The team'} has no projects.` : 'No accounts match this filter.'}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-xs text-gray-500 border-b border-gray-100">
                      {['Account', ...(teamList ? ['Account Manager'] : []), 'Projects', 'Migration Type', 'Project Manager', 'Segment', 'Phase', 'Status', 'Delay', 'Ends', 'Flags'].map((h) => (
                        <th key={h} className="text-left font-medium py-2 pr-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {amAccounts.map((a) => {
                      const open = expandedAccounts.has(a.key);
                      const toggle = () => setExpandedAccounts((prev) => {
                        const next = new Set(prev);
                        if (next.has(a.key)) next.delete(a.key); else next.add(a.key);
                        return next;
                      });
                      return (
                        <Fragment key={a.key}>
                          <tr className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={toggle}>
                            <td className="py-2 pr-3">
                              <button type="button" className="flex items-center gap-1.5 text-left font-medium text-gray-900" aria-expanded={open}>
                                <span className={`inline-block w-3 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
                                {a.label}
                              </button>
                            </td>
                            {teamList && <td className="py-2 pr-3 text-xs text-gray-700">{a.ams.join(', ') || '—'}</td>}
                            <td className="py-2 pr-3 text-xs text-gray-700 whitespace-nowrap">
                              {a.projects.length} · {a.types.join(', ')}
                            </td>
                            <td className="py-2 pr-3 text-xs text-gray-600">
                              <span className="inline-block max-w-[220px] truncate align-bottom" title={a.migrationTypes.join(', ')}>{a.migrationTypes.join(', ') || '—'}</span>
                            </td>
                            <td className="py-2 pr-3 text-xs text-gray-700">{a.pms.join(', ') || '—'}</td>
                            <td className="py-2 pr-3 text-xs text-gray-600">{a.segments.join(', ') || '—'}</td>
                            <td className="py-2 pr-3 text-xs text-gray-600">{a.phases.join(', ') || '—'}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">
                              {a.open > 0 ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{a.open} open</span> : null}
                              {a.open > 0 && a.completed > 0 ? ' ' : null}
                              {a.completed > 0 ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{a.completed} completed</span> : null}
                              {a.open === 0 && a.completed === 0 ? statusBadge(a.projects[0].status) : null}
                            </td>
                            <td className="py-2 pr-3">{a.liveCount === 0 ? <span className="text-xs text-gray-400">—</span> : a.worst ? delayBadge(a.worst) : <span className="text-xs text-gray-400">On time</span>}</td>
                            <td className="py-2 pr-3 text-xs text-gray-600 whitespace-nowrap">{a.liveCount === 0 && a.end ? `Completed ${fmtDate(a.end)}` : fmtDate(a.end)}</td>
                            <td className="py-2 pr-3">
                              <span className="flex gap-1">
                                {a.escalated && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">Escalated</span>}
                                {a.overaged && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Overaged</span>}
                              </span>
                            </td>
                          </tr>
                          {open && a.projects.map((p) => {
                            const live = OPEN_STATUSES.has(p.status) || p.status === 'INACTIVE';
                            return (
                              <tr key={p.id} className="bg-slate-50/70 text-xs">
                                <td className="py-1.5 pr-3 pl-6">
                                  <Link href={`/projects/${p.id}`} className="text-primary-700 hover:underline inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    {p.name} <ExternalLink size={11} />
                                  </Link>
                                </td>
                                {teamList && <td className="py-1.5 pr-3 text-gray-700">{p.accountManager || '—'}</td>}
                                <td className="py-1.5 pr-3 text-gray-600">{getCategory(p.migrationTypes || '').replace(' Migration', '')}</td>
                                <td className="py-1.5 pr-3 text-gray-600">
                                  <span className="inline-block max-w-[220px] truncate align-bottom" title={p.migrationTypes || ''}>{p.migrationTypes || '—'}</span>
                                </td>
                                <td className="py-1.5 pr-3 text-gray-700">{p.projectManager || '—'}</td>
                                <td className="py-1.5 pr-3 text-gray-600">{segmentOf(p) ?? '—'}</td>
                                <td className="py-1.5 pr-3 text-gray-600">{p.phase || '—'}</td>
                                <td className="py-1.5 pr-3">{statusBadge(p.status)}</td>
                                <td className="py-1.5 pr-3">{live ? delayBadge(p) : <span className="text-gray-400">—</span>}</td>
                                <td className="py-1.5 pr-3 text-gray-600 whitespace-nowrap">
                                  {p.status === 'COMPLETED' ? `Completed ${fmtDate(p.actualEnd ?? p.archivedAt ?? effectiveEnd(p))}` : fmtDate(effectiveEnd(p))}
                                </td>
                                <td className="py-1.5 pr-3">
                                  <span className="flex gap-1">
                                    {p.isEscalated && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">Escalated</span>}
                                    {p.isOveraged && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Overaged</span>}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </SectionCard>
        </div>
      )}

      {/* Leaderboard */}
      {!fixedAm && (
      <SectionCard
        title="Account Manager Leaderboard"
        subtitle="Score = portfolio volume (30%) + open projects on time (45%) + open projects not escalated (25%). AM segment = where most of their projects sit."
        right={
          <div className="flex items-center gap-1">
            {(['ALL', 'ENT', 'SMB'] as const).map((s) => (
              <button key={s} onClick={() => setLeaderSegment(s)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${leaderSegment === s ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'}`}>
                {s}
              </button>
            ))}
          </div>
        }
      >
        {leaderboard.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No account managers in this segment.</p>
        ) : (
          <>
            {leaderboard.length > 1 && (
              <p className="text-xs text-gray-600 mb-3">
                <strong className="text-green-700">{leader.manager}</strong> leads with {leader.compositeScore}.{' '}
                {(() => {
                  const last = leaderboard[leaderboard.length - 1];
                  return <>Lowest is <strong className="text-red-700">{last.manager}</strong> at {last.compositeScore}{last.delayed > 0 ? `, with ${last.delayed} delayed project${last.delayed === 1 ? '' : 's'}` : ''}.</>;
                })()}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    {['Rank', 'Account Manager', 'Accounts', 'Projects', 'On-Time %', 'Escalated', 'Score', 'Vs. Leader'].map((h, i) => (
                      <th key={h} className={`font-medium py-2 pr-3 ${i <= 1 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {leaderboard.map((r, i) => (
                    <tr key={r.manager} className="hover:bg-gray-50">
                      <td className="py-2 pr-3 text-gray-500 tabular-nums">#{i + 1}</td>
                      <td className="py-2 pr-3 font-medium text-gray-800">{r.manager}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.customers}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.total}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.pctOnTime == null ? '—' : `${r.pctOnTime}%`}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-orange-600">{r.escalated}</td>
                      <td className="py-2 pr-3 text-right tabular-nums font-bold text-gray-900">{r.compositeScore}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-gray-500">{i === 0 ? '—' : `−${leader.compositeScore - r.compositeScore}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>
      )}

      {/* Migration type overview */}
      <SectionCard title="Migration Type Overview" subtitle={selectedAm ? `${selectedAm}'s projects` : 'All account managers'}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {categoryStats.map((c) => (
            <div key={c.key} className={`p-4 rounded-xl border ${c.cls}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{c.icon}</span>
                <span className={`text-sm font-semibold ${c.text}`}>{c.key}</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-2">{c.total}</div>
              <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
                <span>{c.active} Active</span>
                <span>{c.completed} Done</span>
                <span>{c.overaged} Overaged</span>
                <span>{c.delayed} Delayed</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <SectionCard title="Escalated Projects" subtitle={`${escalations.length} escalated`}>
          <ProjectTable
            projects={escalations}
            empty="No escalated projects."
            columns={[
              { label: 'Priority', render: (p) => <span className="text-xs font-semibold text-orange-700">{p.escalationPriority || 'MEDIUM'}</span> },
              { label: 'Status', render: (p) => <span className="text-xs text-gray-600">{p.status}</span> },
            ]}
          />
        </SectionCard>

        <SectionCard
          title="Overage Projects"
          subtitle={`${overages.length} overaged · $${overages.reduce((s, p) => s + (Number(p.overageAmount) || 0), 0).toLocaleString()} total overage`}
        >
          <ProjectTable
            projects={overages}
            empty="No overaged projects."
            columns={[
              { label: 'Overage', align: 'right', render: (p) => p.overageAmount != null ? `$${Number(p.overageAmount).toLocaleString()}` : '—' },
              { label: 'Extended to', render: (p) => <span className="text-xs text-gray-600">{fmtDate(p.extendedEndDate)}</span> },
            ]}
          />
        </SectionCard>
      </div>

      <SectionCard
        title="Renewals Due"
        subtitle="Open projects already past their SOW end (or extension date, if overaged) — candidates for a renewal or extension conversation."
      >
        <ProjectTable
          projects={renewals}
          empty="No open projects past their end date."
          columns={[
            { label: 'Ended', render: (p) => <span className="text-xs text-gray-600">{fmtDate(effectiveEnd(p))}</span> },
            { label: 'Days past', align: 'right', render: (p) => { const e = effectiveEnd(p); return e ? Math.floor((today.getTime() - new Date(e).getTime()) / 86400000) : '—'; } },
            { label: 'Phase', render: (p) => <span className="text-xs text-gray-600">{p.phase}</span> },
          ]}
        />
        <div className="mt-4 border-t border-gray-100 pt-3">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Upsell &amp; cross-sell (HubSpot)</h3>
          {upsellDeals === null ? (
            <p className="text-xs text-gray-500">HubSpot deal data isn&apos;t available — the HubSpot connection isn&apos;t running on the backend right now.</p>
          ) : upsellDeals.length === 0 ? (
            <p className="text-xs text-gray-500">No open upsell or cross-sell deals for these accounts.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  {['Account', 'Account Manager', 'Deal', 'Type', 'Stage', 'Amount'].map((h) => <th key={h} className="text-left font-medium py-2 pr-3">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {upsellDeals.map((d, i) => (
                  <tr key={`${d.account}-${d.name}-${i}`}>
                    <td className="py-2 pr-3">{d.account}</td>
                    <td className="py-2 pr-3 text-gray-600">{d.am}</td>
                    <td className="py-2 pr-3">{d.name}</td>
                    <td className="py-2 pr-3 text-xs">{d.category === 'upsell' ? 'Upsell' : 'Cross-sell'}</td>
                    <td className="py-2 pr-3 text-xs text-gray-600">{d.stage}</td>
                    <td className="py-2 pr-3 tabular-nums">{d.amount != null ? `$${d.amount.toLocaleString()}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <SectionCard title="Delayed Projects" subtitle="Open projects currently delayed, most overdue first (top 15).">
          <ProjectTable
            projects={delayedProjects}
            empty="No delayed projects."
            columns={[{ label: 'Days late', align: 'right', render: (p) => <span className="text-red-600 font-semibold">{p.delayDays}</span> }]}
          />
        </SectionCard>

        <SectionCard title="Upcoming Deadlines" subtitle={`Open projects ending in the next ${UPCOMING_DAYS} days.`}>
          <ProjectTable
            projects={upcoming}
            empty={`Nothing ends in the next ${UPCOMING_DAYS} days.`}
            columns={[
              { label: 'Ends', render: (p) => <span className="text-xs text-gray-700">{fmtDate(effectiveEnd(p))}</span> },
              { label: 'In', align: 'right', render: (p) => { const e = effectiveEnd(p); return e ? `${Math.ceil((new Date(e).getTime() - today.getTime()) / 86400000)}d` : '—'; } },
            ]}
          />
        </SectionCard>
      </div>
    </div>
  );
}
