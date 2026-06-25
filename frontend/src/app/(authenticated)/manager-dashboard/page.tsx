'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useManagerGoalsWithStats } from '@/hooks/useProjects';
import Link from 'next/link';
import {
  Loader2, AlertCircle, X, PlayCircle, PauseCircle,
  CheckCircle, Clock, ChevronRight, Search, Link2Off,
  ArrowLeft,
} from 'lucide-react';
import api from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Segment = 'ENT' | 'SMB';

interface ManagerStat {
  manager: string;
  total: number;
  active: number;
  inactive: number;
  completed: number;
  delayed: number;
  atRisk: number;
  onTime: number;
  pctOnTime: number;
  avgDelayDays: number;
  achievedPct: number;
  goalPct: number;
  variance: number;
}

// Future contract for Jira SLA — wired up when credentials are configured
interface JiraSlaData {
  ticketCount: number;
  breachCount: number;
  breachRate: number;
  firstResponseBreaches: number;
  resolutionBreaches: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SEGMENT_CONFIG: { label: Segment; managers: string[] }[] = [
  { label: 'ENT', managers: ['Abhishek', 'Lakshmi Prasanna'] },
  { label: 'SMB', managers: ['Ajay', 'Abhishikth', 'Harika', 'Sravan', 'Raghu'] },
];

const NAMED_MANAGER_SET = new Set(SEGMENT_CONFIG.flatMap((s) => s.managers));

// ─── Badge styles ─────────────────────────────────────────────────────────────

const DELAY_COLORS: Record<string, string> = {
  DELAYED:     'bg-red-100 text-red-700',
  AT_RISK:     'bg-yellow-100 text-yellow-700',
  NOT_DELAYED: 'bg-green-100 text-green-700',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'bg-green-100 text-green-700',
  ON_HOLD:   'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toInitials(name: string): string {
  return name.split(' ').map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function sumStats(stats: ManagerStat[]) {
  const total      = stats.reduce((s, m) => s + m.total, 0);
  const onTime     = stats.reduce((s, m) => s + m.onTime, 0);
  const delayed    = stats.reduce((s, m) => s + m.delayed, 0);
  const atRisk     = stats.reduce((s, m) => s + m.atRisk, 0);
  const completed  = stats.reduce((s, m) => s + m.completed, 0);
  const active     = stats.reduce((s, m) => s + m.active, 0);
  const inactive   = stats.reduce((s, m) => s + m.inactive, 0);
  const pctOnTime  = total > 0 ? Math.round((onTime / total) * 100) : 0;
  const avgDelayDays = delayed > 0
    ? Math.round(stats.reduce((s, m) => s + m.avgDelayDays * m.delayed, 0) / delayed)
    : 0;
  return { total, onTime, delayed, atRisk, completed, active, inactive, pctOnTime, avgDelayDays };
}

// ─── JiraSlaSection ──────────────────────────────────────────────────────────

function JiraSlaSection() {
  return (
    <div className="border border-dashed border-gray-200 rounded-xl p-4 bg-gray-50 flex items-start gap-3">
      <Link2Off size={18} className="text-gray-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-gray-600">Jira SLA Tracking</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Connect Jira to enable SLA tracking. When configured, this section will show ticket count,
          breach count, breach rate, first-response breaches, and resolution breaches per project.
        </p>
      </div>
    </div>
  );
}

// ─── ManagerDetailView (inline, not a popup) ─────────────────────────────────

function ManagerDetailView({
  stat,
  isOthers,
  onBack,
}: {
  stat: ManagerStat;
  isOthers: boolean;
  onBack: () => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: projectData, isLoading: projectsLoading } = useQuery({
    queryKey: isOthers ? ['managerDashboard', 'others', 'projects'] : ['managerDashboard', stat.manager, 'projects'],
    queryFn: () =>
      isOthers
        ? api.get('/projects?limit=500').then((r: any) => r.data)
        : api.get(`/projects?projectManager=${encodeURIComponent(stat.manager)}&limit=200`).then((r: any) => r.data),
    staleTime: 30_000,
  });

  const allFetched: any[] = projectData?.data ?? [];
  const projects = useMemo(
    () => isOthers ? allFetched.filter((p: any) => !NAMED_MANAGER_SET.has(p.projectManager)) : allFetched,
    [allFetched, isOthers]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return projects.filter((p: any) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (q && !p.name?.toLowerCase().includes(q) && !p.customerName?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projects, search, statusFilter]);

  const kpis = [
    { label: 'Active',    value: stat.active,    color: 'text-green-700',  bg: 'bg-green-50',  icon: PlayCircle },
    { label: 'On Hold',   value: stat.inactive,  color: 'text-yellow-700', bg: 'bg-yellow-50', icon: PauseCircle },
    { label: 'Completed', value: stat.completed, color: 'text-blue-700',   bg: 'bg-blue-50',   icon: CheckCircle },
    { label: 'Delayed',   value: stat.delayed,   color: 'text-red-700',    bg: 'bg-red-50',    icon: Clock },
    { label: 'At Risk',   value: stat.atRisk,    color: 'text-orange-700', bg: 'bg-orange-50', icon: AlertCircle },
  ];

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Back button + manager header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 font-medium transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>
      </div>

      <div className="bg-gradient-to-r from-[#1b4f72] to-[#2980b9] rounded-2xl p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
          {isOthers ? 'OT' : toInitials(stat.manager)}
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{stat.manager}</h2>
          <p className="text-sm text-blue-100 mt-0.5">
            Project Manager · {stat.total} total projects
          </p>
        </div>
        {!isOthers && (
          <Link
            href={`/projects?projectManager=${encodeURIComponent(stat.manager)}`}
            className="ml-auto flex items-center gap-1.5 text-xs text-white/80 hover:text-white font-medium px-3 py-1.5 rounded-lg border border-white/30 hover:border-white/60 transition"
          >
            View in All Projects <ChevronRight size={12} />
          </Link>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-5 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={`${k.bg} rounded-xl p-4 flex items-center gap-3 border border-white`}>
            <k.icon size={20} className={k.color} />
            <div>
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* On Time + Avg Delay summary strip */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">% On Time</p>
            <p className={`text-2xl font-bold ${stat.pctOnTime >= 80 ? 'text-green-600' : stat.pctOnTime >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
              {stat.pctOnTime}%
            </p>
          </div>
          <div className="flex-1">
            <div className="bg-gray-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${stat.pctOnTime >= 80 ? 'bg-green-500' : stat.pctOnTime >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                style={{ width: `${stat.pctOnTime}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">{stat.onTime} of {stat.total} projects on time</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Avg Delay (Late Projects Only)</p>
          {stat.avgDelayDays > 0 ? (
            <p className="text-2xl font-bold text-red-600">{stat.avgDelayDays} <span className="text-base font-normal text-gray-400">days</span></p>
          ) : (
            <p className="text-2xl font-bold text-green-600">0 <span className="text-base font-normal text-gray-400">days</span></p>
          )}
        </div>
      </div>

      {/* Project list */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {/* Table header + filters */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700 flex-shrink-0">Active Projects</h3>
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none"
          >
            <option value="">All Status</option>
            {['ACTIVE', 'ON_HOLD', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400 flex-shrink-0">{filtered.length} projects</span>
        </div>

        {projectsLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            {projects.length === 0 ? 'No active projects found for this manager.' : 'No projects match the current filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Project Name', 'Customer', 'Phase', 'Status', 'Delay', 'Planned End', 'SOW End'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p: any) => {
                  const sowEnd = p.extendedEndDate ?? p.plannedEnd;
                  const isExtended = !!p.extendedEndDate;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/projects/${p.id}`}
                          className="font-medium text-gray-900 hover:text-primary-600 hover:underline"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{p.customerName || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium whitespace-nowrap">
                          {p.phase?.replace(/_/g, ' ') || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-500'}`}>
                          {p.status?.replace('_', ' ') || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.delayStatus && p.delayStatus !== 'NOT_DELAYED' ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${DELAY_COLORS[p.delayStatus]}`}>
                            {p.delayStatus === 'DELAYED' && p.delayDays > 0 ? `Delayed (${p.delayDays}d)` : 'At Risk'}
                          </span>
                        ) : (
                          <span className="text-xs text-green-600 font-medium">On Track</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(p.plannedEnd)}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span className={isExtended ? 'text-amber-600 font-medium' : 'text-gray-500'}>
                          {fmtDate(sowEnd)}{isExtended && <span className="ml-1">↑</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Jira SLA section */}
        <div className="p-4 border-t border-gray-100">
          <JiraSlaSection />
        </div>
      </div>
    </div>
  );
}

// ─── Manager stats table row ──────────────────────────────────────────────────

function ManagerRow({
  name,
  stat,
  isOthers,
  onSelect,
}: {
  name: string;
  stat: ManagerStat | null;
  isOthers: boolean;
  onSelect: () => void;
}) {
  const initials = isOthers ? 'OT' : toInitials(name);
  const loading = stat === null;

  return (
    <tr
      onClick={onSelect}
      className="hover:bg-primary-50/40 cursor-pointer transition-colors group border-b border-gray-100 last:border-0"
    >
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700 flex-shrink-0 group-hover:bg-primary-200 transition-colors">
            {initials}
          </div>
          <span className="font-medium text-gray-900 text-sm">{name}</span>
        </div>
      </td>

      <td className="px-5 py-3.5 text-center">
        {loading ? <Loader2 size={13} className="animate-spin text-gray-300 mx-auto" /> : (
          <span className="font-semibold text-gray-800">{stat.total}</span>
        )}
      </td>

      <td className="px-5 py-3.5 text-center">
        {loading ? '—' : (
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-50 text-green-700 font-semibold text-sm">
            {stat.onTime}
          </span>
        )}
      </td>

      <td className="px-5 py-3.5 text-center">
        {loading ? '—' : (
          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm ${stat.delayed > 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-400'}`}>
            {stat.delayed}
          </span>
        )}
      </td>

      <td className="px-5 py-3.5 text-center">
        {loading ? '—' : (
          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm ${stat.atRisk > 0 ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-50 text-gray-400'}`}>
            {stat.atRisk}
          </span>
        )}
      </td>

      <td className="px-5 py-3.5">
        {loading ? '—' : (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[60px]">
              <div
                className={`h-1.5 rounded-full transition-all ${stat.pctOnTime >= 80 ? 'bg-green-500' : stat.pctOnTime >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                style={{ width: `${stat.pctOnTime}%` }}
              />
            </div>
            <span className={`text-sm font-semibold w-10 text-right ${stat.pctOnTime >= 80 ? 'text-green-700' : stat.pctOnTime >= 50 ? 'text-yellow-700' : 'text-red-700'}`}>
              {stat.pctOnTime}%
            </span>
          </div>
        )}
      </td>

      <td className="px-5 py-3.5 text-center">
        {loading ? '—' : (
          stat.avgDelayDays > 0
            ? <span className="text-sm font-semibold text-red-600">{stat.avgDelayDays}d</span>
            : <span className="text-sm text-gray-400">—</span>
        )}
      </td>

      <td className="px-3 py-3.5 text-right">
        <ChevronRight size={16} className="text-gray-300 group-hover:text-primary-500 ml-auto transition-colors" />
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ManagerDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [activeSegment, setActiveSegment] = useState<Segment>('ENT');
  const [selectedManager, setSelectedManager] = useState<string | null>(null);

  const { data: statsData, isLoading: statsLoading } = useManagerGoalsWithStats();
  const allStats: ManagerStat[] = useMemo(() => {
    const raw: any[] = statsData?.data ?? [];
    return raw;
  }, [statsData]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
      </div>
    );
  }

  if (user?.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-lg font-semibold text-gray-700">Access Denied</p>
        <p className="text-sm text-gray-400">This page is only accessible to administrators.</p>
      </div>
    );
  }

  const currentSegment = SEGMENT_CONFIG.find((s) => s.label === activeSegment)!;

  // Build per-manager stat lookup
  const getStatForManager = (name: string): ManagerStat | null => {
    if (statsLoading) return null;
    return allStats.find((s) => s.manager.toLowerCase() === name.toLowerCase()) ?? {
      manager: name, total: 0, active: 0, inactive: 0, completed: 0,
      delayed: 0, atRisk: 0, onTime: 0, pctOnTime: 0, avgDelayDays: 0,
      achievedPct: 0, goalPct: 80, variance: -80,
    };
  };

  // "Others" = aggregate of all managers NOT in NAMED_MANAGER_SET
  const EMPTY_STAT: ManagerStat = { manager: 'Others', total: 0, active: 0, inactive: 0, completed: 0, delayed: 0, atRisk: 0, onTime: 0, pctOnTime: 0, avgDelayDays: 0, achievedPct: 0, goalPct: 80, variance: -80 };

  const othersStats: ManagerStat | null = useMemo(() => {
    if (statsLoading) return null;
    const others = allStats.filter((s) => !NAMED_MANAGER_SET.has(s.manager));
    if (others.length === 0) return { ...EMPTY_STAT, manager: 'Others' };
    const s = sumStats(others);
    return { ...EMPTY_STAT, manager: 'Others', ...s };
  }, [allStats, statsLoading]);

  // Resolve stat for selected manager (used in detail view)
  const selectedStat = useMemo(() => {
    if (!selectedManager) return null;
    if (selectedManager === 'Others') return othersStats;
    return getStatForManager(selectedManager);
  }, [selectedManager, allStats, othersStats]);

  // If a manager is selected, show the detail view instead of the table
  if (selectedManager !== null && selectedStat !== null) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Project health overview by business segment and manager</p>
        </div>
        <ManagerDetailView
          stat={selectedStat}
          isOthers={selectedManager === 'Others'}
          onBack={() => setSelectedManager(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Project health overview by business segment and manager</p>
      </div>

      {/* Segment tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {SEGMENT_CONFIG.map((seg) => (
          <button
            key={seg.label}
            onClick={() => {
              setActiveSegment(seg.label);
              setSelectedManager(null);
            }}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              activeSegment === seg.label
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {seg.label}
          </button>
        ))}
      </div>

      {/* Stats table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {statsLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-[#1b4f72] text-white text-xs font-semibold">
                <th className="px-5 py-3 text-left">Project Manager</th>
                <th className="px-5 py-3 text-center">Total Projects</th>
                <th className="px-5 py-3 text-center">On Time</th>
                <th className="px-5 py-3 text-center">Delayed</th>
                <th className="px-5 py-3 text-center">At Risk</th>
                <th className="px-5 py-3 text-left min-w-[140px]">% On Time</th>
                <th className="px-5 py-3 text-center whitespace-nowrap">Avg Delay (Days, Late Only)</th>
                <th className="px-3 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {currentSegment.managers.map((name) => (
                <ManagerRow
                  key={name}
                  name={name}
                  stat={getStatForManager(name)}
                  isOthers={false}
                  onSelect={() => setSelectedManager(name)}
                />
              ))}
              {currentSegment.label === 'SMB' && (
                <ManagerRow
                  key="others"
                  name="Others"
                  stat={othersStats}
                  isOthers={true}
                  onSelect={() => setSelectedManager('Others')}
                />
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
