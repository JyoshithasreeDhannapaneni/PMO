'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import {
  Loader2, Plus, Calendar, ChevronDown, Maximize2,
  List, BarChart2, AlertTriangle, CheckCircle, Activity,
  FolderKanban, FileText, MoreVertical, User,
} from 'lucide-react';
import Link from 'next/link';
import { format, addDays, startOfMonth, endOfMonth, differenceInDays, eachMonthOfInterval, isToday } from 'date-fns';
import { useWeeklyReport, useProjects } from '@/hooks/useProjects';
import { useAuth } from '@/context/AuthContext';



type ZoomLevel = 'Month' | 'Week' | 'Day';
type ViewMode = 'list' | 'gantt';

interface Project {
  id: string;
  name: string;
  customerName: string;
  projectManager: string;
  accountManager: string;
  status: string;
  phase: string;
  planType: string;
  migrationTypes: string | null;
  delayStatus: string;
  delayDays: number;
  plannedStart: string;
  plannedEnd: string;
  estimatedCost: number | null;
  actualCost: number | null;
  createdAt: string;
}

// Phase → approximate progress
const PHASE_PROGRESS: Record<string, number> = {
  KICKOFF: 10, MIGRATION: 40, VALIDATION: 65, CLOSURE: 85, COMPLETED: 100,
};

function getProgress(p: Project): number {
  if (p.status === 'COMPLETED') return 100;
  if (p.status === 'ON_HOLD' || p.status === 'CANCELLED') return 0;
  return PHASE_PROGRESS[p.phase] ?? 20;
}

function getStatusLabel(p: Project): string {
  if (p.status === 'COMPLETED') return 'Completed';
  if (p.status === 'CANCELLED' || p.status === 'ON_HOLD') return 'Not Started';
  if (p.delayStatus === 'DELAYED') return 'Delayed';
  if (p.delayStatus === 'AT_RISK') return 'At Risk';
  return 'On Track';
}

function getBarColor(p: Project): string {
  if (p.status === 'COMPLETED') return '#3b82f6';
  if (p.status === 'CANCELLED' || p.status === 'ON_HOLD') return '#9ca3af';
  if (p.delayStatus === 'DELAYED') return '#ef4444';
  if (p.delayStatus === 'AT_RISK') return '#f97316';
  return '#22c55e';
}

function getStatusDot(label: string): string {
  switch (label) {
    case 'On Track': return 'bg-green-500';
    case 'At Risk': return 'bg-orange-500';
    case 'Delayed': return 'bg-red-500';
    case 'Completed': return 'bg-blue-500';
    default: return 'bg-gray-400';
  }
}

function getMigrationBadge(types: string | null) {
  if (!types) return null;
  const t = types.toUpperCase();
  if (t.includes('CONTENT')) return { label: 'Content', cls: 'bg-blue-100 text-blue-700' };
  if (t.includes('EMAIL')) return { label: 'Email', cls: 'bg-green-100 text-green-700' };
  if (t.includes('MESSAGING')) return { label: 'Messaging', cls: 'bg-purple-100 text-purple-700' };
  return { label: types, cls: 'bg-gray-100 text-gray-700' };
}

// ── Gantt Chart ─────────────────────────────────────────────────────────────
const PX_PER_DAY: Record<ZoomLevel, number> = { Month: 4, Week: 14, Day: 40 };

function GanttChart({
  projects,
  zoom,
  rangeStart,
  rangeEnd,
}: {
  projects: Project[];
  zoom: ZoomLevel;
  rangeStart: Date;
  rangeEnd: Date;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const px = PX_PER_DAY[zoom];
  const totalDays = differenceInDays(rangeEnd, rangeStart) + 1;
  const totalWidth = totalDays * px;
  const today = new Date();
  const todayOffset = differenceInDays(today, rangeStart) * px;
  const months = eachMonthOfInterval({ start: rangeStart, end: rangeEnd });

  // Scroll to today on mount
  useEffect(() => {
    if (scrollRef.current) {
      const scroll = Math.max(0, todayOffset - 120);
      scrollRef.current.scrollLeft = scroll;
    }
  }, [todayOffset]);

  return (
    <div className="flex border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      {/* Fixed left columns */}
      <div className="flex-shrink-0 w-[520px]">
        {/* Header row */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 h-[54px]">
          <div className="w-[200px] px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 flex items-center">Project / Manager</div>
          <div className="w-[80px] px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 flex items-center">Type</div>
          <div className="w-[90px] px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 flex items-center">Status</div>
          <div className="w-[80px] px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 flex items-center">Start Date</div>
          <div className="w-[80px] px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center">End Date</div>
        </div>
        {/* Rows */}
        {projects.map((p, i) => {
          const statusLabel = getStatusLabel(p);
          const badge = getMigrationBadge(p.migrationTypes);
          return (
            <div key={p.id} className={`flex border-b border-gray-100 dark:border-gray-700 h-[52px] ${i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'}`}>
              <div className="w-[200px] px-3 py-2 border-r border-gray-200 dark:border-gray-700 flex flex-col justify-center min-w-0">
                <Link href={`/portfolio/${p.id}`} className="text-xs font-semibold text-gray-900 dark:text-white hover:text-primary-600 truncate">{p.name}</Link>
                <div className="flex items-center gap-1 mt-0.5">
                  <User size={10} className="text-gray-400 flex-shrink-0" />
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{p.projectManager}</span>
                </div>
              </div>
              <div className="w-[80px] px-2 py-2 border-r border-gray-200 dark:border-gray-700 flex items-center">
                {badge && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${badge.cls}`}>{badge.label}</span>}
              </div>
              <div className="w-[90px] px-2 py-2 border-r border-gray-200 dark:border-gray-700 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusDot(statusLabel)}`} />
                <span className={`text-xs font-medium ${statusLabel === 'On Track' ? 'text-green-600' : statusLabel === 'Delayed' ? 'text-red-600' : statusLabel === 'At Risk' ? 'text-orange-500' : statusLabel === 'Completed' ? 'text-blue-600' : 'text-gray-500'}`}>{statusLabel}</span>
              </div>
              <div className="w-[80px] px-2 py-2 border-r border-gray-200 dark:border-gray-700 flex items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">{format(new Date(p.plannedStart), 'MMM dd, yyyy')}</span>
              </div>
              <div className="w-[80px] px-2 py-2 flex items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">{format(new Date(p.plannedEnd), 'MMM dd, yyyy')}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable timeline */}
      <div className="flex-1 overflow-x-auto" ref={scrollRef}>
        <div style={{ width: totalWidth, minWidth: totalWidth }}>
          {/* Month + day header (2 rows totalling 54px) */}
          <div className="relative h-[54px] bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
            {/* Month labels */}
            <div className="absolute inset-x-0 top-0 h-[27px] flex">
              {months.map((m) => {
                const mStart = m < rangeStart ? rangeStart : m;
                const mEnd = endOfMonth(m) > rangeEnd ? rangeEnd : endOfMonth(m);
                const leftPx = differenceInDays(mStart, rangeStart) * px;
                const widthPx = (differenceInDays(mEnd, mStart) + 1) * px;
                return (
                  <div key={m.toISOString()} className="absolute border-r border-gray-200 dark:border-gray-600 flex items-center px-2 overflow-hidden" style={{ left: leftPx, width: widthPx, height: 27 }}>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">{format(m, 'MMM yyyy')}</span>
                  </div>
                );
              })}
            </div>
            {/* Week/day markers row */}
            <div className="absolute inset-x-0 top-[27px] h-[27px] flex items-center">
              {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, wi) => {
                const d = addDays(rangeStart, wi * 7);
                const leftPx = wi * 7 * px;
                return (
                  <div key={wi} className="absolute border-r border-gray-100 dark:border-gray-700 flex items-center px-1" style={{ left: leftPx, width: 7 * px, height: 27 }}>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{format(d, 'd')}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Project rows */}
          {projects.map((p, i) => {
            const start = new Date(p.plannedStart);
            const end = new Date(p.plannedEnd);
            const barLeft = Math.max(0, differenceInDays(start, rangeStart)) * px;
            const barDays = Math.max(1, differenceInDays(end, start));
            const barWidth = Math.min(barDays * px, totalWidth - barLeft);
            const progress = getProgress(p);
            const color = getBarColor(p);
            const lighterColor = color + '40';

            return (
              <div key={p.id} className={`relative border-b border-gray-100 dark:border-gray-700 h-[52px] ${i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'}`}>
                {/* Week grid lines */}
                {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, wi) => (
                  <div key={wi} className="absolute top-0 bottom-0 border-r border-gray-100 dark:border-gray-700/50" style={{ left: wi * 7 * px }} />
                ))}

                {/* Today line */}
                {todayOffset >= 0 && todayOffset <= totalWidth && (
                  <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-red-400 z-10" style={{ left: todayOffset }} />
                )}

                {/* Project bar */}
                {barLeft <= totalWidth && (
                  <div className="absolute top-3" style={{ left: barLeft, width: barWidth }}>
                    {/* Bar background */}
                    <div className="h-6 rounded-full overflow-hidden relative" style={{ background: lighterColor }}>
                      {/* Progress fill */}
                      <div className="h-full rounded-full" style={{ width: `${progress}%`, background: color }} />
                    </div>
                    {/* Progress label */}
                    <span className="absolute right-[-36px] top-0 text-xs font-semibold" style={{ color }}>{progress}%</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── List View Table ──────────────────────────────────────────────────────────
function ListView({ projects }: { projects: Project[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-700/50">
          <tr>
            {['Project / Manager', 'Type', 'Status', 'Start Date', 'End Date', 'Progress', ''].map((h) => (
              <th key={h} className={`py-3 px-4 font-medium text-gray-500 dark:text-gray-400 ${h === 'Project / Manager' ? 'text-left' : 'text-center'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const statusLabel = getStatusLabel(p);
            const badge = getMigrationBadge(p.migrationTypes);
            const progress = getProgress(p);
            const color = getBarColor(p);
            return (
              <tr key={p.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <td className="py-3 px-4">
                  <Link href={`/portfolio/${p.id}`} className="font-semibold text-gray-900 dark:text-white hover:text-primary-600 text-sm">{p.name}</Link>
                  <div className="flex items-center gap-1 mt-0.5">
                    <User size={11} className="text-gray-400" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">{p.projectManager}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-center">
                  {badge && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>}
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${getStatusDot(statusLabel)}`} />
                    <span className={`text-xs font-medium ${statusLabel === 'On Track' ? 'text-green-600' : statusLabel === 'Delayed' ? 'text-red-600' : statusLabel === 'At Risk' ? 'text-orange-500' : statusLabel === 'Completed' ? 'text-blue-600' : 'text-gray-500'}`}>{statusLabel}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-center text-xs text-gray-600 dark:text-gray-400">{format(new Date(p.plannedStart), 'MMM dd, yyyy')}</td>
                <td className="py-3 px-4 text-center text-xs text-gray-600 dark:text-gray-400">{format(new Date(p.plannedEnd), 'MMM dd, yyyy')}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2 justify-center">
                    <div className="w-24 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${progress}%`, background: color }} />
                    </div>
                    <span className="text-xs font-semibold" style={{ color }}>{progress}%</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-center">
                  <Link href={`/portfolio/${p.id}`}>
                    <button className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 transition-colors">
                      <MoreVertical size={15} />
                    </button>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const [viewMode, setViewMode] = useState<ViewMode>('gantt');
  const [zoom, setZoom] = useState<ZoomLevel>('Month');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  // Manager: lock filter to their own name; admin/viewer: free choice
  const [filterManager, setFilterManager] = useState('');
  const [showWeeklyDropdown, setShowWeeklyDropdown] = useState(false);
  const { data: weeklyData } = useWeeklyReport(isManager ? (user?.name ?? undefined) : undefined);

  const { data: projectsData, isLoading: loading } = useProjects({
    limit: 200,
    projectManager: isManager ? user?.name : undefined,
  });
  const projects: Project[] = (projectsData?.data as any) || [];

  const allManagers = useMemo(() => [...new Set(projects.map((p) => p.projectManager).filter(Boolean))], [projects]);

  const filtered = useMemo(() => projects.filter((p) => {
    if (filterStatus) {
      const label = getStatusLabel(p);
      if (filterStatus === 'ON_TRACK' && label !== 'On Track') return false;
      if (filterStatus === 'AT_RISK' && label !== 'At Risk') return false;
      if (filterStatus === 'DELAYED' && label !== 'Delayed') return false;
      if (filterStatus === 'COMPLETED' && label !== 'Completed') return false;
      if (filterStatus === 'NOT_STARTED' && label !== 'Not Started') return false;
    }
    if (filterType && !p.migrationTypes?.toUpperCase().includes(filterType)) return false;
    // Manager: always scoped to their name; admin: use dropdown filter
    const managerCheck = isManager ? (user?.name ?? '') : filterManager;
    if (managerCheck && p.projectManager !== managerCheck) return false;
    return true;
  }), [projects, filterStatus, filterType, filterManager, isManager, user?.name]);

  // Timeline range
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (!filtered.length) {
      const s = new Date(); s.setDate(1);
      const e = new Date(s); e.setMonth(e.getMonth() + 6);
      return { rangeStart: s, rangeEnd: e };
    }
    const starts = filtered.map((p) => new Date(p.plannedStart));
    const ends = filtered.map((p) => new Date(p.plannedEnd));
    const minStart = new Date(Math.min(...starts.map((d) => d.getTime())));
    const maxEnd = new Date(Math.max(...ends.map((d) => d.getTime())));
    return {
      rangeStart: startOfMonth(addDays(minStart, -7)),
      rangeEnd: endOfMonth(addDays(maxEnd, 7)),
    };
  }, [filtered]);

  const stats = useMemo(() => ({
    total: projects.length,
    active: projects.filter((p) => p.status === 'ACTIVE').length,
    completed: projects.filter((p) => p.status === 'COMPLETED').length,
    delayed: projects.filter((p) => p.delayStatus === 'DELAYED').length,
  }), [projects]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
    </div>
  );

  const selectCls = 'px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer appearance-none pr-7';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Portfolio</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isManager ? `Your project portfolio — ${user?.name}` : 'View all portfolios and timelines'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Weekly Report dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowWeeklyDropdown(!showWeeklyDropdown)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Calendar size={14} className="text-primary-600" />
              Weekly Report
              <ChevronDown size={14} />
            </button>
            {showWeeklyDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 py-1">
                <Link href="/?report=weekly" onClick={() => setShowWeeklyDropdown(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <FileText size={14} /> View Weekly Report
                </Link>
                <Link href="/?report=monthly" onClick={() => setShowWeeklyDropdown(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <BarChart2 size={14} /> View Monthly Report
                </Link>
              </div>
            )}
          </div>
          <Link
            href="/projects/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus size={15} /> New Project
          </Link>
        </div>
      </div>

      {/* Manager scope banner */}
      {isManager && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">
          <User size={14} className="flex-shrink-0" />
          <span><strong>Manager View</strong> — Showing your portfolio: projects assigned to <strong>{user?.name}</strong>.</span>
        </div>
      )}

      {/* View Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 gap-0">
        {(['list', 'gantt'] as ViewMode[]).map((v) => (
          <button
            key={v}
            onClick={() => setViewMode(v)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${viewMode === v ? 'border-primary-600 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            {v === 'list' ? <List size={15} /> : <BarChart2 size={15} />}
            {v === 'list' ? 'List View' : 'Gantt View'}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Projects', value: stats.total, sub: 'All portfolios',
            icon: <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center"><FolderKanban size={20} className="text-blue-600" /></div>,
            valueColor: 'text-gray-900 dark:text-white',
          },
          {
            label: 'Active Projects', value: stats.active,
            sub: stats.total > 0 ? `${Math.round((stats.active / stats.total) * 100)}% of total` : '0% of total',
            subColor: 'text-green-600',
            icon: <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center"><Activity size={20} className="text-green-600" /></div>,
            valueColor: 'text-gray-900 dark:text-white',
          },
          {
            label: 'Completed', value: stats.completed,
            sub: stats.total > 0 ? `${Math.round((stats.completed / stats.total) * 100)}% of total` : '0% of total',
            subColor: 'text-purple-600',
            icon: <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center"><CheckCircle size={20} className="text-purple-600" /></div>,
            valueColor: 'text-gray-900 dark:text-white',
          },
          {
            label: 'Delayed Projects', value: stats.delayed,
            sub: stats.total > 0 ? `${Math.round((stats.delayed / stats.total) * 100)}% of total` : '0% of total',
            subColor: 'text-red-600',
            icon: <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center"><AlertTriangle size={20} className="text-red-600" /></div>,
            valueColor: stats.delayed > 0 ? 'text-red-600' : 'text-gray-900 dark:text-white',
          },
        ].map((item) => (
          <Card key={item.label} className="flex items-center gap-4 py-4">
            {item.icon}
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{item.label}</p>
              <p className={`text-3xl font-bold mt-0.5 ${item.valueColor}`}>{item.value}</p>
              <p className={`text-xs mt-0.5 ${item.subColor || 'text-gray-400'}`}>{item.sub}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters + Zoom */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Filters:</span>

        <div className="relative">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={selectCls}>
            <option value="">All Status</option>
            <option value="ON_TRACK">On Track</option>
            <option value="AT_RISK">At Risk</option>
            <option value="DELAYED">Delayed</option>
            <option value="COMPLETED">Completed</option>
            <option value="NOT_STARTED">Not Started</option>
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={selectCls}>
            <option value="">All Types</option>
            <option value="CONTENT">Content</option>
            <option value="EMAIL">Email</option>
            <option value="MESSAGING">Messaging</option>
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>

        {/* Manager filter: hidden for MANAGER role (already scoped to their name) */}
        {!isManager && (
          <div className="relative">
            <select value={filterManager} onChange={(e) => setFilterManager(e.target.value)} className={selectCls}>
              <option value="">All Managers</option>
              {allManagers.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        )}
        {/* Manager scope badge */}
        {isManager && (
          <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg">
            <User size={12} /> {user?.name}
          </span>
        )}

        {viewMode === 'gantt' && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800">
            <Calendar size={13} />
            <span>{format(rangeStart, 'MMM dd, yyyy')} - {format(rangeEnd, 'MMM dd, yyyy')}</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {viewMode === 'gantt' && (
            <>
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    const today = new Date();
                    // Reset range to center on today
                  }
                }}
                className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 transition-colors"
              >
                Today
              </button>
              <div className="flex items-center gap-0.5">
                <span className="text-sm text-gray-500 dark:text-gray-400 mr-1">Zoom:</span>
                {(['Month', 'Week', 'Day'] as ZoomLevel[]).map((z) => (
                  <button
                    key={z}
                    onClick={() => setZoom(z)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${zoom === z ? 'bg-primary-600 text-white' : 'border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50'}`}
                  >
                    {z}
                  </button>
                ))}
              </div>
              <button className="p-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-500 hover:bg-gray-50 dark:bg-gray-800 transition-colors">
                <Maximize2 size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main content */}
      {filtered.length === 0 ? (
        <Card className="text-center py-16 text-gray-400">
          <FolderKanban size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No projects match the selected filters</p>
        </Card>
      ) : viewMode === 'gantt' ? (
        <GanttChart projects={filtered} zoom={zoom} rangeStart={rangeStart} rangeEnd={rangeEnd} />
      ) : (
        <ListView projects={filtered} />
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap">
          {[
            { label: 'On Track', color: 'bg-green-500' },
            { label: 'At Risk', color: 'bg-orange-500' },
            { label: 'Delayed', color: 'bg-red-500' },
            { label: 'Completed', color: 'bg-blue-500' },
            { label: 'Not Started', color: 'bg-gray-400' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
              <span className="text-xs text-gray-600 dark:text-gray-400">{item.label}</span>
            </div>
          ))}
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Showing 1 to {filtered.length} of {projects.length} projects
        </span>
      </div>
    </div>
  );
}
