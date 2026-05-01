'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { useSettings } from '@/context/SettingsContext';
import {
  ArrowLeft, Loader2, ChevronDown, ChevronRight,
  Clock, CheckCircle, Circle, AlertTriangle, Play, Pause,
  Calendar, BarChart3, List, RefreshCw, Zap, AlertCircle,
  CalendarDays, Flag, ChevronsLeft, ChevronsRight,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────────────── */
interface ProjectTask {
  id: string;
  name: string;
  orderIndex: number;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'SKIPPED';
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  duration: number;
  progress: number;
  assignee?: string;
  isMilestone: boolean;
  notes?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface ProjectPhase {
  id: string;
  phaseName: string;
  orderIndex: number;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  progress: number;
  tasks: ProjectTask[];
}

interface Project {
  id: string;
  name: string;
  customerName: string;
  plannedStart: string;
  plannedEnd: string;
}

interface GanttData {
  project: Project;
  phases: ProjectPhase[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/* ── Config ─────────────────────────────────────────────────────────── */
const STATUS_CFG = {
  TODO:        { label: 'To Do',       barColor: '#9CA3AF', barBg: '#E5E7EB', badge: 'bg-gray-100 text-gray-600' },
  IN_PROGRESS: { label: 'In Progress', barColor: '#3B82F6', barBg: '#BFDBFE', badge: 'bg-blue-100 text-blue-700' },
  DONE:        { label: 'Done',        barColor: '#22C55E', barBg: '#BBF7D0', badge: 'bg-green-100 text-green-700' },
  BLOCKED:     { label: 'Blocked',     barColor: '#EF4444', barBg: '#FECACA', badge: 'bg-red-100 text-red-700' },
  SKIPPED:     { label: 'Skipped',     barColor: '#9CA3AF', barBg: '#E5E7EB', badge: 'bg-gray-100 text-gray-500' },
  PENDING:     { label: 'Pending',     barColor: '#9CA3AF', barBg: '#E5E7EB', badge: 'bg-gray-100 text-gray-500' },
  COMPLETED:   { label: 'Completed',   barColor: '#22C55E', barBg: '#BBF7D0', badge: 'bg-green-100 text-green-700' },
};

const PRIORITY_CFG: Record<string, { label: string; cls: string }> = {
  CRITICAL: { label: 'Critical', cls: 'bg-red-100 text-red-700' },
  HIGH:     { label: 'High',     cls: 'bg-orange-100 text-orange-700' },
  MEDIUM:   { label: 'Medium',   cls: 'bg-yellow-100 text-yellow-700' },
  LOW:      { label: 'Low',      cls: 'bg-gray-100 text-gray-500' },
};

const PHASE_COLORS = ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];

type ZoomLevel = 'day' | 'week' | 'month' | 'quarter' | 'year';
const ZOOM_CONFIG: Record<ZoomLevel, { cellWidth: number; daysPerCell: number }> = {
  day:     { cellWidth: 40,  daysPerCell: 1   },
  week:    { cellWidth: 100, daysPerCell: 7   },
  month:   { cellWidth: 120, daysPerCell: 30  },
  quarter: { cellWidth: 150, daysPerCell: 91  },
  year:    { cellWidth: 200, daysPerCell: 365 },
};

/* ── Helpers ─────────────────────────────────────────────────────────── */
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtShort(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function initials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function avatarColor(name?: string) {
  const colors = ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'];
  if (!name) return colors[0];
  return colors[name.charCodeAt(0) % colors.length];
}

const PAGE_SIZE = 10;

/* ═══════════════════════════════════════════════════════════════════ */
export default function ProjectTasksPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { settings } = useSettings();

  const leftRef  = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  const [ganttData,       setGanttData]       = useState<GanttData | null>(null);
  const [expandedPhases,  setExpandedPhases]  = useState<Set<string>>(new Set());
  const [isLoading,       setIsLoading]       = useState(true);
  const [error,           setError]           = useState<string | null>(null);
  const [viewMode,        setViewMode]        = useState<'gantt' | 'list'>('gantt');
  const [updatingTask,    setUpdatingTask]    = useState<string | null>(null);
  const [isAutoUpdating,  setIsAutoUpdating]  = useState(false);
  const [isApplyingTpl,  setIsApplyingTpl]  = useState(false);
  const [allTemplates,    setAllTemplates]    = useState<any[]>([]);
  const [lastSync,        setLastSync]        = useState<Date | null>(null);
  const [zoomLevel,       setZoomLevel]       = useState<ZoomLevel>('week');
  const [hoveredTask,     setHoveredTask]     = useState<string | null>(null);
  const [viewStartDate,   setViewStartDate]   = useState<Date>(new Date());
  const [listPage,        setListPage]        = useState(1);

  /* fetch ─────────────────────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      const res = await fetch(`${API_URL}/api/tasks/project/${projectId}/gantt`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json.success) {
        setGanttData(json.data);
        setExpandedPhases(new Set(json.data.phases.map((p: ProjectPhase) => p.id)));
        setLastSync(new Date());
        if (json.data.project.plannedStart) {
          const s = new Date(json.data.project.plannedStart);
          s.setDate(s.getDate() - 14);
          setViewStartDate(s);
        }
      } else {
        setError(json.error?.message || 'Failed to load tasks');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
    fetch(`${API_URL}/api/templates`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(r => r.json()).then(j => { if (j.success) setAllTemplates(j.data || []); }).catch(() => {});

    // Auto-refresh every 30s for real-time tracking
    const interval = setInterval(() => fetchData(), 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const applyTemplate = async (templateCode: string) => {
    try {
      setIsApplyingTpl(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      const res = await fetch(`${API_URL}/api/tasks/project/${projectId}/from-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ templateCode, startDate: ganttData?.project.plannedStart }),
      });
      const json = await res.json();
      if (json.success) await fetchData();
    } catch { /* silent */ } finally { setIsApplyingTpl(false); }
  };

  const triggerSync = async () => {
    try {
      setIsAutoUpdating(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      await fetch(`${API_URL}/api/tasks/project/${projectId}/auto-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      await fetchData();
    } catch { /* silent */ } finally { setIsAutoUpdating(false); }
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    try {
      setUpdatingTask(taskId);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      await fetch(`${API_URL}/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status }),
      });
      await fetchData();
    } catch { /* silent */ } finally { setUpdatingTask(null); }
  };

  const togglePhase = (id: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /* ── stats ──────────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    if (!ganttData) return { total: 0, done: 0, active: 0, overdue: 0, blocked: 0, progress: 0 };
    const today = new Date(); today.setHours(0,0,0,0);
    let total=0, done=0, active=0, overdue=0, blocked=0;
    ganttData.phases.forEach(ph => ph.tasks.forEach(t => {
      total++;
      if (t.status === 'DONE') done++;
      if (t.status === 'IN_PROGRESS') active++;
      if (t.status === 'BLOCKED') blocked++;
      if (t.status !== 'DONE' && t.status !== 'SKIPPED' && new Date(t.plannedEnd) < today) overdue++;
    }));
    return { total, done, active, overdue, blocked, progress: total ? Math.round((done/total)*100) : 0 };
  }, [ganttData]);

  /* ── flat tasks for list view ────────────────────────────────────── */
  const flatTasks = useMemo(() => {
    if (!ganttData) return [];
    return ganttData.phases
      .sort((a,b) => a.orderIndex - b.orderIndex)
      .flatMap((ph, phIdx) =>
        ph.tasks.sort((a,b) => a.orderIndex - b.orderIndex).map(t => ({
          ...t,
          phaseName: ph.phaseName,
          phaseColor: PHASE_COLORS[phIdx % PHASE_COLORS.length],
        }))
      );
  }, [ganttData]);

  const listPages = Math.max(1, Math.ceil(flatTasks.length / PAGE_SIZE));
  const listSlice = flatTasks.slice((listPage-1)*PAGE_SIZE, listPage*PAGE_SIZE);

  /* ── gantt geometry ─────────────────────────────────────────────── */
  const zoomCfg = ZOOM_CONFIG[zoomLevel];
  const visibleDays = zoomLevel==='day' ? 60 : zoomLevel==='week' ? 120 : zoomLevel==='month' ? 365 : zoomLevel==='quarter' ? 730 : 1095;
  const totalCells = Math.ceil(visibleDays / zoomCfg.daysPerCell);
  const totalWidth = totalCells * zoomCfg.cellWidth;

  const timelineCells = useMemo(() => {
    const cells: { date: Date; label: string; sub?: string; isToday: boolean; isWeekend: boolean }[] = [];
    const cur = new Date(viewStartDate);
    const today = new Date(); today.setHours(0,0,0,0);
    for (let i=0; i<totalCells; i++) {
      const d = new Date(cur);
      const isToday = d.toDateString() === today.toDateString();
      const isWeekend = d.getDay()===0||d.getDay()===6;
      let label='', sub='';
      if (zoomLevel==='day') { label=d.getDate().toString(); sub=d.toLocaleDateString('en-US',{weekday:'short'}); }
      else if (zoomLevel==='week') { label=d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
      else if (zoomLevel==='month') { label=d.toLocaleDateString('en-US',{month:'short',year:'2-digit'}); }
      else if (zoomLevel==='quarter') { label=`Q${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()}`; }
      else { label=d.getFullYear().toString(); }
      cells.push({ date:d, label, sub, isToday, isWeekend });
      cur.setDate(cur.getDate() + zoomCfg.daysPerCell);
    }
    return cells;
  }, [viewStartDate, zoomLevel, totalCells, zoomCfg]);

  const monthHeaders = useMemo(() => {
    const hdrs: {label:string; width:number}[] = [];
    let cur='', w=0;
    timelineCells.forEach(c => {
      const lbl = (zoomLevel==='day'||zoomLevel==='week')
        ? c.date.toLocaleDateString('en-US',{month:'long',year:'numeric'})
        : c.date.getFullYear().toString();
      if (lbl !== cur) { if (cur) hdrs.push({label:cur, width:w}); cur=lbl; w=zoomCfg.cellWidth; }
      else w += zoomCfg.cellWidth;
    });
    if (cur) hdrs.push({label:cur, width:w});
    return hdrs;
  }, [timelineCells, zoomLevel, zoomCfg]);

  const barPos = useCallback((start: string, end: string) => {
    const s = new Date(start), e = new Date(end);
    const pxd = zoomCfg.cellWidth / zoomCfg.daysPerCell;
    const ms = 24*60*60*1000;
    return {
      left:  ((s.getTime() - viewStartDate.getTime()) / ms) * pxd,
      width: Math.max(((e.getTime() - s.getTime()) / ms + 1) * pxd, 20),
    };
  }, [viewStartDate, zoomCfg]);

  const todayPos = useCallback(() => {
    const t = new Date(); t.setHours(12,0,0,0);
    return ((t.getTime() - viewStartDate.getTime()) / (24*60*60*1000)) * (zoomCfg.cellWidth/zoomCfg.daysPerCell);
  }, [viewStartDate, zoomCfg]);

  const scrollTimeline = (dir: 'left'|'right') => {
    const days = zoomLevel==='day'?7:zoomLevel==='week'?14:zoomLevel==='month'?30:zoomLevel==='quarter'?91:365;
    setViewStartDate(p => { const d=new Date(p); d.setDate(d.getDate()+(dir==='right'?days:-days)); return d; });
  };

  const ROW_H = 36, PH_H = 42;

  /* ── Loading / Error states ──────────────────────────────────────── */
  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
    </div>
  );
  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertCircle className="w-12 h-12 text-red-500" />
      <p className="text-red-600 font-medium">{error}</p>
      <Button onClick={fetchData}><RefreshCw size={14} className="mr-1"/>Try Again</Button>
    </div>
  );
  if (!ganttData) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <CalendarDays className="w-16 h-16 text-gray-300" />
      <p className="text-gray-500">No task data for this project.</p>
      <Link href={`/projects/${projectId}`}><Button>Back to Project</Button></Link>
    </div>
  );

  // Show template picker if project has no phases/tasks yet
  const hasNoTasks = ganttData.phases.length === 0 || ganttData.phases.every(p => p.tasks.length === 0);

  // Resolve stored migration type values (may be codes like "CONTENT", IDs like "content", or legacy numeric IDs)
  const enabledSettingTypes = settings.migrationTypes.filter(t => t.enabled);
  const resolveType = (raw: string): { code: string; name: string; icon: string; color: string } | null => {
    const up = raw.toUpperCase();
    // Try matching by code
    const byCode = enabledSettingTypes.find(t => t.code.toUpperCase() === up);
    if (byCode) return { code: byCode.code, name: byCode.name, icon: byCode.icon, color: byCode.color };
    // Try matching by id (e.g. "content" stored lowercase)
    const byId = enabledSettingTypes.find(t => t.id.toUpperCase() === up);
    if (byId) return { code: byId.code, name: byId.name, icon: byId.icon, color: byId.color };
    // Try matching by name substring
    const byName = enabledSettingTypes.find(t => t.name.toUpperCase().includes(up) || up.includes(t.name.toUpperCase().split(' ')[0]));
    if (byName) return { code: byName.code, name: byName.name, icon: byName.icon, color: byName.color };
    return null;
  };

  const rawTypes = ganttData.project.migrationTypes
    ? ganttData.project.migrationTypes.split(',').map((t: string) => t.trim()).filter(Boolean)
    : [];

  // Resolve each stored value; if nothing resolves (e.g. all numeric), use all enabled settings types
  const resolvedTypes = rawTypes.map(resolveType).filter(Boolean) as { code: string; name: string; icon: string; color: string }[];
  const projectMigrationTypes = resolvedTypes.length > 0
    ? resolvedTypes
    : hasNoTasks ? enabledSettingTypes.map(t => ({ code: t.code, name: t.name, icon: t.icon, color: t.color })) : [];

  const tp = todayPos();
  const sortedPhases = [...ganttData.phases].sort((a,b) => a.orderIndex - b.orderIndex);

  /* ══════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col h-full animate-fadeIn">

      {/* ── Back + Title ─────────────────────────────────────────────── */}
      <Link href={`/projects/${projectId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mb-2">
        <ArrowLeft size={14}/> Back to Project
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{ganttData.project.name}</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {ganttData.project.customerName} · {fmtShort(ganttData.project.plannedStart)} – {fmtShort(ganttData.project.plannedEnd)}
            </p>
            {projectMigrationTypes.map((mt, idx) => {
              const badgeCls = [
                'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
                'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
                'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
              ][idx % 4];
              return (
                <span key={mt.code} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${badgeCls}`}>
                  {mt.icon} {mt.name}
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={triggerSync} disabled={isAutoUpdating}>
            {isAutoUpdating ? <Loader2 size={13} className="animate-spin mr-1"/> : <Zap size={13} className="mr-1"/>}Sync
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
            <RefreshCw size={13} className={isLoading?'animate-spin':''}/>
          </Button>
          {/* View toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            <button onClick={()=>setViewMode('list')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${viewMode==='list'?'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white':'text-gray-500'}`}>
              <List size={13}/> List
            </button>
            <button onClick={()=>setViewMode('gantt')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${viewMode==='gantt'?'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white':'text-gray-500'}`}>
              <BarChart3 size={13}/> Gantt
            </button>
          </div>
        </div>
      </div>

      {/* ── Template picker (no tasks yet) ───────────────────────────── */}
      {hasNoTasks && projectMigrationTypes.length > 0 && (
        <div className="mb-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">No tasks yet — apply a template to get started</p>
            <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">Click a migration type to auto-generate phases and tasks from its template</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {projectMigrationTypes.map((mt, idx) => {
              const tpl = allTemplates.find(t =>
                t.code?.toUpperCase() === mt.code || t.name?.toUpperCase().includes(mt.code)
              );
              const btnCls = [
                'bg-blue-600 hover:bg-blue-700',
                'bg-green-600 hover:bg-green-700',
                'bg-purple-600 hover:bg-purple-700',
                'bg-orange-500 hover:bg-orange-600',
              ][idx % 4];
              const label = tpl ? tpl.name : mt.name;
              return (
                <button key={mt.code} onClick={() => applyTemplate(mt.code)} disabled={isApplyingTpl}
                  className={`flex items-center gap-1.5 px-3 py-2 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 ${btnCls}`}>
                  {isApplyingTpl ? <Loader2 size={14} className="animate-spin"/> : <span>{mt.icon}</span>}
                  {label} Template
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Stats bar ─────────────────────────────────────────────────── */}
      <div className="flex gap-4 mb-4 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 flex-wrap">
        {[
          { label:'Total',    value: stats.total,    icon: <CalendarDays size={18} className="text-gray-500"/>,    color:'text-gray-800 dark:text-gray-100' },
          { label:'Done',     value: stats.done,     icon: <CheckCircle  size={18} className="text-green-500"/>,   color:'text-green-600' },
          { label:'Active',   value: stats.active,   icon: <Play         size={18} className="text-blue-500"/>,    color:'text-blue-600' },
          { label:'Overdue',  value: stats.overdue,  icon: <Clock        size={18} className="text-red-500"/>,     color:'text-red-600' },
          { label:'Blocked',  value: stats.blocked,  icon: <AlertTriangle size={18} className="text-orange-500"/>, color:'text-orange-600' },
          { label:'Progress', value:`${stats.progress}%`, icon: <Flag    size={18} className="text-primary-500"/>, color:'text-primary-600' },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-2 pr-4 border-r border-gray-100 dark:border-gray-700 last:border-0">
            {s.icon}
            <div>
              <p className={`text-xl font-bold leading-none ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* GANTT VIEW */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {viewMode === 'gantt' && (
        <div className="flex-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">

          {/* Toolbar */}
          <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {/* Nav arrows + Today */}
              <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 overflow-hidden">
                <button onClick={()=>scrollTimeline('left')}  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600"><ChevronsLeft  size={15}/></button>
                <button onClick={()=>{ const t=new Date(); t.setDate(t.getDate()-7); setViewStartDate(t); }}
                  className="px-2.5 py-1 text-xs font-semibold border-x border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600">Today</button>
                <button onClick={()=>scrollTimeline('right')} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600"><ChevronsRight size={15}/></button>
              </div>
              {/* Zoom */}
              <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 overflow-hidden p-0.5 gap-0.5">
                {(['day','week','month','quarter','year'] as ZoomLevel[]).map(z => (
                  <button key={z} onClick={()=>setZoomLevel(z)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${zoomLevel===z?'bg-primary-600 text-white':'hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>
                    {z.charAt(0).toUpperCase()+z.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span>{viewStartDate.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
              {lastSync && <span>Updated: {lastSync.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>}
            </div>
          </div>

          {/* Chart body */}
          <div className="flex-1 flex overflow-hidden">

            {/* Left: task names */}
            <div className="w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col">
              {/* Header */}
              <div className="flex-shrink-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700" style={{height: PH_H+8}}>
                <div className="h-8 flex items-center px-3 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">TASK</span>
                </div>
                <div className="h-7 flex items-center px-3">
                  <span className="text-xs text-gray-400">{flatTasks.length} tasks across {ganttData.phases.length} phases</span>
                </div>
              </div>

              {/* Rows */}
              <div ref={leftRef} className="flex-1 overflow-y-auto"
                onScroll={e => { if(rightRef.current) rightRef.current.scrollTop = e.currentTarget.scrollTop; }}>
                {sortedPhases.map((ph, phIdx) => (
                  <div key={ph.id}>
                    {/* Phase row */}
                    <div style={{height:PH_H}}
                      className="flex items-center px-2 gap-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      onClick={()=>togglePhase(ph.id)}>
                      {expandedPhases.has(ph.id) ? <ChevronDown size={13} className="text-gray-400 flex-shrink-0"/> : <ChevronRight size={13} className="text-gray-400 flex-shrink-0"/>}
                      <div className="w-4 h-4 rounded-sm flex-shrink-0 flex items-center justify-center" style={{backgroundColor: PHASE_COLORS[phIdx % PHASE_COLORS.length]}}>
                        <span className="text-[9px] font-bold text-white">{phIdx+1}</span>
                      </div>
                      <span className="font-semibold text-xs text-gray-800 dark:text-gray-100 truncate flex-1">{ph.phaseName}</span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{ph.progress}%</span>
                    </div>

                    {/* Task rows */}
                    {expandedPhases.has(ph.id) && ph.tasks.sort((a,b)=>a.orderIndex-b.orderIndex).map(t => {
                      const today = new Date(); today.setHours(0,0,0,0);
                      const overdue = t.status!=='DONE' && t.status!=='SKIPPED' && new Date(t.plannedEnd) < today;
                      return (
                        <div key={t.id} style={{height:ROW_H}}
                          className={`flex items-center pl-8 pr-2 gap-1.5 border-b border-gray-100 dark:border-gray-800 ${overdue?'bg-red-50/40 dark:bg-red-900/10':''}`}>
                          <div className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{backgroundColor: STATUS_CFG[t.status]?.barColor ?? '#9CA3AF'}}/>
                          {t.isMilestone && <Flag size={10} className="text-amber-500 flex-shrink-0"/>}
                          <span className={`text-xs flex-1 truncate ${t.status==='DONE'?'line-through text-gray-400':overdue?'text-red-600 dark:text-red-400':'text-gray-700 dark:text-gray-300'}`}>
                            {t.name}
                          </span>
                          <span className={`text-[10px] flex-shrink-0 font-medium ${t.progress===100?'text-green-600':t.progress>0?'text-blue-600':'text-gray-400'}`}>
                            {t.progress}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: timeline */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
              <div style={{width: totalWidth, minWidth:'100%'}}>

                {/* Month header */}
                <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <div className="h-8 flex border-b border-gray-200 dark:border-gray-700">
                    {monthHeaders.map((h,i)=>(
                      <div key={i} style={{width:h.width}}
                        className="border-r border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800">
                        {h.label}
                      </div>
                    ))}
                  </div>
                  {/* Day/week cells */}
                  <div className="flex" style={{height: PH_H - 8}}>
                    {timelineCells.map((c,i)=>(
                      <div key={i} style={{width:zoomCfg.cellWidth}}
                        className={`flex flex-col items-center justify-center text-[10px] border-r border-gray-200 dark:border-gray-700 ${c.isToday?'bg-blue-500 text-white font-bold':c.isWeekend&&zoomLevel==='day'?'bg-gray-100 dark:bg-gray-800 text-gray-400':'text-gray-500 dark:text-gray-400'}`}>
                        <span>{c.label}</span>
                        {c.sub && <span className="text-[8px] opacity-70">{c.sub}</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chart area */}
                <div ref={rightRef} className="relative overflow-y-auto"
                  style={{height:'calc(100vh - 400px)', minHeight:250}}
                  onScroll={e=>{ if(leftRef.current) leftRef.current.scrollTop = e.currentTarget.scrollTop; }}>

                  {/* Grid */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {timelineCells.map((c,i)=>(
                      <div key={i} style={{width:zoomCfg.cellWidth}}
                        className={`h-full border-r border-gray-100 dark:border-gray-800 ${c.isWeekend&&zoomLevel==='day'?'bg-gray-50 dark:bg-gray-800/30':''}`}/>
                    ))}
                  </div>

                  {/* Today line */}
                  {tp>0 && tp<totalWidth && (
                    <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none" style={{left:tp}}>
                      <div className="absolute -top-0 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-b whitespace-nowrap">
                        TODAY
                      </div>
                    </div>
                  )}

                  {/* Bars */}
                  <div className="relative">
                    {sortedPhases.map((ph, phIdx) => {
                      const phColor = PHASE_COLORS[phIdx % PHASE_COLORS.length];
                      const pp = barPos(ph.plannedStart, ph.plannedEnd);
                      return (
                        <div key={ph.id}>
                          {/* Phase bar */}
                          <div style={{height:PH_H}} className="relative">
                            {pp.left+pp.width > 0 && pp.left < totalWidth && (
                              <div className="absolute rounded shadow-sm overflow-hidden" style={{left:Math.max(0,pp.left), width:pp.width, top:8, height:PH_H-16}}>
                                <div className="absolute inset-0 opacity-25" style={{backgroundColor:phColor}}/>
                                <div className="absolute inset-y-0 left-0" style={{width:`${ph.progress}%`, backgroundColor:phColor, opacity:0.6}}/>
                                <div className="absolute inset-0 flex items-center px-2">
                                  <span className="text-[10px] font-bold truncate" style={{color:phColor}}>{ph.phaseName}</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Task bars */}
                          {expandedPhases.has(ph.id) && ph.tasks.sort((a,b)=>a.orderIndex-b.orderIndex).map(t => {
                            const cfg = STATUS_CFG[t.status] ?? STATUS_CFG.TODO;
                            const pos = barPos(t.plannedStart, t.plannedEnd);
                            const today = new Date(); today.setHours(0,0,0,0);
                            const overdue = t.status!=='DONE' && t.status!=='SKIPPED' && new Date(t.plannedEnd)<today;

                            return (
                              <div key={t.id} style={{height:ROW_H}} className="relative"
                                onMouseEnter={()=>setHoveredTask(t.id)}
                                onMouseLeave={()=>setHoveredTask(null)}>
                                {pos.left+pos.width > 0 && pos.left < totalWidth && (
                                  t.isMilestone ? (
                                    <div className="absolute top-1/2 -translate-y-1/2 z-10" style={{left:pos.left}}>
                                      <div className="w-4 h-4 rotate-45 border-2 border-white dark:border-gray-900 shadow-lg" style={{backgroundColor:cfg.barColor}}/>
                                    </div>
                                  ) : (
                                    <div className={`absolute top-1.5 rounded-full overflow-hidden cursor-pointer ${overdue?'ring-1 ring-red-400':''}`}
                                      style={{left:pos.left, width:pos.width, height:ROW_H-10}}>
                                      <div className="absolute inset-0 rounded-full" style={{backgroundColor:cfg.barBg}}/>
                                      <div className="absolute inset-y-0 left-0 rounded-full" style={{width:`${t.progress}%`, backgroundColor:cfg.barColor}}/>
                                      <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
                                        <span className={`text-[10px] font-medium truncate ${t.progress>40?'text-white':'text-gray-700 dark:text-gray-200'}`}>
                                          {t.name}
                                        </span>
                                      </div>
                                    </div>
                                  )
                                )}

                                {/* Tooltip */}
                                {hoveredTask === t.id && (
                                  <div className="absolute z-50 bg-gray-900 text-white text-[10px] rounded-lg p-2.5 shadow-xl pointer-events-none"
                                    style={{left: Math.min(pos.left+pos.width/2, totalWidth-200), bottom:'100%', marginBottom:4, transform:'translateX(-50%)', minWidth:180}}>
                                    <p className="font-semibold text-xs mb-1">{t.name}</p>
                                    <div className="space-y-0.5 text-gray-300">
                                      <div className="flex justify-between gap-4"><span>Start:</span><span className="text-white">{fmtDate(t.plannedStart)}</span></div>
                                      <div className="flex justify-between gap-4"><span>End:</span><span className="text-white">{fmtDate(t.plannedEnd)}</span></div>
                                      <div className="flex justify-between gap-4"><span>Duration:</span><span className="text-white">{t.duration}d</span></div>
                                      <div className="flex justify-between gap-4"><span>Progress:</span><span className="text-white">{t.progress}%</span></div>
                                      <div className="flex justify-between gap-4"><span>Status:</span><span style={{color:cfg.barColor}}>{cfg.label}</span></div>
                                      {t.assignee && <div className="flex justify-between gap-4"><span>Assignee:</span><span className="text-white">{t.assignee}</span></div>}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 flex items-center gap-4 text-[10px] flex-wrap">
            <span className="font-semibold text-gray-500">Legend:</span>
            {Object.entries(STATUS_CFG).slice(0,5).map(([k,v])=>(
              <div key={k} className="flex items-center gap-1">
                <div className="w-3 h-2 rounded-full" style={{backgroundColor:v.barColor}}/>
                <span className="text-gray-500">{v.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rotate-45 bg-amber-500"/>
              <span className="text-gray-500">Milestone</span>
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <div className="w-0.5 h-3 bg-red-500"/>
              <span className="text-gray-500">Today</span>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* LIST VIEW */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {viewMode === 'list' && (
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                <tr>
                  {['TASK','TYPE','ASSIGNEE','START DATE','DUE DATE','DURATION','STATUS','PROGRESS','PRIORITY',''].map(h=>(
                    <th key={h} className={`py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap border-b border-gray-200 dark:border-gray-700 ${h==='TASK'?'text-left':'text-center'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listSlice.map((t: any) => {
                  const cfg = STATUS_CFG[t.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.TODO;
                  const today = new Date(); today.setHours(0,0,0,0);
                  const overdue = t.status!=='DONE' && t.status!=='SKIPPED' && new Date(t.plannedEnd)<today;
                  const pri = t.priority ? PRIORITY_CFG[t.priority] : null;
                  return (
                    <tr key={t.id} className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${overdue?'bg-red-50/30 dark:bg-red-900/10':''}`}>
                      {/* Task name */}
                      <td className="py-3 px-3 max-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          {t.isMilestone && <Flag size={11} className="text-amber-500 flex-shrink-0"/>}
                          <span className={`font-medium truncate ${t.status==='DONE'?'line-through text-gray-400':overdue?'text-red-600 dark:text-red-400':'text-gray-900 dark:text-white'}`}>
                            {t.name}
                          </span>
                          {overdue && <AlertCircle size={11} className="text-red-500 flex-shrink-0"/>}
                        </div>
                      </td>
                      {/* Type = phase name */}
                      <td className="py-3 px-3 text-center">
                        <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full text-white whitespace-nowrap"
                          style={{backgroundColor: t.phaseColor}}>
                          {t.phaseName}
                        </span>
                      </td>
                      {/* Assignee */}
                      <td className="py-3 px-3 text-center">
                        {t.assignee ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                              style={{backgroundColor: avatarColor(t.assignee)}}>
                              {initials(t.assignee)}
                            </div>
                            <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[80px]">{t.assignee}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      {/* Start */}
                      <td className="py-3 px-3 text-center text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {fmtDate(t.plannedStart)}
                      </td>
                      {/* Due */}
                      <td className="py-3 px-3 text-center text-xs whitespace-nowrap">
                        <span className={overdue?'text-red-600 font-semibold':'text-gray-600 dark:text-gray-400'}>
                          {fmtDate(t.plannedEnd)}
                        </span>
                      </td>
                      {/* Duration */}
                      <td className="py-3 px-3 text-center text-xs text-gray-600 dark:text-gray-400">
                        {t.duration} {t.duration===1?'day':'days'}
                      </td>
                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        <select
                          value={t.status}
                          onChange={e=>updateTaskStatus(t.id, e.target.value)}
                          disabled={updatingTask===t.id}
                          className={`text-[11px] font-semibold px-2 py-1 rounded-full border-0 cursor-pointer outline-none ${cfg.badge}`}>
                          <option value="TODO">To Do</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="DONE">Done</option>
                          <option value="BLOCKED">Blocked</option>
                          <option value="SKIPPED">Skipped</option>
                        </select>
                        {updatingTask===t.id && <Loader2 size={11} className="animate-spin inline ml-1"/>}
                      </td>
                      {/* Progress */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{width:`${t.progress}%`, backgroundColor:cfg.barColor}}/>
                          </div>
                          <span className="text-[11px] font-semibold" style={{color:cfg.barColor}}>{t.progress}%</span>
                        </div>
                      </td>
                      {/* Priority */}
                      <td className="py-3 px-3 text-center">
                        {pri ? (
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${pri.cls}`}>{pri.label}</span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="py-3 px-2 text-center">
                        <button className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <p className="text-xs text-gray-500">
              Showing {Math.min((listPage-1)*PAGE_SIZE+1, flatTasks.length)}–{Math.min(listPage*PAGE_SIZE, flatTasks.length)} of {flatTasks.length} tasks
            </p>
            <div className="flex items-center gap-1">
              <button onClick={()=>setListPage(p=>Math.max(1,p-1))} disabled={listPage===1}
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"><ChevronsLeft size={14}/></button>
              {Array.from({length:listPages},(_,i)=>i+1).map(pg=>(
                <button key={pg} onClick={()=>setListPage(pg)}
                  className={`w-7 h-7 rounded text-xs font-medium transition-all ${pg===listPage?'bg-primary-600 text-white':'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                  {pg}
                </button>
              ))}
              <button onClick={()=>setListPage(p=>Math.min(listPages,p+1))} disabled={listPage===listPages}
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"><ChevronsRight size={14}/></button>
              <span className="text-xs text-gray-400 ml-2">{PAGE_SIZE}/page</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
