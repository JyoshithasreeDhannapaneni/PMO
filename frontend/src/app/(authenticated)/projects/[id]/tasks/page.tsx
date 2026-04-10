'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Loader2, 
  ChevronDown, 
  ChevronRight,
  Clock,
  CheckCircle,
  Circle,
  AlertTriangle,
  Play,
  Pause,
  Calendar,
  BarChart3,
  List,
  RefreshCw,
  Zap,
  Target,
  AlertCircle,
  CalendarDays,
  Flag,
  ZoomIn,
  ZoomOut,
  ChevronsLeft,
  ChevronsRight,
  GripVertical
} from 'lucide-react';

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

const statusConfig = {
  TODO: { icon: Circle, color: 'text-gray-400', bg: 'bg-gray-100', barColor: '#9CA3AF', barBg: '#E5E7EB', label: 'To Do' },
  IN_PROGRESS: { icon: Play, color: 'text-blue-500', bg: 'bg-blue-100', barColor: '#3B82F6', barBg: '#BFDBFE', label: 'In Progress' },
  DONE: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100', barColor: '#22C55E', barBg: '#BBF7D0', label: 'Done' },
  BLOCKED: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-100', barColor: '#EF4444', barBg: '#FECACA', label: 'Blocked' },
  SKIPPED: { icon: Pause, color: 'text-gray-400', bg: 'bg-gray-100', barColor: '#9CA3AF', barBg: '#E5E7EB', label: 'Skipped' },
  PENDING: { icon: Circle, color: 'text-gray-400', bg: 'bg-gray-100', barColor: '#9CA3AF', barBg: '#E5E7EB', label: 'Pending' },
  COMPLETED: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100', barColor: '#22C55E', barBg: '#BBF7D0', label: 'Completed' },
};

type ZoomLevel = 'day' | 'week' | 'month' | 'quarter' | 'year';

const ZOOM_CONFIG: Record<ZoomLevel, { cellWidth: number; daysPerCell: number; headerFormat: string }> = {
  day: { cellWidth: 40, daysPerCell: 1, headerFormat: 'day' },
  week: { cellWidth: 100, daysPerCell: 7, headerFormat: 'week' },
  month: { cellWidth: 120, daysPerCell: 30, headerFormat: 'month' },
  quarter: { cellWidth: 150, daysPerCell: 91, headerFormat: 'quarter' },
  year: { cellWidth: 200, daysPerCell: 365, headerFormat: 'year' },
};

export default function ProjectTasksPage() {
  const params = useParams();
  const projectId = params.id as string;
  
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  
  const [ganttData, setGanttData] = useState<GanttData | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'gantt'>('gantt');
  const [updatingTask, setUpdatingTask] = useState<string | null>(null);
  const [isAutoUpdating, setIsAutoUpdating] = useState(false);
  const [lastAutoUpdate, setLastAutoUpdate] = useState<Date | null>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('week');
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [viewStartDate, setViewStartDate] = useState<Date>(new Date());
  const [isDragging, setIsDragging] = useState(false);
  const [dragTask, setDragTask] = useState<{ id: string; type: 'move' | 'resize-start' | 'resize-end' } | null>(null);

  const fetchGanttData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/tasks/project/${projectId}/gantt`);
      const data = await response.json();
      if (data.success) {
        setGanttData(data.data);
        setExpandedPhases(new Set(data.data.phases.map((p: ProjectPhase) => p.id)));
        setLastAutoUpdate(new Date());
        
        if (data.data.project.plannedStart) {
          const start = new Date(data.data.project.plannedStart);
          start.setDate(start.getDate() - 14);
          setViewStartDate(start);
        }
      } else {
        setError(data.error?.message || 'Failed to load tasks');
      }
    } catch (err) {
      setError('Failed to connect to server');
      console.error('Failed to fetch tasks:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchGanttData();
  }, [fetchGanttData]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isLoading && !updatingTask && !isDragging) {
        fetchGanttData();
      }
    }, 120000);
    return () => clearInterval(interval);
  }, [fetchGanttData, isLoading, updatingTask, isDragging]);

  const triggerAutoUpdate = async () => {
    try {
      setIsAutoUpdating(true);
      await fetch(`${API_URL}/api/tasks/project/${projectId}/auto-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      await fetchGanttData();
    } catch (err) {
      console.error('Failed to auto-update tasks:', err);
    } finally {
      setIsAutoUpdating(false);
    }
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    try {
      setUpdatingTask(taskId);
      await fetch(`${API_URL}/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await fetchGanttData();
    } catch (err) {
      console.error('Failed to update task:', err);
    } finally {
      setUpdatingTask(null);
    }
  };

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  };

  const zoomConfig = ZOOM_CONFIG[zoomLevel];
  
  const visibleDays = useMemo(() => {
    const days = zoomLevel === 'day' ? 60 : 
                 zoomLevel === 'week' ? 120 : 
                 zoomLevel === 'month' ? 365 : 
                 zoomLevel === 'quarter' ? 730 : 1095;
    return days;
  }, [zoomLevel]);

  const timelineData = useMemo(() => {
    const cells: { date: Date; label: string; subLabel?: string; isToday: boolean; isWeekend: boolean; isMonthStart: boolean }[] = [];
    const current = new Date(viewStartDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalCells = Math.ceil(visibleDays / zoomConfig.daysPerCell);

    for (let i = 0; i < totalCells; i++) {
      const cellDate = new Date(current);
      let label = '';
      let subLabel = '';
      const isToday = cellDate.toDateString() === today.toDateString();
      const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
      const isMonthStart = cellDate.getDate() === 1;

      if (zoomLevel === 'day') {
        label = cellDate.getDate().toString();
        subLabel = cellDate.toLocaleDateString('en-US', { weekday: 'short' });
      } else if (zoomLevel === 'week') {
        label = `${cellDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      } else if (zoomLevel === 'month') {
        label = cellDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      } else if (zoomLevel === 'quarter') {
        const quarter = Math.floor(cellDate.getMonth() / 3) + 1;
        label = `Q${quarter} ${cellDate.getFullYear()}`;
      } else {
        label = cellDate.getFullYear().toString();
      }

      cells.push({ date: cellDate, label, subLabel, isToday, isWeekend, isMonthStart });
      current.setDate(current.getDate() + zoomConfig.daysPerCell);
    }

    return cells;
  }, [viewStartDate, zoomLevel, zoomConfig, visibleDays]);

  const getBarPosition = useCallback((startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const viewStart = viewStartDate.getTime();
    const msPerDay = 24 * 60 * 60 * 1000;
    const pxPerDay = zoomConfig.cellWidth / zoomConfig.daysPerCell;
    
    const startDays = (start.getTime() - viewStart) / msPerDay;
    const durationDays = (end.getTime() - start.getTime()) / msPerDay + 1;
    
    return {
      left: startDays * pxPerDay,
      width: Math.max(durationDays * pxPerDay, 20),
    };
  }, [viewStartDate, zoomConfig]);

  const getTodayPosition = useCallback(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const viewStart = viewStartDate.getTime();
    const msPerDay = 24 * 60 * 60 * 1000;
    const pxPerDay = zoomConfig.cellWidth / zoomConfig.daysPerCell;
    const daysDiff = (today.getTime() - viewStart) / msPerDay;
    return daysDiff * pxPerDay;
  }, [viewStartDate, zoomConfig]);

  const scrollToToday = useCallback(() => {
    const today = new Date();
    today.setDate(today.getDate() - 7);
    setViewStartDate(today);
  }, []);

  const scrollTimeline = useCallback((direction: 'left' | 'right') => {
    const days = zoomLevel === 'day' ? 7 : 
                 zoomLevel === 'week' ? 14 : 
                 zoomLevel === 'month' ? 30 : 
                 zoomLevel === 'quarter' ? 91 : 365;
    
    setViewStartDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + (direction === 'right' ? days : -days));
      return newDate;
    });
  }, [zoomLevel]);

  const isTaskOverdue = useCallback((task: ProjectTask) => {
    if (task.status === 'DONE' || task.status === 'SKIPPED') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(task.plannedEnd);
    endDate.setHours(0, 0, 0, 0);
    return today > endDate;
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatFullDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getOverallProgress = () => {
    if (!ganttData) return 0;
    const totalTasks = ganttData.phases.reduce((sum, p) => sum + p.tasks.length, 0);
    const completedTasks = ganttData.phases.reduce(
      (sum, p) => sum + p.tasks.filter((t) => t.status === 'DONE').length,
      0
    );
    return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  };

  const getProjectStats = useMemo(() => {
    if (!ganttData) return { total: 0, completed: 0, inProgress: 0, overdue: 0, blocked: 0 };
    
    let total = 0, completed = 0, inProgress = 0, overdue = 0, blocked = 0;
    
    ganttData.phases.forEach(phase => {
      phase.tasks.forEach(task => {
        total++;
        if (task.status === 'DONE') completed++;
        else if (task.status === 'IN_PROGRESS') inProgress++;
        else if (task.status === 'BLOCKED') blocked++;
        if (isTaskOverdue(task)) overdue++;
      });
    });
    
    return { total, completed, inProgress, overdue, blocked };
  }, [ganttData, isTaskOverdue]);

  const getMonthYearHeaders = useMemo(() => {
    const headers: { label: string; width: number }[] = [];
    let currentLabel = '';
    let currentWidth = 0;

    timelineData.forEach((cell) => {
      let label = '';
      if (zoomLevel === 'day' || zoomLevel === 'week') {
        label = cell.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      } else if (zoomLevel === 'month' || zoomLevel === 'quarter') {
        label = cell.date.getFullYear().toString();
      } else {
        label = '';
      }

      if (label !== currentLabel) {
        if (currentLabel) {
          headers.push({ label: currentLabel, width: currentWidth });
        }
        currentLabel = label;
        currentWidth = zoomConfig.cellWidth;
      } else {
        currentWidth += zoomConfig.cellWidth;
      }
    });

    if (currentLabel) {
      headers.push({ label: currentLabel, width: currentWidth });
    }

    return headers;
  }, [timelineData, zoomLevel, zoomConfig]);

  const totalWidth = timelineData.length * zoomConfig.cellWidth;
  const todayPosition = getTodayPosition();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary-600 mx-auto" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">Loading project timeline...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <p className="mt-4 text-red-600 dark:text-red-400 font-medium">{error}</p>
          <Button onClick={fetchGanttData} className="mt-4">
            <RefreshCw size={16} className="mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (!ganttData) {
    return (
      <div className="text-center py-12">
        <CalendarDays className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto" />
        <p className="mt-4 text-gray-500 dark:text-gray-400">No task data available for this project.</p>
        <Link href={`/projects/${projectId}`}>
          <Button className="mt-4">Back to Project</Button>
        </Link>
      </div>
    );
  }

  const ROW_HEIGHT = 36;
  const PHASE_HEIGHT = 40;

  return (
    <div className="animate-fadeIn h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 mb-4">
        <Link 
          href={`/projects/${projectId}`}
          className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 mb-3 text-sm"
        >
          <ArrowLeft size={14} className="mr-1" />
          Back to Project
        </Link>
        
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{ganttData.project.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {ganttData.project.customerName} · {formatDate(ganttData.project.plannedStart)} - {formatDate(ganttData.project.plannedEnd)}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={triggerAutoUpdate} disabled={isAutoUpdating}>
              {isAutoUpdating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              <span className="ml-1 hidden sm:inline">Sync</span>
            </Button>
            
            <Button variant="outline" size="sm" onClick={() => fetchGanttData()} disabled={isLoading}>
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </Button>
            
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm' : ''
                }`}
              >
                <List size={14} />
                List
              </button>
              <button
                onClick={() => setViewMode('gantt')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  viewMode === 'gantt' ? 'bg-white dark:bg-gray-700 shadow-sm' : ''
                }`}
              >
                <BarChart3 size={14} />
                Gantt
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex-shrink-0 grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        {[
          { label: 'Total', value: getProjectStats.total, icon: CalendarDays, color: 'gray' },
          { label: 'Done', value: getProjectStats.completed, icon: CheckCircle, color: 'green' },
          { label: 'Active', value: getProjectStats.inProgress, icon: Play, color: 'blue' },
          { label: 'Overdue', value: getProjectStats.overdue, icon: AlertCircle, color: 'red' },
          { label: 'Blocked', value: getProjectStats.blocked, icon: AlertTriangle, color: 'orange' },
          { label: 'Progress', value: `${getOverallProgress()}%`, icon: Flag, color: 'primary' },
        ].map((stat, idx) => (
          <div key={idx} className={`bg-white dark:bg-gray-800 rounded-lg p-2.5 border border-gray-200 dark:border-gray-700`}>
            <div className="flex items-center justify-between">
              <span className={`text-lg font-bold text-${stat.color}-600`}>{stat.value}</span>
              <stat.icon size={16} className={`text-${stat.color}-500`} />
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Gantt Chart */}
      {viewMode === 'gantt' && (
        <div className="flex-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
          {/* Toolbar */}
          <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              {/* Navigation */}
              <div className="flex items-center bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <button
                  onClick={() => scrollTimeline('left')}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-l-lg transition-colors"
                  title="Scroll left"
                >
                  <ChevronsLeft size={16} />
                </button>
                <button
                  onClick={scrollToToday}
                  className="px-2 py-1 text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors border-x border-gray-200 dark:border-gray-600"
                >
                  Today
                </button>
                <button
                  onClick={() => scrollTimeline('right')}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-r-lg transition-colors"
                  title="Scroll right"
                >
                  <ChevronsRight size={16} />
                </button>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-0.5">
                {(['day', 'week', 'month', 'quarter', 'year'] as ZoomLevel[]).map((level) => (
                  <button
                    key={level}
                    onClick={() => setZoomLevel(level)}
                    className={`px-2 py-1 text-xs font-medium rounded transition-all ${
                      zoomLevel === level 
                        ? 'bg-primary-500 text-white' 
                        : 'hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                  >
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span>
                {viewStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {lastAutoUpdate && (
                <span>Updated: {lastAutoUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
          </div>

          {/* Chart Container */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Panel - Task Names */}
            <div className="w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900">
              {/* Header */}
              <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <div className="h-8 flex items-center px-3 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Task</span>
                </div>
                <div className="h-7 flex items-center px-3">
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {ganttData.phases.reduce((sum, p) => sum + p.tasks.length, 0)} tasks
                  </span>
                </div>
              </div>
              
              {/* Task List */}
              <div 
                ref={leftPanelRef}
                className="flex-1 overflow-y-auto scrollbar-hide"
                onScroll={(e) => {
                  if (rightPanelRef.current) {
                    rightPanelRef.current.scrollTop = e.currentTarget.scrollTop;
                  }
                }}
              >
                {ganttData.phases.sort((a, b) => a.orderIndex - b.orderIndex).map((phase) => (
                  <div key={phase.id}>
                    {/* Phase Row */}
                    <div
                      style={{ height: PHASE_HEIGHT }}
                      className="flex items-center px-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      onClick={() => togglePhase(phase.id)}
                    >
                      <div className="flex items-center flex-1 min-w-0">
                        {expandedPhases.has(phase.id) ? (
                          <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
                        ) : (
                          <ChevronRight size={14} className="text-gray-500 flex-shrink-0" />
                        )}
                        <span className="ml-1 font-semibold text-xs text-gray-800 dark:text-gray-200 truncate">
                          {phase.phaseName}
                        </span>
                      </div>
                      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 ml-2">
                        {phase.progress}%
                      </span>
                    </div>
                    
                    {/* Task Rows */}
                    {expandedPhases.has(phase.id) && phase.tasks.sort((a, b) => a.orderIndex - b.orderIndex).map((task) => {
                      const isOverdue = isTaskOverdue(task);
                      
                      return (
                        <div
                          key={task.id}
                          style={{ height: ROW_HEIGHT }}
                          className={`flex items-center pl-6 pr-2 border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors ${
                            selectedTask === task.id ? 'bg-blue-50 dark:bg-blue-900/30' : 
                            hoveredTask === task.id ? 'bg-gray-50 dark:bg-gray-800/50' : ''
                          } ${isOverdue ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}
                          onMouseEnter={() => setHoveredTask(task.id)}
                          onMouseLeave={() => setHoveredTask(null)}
                          onClick={() => setSelectedTask(selectedTask === task.id ? null : task.id)}
                        >
                          <div className="flex items-center flex-1 min-w-0 gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0`} style={{ backgroundColor: statusConfig[task.status].barColor }} />
                            {task.isMilestone && <Flag size={10} className="text-amber-500 flex-shrink-0" />}
                            {isOverdue && <AlertCircle size={10} className="text-red-500 flex-shrink-0" />}
                            <span className={`text-xs truncate ${
                              task.status === 'DONE' ? 'line-through text-gray-400' : 
                              isOverdue ? 'text-red-700 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'
                            }`}>
                              {task.name}
                            </span>
                          </div>
                          <span className={`text-[10px] flex-shrink-0 font-medium ${
                            task.progress === 100 ? 'text-green-600' : task.progress > 0 ? 'text-blue-600' : 'text-gray-400'
                          }`}>
                            {task.progress}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Right Panel - Timeline */}
            <div ref={timelineRef} className="flex-1 overflow-x-auto overflow-y-hidden">
              <div style={{ width: totalWidth, minWidth: '100%' }}>
                {/* Timeline Header */}
                <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  {/* Month/Year Row */}
                  <div className="h-8 flex border-b border-gray-200 dark:border-gray-700">
                    {getMonthYearHeaders.map((header, idx) => (
                      <div
                        key={idx}
                        className="border-r border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800"
                        style={{ width: header.width }}
                      >
                        {header.label}
                      </div>
                    ))}
                  </div>
                  
                  {/* Day/Week Row */}
                  <div className="h-7 flex">
                    {timelineData.map((cell, idx) => (
                      <div
                        key={idx}
                        className={`flex flex-col items-center justify-center text-[10px] border-r transition-colors ${
                          cell.isToday 
                            ? 'bg-blue-500 text-white font-bold' 
                            : cell.isWeekend && zoomLevel === 'day'
                              ? 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                              : 'text-gray-600 dark:text-gray-400'
                        } border-gray-200 dark:border-gray-700`}
                        style={{ width: zoomConfig.cellWidth }}
                      >
                        <span>{cell.label}</span>
                        {cell.subLabel && <span className="text-[8px] opacity-70">{cell.subLabel}</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chart Area */}
                <div 
                  ref={rightPanelRef}
                  className="relative overflow-y-auto"
                  style={{ height: 'calc(100vh - 380px)', minHeight: 300 }}
                  onScroll={(e) => {
                    if (leftPanelRef.current) {
                      leftPanelRef.current.scrollTop = e.currentTarget.scrollTop;
                    }
                  }}
                >
                  {/* Grid Background */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {timelineData.map((cell, idx) => (
                      <div
                        key={idx}
                        className={`h-full border-r ${
                          cell.isWeekend && zoomLevel === 'day'
                            ? 'bg-gray-50 dark:bg-gray-800/30'
                            : 'bg-white dark:bg-gray-900'
                        } border-gray-100 dark:border-gray-800`}
                        style={{ width: zoomConfig.cellWidth }}
                      />
                    ))}
                  </div>

                  {/* Today Line */}
                  {todayPosition > 0 && todayPosition < totalWidth && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                      style={{ left: todayPosition }}
                    >
                      <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-b whitespace-nowrap">
                        TODAY
                      </div>
                    </div>
                  )}

                  {/* Bars */}
                  <div className="relative">
                    {ganttData.phases.sort((a, b) => a.orderIndex - b.orderIndex).map((phase) => (
                      <div key={phase.id}>
                        {/* Phase Bar */}
                        <div style={{ height: PHASE_HEIGHT }} className="relative">
                          {(() => {
                            const pos = getBarPosition(phase.plannedStart, phase.plannedEnd);
                            if (pos.left + pos.width < 0 || pos.left > totalWidth) return null;
                            
                            return (
                              <div
                                className="absolute top-1.5 rounded shadow-sm overflow-hidden cursor-pointer group"
                                style={{ 
                                  left: Math.max(0, pos.left), 
                                  width: pos.width,
                                  height: PHASE_HEIGHT - 12
                                }}
                              >
                                <div className="absolute inset-0 bg-gradient-to-b from-slate-400 to-slate-500 dark:from-slate-600 dark:to-slate-700" />
                                <div
                                  className="absolute inset-y-0 left-0 bg-gradient-to-b from-blue-400 to-blue-500"
                                  style={{ width: `${phase.progress}%` }}
                                />
                                <div className="absolute inset-0 flex items-center px-2">
                                  <span className="text-[10px] font-bold text-white drop-shadow truncate">
                                    {phase.phaseName}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Task Bars */}
                        {expandedPhases.has(phase.id) && phase.tasks.sort((a, b) => a.orderIndex - b.orderIndex).map((task) => {
                          const pos = getBarPosition(task.plannedStart, task.plannedEnd);
                          const config = statusConfig[task.status];
                          const isOverdue = isTaskOverdue(task);
                          
                          if (pos.left + pos.width < 0 || pos.left > totalWidth) {
                            return <div key={task.id} style={{ height: ROW_HEIGHT }} />;
                          }
                          
                          return (
                            <div
                              key={task.id}
                              style={{ height: ROW_HEIGHT }}
                              className={`relative ${
                                selectedTask === task.id ? 'bg-blue-50/30 dark:bg-blue-900/10' : 
                                hoveredTask === task.id ? 'bg-gray-50/50 dark:bg-gray-800/20' : ''
                              }`}
                              onMouseEnter={() => setHoveredTask(task.id)}
                              onMouseLeave={() => setHoveredTask(null)}
                            >
                              {task.isMilestone ? (
                                <div
                                  className="absolute top-1/2 -translate-y-1/2 z-10"
                                  style={{ left: pos.left }}
                                >
                                  <div 
                                    className="w-4 h-4 rotate-45 shadow-lg border-2 border-white dark:border-gray-900"
                                    style={{ backgroundColor: config.barColor }}
                                  />
                                </div>
                              ) : (
                                <div
                                  className={`absolute top-1 rounded cursor-pointer transition-all group ${
                                    hoveredTask === task.id || selectedTask === task.id
                                      ? 'ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-gray-900 z-10' 
                                      : ''
                                  } ${isOverdue ? 'ring-2 ring-red-400 ring-offset-1 dark:ring-offset-gray-900' : ''}`}
                                  style={{ 
                                    left: pos.left, 
                                    width: pos.width,
                                    height: ROW_HEIGHT - 8
                                  }}
                                >
                                  {/* Background */}
                                  <div 
                                    className="absolute inset-0 rounded"
                                    style={{ backgroundColor: config.barBg }}
                                  />
                                  
                                  {/* Progress */}
                                  <div
                                    className={`absolute inset-y-0 left-0 rounded-l ${task.progress === 100 ? 'rounded-r' : ''}`}
                                    style={{ 
                                      width: `${task.progress}%`,
                                      backgroundColor: config.barColor
                                    }}
                                  />
                                  
                                  {/* Overdue stripes */}
                                  {isOverdue && task.status !== 'DONE' && (
                                    <div 
                                      className="absolute inset-0 rounded opacity-30"
                                      style={{
                                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(239,68,68,0.5) 3px, rgba(239,68,68,0.5) 6px)'
                                      }}
                                    />
                                  )}
                                  
                                  {/* Label */}
                                  <div className="absolute inset-0 flex items-center px-1.5 overflow-hidden">
                                    <span className={`text-[10px] font-medium truncate ${
                                      task.progress > 30 ? 'text-white' : 'text-gray-700 dark:text-gray-200'
                                    }`}>
                                      {task.name}
                                    </span>
                                  </div>

                                  {/* Resize handles */}
                                  <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-blue-500/50 rounded-l" />
                                  <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-blue-500/50 rounded-r" />
                                </div>
                              )}

                              {/* Tooltip */}
                              {(hoveredTask === task.id || selectedTask === task.id) && (
                                <div 
                                  className="absolute z-50 bg-gray-900 text-white text-[10px] rounded-lg p-2.5 shadow-xl pointer-events-none"
                                  style={{ 
                                    left: Math.min(pos.left + pos.width / 2, totalWidth - 200),
                                    bottom: '100%',
                                    marginBottom: 4,
                                    transform: 'translateX(-50%)',
                                    minWidth: 180
                                  }}
                                >
                                  <div className="font-semibold text-xs mb-1.5">{task.name}</div>
                                  <div className="space-y-0.5 text-gray-300">
                                    <div className="flex justify-between">
                                      <span>Start:</span>
                                      <span className="text-white">{formatFullDate(task.plannedStart)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>End:</span>
                                      <span className="text-white">{formatFullDate(task.plannedEnd)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Duration:</span>
                                      <span className="text-white">{task.duration} days</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Progress:</span>
                                      <span className={task.progress === 100 ? 'text-green-400' : 'text-white'}>{task.progress}%</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Status:</span>
                                      <span style={{ color: config.barColor }}>{config.label}</span>
                                    </div>
                                    {isOverdue && (
                                      <div className="text-red-400 font-medium mt-1 pt-1 border-t border-gray-700">
                                        ⚠ Overdue
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 px-3 py-2 bg-gray-50 dark:bg-gray-800 flex flex-wrap items-center gap-3 text-[10px]">
            <span className="font-semibold text-gray-600 dark:text-gray-300">Legend:</span>
            {Object.entries(statusConfig).slice(0, 5).map(([key, config]) => (
              <div key={key} className="flex items-center gap-1">
                <div className="w-3 h-2.5 rounded" style={{ backgroundColor: config.barColor }} />
                <span className="text-gray-600 dark:text-gray-400">{config.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rotate-45 bg-amber-500" />
              <span className="text-gray-600 dark:text-gray-400">Milestone</span>
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <div className="w-0.5 h-3 bg-red-500" />
              <span className="text-gray-600 dark:text-gray-400">Today</span>
            </div>
          </div>
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="flex-1 overflow-auto space-y-3">
          {ganttData.phases.sort((a, b) => a.orderIndex - b.orderIndex).map((phase) => {
            const phaseConfig = statusConfig[phase.status];
            const PhaseIcon = phaseConfig.icon;
            
            return (
              <Card key={phase.id} className="overflow-hidden">
                <div
                  className="flex items-center justify-between cursor-pointer p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  onClick={() => togglePhase(phase.id)}
                >
                  <div className="flex items-center gap-2">
                    {expandedPhases.has(phase.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <div className={`p-1.5 rounded ${phaseConfig.bg}`}>
                      <PhaseIcon size={16} className={phaseConfig.color} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900 dark:text-white">{phase.phaseName}</h3>
                      <p className="text-xs text-gray-500">{formatDate(phase.plannedStart)} - {formatDate(phase.plannedEnd)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium">{phase.tasks.filter(t => t.status === 'DONE').length}/{phase.tasks.length}</span>
                    <div className="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${phase.status === 'COMPLETED' ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${phase.progress}%` }} />
                    </div>
                    <span className="text-xs font-medium w-8">{phase.progress}%</span>
                  </div>
                </div>

                {expandedPhases.has(phase.id) && (
                  <div className="border-t border-gray-200 dark:border-gray-700">
                    {phase.tasks.sort((a, b) => a.orderIndex - b.orderIndex).map((task) => {
                      const taskConfig = statusConfig[task.status];
                      const TaskIcon = taskConfig.icon;
                      const isOverdue = isTaskOverdue(task);
                      
                      return (
                        <div key={task.id} className={`flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${isOverdue ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                          <div className="flex items-center gap-2">
                            <TaskIcon size={14} className={taskConfig.color} />
                            <div>
                              <span className={`text-sm ${task.status === 'DONE' ? 'line-through text-gray-400' : ''}`}>{task.name}</span>
                              <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                <Calendar size={10} />
                                {formatDate(task.plannedStart)} - {formatDate(task.plannedEnd)}
                                <span>·</span>
                                {task.duration}d
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={task.status}
                              onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                              disabled={updatingTask === task.id}
                              className={`text-xs border rounded px-1.5 py-1 ${taskConfig.bg} ${taskConfig.color}`}
                            >
                              <option value="TODO">To Do</option>
                              <option value="IN_PROGRESS">In Progress</option>
                              <option value="DONE">Done</option>
                              <option value="BLOCKED">Blocked</option>
                              <option value="SKIPPED">Skipped</option>
                            </select>
                            {updatingTask === task.id && <Loader2 size={12} className="animate-spin" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
