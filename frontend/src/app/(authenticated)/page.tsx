'use client';

import { useState } from 'react';
import { useDashboard } from '@/hooks/useProjects';
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
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Calendar,
  Users,
  Target,
  Activity,
  BarChart3,
  PieChart,
  Zap,
  FileText,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Mail,
  FolderOpen,
  MessageSquare,
  Plus,
  XCircle
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

export default function DashboardPage() {
  const { data, isLoading, error, refetch } = useDashboard();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">Failed to load dashboard</h2>
          <p className="mt-2 text-gray-500">Please check if the backend server is running</p>
          <button 
            onClick={handleRefresh}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
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
    projectsByPlan,
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

  return (
    <div className="min-h-screen bg-gray-50 -m-6 p-6">
      {/* Header Section */}
      <div className="mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">PMO Dashboard</h1>
            <p className="text-gray-500 mt-1">Enterprise Migration Project Overview</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500">
              Last updated: {format(new Date(), 'MMM d, yyyy h:mm a')}
            </div>
            <button 
              onClick={handleRefresh}
              className={`p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-all ${isRefreshing ? 'animate-spin' : ''}`}
            >
              <RefreshCw size={18} className="text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Executive Summary Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        {/* Portfolio Health */}
        <Card className="bg-gradient-to-br from-primary-600 to-primary-700 text-white border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-primary-100 text-sm font-medium">Portfolio Health</p>
              <p className="text-4xl font-bold mt-1">{healthScore}%</p>
              <p className="text-primary-200 text-sm mt-1">
                {healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : 'Needs Attention'}
              </p>
            </div>
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
              <Activity size={32} className="text-white" />
            </div>
          </div>
        </Card>

        {/* Total Projects */}
        <Card className="bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Total Projects</p>
              <p className="text-4xl font-bold text-gray-900 mt-1">{stats.totalProjects}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-green-600 text-sm font-medium">{stats.activeProjects} active</span>
                <span className="text-gray-400">•</span>
                <span className="text-blue-600 text-sm font-medium">{stats.completedProjects} done</span>
              </div>
            </div>
            <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center">
              <FolderKanban size={28} className="text-blue-600" />
            </div>
          </div>
        </Card>

        {/* Completion Rate */}
        <Card className="bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Completion Rate</p>
              <p className="text-4xl font-bold text-gray-900 mt-1">{completionRate}%</p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-green-500 h-2 rounded-full transition-all" 
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            </div>
            <div className="w-14 h-14 rounded-xl bg-green-50 flex items-center justify-center">
              <Target size={28} className="text-green-600" />
            </div>
          </div>
        </Card>

        {/* Risk Alert */}
        <Card className={`${stats.delayedProjects + stats.atRiskProjects > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${stats.delayedProjects + stats.atRiskProjects > 0 ? 'text-red-600' : 'text-green-600'}`}>
                Risk Status
              </p>
              <p className={`text-4xl font-bold mt-1 ${stats.delayedProjects + stats.atRiskProjects > 0 ? 'text-red-700' : 'text-green-700'}`}>
                {stats.delayedProjects + stats.atRiskProjects}
              </p>
              <p className={`text-sm mt-1 ${stats.delayedProjects + stats.atRiskProjects > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {stats.delayedProjects} delayed • {stats.atRiskProjects} at risk
              </p>
            </div>
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${stats.delayedProjects + stats.atRiskProjects > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
              <AlertTriangle size={28} className={stats.delayedProjects + stats.atRiskProjects > 0 ? 'text-red-600' : 'text-green-600'} />
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column - Migration Types & Stats */}
        <div className="xl:col-span-2 space-y-6">
          {/* Migration Type Overview */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Migration Type Overview</h2>
              <Link href="/projects" className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1">
                View All <ChevronRight size={16} />
              </Link>
            </div>
            
            {migrationTypeStats?.byType ? (
              <div className="space-y-4">
                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-4">
                  {migrationTypeStats.byType.map((stat: any) => {
                    const config = {
                      CONTENT: { icon: FolderOpen, color: 'blue', label: 'Content', emoji: '📁' },
                      EMAIL: { icon: Mail, color: 'green', label: 'Email', emoji: '📧' },
                      MESSAGING: { icon: MessageSquare, color: 'purple', label: 'Messaging', emoji: '💬' },
                    }[stat.type] || { icon: FolderKanban, color: 'gray', label: stat.type, emoji: '📦' };
                    
                    return (
                      <div 
                        key={stat.type} 
                        className={`p-4 rounded-xl bg-${config.color}-50 border border-${config.color}-200 hover:shadow-md transition-all cursor-pointer`}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-2xl">{config.emoji}</span>
                          <span className={`font-semibold text-${config.color}-700`}>{config.label}</span>
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-2">{stat.total}</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-gray-600">{stat.active} Active</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <span className="text-gray-600">{stat.completed} Done</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                            <span className="text-gray-600">{stat.overaged} Overaged</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span className="text-gray-600">{stat.delayed} Delayed</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Comparison Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-medium text-gray-500">Type</th>
                        <th className="text-center py-2 px-3 font-medium text-gray-500">Total</th>
                        <th className="text-center py-2 px-3 font-medium text-green-600">Active</th>
                        <th className="text-center py-2 px-3 font-medium text-blue-600">Completed</th>
                        <th className="text-center py-2 px-3 font-medium text-yellow-600">On Hold</th>
                        <th className="text-center py-2 px-3 font-medium text-red-600">At Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {migrationTypeStats.byType.map((stat: any) => (
                        <tr key={stat.type} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-3 font-medium">{stat.type}</td>
                          <td className="text-center py-2 px-3 font-bold">{stat.total}</td>
                          <td className="text-center py-2 px-3">
                            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                              {stat.active}
                            </span>
                          </td>
                          <td className="text-center py-2 px-3">
                            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                              {stat.completed}
                            </span>
                          </td>
                          <td className="text-center py-2 px-3">
                            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-yellow-100 text-yellow-700 text-xs font-semibold">
                              {stat.inactive}
                            </span>
                          </td>
                          <td className="text-center py-2 px-3">
                            <span className={`inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full text-xs font-semibold ${stat.atRisk > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'}`}>
                              {stat.atRisk}
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-semibold">
                        <td className="py-2 px-3">TOTAL</td>
                        <td className="text-center py-2 px-3">{migrationTypeStats.totals.total}</td>
                        <td className="text-center py-2 px-3 text-green-700">{migrationTypeStats.totals.active}</td>
                        <td className="text-center py-2 px-3 text-blue-700">{migrationTypeStats.totals.completed}</td>
                        <td className="text-center py-2 px-3 text-yellow-700">{migrationTypeStats.totals.inactive}</td>
                        <td className="text-center py-2 px-3 text-red-700">{migrationTypeStats.totals.atRisk}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FolderKanban size={48} className="mx-auto mb-2 text-gray-300" />
                <p>No migration data available</p>
              </div>
            )}
          </Card>

          {/* Project Status Distribution */}
          <div className="grid grid-cols-2 gap-6">
            {/* By Status */}
            <Card>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">By Status</h3>
              <div className="space-y-3">
                {[
                  { label: 'Active', value: stats.activeProjects, color: 'green', icon: PlayCircle },
                  { label: 'Completed', value: stats.completedProjects, color: 'blue', icon: CheckCircle },
                  { label: 'On Hold', value: stats.onHoldProjects, color: 'yellow', icon: PauseCircle },
                  { label: 'Delayed', value: stats.delayedProjects, color: 'red', icon: AlertCircle },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <item.icon size={18} className={`text-${item.color}-600`} />
                      <span className="text-gray-700">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div 
                          className={`bg-${item.color}-500 h-2 rounded-full`}
                          style={{ width: `${stats.totalProjects > 0 ? (item.value / stats.totalProjects) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="font-semibold text-gray-900 w-8 text-right">{item.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* By Phase */}
            <Card>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">By Phase</h3>
              <div className="space-y-3">
                {projectsByPhase?.map((phase: any) => {
                  const phaseColors: Record<string, string> = {
                    KICKOFF: 'purple',
                    MIGRATION: 'blue',
                    VALIDATION: 'yellow',
                    CLOSURE: 'green',
                    COMPLETED: 'emerald',
                  };
                  const color = phaseColors[phase.phase] || 'gray';
                  return (
                    <div key={phase.phase} className="flex items-center justify-between">
                      <span className="text-gray-700 capitalize">{phase.phase?.toLowerCase()}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div 
                            className={`bg-${color}-500 h-2 rounded-full`}
                            style={{ width: `${stats.totalProjects > 0 ? (phase.count / stats.totalProjects) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="font-semibold text-gray-900 w-8 text-right">{phase.count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Quick Stats Row */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="text-center py-4">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center mx-auto mb-2">
                <Plus size={20} className="text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{migrationTypeStats?.totals?.newProjects || 0}</p>
              <p className="text-xs text-gray-500">New (30 days)</p>
            </Card>
            <Card className="text-center py-4">
              <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center mx-auto mb-2">
                <Clock size={20} className="text-orange-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{migrationTypeStats?.totals?.overaged || 0}</p>
              <p className="text-xs text-gray-500">Overaged</p>
            </Card>
            <Card className="text-center py-4">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center mx-auto mb-2">
                <FileText size={20} className="text-indigo-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.pendingCaseStudies}</p>
              <p className="text-xs text-gray-500">Pending Cases</p>
            </Card>
            <Card className="text-center py-4">
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center mx-auto mb-2">
                <Clock size={20} className="text-gray-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.avgDelayDays}</p>
              <p className="text-xs text-gray-500">Avg Delay (days)</p>
            </Card>
          </div>
        </div>

        {/* Right Column - Alerts & Activity */}
        <div className="space-y-6">
          {/* Upcoming Deadlines */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Upcoming Deadlines</h3>
              <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full">
                {upcomingDeadlines?.length || 0} projects
              </span>
            </div>
            <div className="space-y-3 max-h-[280px] overflow-y-auto">
              {upcomingDeadlines?.length > 0 ? (
                upcomingDeadlines.slice(0, 5).map((project: any) => (
                  <Link 
                    key={project.id} 
                    href={`/projects/${project.id}`}
                    className="block p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{project.name}</p>
                        <p className="text-sm text-gray-500 truncate">{project.customerName}</p>
                      </div>
                      <div className="text-right ml-2">
                        <p className="text-sm font-medium text-orange-600">
                          {format(new Date(project.deadline), 'MMM d')}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(project.deadline), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-center py-6 text-gray-500">
                  <Calendar size={32} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No upcoming deadlines</p>
                </div>
              )}
            </div>
          </Card>

          {/* Delayed Projects Alert */}
          <Card className={delaySummary?.topDelayed?.length > 0 ? 'border-red-200 bg-red-50' : ''}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Delayed Projects</h3>
              {delaySummary?.topDelayed?.length > 0 && (
                <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
                  Action Required
                </span>
              )}
            </div>
            <div className="space-y-3 max-h-[280px] overflow-y-auto">
              {delaySummary?.topDelayed?.length > 0 ? (
                delaySummary.topDelayed.slice(0, 5).map((project: any) => (
                  <Link 
                    key={project.id} 
                    href={`/projects/${project.id}`}
                    className="block p-3 rounded-lg bg-white border border-red-200 hover:border-red-300 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{project.name}</p>
                        <p className="text-sm text-gray-500 truncate">{project.customerName}</p>
                      </div>
                      <div className="text-right ml-2">
                        <p className="text-lg font-bold text-red-600">+{project.delayDays}d</p>
                        <p className="text-xs text-red-500">delayed</p>
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-center py-6 text-green-600">
                  <CheckCircle size={32} className="mx-auto mb-2" />
                  <p className="text-sm font-medium">All projects on track!</p>
                </div>
              )}
            </div>
          </Card>

          {/* Recent Activity */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
              <Activity size={18} className="text-gray-400" />
            </div>
            <div className="space-y-3 max-h-[200px] overflow-y-auto">
              {recentActivity?.length > 0 ? (
                recentActivity.slice(0, 5).map((activity: any, index: number) => (
                  <div key={index} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <Zap size={14} className="text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">{activity.message}</p>
                      <p className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-gray-500">
                  <Activity size={32} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No recent activity</p>
                </div>
              )}
            </div>
          </Card>

          {/* Quick Actions */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <Link 
                href="/projects/new"
                className="flex items-center gap-2 p-3 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
              >
                <Plus size={18} />
                <span className="text-sm font-medium">New Project</span>
              </Link>
              <Link 
                href="/projects"
                className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <FolderKanban size={18} />
                <span className="text-sm font-medium">All Projects</span>
              </Link>
              <Link 
                href="/case-studies"
                className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <FileText size={18} />
                <span className="text-sm font-medium">Case Studies</span>
              </Link>
              <Link 
                href="/settings"
                className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <BarChart3 size={18} />
                <span className="text-sm font-medium">Reports</span>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
