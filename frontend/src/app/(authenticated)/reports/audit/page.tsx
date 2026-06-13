'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';
import {
  Activity, Download, RefreshCw, Calendar, Users,
  Loader2, AlertCircle, Building2, FlaskConical,
  ChevronDown, ChevronUp, FolderKanban, CheckCircle,
  AlertTriangle, TrendingUp, Plus,
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function authFetch(url: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  }).then((r) => r.json());
}

function downloadCSV(rows: any[][], filename: string) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
}

const ROLE_META: Record<string, { label: string; color: string; bg: string; border: string; dot: string; icon: any }> = {
  PROJECT_MANAGER: {
    label: 'Project Managers',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
    icon: Users,
  },
  ACCOUNT_MANAGER: {
    label: 'Account Managers',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
    icon: Building2,
  },
  PRE_SALES: {
    label: 'Pre-Sales',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    icon: FlaskConical,
  },
};

type Mode = 'weekly' | 'monthly';
type SortKey = 'name' | 'totalProjects' | 'activeProjects' | 'completedProjects' | 'delayedProjects' | 'addedInPeriod' | 'closedInPeriod';

function todayStr() { return format(new Date(), 'yyyy-MM-dd'); }
function weekStart() { return format(subDays(new Date(), 7), 'yyyy-MM-dd'); }
function lastWeekStart() { return format(subDays(new Date(), 14), 'yyyy-MM-dd'); }
function lastWeekEnd() { return format(subDays(new Date(), 8), 'yyyy-MM-dd'); }
function monthStart(offset = 0) { return format(startOfMonth(subMonths(new Date(), offset)), 'yyyy-MM-dd'); }
function monthEnd(offset = 0) { return format(endOfMonth(subMonths(new Date(), offset)), 'yyyy-MM-dd'); }

export default function AuditDashboardPage() {
  const [mode, setMode] = useState<Mode>('weekly');
  // draft — what's shown in the date pickers
  const [draftStart, setDraftStart] = useState(weekStart);
  const [draftEnd, setDraftEnd] = useState(todayStr);
  // applied — drives the query (only changes on Apply or preset click)
  const [queryStart, setQueryStart] = useState(weekStart);
  const [queryEnd, setQueryEnd] = useState(todayStr);

  const [expandedRole, setExpandedRole] = useState<string | null>('PROJECT_MANAGER');
  const [sortKey, setSortKey] = useState<SortKey>('totalProjects');
  const [sortAsc, setSortAsc] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['auditUserProjectSummary', queryStart, queryEnd],
    queryFn: () =>
      authFetch(`${API_BASE}/api/audit/user-project-summary?startDate=${queryStart}&endDate=${queryEnd}`),
  });

  const summary = data?.data;

  function applyRange() {
    setQueryStart(draftStart);
    setQueryEnd(draftEnd);
  }

  function applyPreset(m: Mode, s: string, e: string) {
    setMode(m);
    setDraftStart(s);
    setDraftEnd(e);
    setQueryStart(s);
    setQueryEnd(e);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  function sorted(users: any[]) {
    return [...users].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortAsc ? cmp : -cmp;
    });
  }

  function handleExport() {
    if (!summary) return;
    const rows = [
      ['Name', 'Email', 'Role', 'Total Projects', 'Active', 'Completed', 'Cancelled', 'Delayed', 'At Risk', `Added (${queryStart}–${queryEnd})`, `Closed (${queryStart}–${queryEnd})`],
      ...summary.users.map((u: any) => [
        u.name, u.email, u.role,
        u.totalProjects, u.activeProjects, u.completedProjects, u.cancelledProjects,
        u.delayedProjects, u.atRiskProjects, u.addedInPeriod, u.closedInPeriod,
      ]),
    ];
    downloadCSV(rows, `audit-dashboard-${queryStart}-to-${queryEnd}.csv`);
  }

  const SortTh = ({ col, label }: { col: SortKey; label: string }) => (
    <th
      onClick={() => toggleSort(col)}
      className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-800 select-none whitespace-nowrap"
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === col ? (sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : null}
      </span>
    </th>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <nav className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Link href="/" className="hover:text-primary-600">Dashboard</Link>
            <span>/</span>
            <span className="text-gray-700">Audit Dashboard</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Activity size={22} className="text-primary-600" /> Audit Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Project activity per Project Manager, Account Manager &amp; Pre-Sales
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={!summary}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Date Controls */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          {/* Weekly / Monthly mode */}
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
            <button
              onClick={() => applyPreset('weekly', weekStart(), todayStr())}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'weekly' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Weekly
            </button>
            <button
              onClick={() => applyPreset('monthly', monthStart(), monthEnd())}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'monthly' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Monthly
            </button>
          </div>

          {/* Quick presets */}
          <div className="flex gap-1.5 flex-wrap">
            {mode === 'weekly' ? (
              <>
                <button
                  onClick={() => applyPreset('weekly', weekStart(), todayStr())}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
                >
                  This Week
                </button>
                <button
                  onClick={() => applyPreset('weekly', lastWeekStart(), lastWeekEnd())}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
                >
                  Last Week
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => applyPreset('monthly', monthStart(), monthEnd())}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
                >
                  This Month
                </button>
                <button
                  onClick={() => applyPreset('monthly', monthStart(1), monthEnd(1))}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
                >
                  Last Month
                </button>
              </>
            )}
          </div>

          {/* Manual date range */}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Calendar size={15} className="text-gray-400" />
            <input
              type="date"
              value={draftStart}
              onChange={(e) => setDraftStart(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-900"
            />
            <span className="text-sm text-gray-400">—</span>
            <input
              type="date"
              value={draftEnd}
              onChange={(e) => setDraftEnd(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-900"
            />
            <button
              onClick={applyRange}
              className="px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
        </div>
      ) : !summary ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <AlertCircle size={32} className="mr-3" /> Failed to load data
        </div>
      ) : (
        <>
          {/* Role KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['PROJECT_MANAGER', 'ACCOUNT_MANAGER', 'PRE_SALES'] as const).map((role) => {
              const meta = ROLE_META[role];
              const t = summary.totals[role];
              const Icon = meta.icon;
              return (
                <Card key={role} className={`border ${meta.border}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={18} className={meta.color} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-600">{meta.label}</p>
                      <p className={`text-3xl font-bold mt-0.5 ${meta.color}`}>{t.totalProjects}</p>
                      <div className="flex gap-3 mt-1.5 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />{t.active} active</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />{t.delayed} delayed</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />+{t.addedInPeriod} new</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{t.users} users</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Per-role expandable tables */}
          {(['PROJECT_MANAGER', 'ACCOUNT_MANAGER', 'PRE_SALES'] as const).map((role) => {
            const meta = ROLE_META[role];
            const users = sorted(summary.byRole[role] ?? []);
            const isOpen = expandedRole === role;
            const Icon = meta.icon;
            const t = summary.totals[role];

            return (
              <Card key={role} className="overflow-hidden p-0">
                {/* Section toggle header */}
                <button
                  onClick={() => setExpandedRole(isOpen ? null : role)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg ${meta.bg} flex items-center justify-center`}>
                      <Icon size={17} className={meta.color} />
                    </div>
                    <div>
                      <span className="font-semibold text-gray-800 text-sm">{meta.label}</span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${meta.bg} ${meta.color}`}>
                        {users.length} {users.length === 1 ? 'user' : 'users'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1.5"><FolderKanban size={12} className="text-gray-400" />{t.totalProjects} total</span>
                      <span className="flex items-center gap-1.5"><CheckCircle size={12} className="text-green-400" />{t.active} active</span>
                      <span className="flex items-center gap-1.5"><AlertTriangle size={12} className="text-red-400" />{t.delayed} delayed</span>
                      <span className="flex items-center gap-1.5"><Plus size={12} className="text-blue-400" />+{t.addedInPeriod} this period</span>
                    </div>
                    {isOpen ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100">
                    {users.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-10">No users with this role found.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50">
                              <SortTh col="name" label="User" />
                              <SortTh col="totalProjects" label="Projects in Period" />
                              <SortTh col="activeProjects" label="Active" />
                              <SortTh col="completedProjects" label="Completed" />
                              <SortTh col="delayedProjects" label="Delayed" />
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">At Risk</th>
                              <SortTh col="addedInPeriod" label="New" />
                              <SortTh col="closedInPeriod" label="Closed" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {users.map((u: any) => (
                              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2.5">
                                    <div className={`w-8 h-8 rounded-full ${meta.bg} flex items-center justify-center text-xs font-bold ${meta.color} flex-shrink-0`}>
                                      {u.name?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <div>
                                      <p className="font-medium text-gray-900 text-sm leading-tight">{u.name}</p>
                                      <p className="text-xs text-gray-400 leading-tight">{u.email}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`text-base font-bold ${meta.color}`}>{u.totalProjects}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="flex items-center gap-1 text-gray-700">
                                    <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                                    {u.activeProjects}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-gray-600">{u.completedProjects}</td>
                                <td className="px-4 py-3">
                                  {u.delayedProjects > 0 ? (
                                    <span className="flex items-center gap-1 text-red-600 font-medium">
                                      <AlertTriangle size={13} />{u.delayedProjects}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">0</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {u.atRiskProjects > 0 ? (
                                    <span className="text-amber-600 font-medium">{u.atRiskProjects}</span>
                                  ) : (
                                    <span className="text-gray-400">0</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {u.addedInPeriod > 0 ? (
                                    <span className="flex items-center gap-1 text-blue-600 font-medium">
                                      <TrendingUp size={13} />+{u.addedInPeriod}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">0</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {u.closedInPeriod > 0 ? (
                                    <span className="flex items-center gap-1 text-emerald-600 font-medium">
                                      <CheckCircle size={13} />{u.closedInPeriod}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">0</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}

          <p className="text-xs text-gray-400 text-center pb-2">
            Period: <strong>{format(new Date(queryStart), 'MMM d, yyyy')}</strong> — <strong>{format(new Date(queryEnd), 'MMM d, yyyy')}</strong>
            {' · '}Added/Closed columns reflect project activity within this period only.
          </p>
        </>
      )}
    </div>
  );
}
