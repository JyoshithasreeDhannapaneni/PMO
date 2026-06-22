'use client';

import { useState, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProjects } from '@/hooks/useProjects';
import { useSettings } from '@/context/SettingsContext';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';
import {
  Activity, Download, RefreshCw, Calendar, Users, User,
  Loader2, AlertCircle, Building2, FlaskConical,
  ChevronDown, ChevronUp, FolderKanban, CheckCircle,
  AlertTriangle, TrendingUp, Plus, Camera,
  Layers, FolderOpen, MessageSquare, Mail, Flag,
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { toPng } from 'html-to-image';
import type { Project } from '@/types';

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
  const [snapshotTab, setSnapshotTab] = useState<'snapshot' | 'delay' | 'final'>('snapshot');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['auditUserProjectSummary', queryStart, queryEnd],
    queryFn: () =>
      authFetch(`${API_BASE}/api/audit/user-project-summary?startDate=${queryStart}&endDate=${queryEnd}`),
  });

  const summary = data?.data;

  // Project Snapshot — live data from all projects (same source as /projects page)
  const { settings } = useSettings();
  const snapshotRef = useRef<HTMLDivElement>(null);
  const { data: allProjectsData, isLoading: isSnapshotLoading, refetch: refetchSnapshot } = useProjects({ limit: 10000 });

  // Shared lookup: migration type name → category bucket
  const nameToCategory = useMemo(() => {
    const map = new Map<string, string>();
    for (const mt of settings.migrationTypes) {
      map.set(mt.name.toLowerCase(), mt.category);
    }
    return map;
  }, [settings.migrationTypes]);

  // Returns which snapshot buckets ('content' | 'message' | 'email') the project belongs to
  const classify = (migrationTypes: string | null | undefined): Set<string> => {
    const cats = new Set<string>();
    if (!migrationTypes) return cats;
    for (const raw of migrationTypes.split(',')) {
      const cat = nameToCategory.get(raw.trim().toLowerCase());
      if (cat === 'Content Migration') cats.add('content');
      else if (cat === 'Messaging') cats.add('message');
      else if (cat === 'Email') cats.add('email');
    }
    return cats;
  };

  const snapshotStats = useMemo(() => {
    const projects: Project[] = allProjectsData?.data ?? [];
    const content = projects.filter(p => classify(p.migrationTypes).has('content'));
    const message = projects.filter(p => classify(p.migrationTypes).has('message'));
    const email   = projects.filter(p => classify(p.migrationTypes).has('email'));
    const uniqueIds = new Set([...content, ...message, ...email].map(p => p.id));

    const managers = [...new Set(projects.map(p => p.projectManager).filter(Boolean))].sort() as string[];
    const byManager = managers.map(manager => {
      const mp = projects.filter(p => p.projectManager === manager);
      const cSet = new Set(mp.filter(p => classify(p.migrationTypes).has('content')).map(p => p.id));
      const mSet = new Set(mp.filter(p => classify(p.migrationTypes).has('message')).map(p => p.id));
      const eSet = new Set(mp.filter(p => classify(p.migrationTypes).has('email')).map(p => p.id));
      const tSet = new Set([...cSet, ...mSet, ...eSet]);
      return { manager, c: cSet.size, m: mSet.size, e: eSet.size, t: tSet.size };
    }).filter(row => row.c > 0 || row.m > 0 || row.e > 0);

    return {
      totalUnique: uniqueIds.size,
      totalCount: content.length + message.length + email.length,
      contentCount: content.length,
      messageCount: message.length,
      emailCount: email.length,
      byManager,
    };
  }, [allProjectsData, nameToCategory]);

  // Delay summary rows — all DELAYED/AT_RISK projects with a positive delayDays
  const delayRows = useMemo(() => {
    const projects: Project[] = allProjectsData?.data ?? [];
    return projects
      .filter(p => p.delayDays > 0 && p.delayStatus !== 'NOT_DELAYED' && p.status !== 'COMPLETED' && p.status !== 'CANCELLED')
      .map(p => {
        const cats = classify(p.migrationTypes);
        const primaryCategory = cats.has('email') ? 'Email' : cats.has('message') ? 'Message' : cats.has('content') ? 'Content' : 'Other';
        const days = p.delayDays;
        const severity: 'Moderate' | 'High' | 'Critical' = days >= 60 ? 'Critical' : days >= 30 ? 'High' : 'Moderate';
        const duration = days >= 60 ? '> 2 Months' : days >= 30 ? '> 1 Month' : '< 1 Month';
        return { ...p, primaryCategory, severity, duration };
      })
      .sort((a, b) => {
        const order = { Moderate: 0, High: 1, Critical: 2 };
        return order[a.severity] - order[b.severity];
      });
  }, [allProjectsData, nameToCategory]);

  // Final Validation tab — projects whose current phase contains "final"
  const finalValidationRows = useMemo(() => {
    const projects: Project[] = allProjectsData?.data ?? [];
    return projects
      .filter(p =>
        p.phase?.toLowerCase().includes('final') &&
        p.status !== 'COMPLETED' &&
        p.status !== 'CANCELLED'
      )
      .map(p => {
        const cats = classify(p.migrationTypes);
        const primaryCategory = cats.has('email') ? 'Email' : cats.has('message') ? 'Message' : cats.has('content') ? 'Content' : 'Other';
        return { ...p, primaryCategory };
      })
      .sort((a, b) => a.projectManager.localeCompare(b.projectManager));
  }, [allProjectsData, nameToCategory]);

  const handleDownloadSnapshot = async () => {
    if (!snapshotRef.current) return;
    try {
      const dataUrl = await toPng(snapshotRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      const label = snapshotTab === 'delay' ? 'delay-summary' : snapshotTab === 'final' ? 'final-validation' : 'project-snapshot';
      a.download = `${label}-${format(new Date(), 'yyyy-MM-dd')}.png`;
      a.click();
    } catch (err) {
      console.error('Snapshot export failed:', err);
    }
  };

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

      {/* ── Project Snapshot ─────────────────────────────────────────── */}
      <div className="border-t border-gray-200 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Camera size={18} className="text-primary-600" /> Project Reports
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Live data from all projects — refreshes with current data from the Projects page
            </p>
          </div>
          {/* Sub-tabs */}
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
            <button
              onClick={() => setSnapshotTab('snapshot')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${snapshotTab === 'snapshot' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Project Snapshot
            </button>
            <button
              onClick={() => setSnapshotTab('delay')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${snapshotTab === 'delay' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Delay Summary
              {delayRows.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded-full font-semibold">{delayRows.length}</span>
              )}
            </button>
            <button
              onClick={() => setSnapshotTab('final')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${snapshotTab === 'final' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Final Validation
              {finalValidationRows.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-semibold">{finalValidationRows.length}</span>
              )}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetchSnapshot()}
              disabled={isSnapshotLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={isSnapshotLoading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button
              onClick={handleDownloadSnapshot}
              disabled={isSnapshotLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-40"
            >
              <Camera size={14} /> {snapshotTab === 'delay' ? 'Download Delay Image' : snapshotTab === 'final' ? 'Download Image' : 'Download Image'}
            </button>
          </div>
        </div>

        {isSnapshotLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : snapshotTab === 'snapshot' ? (
          <div ref={snapshotRef} className="bg-white rounded-xl p-5 border border-gray-200" style={{ minWidth: 820 }}>
            {/* Top stat cards */}
            <div className="grid grid-cols-5 gap-3 mb-5">
              {[
                {
                  label: 'TOTAL UNIQUE PROJECTS',
                  value: snapshotStats.totalUnique,
                  desc: 'Unique projects after removing duplicates across Content, Message and Email.',
                  Icon: Users,
                  headerBg: 'bg-[#1e3a8a]',
                },
                {
                  label: 'TOTAL PROJECT COUNT',
                  value: snapshotStats.totalCount,
                  desc: 'Total project records across Content, Message and Email.',
                  Icon: Layers,
                  headerBg: 'bg-[#2563eb]',
                },
                {
                  label: 'CONTENT PROJECTS',
                  value: snapshotStats.contentCount,
                  desc: 'Total Content project records.',
                  Icon: FolderOpen,
                  headerBg: 'bg-[#0284c7]',
                },
                {
                  label: 'MESSAGE PROJECTS',
                  value: snapshotStats.messageCount,
                  desc: 'Total Message project records.',
                  Icon: MessageSquare,
                  headerBg: 'bg-[#4f46e5]',
                },
                {
                  label: 'EMAIL PROJECTS',
                  value: snapshotStats.emailCount,
                  desc: 'Total Email project records.',
                  Icon: Mail,
                  headerBg: 'bg-[#7c3aed]',
                },
              ].map(({ label, value, desc, Icon, headerBg }) => (
                <div key={label} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  <div className={`${headerBg} px-3 py-2.5 flex items-start gap-2`}>
                    <Icon size={15} className="text-white opacity-80 mt-0.5 shrink-0" />
                    <span className="text-white text-xs font-bold tracking-wide leading-tight">{label}</span>
                  </div>
                  <div className="px-3 pt-3 pb-4 text-center">
                    <p className="text-4xl font-extrabold text-gray-900 leading-none">{value}</p>
                    <p className="text-xs text-gray-500 mt-2 leading-snug">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Manager breakdown table */}
            <div className="rounded-xl overflow-hidden border border-gray-200">
              <div className="bg-[#1e3a8a] px-5 py-3">
                <span className="text-white text-sm font-bold uppercase tracking-wider">
                  Unique Projects by Migration Manager (Duplicates Removed)
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-blue-50/70">
                  <tr>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-[#1e3a8a] w-10">#</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-[#1e3a8a]">Migration Manager</th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-[#1e3a8a]">
                      <div className="flex flex-col items-center gap-0.5">
                        <FolderOpen size={13} className="text-sky-500" />
                        <span>Content Projects</span>
                        <span className="font-normal text-gray-400">(Unique)</span>
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-[#1e3a8a]">
                      <div className="flex flex-col items-center gap-0.5">
                        <MessageSquare size={13} className="text-indigo-500" />
                        <span>Message Projects</span>
                        <span className="font-normal text-gray-400">(Unique)</span>
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-[#1e3a8a]">
                      <div className="flex flex-col items-center gap-0.5">
                        <Mail size={13} className="text-violet-500" />
                        <span>Email Projects</span>
                        <span className="font-normal text-gray-400">(Unique)</span>
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center text-xs font-semibold text-[#1e3a8a]">
                      <div className="flex flex-col items-center gap-0.5">
                        <Users size={13} className="text-[#1e3a8a]" />
                        <span>Total Unique</span>
                        <span className="font-normal text-gray-400">Projects</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {snapshotStats.byManager.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-gray-400">No project data available</td>
                    </tr>
                  ) : snapshotStats.byManager.map((row, i) => (
                    <tr key={row.manager} className="border-t border-gray-100 hover:bg-gray-50/50">
                      <td className="py-2.5 px-4 text-gray-400 text-xs">{i + 1}</td>
                      <td className="py-2.5 px-4 font-medium text-gray-800">{row.manager}</td>
                      <td className="py-2.5 px-4 text-center text-gray-700">{row.c || <span className="text-gray-300">—</span>}</td>
                      <td className="py-2.5 px-4 text-center text-gray-700">{row.m || <span className="text-gray-300">—</span>}</td>
                      <td className="py-2.5 px-4 text-center text-gray-700">{row.e || <span className="text-gray-300">—</span>}</td>
                      <td className="py-2.5 px-4 text-center font-bold text-[#1e3a8a]">{row.t}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[#1e3a8a]/20 bg-blue-50/40">
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4 font-bold text-[#1e3a8a] uppercase text-xs tracking-wider">Total</td>
                    <td className="py-3 px-4 text-center font-bold text-sky-600">{snapshotStats.contentCount}</td>
                    <td className="py-3 px-4 text-center font-bold text-indigo-600">{snapshotStats.messageCount}</td>
                    <td className="py-3 px-4 text-center font-bold text-violet-600">{snapshotStats.emailCount}</td>
                    <td className="py-3 px-4 text-center font-bold text-[#1e3a8a]">{snapshotStats.totalUnique}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : snapshotTab === 'delay' ? (
          /* ── Delay Summary tab ────────────────────────────────────── */
          <div ref={snapshotRef} className="bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ minWidth: 900, width: '100%' }}>
            {/* Title bar */}
            <div className="bg-[#1e3a8a] px-6 py-4 text-center">
              <h3 className="text-white text-xl font-bold tracking-wide">Project Delay Summary</h3>
            </div>

            {delayRows.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-16">No delayed projects found</p>
            ) : (
              <>
                <div>
                  <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                    <thead>
                      <tr className="bg-[#1e3a8a]">
                        {['Migration Manager', 'Category', 'Project Name', 'Account Manager', 'Delay Duration', 'Delay Severity'].map(h => (
                          <th key={h} className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wide">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {delayRows.map((row, i) => {
                        const severityStyle =
                          row.severity === 'Critical' ? 'bg-red-600 text-white' :
                          row.severity === 'High'     ? 'bg-orange-400 text-white' :
                                                        'bg-yellow-200 text-yellow-800';
                        const catIcon =
                          row.primaryCategory === 'Email'   ? <Mail size={14} className="text-emerald-500" /> :
                          row.primaryCategory === 'Message' ? <MessageSquare size={14} className="text-red-500" /> :
                                                              <FolderOpen size={14} className="text-blue-600" />;
                        const catColor =
                          row.primaryCategory === 'Email'   ? 'text-emerald-600' :
                          row.primaryCategory === 'Message' ? 'text-red-500' :
                                                              'text-blue-600';
                        return (
                          <tr key={`${row.id}-${i}`} className="border-t border-gray-100 hover:bg-gray-50/50">
                            <td className="px-4 py-3 text-center font-medium text-gray-800">{row.projectManager}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1.5">
                                {catIcon}
                                <span className={`font-semibold text-xs ${catColor}`}>{row.primaryCategory}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center text-gray-800">{row.name}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1.5 text-gray-700">
                                <Users size={13} className="text-gray-400 shrink-0" />
                                {row.accountManager || '—'}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center text-gray-700">{row.duration}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-block px-3 py-1 rounded font-semibold text-xs ${severityStyle}`}>
                                {row.severity}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-5 px-5 py-3 border-t border-gray-100 bg-gray-50/60">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-yellow-300 inline-block" />
                    <span className="text-xs text-gray-600">Moderate (&lt; 1 Month)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" />
                    <span className="text-xs text-gray-600">High (&gt; 1 Month)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-600 inline-block" />
                    <span className="text-xs text-gray-600">Critical (&gt; 2 Months)</span>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          /* ── Final Validation tab ─────────────────────────────────── */
          (() => {
            const PURPLE = '#2d1b6e';
            const msgCount  = finalValidationRows.filter(r => r.primaryCategory === 'Message').length;
            const contCount = finalValidationRows.filter(r => r.primaryCategory === 'Content').length;
            const emailCount= finalValidationRows.filter(r => r.primaryCategory === 'Email').length;
            const amCount   = new Set(finalValidationRows.map(r => r.accountManager).filter(Boolean)).size;
            const stageName = finalValidationRows[0]?.phase ?? 'Final Validation';

            const summaryCards = [
              { label: 'TOTAL PROJECTS',    value: finalValidationRows.length, Icon: Users },
              { label: 'MESSAGE PROJECTS',  value: msgCount,  Icon: MessageSquare },
              { label: 'CONTENT PROJECTS',  value: contCount, Icon: FolderOpen },
              { label: 'EMAIL PROJECTS',    value: emailCount,Icon: Mail },
              { label: 'ACCOUNT MANAGERS',  value: amCount,   Icon: User },
              { label: 'CURRENT STAGE',     value: null, text: stageName, Icon: Flag },
            ];

            return (
              <div ref={snapshotRef} className="bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ minWidth: 900, width: '100%' }}>
                {/* Title */}
                <div style={{ background: PURPLE }} className="px-6 py-4 text-center">
                  <h3 className="text-white text-xl font-bold tracking-wide">Projects in Final Validation</h3>
                </div>

                {finalValidationRows.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-16">No projects currently in final validation</p>
                ) : (
                  <>
                    <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                      <thead>
                        <tr style={{ background: '#f0edff' }}>
                          {[
                            { label: 'Migration Manager', Icon: Users },
                            { label: 'Migration Type',    Icon: FolderOpen },
                            { label: 'Project Name',      Icon: Building2 },
                            { label: 'Account Manager',   Icon: User },
                            { label: 'Status',            Icon: CheckCircle },
                            { label: 'Current Stage',     Icon: Flag },
                          ].map(({ label, Icon }) => (
                            <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: PURPLE }}>
                              <div className="flex items-center justify-center gap-1.5">
                                <Icon size={13} style={{ color: PURPLE }} />
                                {label}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {finalValidationRows.map((row, i) => {
                          const catIcon =
                            row.primaryCategory === 'Email'   ? <Mail size={14} className="text-emerald-500" /> :
                            row.primaryCategory === 'Message' ? <MessageSquare size={14} className="text-purple-500" /> :
                                                                <FolderOpen size={14} className="text-purple-700" />;
                          const catColor =
                            row.primaryCategory === 'Email'   ? 'text-emerald-600' :
                            row.primaryCategory === 'Message' ? 'text-purple-600' :
                                                                'text-purple-800';
                          return (
                            <tr key={`${row.id}-${i}`} className="border-t border-gray-100 hover:bg-purple-50/30">
                              <td className="px-4 py-3 text-center font-medium text-gray-800">{row.projectManager}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center gap-1.5">
                                  {catIcon}
                                  <span className={`font-semibold text-xs ${catColor}`}>{row.primaryCategory}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center text-gray-800">{row.name}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center gap-1.5 text-gray-700">
                                  <User size={13} className="text-gray-400 shrink-0" />
                                  {row.accountManager || '—'}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                                  <span className="text-gray-700 text-xs">{row.status === 'ACTIVE' ? 'Active' : row.status}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center text-xs text-gray-600">{row.phase}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Summary cards */}
                    <div className="grid grid-cols-6 gap-3 px-5 py-5" style={{ background: PURPLE }}>
                      {summaryCards.map(({ label, value, text, Icon }) => (
                        <div key={label} className="flex flex-col items-center gap-2">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
                            <Icon size={20} className="text-white" />
                          </div>
                          <div className="text-center">
                            <p className="text-white text-xs font-semibold uppercase tracking-wide leading-tight">{label}</p>
                            {text ? (
                              <p className="text-yellow-300 text-sm font-bold leading-tight mt-0.5">{text}</p>
                            ) : (
                              <p className="text-white text-2xl font-extrabold leading-none mt-0.5">{value}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
