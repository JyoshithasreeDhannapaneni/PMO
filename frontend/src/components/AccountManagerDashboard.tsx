'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, AlertCircle, X, ExternalLink } from 'lucide-react';
import { useProjects, useManagerStats, useHubspotSignals } from '@/hooks/useProjects';
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
  const selectedAm = fixedAm ?? pickedAm;
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

  const scoped = selectedAm ? allProjects.filter((p) => p.accountManager === selectedAm) : allProjects;
  const openScoped = scoped.filter((p) => OPEN_STATUSES.has(p.status));

  const escalations = scoped.filter((p) => p.isEscalated);
  const overages = scoped.filter((p) => p.isOveraged);
  const renewals = scoped.filter((p) => isRenewalDue(p, today)).sort((a, b) => (effectiveEnd(a) ?? '').localeCompare(effectiveEnd(b) ?? ''));
  const delayedProjects = openScoped.filter((p) => p.delayStatus === 'DELAYED').sort((a, b) => (b.delayDays || 0) - (a.delayDays || 0)).slice(0, 15);
  const horizon = new Date(today.getTime() + UPCOMING_DAYS * 86400000);
  const upcoming = openScoped
    .filter((p) => { const e = effectiveEnd(p); return !!e && new Date(e) >= today && new Date(e) <= horizon; })
    .sort((a, b) => (effectiveEnd(a) ?? '').localeCompare(effectiveEnd(b) ?? ''));

  const categoryStats = useMemo(() => {
    const nameToCategory: Record<string, string> = {};
    (settings.migrationTypes ?? []).forEach((t: { name?: string; category?: string }) => {
      if (t.name && t.category) nameToCategory[t.name.toLowerCase()] = t.category;
    });
    // Same categorisation as the main dashboard's Migration Type Overview.
    const getCategory = (migTypes: string): string => {
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
  }, [scoped, settings.migrationTypes]);

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

  if (projectsLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
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
        subtitle={fixedAm ? `Projects where ${fixedAm} is the Account Manager. Open = Active + On Hold.` : 'Click a card to focus every section on that account manager. Open = Active + On Hold.'}
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
      <SectionCard title="Account Manager Performance" subtitle="Total and completion include finished/archived projects (same as the main dashboard); delayed, escalated and overaged count current projects.">
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
              {amRows.map((r) => (
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
      </SectionCard>

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
