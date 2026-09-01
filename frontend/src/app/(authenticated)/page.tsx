'use client';

import { useState, useEffect, useMemo } from 'react';
import { useDashboard, useManagerStats, useProjectsByMigrationType, useOveragedProjects, useEscalatedProjects, useProjects } from '@/hooks/useProjects';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';
import {
  Loader2, FolderKanban, PlayCircle, CheckCircle, PauseCircle,
  AlertTriangle, AlertCircle, Clock, Activity, FileText,
  RefreshCw, ChevronRight, Plus, User, Users, Calendar,
  TrendingUp, X, Download, CalendarDays, UserCheck, Filter,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

type ViewMode = 'my' | 'overall';


/* ── Portfolio Status Donut ─────────────────────────────────────── */
function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  const R = 40, cx = 50, cy = 50, stroke = 14;
  const circumference = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-4">
      <svg width={100} height={100} viewBox="0 0 100 100">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dash = pct * circumference;
          const gap = circumference - dash;
          const rot = -90 + (offset / total) * 360;
          offset += seg.value;
          return (
            <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={seg.color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${gap}`} strokeDashoffset={(-circumference * (-90 - rot + 90)) / 360}
              style={{ transform: `rotate(${rot}deg)`, transformOrigin: '50px 50px' }} />
          );
        })}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="text-xs font-bold fill-gray-700" fontSize={12}>
          {total}
        </text>
      </svg>
      <div className="space-y-1.5">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
            <span className="text-gray-600 flex-1">{seg.label}</span>
            <span className="font-semibold text-gray-800">{seg.value}</span>
            <span className="text-gray-400">({Math.round((seg.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Bar Chart ──────────────────────────────────────────────────── */
function BarChart({ bars }: { bars: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="flex items-end gap-3 h-28">
      {bars.map((b) => (
        <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs font-semibold text-gray-700">{b.value}</span>
          <div className="w-full rounded-t-md transition-all" style={{ height: `${(b.value / max) * 80}px`, background: b.color, minHeight: b.value > 0 ? 8 : 0 }} />
          <span className="text-xs text-gray-500 text-center leading-tight">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Escalate Control (inline priority picker + button) ─────────── */
function EscalateControl({ projectId, isEscalated, defaultPriority, busy, onEscalate }: {
  projectId: string; isEscalated: boolean; defaultPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  busy: boolean; onEscalate: (p: 'LOW'|'MEDIUM'|'HIGH') => Promise<void>;
}) {
  const [priority, setPriority] = useState<'LOW'|'MEDIUM'|'HIGH'>(defaultPriority);
  if (isEscalated) return null; // already escalated rows handled differently
  return (
    <div className="flex items-center gap-1.5 justify-center">
      <select
        value={priority}
        onChange={e => setPriority(e.target.value as any)}
        disabled={busy}
        onClick={e => e.stopPropagation()}
        className="text-xs px-1.5 py-1 border border-blue-100 rounded-lg bg-white text-gray-700 focus:outline-none cursor-pointer"
      >
        <option value="LOW">🟢 Low</option>
        <option value="MEDIUM">🟡 Medium</option>
        <option value="HIGH">🔴 High</option>
      </select>
      <button
        disabled={busy}
        onClick={e => { e.stopPropagation(); onEscalate(priority); }}
        className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1 whitespace-nowrap"
      >
        {busy ? <Loader2 size={11} className="animate-spin"/> : <AlertTriangle size={11}/>} Escalate
      </button>
    </div>
  );
}

/* ── Migration Type Projects Modal ──────────────────────────────── */
function MigrationTypeModal({ type, onClose }: { type: string; onClose: () => void }) {
  const { data, isLoading } = useProjectsByMigrationType(type);
  const projects: any[] = data?.data || [];
  const CATEGORY_META: Record<string, { emoji: string; bg: string }> = {
    'Content Migration': { emoji: '📁', bg: 'bg-blue-600' },
    'Messaging':         { emoji: '💬', bg: 'bg-green-600' },
    'Email':             { emoji: '📧', bg: 'bg-purple-600' },
  };
  const meta = CATEGORY_META[type] || { emoji: '📦', bg: 'bg-blue-600' };
  const emoji = meta.emoji;
  const bg = meta.bg;
  const label = type;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className={`flex items-center justify-between p-5 ${bg} text-white`}>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{emoji}</span>
            <div>
              <h2 className="text-lg font-bold">{label} Projects</h2>
              <p className="text-xs opacity-80">{projects.length} project{projects.length !== 1 ? 's' : ''} found</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/20 transition-colors"><X size={17} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FolderKanban size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No {type.toLowerCase()} projects found</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-blue-100">
              <table className="w-full text-sm">
                <thead className="bg-blue-50/60">
                  <tr>
                    {['Project Name', 'Manager', 'Status', 'Phase', 'Delay'].map((h) => (
                      <th key={h} className={`py-2.5 px-3 font-medium text-gray-500 ${h === 'Project Name' ? 'text-left' : 'text-center'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p: any) => (
                    <tr key={p.id} className="border-t border-blue-50 hover:bg-blue-50/50 cursor-pointer" onClick={() => { window.location.href = `/projects/${p.id}`; onClose(); }}>
                      <td className="py-2.5 px-3 font-medium text-gray-900 max-w-[200px] truncate">{p.name}</td>
                      <td className="text-center py-2.5 px-3 text-gray-600 text-xs">{p.projectManager}</td>
                      <td className="text-center py-2.5 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${p.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : p.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' : p.status === 'ON_HOLD' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{p.status}</span>
                      </td>
                      <td className="text-center py-2.5 px-3 text-xs text-gray-500">{p.phase}</td>
                      <td className="text-center py-2.5 px-3">
                        {p.delayDays > 0 ? (
                          <span className="text-xs font-semibold text-red-600">+{p.delayDays}d</span>
                        ) : (
                          <span className="text-xs text-green-600">On Track</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-blue-100 flex justify-end">
          <Link href={`/projects?planType=${type}`} onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">
            <Filter size={13} /> View in Projects Page <ChevronRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── Main Dashboard ─────────────────────────────────────────────── */
function downloadProjectsCSV(projects: any[], filename: string) {
  const headers = [
    'Project Name', 'Customer', 'Project Manager', 'Account Manager', 'Status', 'Phase',
    'Plan Type', 'Migration Types', 'Source Platform', 'Target Platform',
    'SOW Start Date', 'SOW End Date', 'Kickoff Start Date', 'Project End Date',
    'Delay Status', 'Delay Days', 'Days Overdue',
    'Budget ($)', 'Actual Cost ($)', 'Overage Amount ($)',
    'Number of Servers', 'Project Memory', 'Is Overaged', 'Is Escalated',
    'Escalation Priority', 'Description', 'Notes', 'Created At',
  ];
  const rows = projects.map((p) => [
    p.name, p.customerName, p.projectManager, p.accountManager || '',
    p.status, p.phase, p.planType || '', p.migrationTypes || '',
    p.sourcePlatform || '', p.targetPlatform || '',
    p.plannedStart ? new Date(p.plannedStart).toLocaleDateString() : '',
    p.plannedEnd ? new Date(p.plannedEnd).toLocaleDateString() : '',
    p.actualStart ? new Date(p.actualStart).toLocaleDateString() : '',
    p.actualEnd ? new Date(p.actualEnd).toLocaleDateString() : '',
    p.delayStatus || '', p.delayDays ?? '', p.daysOverdue ?? '',
    p.estimatedCost ?? '', p.actualCost ?? '', p.overageAmount ?? '',
    p.numberOfServers ?? '', p.projectMemory || '',
    p.isOveraged ? 'Yes' : 'No', p.isEscalated ? 'Yes' : 'No',
    p.escalationPriority || '', p.description || '', p.notes || '',
    p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '',
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const dash = settings.dashboardSettings;
  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'PROJECT_MANAGER';
  const isViewer = user?.role === 'VIEWER';
  // ADMIN defaults to overall; MANAGER/others default to my
  const [viewMode, setViewMode] = useState<ViewMode>(isAdmin ? 'overall' : 'my');
  const pmFilter = viewMode === 'my' && user?.name ? `&projectManager=${encodeURIComponent(user.name)}` : '';
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedMigrationType, setSelectedMigrationType] = useState<string | null>(null);
  const [showOveragedPanel, setShowOveragedPanel] = useState(false);
  const [showEscalatedPanel, setShowEscalatedPanel] = useState(false);
  const [escalatingId, setEscalatingId] = useState<string | null>(null);
  const { showToast } = useToast();

  // MANAGER 'my': filter to their own projects
  // MANAGER 'overall': no filter — show full portfolio health across all managers
  // ADMIN 'my': filter to their own; ADMIN 'overall': no filter
  const managerFilter = viewMode === 'my' ? (user?.name ?? '') : undefined;
  const { data, isLoading, error, refetch } = useDashboard(managerFilter);
  const { data: managerData } = useManagerStats(managerFilter);
  const { data: overagedData, refetch: refetchOveraged } = useOveragedProjects(managerFilter);
  const { data: escalatedData, refetch: refetchEscalated } = useEscalatedProjects(managerFilter);
  const overagedProjects: any[] = overagedData?.data || [];
  const escalatedProjects: any[] = escalatedData?.data || [];

  // Fetch all projects for frontend category grouping
  const { data: allProjectsData } = useProjects({ status: undefined, limit: 500000 });
  const allProjectsList: any[] = (allProjectsData?.data || []).filter(
    (p: any) => viewMode === 'overall' || !managerFilter || p.projectManager === managerFilter
  );
  const activeProjectsList = allProjectsList.filter((p: any) => p.status !== 'COMPLETED' && p.status !== 'CANCELLED');
  const migrationProjectsCount = activeProjectsList.filter((p: any) => !p.projectType || p.projectType !== 'POC').length;
  const pocProjectsCount = activeProjectsList.filter((p: any) => p.projectType === 'POC').length;

  // Build category stats from settings + project data (reliable, no server-side grouping needed)
  const categoryStats = useMemo(() => {
    const nameToCategory: Record<string, string> = {};
    settings.migrationTypes.forEach((t: any) => {
      if (t.name && t.category) nameToCategory[t.name.toLowerCase()] = t.category;
    });

    const getCategory = (migTypes: string): string => {
      if (!migTypes) return 'Content Migration';
      for (const part of migTypes.split(',').map((s: string) => s.trim())) {
        const cat = nameToCategory[part.toLowerCase()];
        if (cat) return cat;
      }
      const u = migTypes.toUpperCase();
      if (['SLACK','TEAMS','CHAT','META','WEBEX','SKYPE','VIVA'].some(k => u.includes(k))) return 'Messaging';
      if (['GMAIL','OUTLOOK','EXCHANGE','OFFICE365','GOOGLE WORKSPACE','LOTUS','ZIMBRA'].some(k => u.includes(k))) return 'Email';
      return 'Content Migration';
    };

    const CATS = [
      { key: 'Content Migration', icon: '📁' },
      { key: 'Messaging',         icon: '💬' },
      { key: 'Email',             icon: '📧' },
    ];

    return CATS.map(({ key, icon }) => {
      const ps = allProjectsList.filter((p: any) => getCategory(p.migrationTypes || '') === key);
      return {
        type: key, name: key, icon,
        total:     ps.length,
        active:    ps.filter((p: any) => p.status === 'ACTIVE').length,
        completed: ps.filter((p: any) => p.status === 'COMPLETED').length,
        inactive:  ps.filter((p: any) => p.status === 'ON_HOLD').length,
        delayed:   ps.filter((p: any) => p.delayStatus === 'DELAYED').length,
        atRisk:    ps.filter((p: any) => p.delayStatus === 'AT_RISK').length,
        overaged:  ps.filter((p: any) => p.isOveraged).length,
        cancelled: ps.filter((p: any) => p.status === 'CANCELLED').length,
      };
    });
  }, [allProjectsList, settings.migrationTypes]);

  const portfolioStats = useMemo(() => {
    const active    = allProjectsList.filter((p: any) => p.status === 'ACTIVE').length;
    const completed = allProjectsList.filter((p: any) => p.status === 'COMPLETED').length;
    const onHold    = allProjectsList.filter((p: any) => p.status === 'ON_HOLD').length;
    const delayed   = allProjectsList.filter((p: any) => p.delayStatus === 'DELAYED').length;
    const atRisk    = allProjectsList.filter((p: any) => p.delayStatus === 'AT_RISK').length;
    return { active, completed, onHold, delayed, atRisk };
  }, [allProjectsList]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetch(), refetchOveraged(), refetchEscalated()]);
    setTimeout(() => setIsRefreshing(false), 600);
  };


  if (isLoading) return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto" />
        <p className="mt-4 text-gray-600">Loading dashboard…</p>
      </div>
    </div>
  );

  if (error || !data?.data) return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
        <h2 className="mt-4 text-xl font-semibold text-gray-900">Failed to load dashboard</h2>
        <p className="mt-2 text-gray-500">Please check if the backend server is running</p>
        <button onClick={handleRefresh} className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Try Again</button>
      </div>
    </div>
  );

  const { stats, projectsByStatus, projectsByPhase, recentActivity, delaySummary, upcomingDeadlines, migrationTypeStats } = data.data;
  const managers: any[] = managerData?.data || [];

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PMO Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Welcome back, {user?.name || 'Administrator'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle — all roles */}
          <div className="flex items-center bg-blue-50 border border-blue-200 rounded-xl p-1 gap-1">
            <button onClick={() => setViewMode('my')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'my' ? 'bg-white text-blue-700 shadow-sm border border-blue-200' : 'text-slate-500 hover:text-blue-600'}`}>
              <User size={13} />
              My View
            </button>
            <button onClick={() => setViewMode('overall')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'overall' ? 'bg-white text-blue-700 shadow-sm border border-blue-200' : 'text-slate-500 hover:text-blue-600'}`}>
              <Users size={13} />
              Overall View
            </button>
          </div>
          <span className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
            viewMode === 'my'
              ? 'bg-blue-100 text-blue-700'
              : isManager
                ? 'bg-blue-100 text-blue-700'
                : 'bg-purple-100 text-purple-700'
          }`}>
            {viewMode === 'my' ? <User size={10} /> : <Users size={10} />}
            {viewMode === 'my' ? 'My projects only' : 'All managers'}
          </span>
          <span className="text-xs text-gray-400 hidden md:block">Updated {format(new Date(), 'MMM d · h:mm a')}</span>
          <button onClick={handleRefresh} className={`p-2 rounded-lg bg-white border border-blue-200 hover:bg-blue-50 transition-all ${isRefreshing ? 'animate-spin' : ''}`}>
            <RefreshCw size={15} className="text-slate-500" />
          </button>
          {!isViewer && (
            <Link href="/projects/new" className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors">
              <Plus size={14} /> New Project
            </Link>
          )}
        </div>
      </div>

      {/* Context banner */}
      {isManager ? (
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
          <User size={14} className="flex-shrink-0" />
          <span>
            {viewMode === 'my'
              ? <><strong>My View</strong> — Showing projects assigned to <strong>{user?.name}</strong>.</>
              : <><strong>Overview</strong> — Showing full portfolio health across all managers.</>
            }
            {' '}Projects you create are automatically assigned to you.
          </span>
        </div>
      ) : viewMode === 'my' ? (
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
          <User size={14} className="flex-shrink-0" />
          <span><strong>My View</strong> — Showing projects assigned to <strong>{user?.name}</strong>.
            <button onClick={() => setViewMode('overall')} className="ml-2 underline hover:no-underline">Switch to Overall View →</button>
          </span>
        </div>
      ) : null}

      {/* ── KPI Row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href={`/projects?hideCompleted=true${pmFilter}`} className="col-span-2 lg:col-span-1 block group">
          <Card className="h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Total Projects</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalProjects}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {migrationProjectsCount > 0 && (
                    <span className="text-xs text-blue-500 font-medium">{migrationProjectsCount} migration</span>
                  )}
                  {migrationProjectsCount > 0 && pocProjectsCount > 0 && (
                    <span className="text-xs text-gray-300">·</span>
                  )}
                  {pocProjectsCount > 0 && (
                    <span className="text-xs text-violet-500 font-medium">{pocProjectsCount} POC</span>
                  )}
                  {pocProjectsCount === 0 && migrationProjectsCount === 0 && (
                    <span className="text-xs text-gray-400">Excl. completed &amp; cancelled</span>
                  )}
                </div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                <FolderKanban size={20} className="text-blue-600" />
              </div>
            </div>
          </Card>
        </Link>
        <Link href={`/projects?status=ACTIVE${pmFilter}`} className="block group">
          <Card className="h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg border-green-200">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-green-600 text-sm font-medium">Active</p>
                <p className="text-3xl font-bold text-green-700 mt-1">{stats.activeProjects}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {stats.delayedProjects > 0 && (
                    <span className="text-xs text-red-500 font-medium">{stats.delayedProjects} delayed</span>
                  )}
                  {stats.atRiskProjects > 0 && (
                    <span className="text-xs text-orange-500 font-medium">{stats.atRiskProjects} at risk</span>
                  )}
                  {stats.delayedProjects === 0 && stats.atRiskProjects === 0 && (
                    <span className="text-xs text-green-500">All on track</span>
                  )}
                </div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                <PlayCircle size={20} className="text-green-600" />
              </div>
            </div>
          </Card>
        </Link>
        <Link href={`/projects?status=ON_HOLD${pmFilter}`} className="block group">
          <Card className="h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg border-yellow-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-yellow-600 text-sm font-medium">On Hold</p>
                <p className="text-3xl font-bold text-yellow-700 mt-1">{stats.onHoldProjects}</p>
                <p className="text-xs text-yellow-500 mt-1">On hold projects</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-yellow-50 flex items-center justify-center">
                <PauseCircle size={20} className="text-yellow-600" />
              </div>
            </div>
          </Card>
        </Link>
        <Link href={`/projects?status=COMPLETED${pmFilter}`} className="block group">
          <Card className="h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-600 text-sm font-medium">Completed</p>
                <p className="text-3xl font-bold text-blue-700 mt-1">{stats.completedProjects}</p>
                <p className="text-xs text-blue-500 mt-1">Successfully closed</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                <CheckCircle size={20} className="text-blue-600" />
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {/* ── Quick Stats ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button type="button" onClick={() => setShowOveragedPanel(true)}
          className="block w-full text-left group focus:outline-none">
          <Card className="text-center py-3 h-full group-hover:shadow-lg group-hover:border-orange-300 transition-all">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center mx-auto mb-2">
              <Clock size={18} className="text-orange-600" />
            </div>
            <p className="text-2xl font-bold text-orange-600">{overagedProjects.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Overaged</p>
            <p className="text-[10px] text-orange-500 font-medium mt-1">View Overaged →</p>
          </Card>
        </button>

        <button type="button" onClick={() => setShowEscalatedPanel(true)}
          className="block w-full text-left group focus:outline-none">
          <Card className="text-center py-3 h-full group-hover:shadow-lg group-hover:border-red-300 transition-all">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center mx-auto mb-2">
              <AlertTriangle size={18} className="text-red-600" />
            </div>
            <p className="text-2xl font-bold text-red-600">{escalatedProjects.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Escalated</p>
            <p className="text-[10px] text-red-500 font-medium mt-1">View Escalated →</p>
          </Card>
        </button>

        <Link href="/case-studies" className="block group">
          <Card className="text-center py-3 h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center mx-auto mb-2">
              <FileText size={18} className="text-indigo-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.pendingCaseStudies}</p>
            <p className="text-xs text-gray-500 mt-0.5">Pending Cases</p>
          </Card>
        </Link>

        <Link href="/projects?delayStatus=DELAYED" className="block group">
          <Card className="text-center py-3 h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mx-auto mb-2">
              <TrendingUp size={18} className="text-gray-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.avgDelayDays}</p>
            <p className="text-xs text-gray-500 mt-0.5">Avg Delay (d)</p>
          </Card>
        </Link>
      </div>

      {/* ── Pending Case Studies Alert ──────────────────────────────── */}
      {stats.pendingCaseStudies > 0 && (
        <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-300 rounded-xl">
          <div className="w-9 h-9 rounded-lg bg-yellow-100 flex items-center justify-center flex-shrink-0">
            <FileText size={18} className="text-yellow-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-yellow-800">
              {stats.pendingCaseStudies} case {stats.pendingCaseStudies === 1 ? 'study' : 'studies'} pending completion
            </p>
            <p className="text-xs text-yellow-600 mt-0.5">
              Projects that are completed or closed need their case studies documented.
            </p>
          </div>
          <Link
            href="/case-studies"
            className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 bg-yellow-600 text-white rounded-lg text-xs font-medium hover:bg-yellow-700 transition-colors"
          >
            Complete Now <ChevronRight size={12} />
          </Link>
        </div>
      )}

      {/* ── Overaged Projects Panel ──────────────────────────────────── */}
      {showOveragedPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowOveragedPanel(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 bg-orange-500 text-white">
              <div className="flex items-center gap-2">
                <Clock size={20} />
                <div>
                  <h2 className="text-base font-bold">Overaged Projects</h2>
                  <p className="text-xs opacity-80">{overagedProjects.length} projects past their due date — click a row to open, or escalate directly</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => downloadProjectsCSV(overagedProjects, 'overaged-projects.csv')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors">
                  <Download size={13}/> Download All
                </button>
                <button onClick={() => setShowOveragedPanel(false)} className="p-1.5 rounded-lg hover:bg-white/20"><X size={16}/></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {overagedProjects.length === 0 ? (
                <div className="text-center py-16 text-gray-400"><CheckCircle size={40} className="mx-auto mb-3 text-green-400"/><p className="font-medium">No overaged projects 🎉</p></div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-blue-50/60 sticky top-0 z-10">
                    <tr>
                      {['Project Name','Manager','Due Date','Days Overdue','Status','Escalate','Download'].map(h => (
                        <th key={h} className={`py-2.5 px-3 font-semibold text-gray-500 text-xs uppercase tracking-wide ${h==='Project Name'?'text-left':'text-center'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {overagedProjects.map((p: any) => (
                      <tr key={p.id} className="border-t border-blue-50 hover:bg-orange-50 group">
                        {/* Project name — click to navigate */}
                        <td className="py-3 px-3">
                          <Link href={`/projects/${p.id}`} onClick={() => setShowOveragedPanel(false)}
                            className="font-semibold text-gray-900 hover:text-orange-600 flex items-center gap-1.5 group-hover:underline">
                            {p.name}
                            <ChevronRight size={13} className="opacity-0 group-hover:opacity-100 text-orange-500 transition-opacity"/>
                          </Link>
                          <p className="text-[11px] text-gray-400 mt-0.5">{p.customerName}</p>
                        </td>
                        <td className="text-center py-3 px-3 text-gray-600 text-xs">{p.projectManager}</td>
                        <td className="text-center py-3 px-3 text-gray-500 text-xs">{new Date(p.plannedEnd).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                        <td className="text-center py-3 px-3">
                          <span className={`font-bold text-sm ${p.daysOverdue >= 14 ? 'text-red-600' : 'text-orange-600'}`}>{p.daysOverdue}d</span>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">Overaged</span>
                        </td>
                        {/* Escalate action with inline priority selector */}
                        <td className="text-center py-3 px-3" onClick={e => e.stopPropagation()}>
                          {isViewer ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : (
                            <EscalateControl
                              projectId={p.id}
                              isEscalated={false}
                              defaultPriority={p.daysOverdue >= 14 ? 'HIGH' : p.daysOverdue >= 7 ? 'MEDIUM' : 'LOW'}
                              busy={escalatingId === p.id}
                              onEscalate={async (priority) => {
                                setEscalatingId(p.id);
                                const token = localStorage.getItem('token');
                                await fetch(`${process.env.NEXT_PUBLIC_API_URL||'http://localhost:3001'}/api/dashboard/escalate/${p.id}`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ priority }),
                                });
                                setEscalatingId(null);
                                await Promise.all([refetchOveraged(), refetchEscalated()]);
                              }}
                            />
                          )}
                        </td>
                        <td className="text-center py-3 px-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadProjectsCSV([p], `${p.name.replace(/[^a-z0-9]/gi,'_')}.csv`); }}
                            className="text-xs text-orange-600 hover:text-orange-800 border border-orange-200 hover:border-orange-400 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 mx-auto"
                            title="Download project data"
                          >
                            <Download size={11}/> CSV
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-5 py-3 border-t border-blue-100 flex justify-between items-center bg-gray-50">
              <p className="text-xs text-gray-400">Click project name to open · Set priority and escalate in one click</p>
              <Link href="/projects" onClick={() => setShowOveragedPanel(false)} className="text-xs text-orange-600 font-semibold hover:underline">View All Projects →</Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Escalated Projects Panel ─────────────────────────────────── */}
      {showEscalatedPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowEscalatedPanel(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 bg-red-600 text-white">
              <div className="flex items-center gap-2">
                <AlertTriangle size={20} />
                <div>
                  <h2 className="text-base font-bold">Escalated Projects</h2>
                  <p className="text-xs opacity-80">{escalatedProjects.length} projects requiring immediate attention — change priority or remove escalation inline</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => downloadProjectsCSV(escalatedProjects, 'escalated-projects.csv')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors">
                  <Download size={13}/> Download All
                </button>
                <button onClick={() => setShowEscalatedPanel(false)} className="p-1.5 rounded-lg hover:bg-white/20"><X size={16}/></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {escalatedProjects.length === 0 ? (
                <div className="text-center py-16 text-gray-400"><CheckCircle size={40} className="mx-auto mb-3 text-green-400"/><p className="font-medium">No escalated projects 🎉</p></div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-blue-50/60 sticky top-0 z-10">
                    <tr>
                      {['Project Name','Manager','Days Delayed','Change Priority','Status','Action','Download'].map(h => (
                        <th key={h} className={`py-2.5 px-3 font-semibold text-gray-500 text-xs uppercase tracking-wide ${h==='Project Name'?'text-left':'text-center'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {escalatedProjects.map((p: any) => (
                      <tr key={p.id} className="border-t border-blue-50 hover:bg-red-50 group">
                        {/* Project name — click to navigate */}
                        <td className="py-3 px-3">
                          <Link href={`/projects/${p.id}`} onClick={() => setShowEscalatedPanel(false)}
                            className="font-semibold text-gray-900 hover:text-red-600 flex items-center gap-1.5 group-hover:underline">
                            {p.name}
                            <ChevronRight size={13} className="opacity-0 group-hover:opacity-100 text-red-500 transition-opacity"/>
                          </Link>
                          <p className="text-[11px] text-gray-400 mt-0.5">{p.customerName}</p>
                        </td>
                        <td className="text-center py-3 px-3 text-gray-600 text-xs">{p.projectManager}</td>
                        <td className="text-center py-3 px-3">
                          <span className={`font-bold text-sm ${p.delayDays >= 14 ? 'text-red-600' : 'text-orange-500'}`}>{p.delayDays}d</span>
                        </td>
                        {/* Inline priority change */}
                        <td className="text-center py-3 px-3" onClick={e => e.stopPropagation()}>
                          <select
                            defaultValue={p.escalationPriority || 'MEDIUM'}
                            disabled={isViewer || escalatingId === p.id}
                            onChange={async (e) => {
                              const priority = e.target.value as 'LOW' | 'MEDIUM' | 'HIGH';
                              setEscalatingId(p.id);
                              const token = localStorage.getItem('token');
                              await fetch(`${process.env.NEXT_PUBLIC_API_URL||'http://localhost:3001'}/api/dashboard/escalate/${p.id}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ priority }),
                              });
                              setEscalatingId(null);
                              refetchEscalated();
                            }}
                            className={`text-xs font-semibold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-300 ${
                              p.escalationPriority==='HIGH' ? 'bg-red-50 border-red-200 text-red-700' :
                              p.escalationPriority==='MEDIUM' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                              'bg-gray-50 border-gray-200 text-gray-600'
                            }`}
                          >
                            <option value="LOW">🟢 Low</option>
                            <option value="MEDIUM">🟡 Medium</option>
                            <option value="HIGH">🔴 High</option>
                          </select>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.isEscalated ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                            {p.isEscalated ? 'Escalated' : 'Delayed'}
                          </span>
                        </td>
                        <td className="text-center py-3 px-3" onClick={e => e.stopPropagation()}>
                          {isViewer ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : p.isEscalated ? (
                            <button
                              disabled={escalatingId === p.id}
                              onClick={async () => {
                                setEscalatingId(p.id);
                                const token = localStorage.getItem('token');
                                await fetch(`${process.env.NEXT_PUBLIC_API_URL||'http://localhost:3001'}/api/dashboard/deescalate/${p.id}`, {
                                  method: 'POST', headers: { Authorization: `Bearer ${token}` },
                                });
                                setEscalatingId(null);
                                refetchEscalated();
                              }}
                              className="text-xs text-gray-500 hover:text-gray-800 border border-blue-100 hover:border-gray-400 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1 mx-auto"
                            >
                              {escalatingId === p.id ? <Loader2 size={11} className="animate-spin"/> : <X size={11}/>} Remove
                            </button>
                          ) : (
                            <button
                              disabled={escalatingId === p.id}
                              onClick={async () => {
                                setEscalatingId(p.id);
                                const token = localStorage.getItem('token');
                                const priority = p.delayDays >= 14 ? 'HIGH' : p.delayDays >= 7 ? 'MEDIUM' : 'LOW';
                                await fetch(`${process.env.NEXT_PUBLIC_API_URL||'http://localhost:3001'}/api/dashboard/escalate/${p.id}`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ priority }),
                                });
                                setEscalatingId(null);
                                refetchEscalated();
                              }}
                              className="text-xs text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1 mx-auto"
                            >
                              {escalatingId === p.id ? <Loader2 size={11} className="animate-spin"/> : <AlertTriangle size={11}/>} Escalate
                            </button>
                          )}
                        </td>
                        <td className="text-center py-3 px-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadProjectsCSV([p], `${p.name.replace(/[^a-z0-9]/gi,'_')}.csv`); }}
                            className="text-xs text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 mx-auto"
                            title="Download project data"
                          >
                            <Download size={11}/> CSV
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-5 py-3 border-t border-blue-100 flex justify-between items-center bg-gray-50">
              <p className="text-xs text-gray-400">Click project name to open · Change priority inline · Escalate or remove directly</p>
              <Link href="/projects?delayStatus=DELAYED" onClick={() => setShowEscalatedPanel(false)} className="text-xs text-red-600 font-semibold hover:underline">View All Delayed Projects →</Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Migration Type Overview ────────────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Migration Type Overview</h2>
          <Link href="/projects" className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1">View All <ChevronRight size={14} /></Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {categoryStats.map((stat: any) => {
            const palettes: Record<string, { cardCls: string; textCls: string }> = {
              'Content Migration': { cardCls: 'bg-blue-50 border-blue-200',     textCls: 'text-blue-700' },
              'Messaging':         { cardCls: 'bg-green-50 border-green-200',   textCls: 'text-green-700' },
              'Email':             { cardCls: 'bg-purple-50 border-purple-200', textCls: 'text-purple-700' },
            };
            const palette = palettes[stat.type] || palettes['Content Migration'];
            return (
              <button key={stat.type} onClick={() => setSelectedMigrationType(stat.type)}
                className={`p-4 rounded-xl border ${palette.cardCls} hover:opacity-90 transition-opacity text-left w-full cursor-pointer`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{stat.icon || '📦'}</span>
                  <span className={`text-sm font-semibold ${palette.textCls}`}>{stat.name}</span>
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-2">{stat.total}</div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <span className="flex items-center gap-1 text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />{stat.active} Active</span>
                  <span className="flex items-center gap-1 text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />{stat.completed} Done</span>
                  <span className="flex items-center gap-1 text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />{stat.overaged} Overaged</span>
                  <span className="flex items-center gap-1 text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />{stat.delayed} Delayed</span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── Two-col: Portfolio Health + Delayed Projects ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Portfolio Health */}
        {dash.showCharts && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Portfolio Health</h3>
              <Link href="/projects" className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-0.5">View Details <ChevronRight size={12} /></Link>
            </div>
            <DonutChart segments={[
              { label: 'On Track',  value: Math.max(0, portfolioStats.active - portfolioStats.delayed - portfolioStats.atRisk), color: '#22c55e' },
              { label: 'At Risk',   value: portfolioStats.atRisk,    color: '#f97316' },
              { label: 'Delayed',   value: portfolioStats.delayed,   color: '#ef4444' },
              { label: 'On Hold',   value: portfolioStats.onHold,    color: '#eab308' },
              { label: 'Completed', value: portfolioStats.completed, color: '#3b82f6' },
            ].filter((s) => s.value > 0)} />
            <div className="mt-4 space-y-2 border-t border-blue-50 pt-3">
              {(() => {
                const grandTotal = portfolioStats.active + portfolioStats.completed + portfolioStats.onHold;
                return [
                  { label: 'Active',    value: portfolioStats.active,    sub: `${portfolioStats.delayed} delayed · ${portfolioStats.atRisk} at risk`, iconColor: 'text-green-600', barColor: 'bg-green-500', icon: PlayCircle },
                  { label: 'Completed', value: portfolioStats.completed, sub: null, iconColor: 'text-blue-600',  barColor: 'bg-blue-500',  icon: CheckCircle },
                  { label: 'On Hold',   value: portfolioStats.onHold,    sub: null, iconColor: 'text-yellow-600', barColor: 'bg-yellow-500', icon: PauseCircle },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 w-24 flex-shrink-0">
                      <item.icon size={13} className={item.iconColor} />
                      <span className="text-xs text-gray-700">{item.label}</span>
                    </div>
                    <div className="flex-1 bg-blue-100 rounded-full h-2">
                      <div className={`${item.barColor} h-2 rounded-full transition-all`}
                        style={{ width: `${grandTotal > 0 ? (item.value / grandTotal) * 100 : 0}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-900 w-5 text-right">{item.value}</span>
                  </div>
                ));
              })()}
            </div>
          </Card>
        )}

        {/* Delayed Projects */}
        {dash.showDelayedProjects && (
          <Card className={delaySummary?.topDelayed?.length > 0 ? 'border-red-200 bg-red-50' : ''}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Delayed Projects</h3>
              {delaySummary?.topDelayed?.length > 0 && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">Action Required</span>
              )}
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {delaySummary?.topDelayed?.length > 0 ? delaySummary.topDelayed.map((project: any) => (
                <Link key={project.id} href={`/projects/${project.id}`}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-red-200 hover:border-red-400 transition-all">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{project.name}</p>
                    <p className="text-xs text-gray-500 truncate">{project.customerName}</p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0 ml-2">
                    <span className="text-sm font-bold text-red-600">+{project.delayDays}d</span>
                    <span className="text-[10px] text-gray-400">{project.projectManager}</span>
                  </div>
                </Link>
              )) : (
                <div className="text-center py-8 text-green-600">
                  <CheckCircle size={28} className="mx-auto mb-1" />
                  <p className="text-xs font-medium">All projects on track!</p>
                </div>
              )}
            </div>
            {delaySummary?.topDelayed?.length > 0 && (
              <Link href="/projects?delayStatus=DELAYED" className="mt-2 text-xs text-red-600 font-medium flex items-center justify-end gap-0.5 hover:underline">
                View All Delayed <ChevronRight size={12} />
              </Link>
            )}
          </Card>
        )}
      </div>

      {/* ── Two-col: Manager Performance + (Deadlines + Notifications) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Manager Performance */}
        {managers.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Users size={16} className="text-primary-600" /> Manager Performance
              </h3>
              {isAdmin && (
                <Link href="/manager-dashboard" className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-0.5">
                  View Details <ChevronRight size={12} />
                </Link>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-blue-50/60">
                  <tr>
                    {['Project Manager', 'Total', 'Active', 'Completed', 'Delayed', 'Completion'].map((h) => (
                      <th key={h} className={`py-2 px-3 font-medium text-gray-500 text-xs ${h === 'Project Manager' ? 'text-left' : 'text-center'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {managers.map((m: any) => (
                    <tr key={m.manager} className="border-t border-blue-50 hover:bg-blue-50/50">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700 flex-shrink-0">
                            {m.manager.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-800 text-xs">{m.manager}</span>
                        </div>
                      </td>
                      <td className="text-center py-2.5 px-3 font-semibold text-gray-700 text-xs">{m.total}</td>
                      <td className="text-center py-2.5 px-3">
                        <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">{m.active}</span>
                      </td>
                      <td className="text-center py-2.5 px-3">
                        <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">{m.completed}</span>
                      </td>
                      <td className="text-center py-2.5 px-3">
                        <span className={`inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-xs font-semibold ${m.delayed > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'}`}>{m.delayed}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2 justify-center">
                          <div className="flex-1 max-w-[70px] bg-gray-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full transition-all ${m.achievedPct >= 80 ? 'bg-green-500' : m.achievedPct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                              style={{ width: `${m.achievedPct}%` }} />
                          </div>
                          <span className={`font-semibold text-xs ${m.achievedPct >= 80 ? 'text-green-700' : m.achievedPct >= 50 ? 'text-yellow-700' : 'text-red-700'}`}>
                            {m.achievedPct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Upcoming Deadlines + Notifications stacked */}
        <div className="space-y-4">
          {dash.showUpcomingDeadlines && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Upcoming Deadlines</h3>
                <Link href="/projects" className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-0.5">View All <ChevronRight size={12} /></Link>
              </div>
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {upcomingDeadlines?.length > 0 ? upcomingDeadlines.slice(0, 5).map((project: any) => (
                  <Link key={project.id} href={`/projects/${project.id}`}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-gray-100 hover:border-primary-300 hover:bg-primary-50 transition-all">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{project.name}</p>
                      <p className="text-[10px] text-gray-400">{project.projectManager}</p>
                    </div>
                    <span className={`text-xs font-semibold flex-shrink-0 px-2 py-0.5 rounded ml-2 ${new Date(project.deadline) < new Date(Date.now() + 3 * 86400000) ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                      {format(new Date(project.deadline), 'MMM d')}
                    </span>
                  </Link>
                )) : (
                  <div className="text-center py-5 text-gray-400">
                    <Calendar size={22} className="mx-auto mb-1 opacity-40" />
                    <p className="text-xs">No upcoming deadlines</p>
                  </div>
                )}
              </div>
            </Card>
          )}

        </div>
      </div>

      {/* ── Migration Type Modal ───────────────────────────────────── */}
      {selectedMigrationType && (
        <MigrationTypeModal type={selectedMigrationType} onClose={() => setSelectedMigrationType(null)} />
      )}

    </div>
  );
}
