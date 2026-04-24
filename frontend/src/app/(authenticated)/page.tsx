'use client';

import { useState } from 'react';
import { useDashboard } from '@/hooks/useProjects';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';
import {
  Loader2,
  FolderKanban,
  PlayCircle,
  CheckCircle,
  PauseCircle,
  AlertTriangle,
  AlertCircle,
  Clock,
  Activity,
  BarChart3,
  FileText,
  RefreshCw,
  ChevronRight,
  Mail,
  FolderOpen,
  MessageSquare,
  Plus,
  User,
  Users,
  Calendar,
  Target,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

type ViewMode = 'my' | 'overall';

export default function DashboardPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const dash = settings.dashboardSettings;

  // Admins default to overall; managers default to my view
  const isAdmin = user?.role === 'ADMIN';
  const [viewMode, setViewMode] = useState<ViewMode>(isAdmin ? 'overall' : 'my');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pass manager name when My View is active for MANAGER role
  const managerFilter = viewMode === 'my' && !isAdmin ? (user?.name ?? '') : undefined;

  const { data, isLoading, error, refetch } = useDashboard(managerFilter);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">Failed to load dashboard</h2>
          <p className="mt-2 text-gray-500">Please check if the backend server is running</p>
          <button onClick={handleRefresh} className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const {
    stats,
    projectsByStatus,
    projectsByPhase,
    recentActivity,
    delaySummary,
    upcomingDeadlines,
    migrationTypeStats,
  } = data.data;

  const healthScore = stats.totalProjects > 0
    ? Math.round(((stats.totalProjects - stats.delayedProjects - stats.atRiskProjects) / stats.totalProjects) * 100)
    : 100;

  const completionRate = stats.totalProjects > 0
    ? Math.round((stats.completedProjects / stats.totalProjects) * 100)
    : 0;

  const healthLabel = healthScore >= 90 ? 'Excellent' : healthScore >= 70 ? 'Good' : healthScore >= 50 ? 'Fair' : 'Needs Attention';

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">PMO Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Welcome back, {user?.name || 'Manager'}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* My View / Overall View toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-xl p-1 gap-1">
            <button
              onClick={() => setViewMode('my')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'my'
                  ? 'bg-white dark:bg-gray-800 text-primary-700 dark:text-primary-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <User size={15} />
              My View
            </button>
            <button
              onClick={() => setViewMode('overall')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'overall'
                  ? 'bg-white dark:bg-gray-800 text-primary-700 dark:text-primary-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <Users size={15} />
              Overall View
            </button>
          </div>

          {/* View badge */}
          <span className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
            viewMode === 'my'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
              : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
          }`}>
            {viewMode === 'my' ? <User size={11} /> : <Users size={11} />}
            {viewMode === 'my' ? 'My projects only' : 'All managers'}
          </span>

          {/* Timestamp + Refresh */}
          <span className="text-xs text-gray-400 hidden md:block">
            Updated {format(new Date(), 'MMM d · h:mm a')}
          </span>
          <button
            onClick={handleRefresh}
            className={`p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 transition-all ${isRefreshing ? 'animate-spin' : ''}`}
          >
            <RefreshCw size={16} className="text-gray-500" />
          </button>

          <Link
            href="/projects/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus size={16} /> New Project
          </Link>
        </div>
      </div>

      {/* ── View context banner ────────────────────────────────────── */}
      {viewMode === 'my' && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-700 dark:text-blue-300">
          <User size={16} className="flex-shrink-0" />
          <span>
            <strong>My View</strong> — Showing only projects, tasks, and metrics assigned to{' '}
            <strong>{user?.name}</strong>.
            {!isAdmin && (
              <button onClick={() => setViewMode('overall')} className="ml-2 underline hover:no-underline">
                Switch to Overall View
              </button>
            )}
          </span>
        </div>
      )}

      {/* ── KPI Row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Portfolio Health */}
        <Link href="/projects" className="col-span-2 lg:col-span-1 block group">
          <Card className="bg-gradient-to-br from-primary-600 to-primary-700 text-white border-0 h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-primary-100 text-sm font-medium">Portfolio Health</p>
                <p className="text-4xl font-bold mt-1">{healthScore}%</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                  healthScore >= 90 ? 'bg-green-400/30 text-green-100' :
                  healthScore >= 70 ? 'bg-yellow-400/30 text-yellow-100' : 'bg-red-400/30 text-red-100'
                }`}>
                  {healthLabel}
                </span>
              </div>
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                <Activity size={30} className="text-white" />
              </div>
            </div>
          </Card>
        </Link>

        {/* Total Projects */}
        <Link href="/projects" className="block group">
          <Card className="h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Projects</p>
                <p className="text-4xl font-bold text-gray-900 dark:text-white mt-1">{stats.totalProjects}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Link href="/projects?status=ACTIVE" onClick={(e) => e.stopPropagation()} className="text-green-600 dark:text-green-400 text-xs font-medium hover:underline">{stats.activeProjects} active</Link>
                  <span className="text-gray-300">•</span>
                  <Link href="/projects?status=COMPLETED" onClick={(e) => e.stopPropagation()} className="text-blue-600 dark:text-blue-400 text-xs font-medium hover:underline">{stats.completedProjects} done</Link>
                  {stats.onHoldProjects > 0 && (
                    <>
                      <span className="text-gray-300">•</span>
                      <Link href="/projects?status=ON_HOLD" onClick={(e) => e.stopPropagation()} className="text-yellow-600 dark:text-yellow-400 text-xs font-medium hover:underline">{stats.onHoldProjects} on hold</Link>
                    </>
                  )}
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/40 flex items-center justify-center">
                <FolderKanban size={24} className="text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </Card>
        </Link>

        {/* Completion Rate */}
        <Link href="/projects?status=COMPLETED" className="block group">
          <Card className="h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Completion Rate</p>
                <p className="text-4xl font-bold text-gray-900 dark:text-white mt-1">{completionRate}%</p>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mt-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${completionRate}%` }} />
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-50 dark:bg-green-900/40 flex items-center justify-center ml-3">
                <Target size={24} className="text-green-600 dark:text-green-400" />
              </div>
            </div>
          </Card>
        </Link>

        {/* Risk Status */}
        <Link href="/projects?delayStatus=DELAYED" className="block group">
          <Card className={`h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg cursor-pointer ${stats.delayedProjects + stats.atRiskProjects > 0 ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20' : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${stats.delayedProjects + stats.atRiskProjects > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  Risk Status
                </p>
                <p className={`text-4xl font-bold mt-1 ${stats.delayedProjects + stats.atRiskProjects > 0 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>
                  {stats.delayedProjects + stats.atRiskProjects}
                </p>
                <p className={`text-xs mt-1 ${stats.delayedProjects + stats.atRiskProjects > 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {stats.atRiskProjects} at risk • {stats.delayedProjects} delayed
                  {stats.onHoldProjects > 0 && ` • ${stats.onHoldProjects} on hold`}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stats.delayedProjects + stats.atRiskProjects > 0 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-green-100 dark:bg-green-900/40'}`}>
                <AlertTriangle size={24} className={stats.delayedProjects + stats.atRiskProjects > 0 ? 'text-red-600' : 'text-green-600'} />
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {/* ── Quick Stats Row ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'New (30d)', value: migrationTypeStats?.totals?.newProjects ?? 0, icon: Plus, bg: 'bg-purple-100 dark:bg-purple-900/40', color: 'text-purple-600 dark:text-purple-400', href: '/projects?sortBy=createdAt&sortOrder=desc' },
          { label: 'Overaged', value: migrationTypeStats?.totals?.overaged ?? 0, icon: Clock, bg: 'bg-orange-100 dark:bg-orange-900/40', color: 'text-orange-600 dark:text-orange-400', href: '/projects?delayStatus=OVERDUE' },
          { label: 'Pending Cases', value: stats.pendingCaseStudies, icon: FileText, bg: 'bg-indigo-100 dark:bg-indigo-900/40', color: 'text-indigo-600 dark:text-indigo-400', href: '/case-studies' },
          { label: 'Avg Delay (d)', value: stats.avgDelayDays, icon: TrendingUp, bg: 'bg-gray-100 dark:bg-gray-700', color: 'text-gray-600 dark:text-gray-400', href: '/projects?delayStatus=DELAYED' },
        ].map((item) => (
          <Link key={item.label} href={item.href} className="block group">
            <Card className="text-center py-3 h-full transition-transform group-hover:scale-[1.02] group-hover:shadow-lg cursor-pointer">
              <div className={`w-10 h-10 rounded-lg ${item.bg} flex items-center justify-center mx-auto mb-2`}>
                <item.icon size={20} className={item.color} />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{item.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.label}</p>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── Main Content ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Migration Type Overview + Charts */}
        <div className="lg:col-span-2 space-y-6">
          {/* Migration Type Cards */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Migration Type Overview</h2>
              <Link href="/projects" className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1">
                View All <ChevronRight size={15} />
              </Link>
            </div>

            {migrationTypeStats?.byType?.filter((s: any) => s.total > 0).length ? (
              <div className="space-y-4">
                {/* Type cards — only show types that have at least one project */}
                <div className="grid grid-cols-3 gap-3">
                  {migrationTypeStats.byType.filter((s: any) => s.total > 0).map((stat: any) => {
                    const cfg: Record<string, { emoji: string; label: string; cardCls: string; textCls: string }> = {
                      CONTENT: { emoji: '📁', label: 'Content', cardCls: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800', textCls: 'text-blue-700 dark:text-blue-300' },
                      EMAIL: { emoji: '📧', label: 'Email', cardCls: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800', textCls: 'text-green-700 dark:text-green-300' },
                      MESSAGING: { emoji: '💬', label: 'Messaging', cardCls: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800', textCls: 'text-purple-700 dark:text-purple-300' },
                    };
                    const c = cfg[stat.type] || { emoji: '📦', label: stat.type, cardCls: 'bg-gray-50 border-gray-200', textCls: 'text-gray-700' };
                    return (
                      <Link key={stat.type} href={`/projects?planType=${stat.type}`} className={`p-4 rounded-xl border ${c.cardCls} block hover:opacity-90 transition-opacity cursor-pointer`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl">{c.emoji}</span>
                          <span className={`text-sm font-semibold ${c.textCls}`}>{c.label}</span>
                        </div>
                        <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{stat.total}</div>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{stat.active} Active</span>
                          <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />{stat.completed} Done</span>
                          <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />{stat.overaged} Overaged</span>
                          <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{stat.delayed} Delayed</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* Summary table */}
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                        <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Total</th>
                        <th className="text-center py-2 px-3 font-medium text-green-600">Active</th>
                        <th className="text-center py-2 px-3 font-medium text-blue-600">Completed</th>
                        <th className="text-center py-2 px-3 font-medium text-yellow-600">On Hold</th>
                        <th className="text-center py-2 px-3 font-medium text-red-600">At Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {migrationTypeStats.byType.filter((s: any) => s.total > 0).map((stat: any) => (
                        <tr key={stat.type} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => window.location.href = `/projects?planType=${stat.type}`}>
                          <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-200">{stat.type}</td>
                          <td className="text-center py-2 px-3 font-bold text-gray-900 dark:text-white">{stat.total}</td>
                          <td className="text-center py-2 px-3"><span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs font-semibold">{stat.active}</span></td>
                          <td className="text-center py-2 px-3"><span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-semibold">{stat.completed}</span></td>
                          <td className="text-center py-2 px-3"><span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 text-xs font-semibold">{stat.inactive}</span></td>
                          <td className="text-center py-2 px-3"><span className={`inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded-full text-xs font-semibold ${stat.atRisk > 0 ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>{stat.atRisk}</span></td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 font-semibold">
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">TOTAL</td>
                        <td className="text-center py-2 px-3 text-gray-900 dark:text-white">{migrationTypeStats.totals.total}</td>
                        <td className="text-center py-2 px-3 text-green-700 dark:text-green-400">{migrationTypeStats.totals.active}</td>
                        <td className="text-center py-2 px-3 text-blue-700 dark:text-blue-400">{migrationTypeStats.totals.completed}</td>
                        <td className="text-center py-2 px-3 text-yellow-700 dark:text-yellow-400">{migrationTypeStats.totals.inactive}</td>
                        <td className="text-center py-2 px-3 text-red-700 dark:text-red-400">{migrationTypeStats.totals.atRisk}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-gray-400">
                <FolderKanban size={40} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">
                  {viewMode === 'my' ? 'No projects assigned to you yet.' : 'No migration data available.'}
                </p>
              </div>
            )}
          </Card>

          {/* By Status + By Phase */}
          {dash.showCharts && (
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Projects by Status</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Active', value: stats.activeProjects, iconColor: 'text-green-600', barColor: 'bg-green-500', icon: PlayCircle },
                    { label: 'Completed', value: stats.completedProjects, iconColor: 'text-blue-600', barColor: 'bg-blue-500', icon: CheckCircle },
                    { label: 'On Hold', value: stats.onHoldProjects, iconColor: 'text-yellow-600', barColor: 'bg-yellow-500', icon: PauseCircle },
                    { label: 'Delayed', value: stats.delayedProjects, iconColor: 'text-red-600', barColor: 'bg-red-500', icon: AlertCircle },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 w-24">
                        <item.icon size={15} className={item.iconColor} />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-1">
                        <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                          <div className={`${item.barColor} h-2 rounded-full transition-all`} style={{ width: `${stats.totalProjects > 0 ? (item.value / stats.totalProjects) * 100 : 0}%` }} />
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white w-6 text-right">{item.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Projects by Phase</h3>
                <div className="space-y-3">
                  {(projectsByPhase as any[])?.map((phase) => {
                    const colors: Record<string, string> = { KICKOFF: 'bg-purple-500', MIGRATION: 'bg-blue-500', VALIDATION: 'bg-yellow-500', CLOSURE: 'bg-green-500', COMPLETED: 'bg-emerald-500' };
                    return (
                      <div key={phase.phase} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700 dark:text-gray-300 w-24 capitalize truncate">{phase.phase?.toLowerCase()}</span>
                        <div className="flex items-center gap-2 flex-1">
                          <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                            <div className={`${colors[phase.phase] || 'bg-gray-500'} h-2 rounded-full transition-all`} style={{ width: `${stats.totalProjects > 0 ? (phase.count / stats.totalProjects) * 100 : 0}%` }} />
                          </div>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white w-6 text-right">{phase.count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Right: Upcoming Deadlines + Delayed + Activity */}
        <div className="space-y-5">
          {/* Upcoming Deadlines */}
          {dash.showUpcomingDeadlines && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Upcoming Deadlines</h3>
                <Link href="/projects" className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-0.5">
                  View All <ChevronRight size={13} />
                </Link>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {upcomingDeadlines?.length > 0 ? (
                  upcomingDeadlines.slice(0, 5).map((project: any) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="flex items-start justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate flex-1 pr-2">{project.name}</p>
                      <span className={`text-xs font-semibold flex-shrink-0 px-2 py-0.5 rounded ${
                        new Date(project.deadline) < new Date(Date.now() + 3 * 86400000)
                          ? 'bg-red-100 text-red-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {format(new Date(project.deadline), 'MMM d')}
                      </span>
                    </Link>
                  ))
                ) : (
                  <div className="text-center py-6 text-gray-400">
                    <Calendar size={28} className="mx-auto mb-2 opacity-40" />
                    <p className="text-xs">No upcoming deadlines</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Delayed Projects */}
          {dash.showDelayedProjects && (
            <Card className={delaySummary?.topDelayed?.length > 0 ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10' : ''}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Delayed Projects</h3>
                {delaySummary?.topDelayed?.length > 0 && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">Action Required</span>
                )}
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {delaySummary?.topDelayed?.length > 0 ? (
                  delaySummary.topDelayed.map((project: any) => (
                    <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 hover:border-red-400 transition-all">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{project.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{project.customerName}</p>
                      </div>
                      <span className="text-sm font-bold text-red-600 ml-2">+{project.delayDays}d</span>
                    </Link>
                  ))
                ) : (
                  <div className="text-center py-5 text-green-600">
                    <CheckCircle size={28} className="mx-auto mb-1" />
                    <p className="text-xs font-medium">All projects on track!</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Recent Activity */}
          {dash.showRecentActivity && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
                <Activity size={15} className="text-gray-400" />
              </div>
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {recentActivity?.length > 0 ? (
                  recentActivity.slice(0, 5).map((activity: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 pb-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                      <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0">
                        <Zap size={12} className="text-primary-600 dark:text-primary-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{activity.message}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-5 text-gray-400">
                    <Activity size={28} className="mx-auto mb-1 opacity-40" />
                    <p className="text-xs">No recent activity</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Quick Actions */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/projects/new" className="flex items-center gap-2 p-3 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-100 transition-colors">
                <Plus size={16} /><span className="text-xs font-medium">New Project</span>
              </Link>
              <Link href="/projects" className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                <FolderKanban size={16} /><span className="text-xs font-medium">All Projects</span>
              </Link>
              <Link href="/case-studies" className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                <FileText size={16} /><span className="text-xs font-medium">Case Studies</span>
              </Link>
              <Link href="/settings" className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                <BarChart3 size={16} /><span className="text-xs font-medium">Settings</span>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
