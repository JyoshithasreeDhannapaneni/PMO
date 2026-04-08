'use client';

import { useState } from 'react';
import { useDashboard } from '@/hooks/useProjects';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { Charts } from '@/components/dashboard/Charts';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { UpcomingDeadlines } from '@/components/dashboard/UpcomingDeadlines';
import { DelayedProjects } from '@/components/dashboard/DelayedProjects';
import { MigrationTypeStats } from '@/components/dashboard/MigrationTypeStats';
import { Loader2, LayoutDashboard, Users, BarChart3 } from 'lucide-react';

type DashboardView = 'overview' | 'pm-view' | 'analytics';

export default function DashboardPage() {
  const [activeView, setActiveView] = useState<DashboardView>('pm-view');
  const { data, isLoading, error } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load dashboard data</p>
        <p className="text-sm text-gray-500 mt-2">Please check if the backend server is running</p>
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

  const views = [
    { id: 'pm-view', label: 'PM View', icon: Users, description: 'Migration type breakdown' },
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, description: 'General stats' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, description: 'Charts & trends' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header with View Switcher */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Project Migration Tracking Overview</p>
        </div>
        
        {/* View Switcher */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          {views.map((view) => (
            <button
              key={view.id}
              onClick={() => setActiveView(view.id as DashboardView)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeView === view.id
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <view.icon size={16} />
              {view.label}
            </button>
          ))}
        </div>
      </div>

      {/* PM View - Migration Type Stats */}
      {activeView === 'pm-view' && (
        <>
          {migrationTypeStats ? (
            <MigrationTypeStats stats={migrationTypeStats} />
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800">
                No migration type data available. Add migration types to your projects to see statistics here.
              </p>
            </div>
          )}
          
          {/* Quick Actions for PM */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <UpcomingDeadlines deadlines={upcomingDeadlines} />
            <DelayedProjects delaySummary={delaySummary} />
          </div>
        </>
      )}

      {/* Overview - General Stats */}
      {activeView === 'overview' && (
        <>
          {/* Stats Cards */}
          <StatsCards stats={stats} />

          {/* Bottom Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <RecentActivity activities={recentActivity} />
            <UpcomingDeadlines deadlines={upcomingDeadlines} />
            <DelayedProjects delaySummary={delaySummary} />
          </div>
        </>
      )}

      {/* Analytics View - Charts */}
      {activeView === 'analytics' && (
        <>
          {/* Stats Cards */}
          <StatsCards stats={stats} />

          {/* Charts */}
          <Charts 
            projectsByStatus={projectsByStatus}
            projectsByPhase={projectsByPhase}
            projectsByPlan={projectsByPlan}
          />

          {/* Migration Type Summary Table */}
          {migrationTypeStats && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Migration Type Distribution</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {migrationTypeStats.byType.map((stat: any) => (
                  <div 
                    key={stat.type} 
                    className={`p-4 rounded-lg border ${
                      stat.type === 'CONTENT' ? 'bg-blue-50 border-blue-200' :
                      stat.type === 'EMAIL' ? 'bg-green-50 border-green-200' :
                      'bg-purple-50 border-purple-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">
                        {stat.type === 'CONTENT' ? '📁' : stat.type === 'EMAIL' ? '📧' : '💬'}
                      </span>
                      <span className="font-semibold text-gray-900">
                        {stat.type === 'CONTENT' ? 'Content' : stat.type === 'EMAIL' ? 'Email' : 'Messaging'}
                      </span>
                    </div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">{stat.total}</div>
                    <div className="text-sm text-gray-600">
                      {stat.active} active · {stat.overaged} overaged
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
