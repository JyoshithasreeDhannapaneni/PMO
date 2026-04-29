'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useProject } from '@/hooks/useProjects';
import {
  Loader2, ChevronRight, Edit, MoreVertical, CheckCircle2,
  AlertTriangle, Users, FileText, Clock, Zap, DollarSign,
  Calendar, BarChart2, ClipboardList, Flag, Shield, BookOpen,
  History, Mail, ChevronDown, User,
} from 'lucide-react';
import { format, differenceInDays, addDays, eachMonthOfInterval, startOfMonth, endOfMonth } from 'date-fns';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type TabId = 'overview' | 'gantt' | 'tasks' | 'milestones' | 'risks' | 'documents' | 'team' | 'history';

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart2 },
  { id: 'gantt', label: 'Gantt Chart', icon: BarChart2 },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'milestones', label: 'Milestones', icon: Flag },
  { id: 'risks', label: 'Risks & Issues', icon: Shield },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'history', label: 'History', icon: History },
];

const PHASE_ICONS: Record<string, string> = {
  KICKOFF: '1', MIGRATION: '2', VALIDATION: '3', CLOSURE: '4', COMPLETED: '5',
};

// Phase-based tasks (template data)
const PHASE_TASKS: Record<string, string[]> = {
  KICKOFF: ['Project Kickoff', 'Requirements Gathering'],
  MIGRATION: ['System Analysis', 'Design & Architecture', 'Configuration', 'Content Migration'],
  VALIDATION: ['Test Planning', 'UAT & Final Testing'],
  CLOSURE: ['Go Live', 'Post Go-Live Support'],
  COMPLETED: ['Project Closure', 'Final Report'],
};

const PHASE_LABELS: Record<string, string> = {
  KICKOFF: 'Kickoff & Planning',
  MIGRATION: 'Analysis & Development',
  VALIDATION: 'Testing',
  CLOSURE: 'Deployment',
  COMPLETED: 'Completed',
};

const PHASE_ORDER = ['KICKOFF', 'MIGRATION', 'VALIDATION', 'CLOSURE', 'COMPLETED'];

const STATUS_COLORS: Record<string, string> = {
  'NOT_DELAYED': '#22c55e', 'AT_RISK': '#f97316', 'DELAYED': '#ef4444',
};

function getStatusLabel(project: any): string {
  if (project.status === 'COMPLETED') return 'Completed';
  if (project.status === 'ON_HOLD' || project.status === 'CANCELLED') return 'On Hold';
  if (project.delayStatus === 'DELAYED') return 'Delayed';
  if (project.delayStatus === 'AT_RISK') return 'At Risk';
  return 'On Track';
}

function getStatusBadgeStyle(label: string) {
  switch (label) {
    case 'On Track': return 'bg-green-100 text-green-700 border-green-300';
    case 'Completed': return 'bg-blue-100 text-blue-700 border-blue-300';
    case 'Delayed': return 'bg-red-100 text-red-700 border-red-300';
    case 'At Risk': return 'bg-orange-100 text-orange-700 border-orange-300';
    default: return 'bg-gray-100 text-gray-700 border-gray-300';
  }
}

function getMigrationLabel(types: string | null) {
  if (!types) return 'N/A';
  const t = types.toUpperCase();
  if (t.includes('CONTENT')) return 'Content Migration';
  if (t.includes('EMAIL')) return 'Email Migration';
  if (t.includes('MESSAGING')) return 'Messaging Migration';
  return types;
}

function getProgress(project: any): number {
  if (project.status === 'COMPLETED') return 100;
  if (project.status === 'ON_HOLD') return 0;
  const phaseProgress: Record<string, number> = { KICKOFF: 10, MIGRATION: 40, VALIDATION: 65, CLOSURE: 85, COMPLETED: 100 };
  return phaseProgress[project.phase] ?? 20;
}

function getPriority(project: any): string {
  if (project.delayStatus === 'DELAYED') return 'High';
  if (project.delayStatus === 'AT_RISK') return 'Medium';
  return 'Low';
}

function getPriorityStyle(p: string) {
  if (p === 'High') return 'bg-red-100 text-red-700';
  if (p === 'Medium') return 'bg-orange-100 text-orange-700';
  return 'bg-green-100 text-green-700';
}

function calcDuration(start: string, end: string): number {
  return Math.max(1, differenceInDays(new Date(end), new Date(start)));
}

// ── Mini Gantt in Overview ───────────────────────────────────────────────────
function MiniGantt({ project }: { project: any }) {
  const phases = PHASE_ORDER.slice(0, PHASE_ORDER.indexOf(project.phase) + 2).filter(Boolean);
  const totalDuration = calcDuration(project.plannedStart, project.plannedEnd);
  const dayWidth = 3; // px per day
  const totalWidth = totalDuration * dayWidth;
  const phaseColors = ['#6366f1', '#3b82f6', '#f59e0b', '#22c55e', '#10b981'];

  const months = eachMonthOfInterval({
    start: startOfMonth(new Date(project.plannedStart)),
    end: endOfMonth(new Date(project.plannedEnd)),
  });

  const rangeStart = startOfMonth(new Date(project.plannedStart));
  const progress = getProgress(project);

  return (
    <div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: Math.max(totalWidth + 200, 500) }}>
          {/* Month header */}
          <div className="flex mb-2 ml-[180px] relative h-5">
            {months.map((m) => {
              const left = differenceInDays(m < new Date(project.plannedStart) ? new Date(project.plannedStart) : m, rangeStart) * dayWidth;
              const daysInMonth = Math.min(
                differenceInDays(endOfMonth(m), m < new Date(project.plannedStart) ? new Date(project.plannedStart) : m) + 1,
                differenceInDays(new Date(project.plannedEnd), m) + 1
              );
              const width = daysInMonth * dayWidth;
              return (
                <div key={m.toISOString()} className="absolute text-xs font-semibold text-gray-700 dark:text-gray-300" style={{ left, width }}>
                  {format(m, 'MMM yyyy')}
                </div>
              );
            })}
          </div>

          {/* Phase rows */}
          {PHASE_ORDER.map((phase, pi) => {
            const phaseIndex = PHASE_ORDER.indexOf(project.phase);
            const tasks = PHASE_TASKS[phase] || [];
            const isCompleted = pi < phaseIndex;
            const isCurrent = pi === phaseIndex;
            const phaseDuration = Math.round(totalDuration / PHASE_ORDER.length);
            const phaseStart = pi * phaseDuration;
            const phaseWidth = Math.min(phaseDuration, totalDuration - phaseStart);
            const phaseProgress = isCompleted ? 100 : isCurrent ? progress : 0;
            const color = phaseColors[pi % phaseColors.length];

            return (
              <div key={phase} className="mb-2">
                {/* Phase header */}
                <div className="flex items-center mb-1">
                  <div className="w-[180px] flex-shrink-0 flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                      {pi + 1}. {PHASE_LABELS[phase] || phase}
                    </span>
                  </div>
                  <div className="relative" style={{ width: Math.max(phaseWidth * dayWidth, 60), height: 20 }}>
                    <div className="absolute inset-y-0 left-0 rounded" style={{ width: '100%', background: color + '20' }} />
                    <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${phaseProgress}%`, background: color }} />
                    <span className="absolute right-[-36px] top-0 text-xs font-semibold" style={{ color }}>{phaseProgress}%</span>
                  </div>
                </div>

                {/* Tasks */}
                {tasks.map((task, ti) => {
                  const taskDuration = Math.round(phaseDuration / tasks.length);
                  const taskStart = phaseStart + ti * taskDuration;
                  const taskWidth = Math.min(taskDuration, totalDuration - taskStart);
                  const taskProgress = isCompleted ? 100 : isCurrent && ti === 0 ? Math.min(100, progress * 1.5) : 0;
                  return (
                    <div key={task} className="flex items-center mb-1">
                      <div className="w-[180px] flex-shrink-0 pl-5 flex items-center gap-1">
                        <ChevronRight size={10} className="text-gray-400" />
                        <span className="text-xs text-gray-600 dark:text-gray-400">{task}</span>
                      </div>
                      <div style={{ marginLeft: 0, width: Math.max(taskWidth * dayWidth, 40), height: 16 }} className="relative rounded overflow-hidden">
                        <div className="absolute inset-0 rounded" style={{ background: color + '15' }} />
                        <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${taskProgress}%`, background: color + '60' }} />
                      </div>
                      {taskProgress > 0 && <span className="ml-2 text-xs" style={{ color }}>{Math.round(taskProgress)}%</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Today marker */}
          <div className="ml-[180px] relative h-1">
            {(() => {
              const todayOffset = differenceInDays(new Date(), rangeStart) * dayWidth;
              return todayOffset > 0 && todayOffset < totalWidth ? (
                <div className="absolute flex flex-col items-center" style={{ left: todayOffset - 20 }}>
                  <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded font-semibold">Today</span>
                </div>
              ) : null;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ project, risks, team }: { project: any; risks: any[]; team: any[] }) {
  const progress = getProgress(project);
  const statusLabel = getStatusLabel(project);
  const priority = getPriority(project);

  // Simulate task counts from phase
  const phaseIndex = PHASE_ORDER.indexOf(project.phase);
  const totalTasks = 12;
  const completedTasks = Math.round((progress / 100) * totalTasks);
  const inProgressTasks = Math.min(3, totalTasks - completedTasks);
  const pendingTasks = totalTasks - completedTasks - inProgressTasks;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Project Details */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Project Details</h3>
          <div className="space-y-3">
            {[
              { label: 'Portfolio / Project Name', value: project.name },
              { label: 'Migration Type', value: getMigrationLabel(project.migrationTypes) },
              { label: 'Account Manager', value: project.accountManager || 'N/A' },
              { label: 'Project Manager', value: project.projectManager },
              { label: 'Status', value: null, badge: statusLabel, badgeStyle: getStatusBadgeStyle(statusLabel) },
              { label: 'Priority', value: null, badge: priority, badgeStyle: getPriorityStyle(priority) },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-44 flex-shrink-0 pt-0.5">{item.label}</span>
                <span className="text-gray-300 dark:text-gray-600">:</span>
                {item.badge ? (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${item.badgeStyle}`}>{item.badge}</span>
                ) : (
                  <span className="text-sm text-gray-800 dark:text-gray-200 flex-1">{item.value}</span>
                )}
              </div>
            ))}
            {project.description && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-44 flex-shrink-0 pt-0.5">Description</span>
                <span className="text-gray-300 dark:text-gray-600">:</span>
                <span className="text-xs text-gray-600 dark:text-gray-400 flex-1 italic">{project.description}</span>
              </div>
            )}
          </div>
        </div>

        {/* Timeline Gantt */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Timeline (Gantt Chart)</h3>
          <MiniGantt project={project} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Progress Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Progress Summary</h3>
          <div className="space-y-3">
            {[
              { label: 'Completed Tasks', value: `${completedTasks} / ${totalTasks}`, bar: (completedTasks / totalTasks) * 100, color: 'bg-green-500' },
              { label: 'In Progress Tasks', value: `${inProgressTasks} / ${totalTasks}`, bar: (inProgressTasks / totalTasks) * 100, color: 'bg-blue-500' },
              { label: 'Pending Tasks', value: `${pendingTasks} / ${totalTasks}`, bar: (pendingTasks / totalTasks) * 100, color: 'bg-orange-400' },
              { label: 'Overall Progress', value: `${progress}%`, bar: progress, color: 'bg-green-500' },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600 dark:text-gray-400">{item.label}</span>
                  <span className="text-xs font-semibold text-gray-900 dark:text-white">{item.value}</span>
                </div>
                <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.bar}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risks & Issues */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Risks & Issues</h3>
            <Link href={`/projects/${project.id}/manage`} className="text-xs text-primary-600 hover:text-primary-700 font-medium">View All</Link>
          </div>
          {risks.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <Shield size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">No risks recorded</p>
            </div>
          ) : (
            <div className="space-y-3">
              {risks.slice(0, 3).map((r: any) => (
                <div key={r.id} className="flex items-start gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL' ? 'bg-red-100 text-red-700' : r.riskLevel === 'MEDIUM' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                    {r.riskLevel === 'CRITICAL' ? 'High' : r.riskLevel?.charAt(0) + r.riskLevel?.slice(1).toLowerCase()}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{r.title || r.description?.slice(0, 50)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Reported on {r.createdAt ? format(new Date(r.createdAt), 'MMM dd, yyyy') : 'N/A'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Team Members */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Team Members</h3>
            <Link href={`/projects/${project.id}/manage`} className="text-xs text-primary-600 hover:text-primary-700 font-medium">View All</Link>
          </div>
          {team.length === 0 ? (
            <div className="space-y-3">
              {/* Show PM and Account Manager from project data */}
              {[
                { name: project.projectManager, role: 'Project Manager', badge: 'Owner', badgeCls: 'bg-blue-100 text-blue-700' },
                project.accountManager ? { name: project.accountManager, role: 'Account Manager', badge: 'Account', badgeCls: 'bg-purple-100 text-purple-700' } : null,
              ].filter(Boolean).map((m: any) => (
                <div key={m.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-sm font-bold text-primary-700 dark:text-primary-300">
                      {m.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{m.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{m.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.badgeCls}`}>{m.badge}</span>
                    <button className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><Mail size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {team.slice(0, 4).map((m: any) => (
                <div key={m.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-sm font-bold text-primary-700 dark:text-primary-300">
                      {(m.memberName || m.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{m.memberName || m.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{m.role?.replace(/_/g, ' ')?.charAt(0) + m.role?.slice(1)?.toLowerCase().replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">{m.role === 'PROJECT_MANAGER' ? 'Owner' : 'Member'}</span>
                    <button className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><Mail size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PortfolioDetailPage({ params }: { params: { id: string } }) {
  const { data, isLoading, error } = useProject(params.id);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [risks, setRisks] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_URL}/api/risks/project/${params.id}`, { headers }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch(`${API_URL}/api/team/project/${params.id}`, { headers }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([riskRes, teamRes]) => {
      setRisks(riskRes.data || []);
      setTeam(teamRes.data || []);
    });
  }, [params.id]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
    </div>
  );

  if (error || !data?.data) return (
    <div className="text-center py-12">
      <p className="text-red-600">Failed to load project</p>
      <Link href="/portfolio" className="mt-4 inline-block text-sm text-primary-600 hover:underline">← Back to Portfolio</Link>
    </div>
  );

  const project = data.data;
  const statusLabel = getStatusLabel(project);
  const progress = getProgress(project);
  const duration = calcDuration(project.plannedStart, project.plannedEnd);
  const badgeStyle = getStatusBadgeStyle(statusLabel);

  // Simulate project code from id
  const projectCode = `PRJ-${String(project.id).slice(-3).toUpperCase()}`;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm">
        <Link href="/portfolio" className="text-primary-600 hover:text-primary-700 font-medium">Portfolio</Link>
        <ChevronRight size={14} className="text-gray-400" />
        <span className="text-gray-900 dark:text-white font-medium">{project.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Zap size={20} className="text-primary-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{project.name}</h1>
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${badgeStyle}`}>{statusLabel}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1 flex-wrap">
              <span>{getMigrationLabel(project.migrationTypes)}</span>
              <span className="text-gray-300">•</span>
              <span>Code: {projectCode}</span>
              <span className="text-gray-300">•</span>
              <span>Created on {format(new Date(project.createdAt), 'MMM dd, yyyy')}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href={`/projects/${project.id}/edit`}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Edit size={14} /> Edit Project
          </Link>
          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              Actions <ChevronDown size={14} />
            </button>
            {showActions && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 py-1">
                <Link href={`/projects/${project.id}/tasks`} onClick={() => setShowActions(false)} className="block px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">View Tasks</Link>
                <Link href={`/projects/${project.id}/manage`} onClick={() => setShowActions(false)} className="block px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Manage Project</Link>
                <Link href={`/projects/${project.id}/edit`} onClick={() => setShowActions(false)} className="block px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Edit Project</Link>
              </div>
            )}
          </div>
          <button className="p-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Overall Progress */}
        <div className="col-span-2 sm:col-span-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">Overall Progress</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{progress}%</p>
          <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full mt-1.5 overflow-hidden">
            <div className="h-full bg-primary-500 rounded-full" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {[
          { label: 'Status', icon: CheckCircle2, value: statusLabel, valueEl: <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusLabel === 'On Track' ? 'bg-green-100 text-green-700' : statusLabel === 'Delayed' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{statusLabel}</span> },
          { label: 'Start Date', icon: Calendar, value: format(new Date(project.plannedStart), 'MMM dd, yyyy') },
          { label: 'End Date', icon: Calendar, value: format(new Date(project.plannedEnd), 'MMM dd, yyyy') },
          { label: 'Duration', icon: Clock, value: `${duration} Days` },
          { label: 'Manager', icon: User, value: project.projectManager },
          { label: 'Budget', icon: DollarSign, value: project.estimatedCost ? `$${Number(project.estimatedCost).toLocaleString()}` : 'N/A' },
        ].map((item) => (
          <div key={item.label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <item.icon size={13} className="text-gray-400" />
              <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
            </div>
            {item.valueEl || <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.value}</p>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === tab.id ? 'border-primary-600 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab project={project} risks={risks} team={team} />}

      {activeTab === 'gantt' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Project Gantt Chart</h3>
          <MiniGantt project={project} />
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-center">
            <Link href={`/projects/${project.id}/tasks`} className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              View Full Gantt Chart →
            </Link>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tasks</h3>
            <Link href={`/projects/${project.id}/tasks`} className="text-xs text-primary-600 hover:text-primary-700 font-medium">Open Task Manager →</Link>
          </div>
          {Object.entries(PHASE_TASKS).map(([phase, tasks]) => (
            <div key={phase} className="mb-4">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">{PHASE_LABELS[phase]}</p>
              <div className="space-y-1.5">
                {tasks.map((t) => (
                  <div key={t} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <CheckCircle2 size={14} className={PHASE_ORDER.indexOf(phase) < PHASE_ORDER.indexOf(project.phase) ? 'text-green-500' : 'text-gray-300'} />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'risks' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Risks & Issues</h3>
          {risks.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Shield size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No risks recorded for this project</p>
              <Link href={`/projects/${project.id}/manage`} className="mt-3 inline-block text-sm text-primary-600 hover:underline">Manage Risks →</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {risks.map((r: any) => (
                <div key={r.id} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold flex-shrink-0 mt-0.5 ${r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL' ? 'bg-red-100 text-red-700' : r.riskLevel === 'MEDIUM' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                    {r.riskLevel?.charAt(0) + r.riskLevel?.slice(1)?.toLowerCase()}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.title || r.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Reported on {r.createdAt ? format(new Date(r.createdAt), 'MMM dd, yyyy') : 'N/A'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'team' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Team Members</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(team.length > 0 ? team : [
              { id: '1', memberName: project.projectManager, role: 'PROJECT_MANAGER' },
              project.accountManager ? { id: '2', memberName: project.accountManager, role: 'ACCOUNT_MANAGER' } : null,
            ].filter(Boolean)).map((m: any) => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-sm font-bold text-primary-700 dark:text-primary-300">
                    {(m.memberName || m.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{m.memberName || m.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{m.role?.replace(/_/g, ' ')}</p>
                  </div>
                </div>
                <button className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><Mail size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {['documents', 'milestones', 'history'].includes(activeTab) && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
          <BookOpen size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {activeTab === 'documents' ? 'Documents' : activeTab === 'milestones' ? 'Milestones' : 'History'} are managed in the project detail view.
          </p>
          <Link href={`/projects/${project.id}/manage`} className="mt-3 inline-block text-sm text-primary-600 hover:underline">
            Open Project Manager →
          </Link>
        </div>
      )}
    </div>
  );
}
