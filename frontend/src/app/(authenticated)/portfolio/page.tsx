'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { 
  Loader2, LayoutGrid, List, Filter, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, Clock, DollarSign, Users, Calendar,
  BarChart3, PieChart, Activity
} from 'lucide-react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Project {
  id: string;
  name: string;
  customerName: string;
  projectManager: string;
  status: string;
  phase: string;
  planType: string;
  delayStatus: string;
  delayDays: number;
  migrationTypes: string | null;
  plannedStart: string;
  plannedEnd: string;
  estimatedCost: number | null;
  actualCost: number | null;
}

export default function PortfolioPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_URL}/api/projects`);
      const json = await res.json();
      if (json.success) {
        setProjects(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
    setLoading(false);
  };

  const filteredProjects = projects.filter((p) => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (filterType !== 'all' && !p.migrationTypes?.includes(filterType)) return false;
    return true;
  });

  // Portfolio Statistics
  const stats = {
    total: projects.length,
    active: projects.filter((p) => p.status === 'ACTIVE').length,
    onHold: projects.filter((p) => p.status === 'ON_HOLD').length,
    completed: projects.filter((p) => p.status === 'COMPLETED').length,
    delayed: projects.filter((p) => p.delayStatus === 'DELAYED').length,
    atRisk: projects.filter((p) => p.delayStatus === 'AT_RISK').length,
    totalBudget: projects.reduce((sum, p) => sum + (p.estimatedCost || 0), 0),
    actualSpend: projects.reduce((sum, p) => sum + (p.actualCost || 0), 0),
  };

  const byPhase = {
    KICKOFF: projects.filter((p) => p.phase === 'KICKOFF').length,
    MIGRATION: projects.filter((p) => p.phase === 'MIGRATION').length,
    VALIDATION: projects.filter((p) => p.phase === 'VALIDATION').length,
    CLOSURE: projects.filter((p) => p.phase === 'CLOSURE').length,
  };

  const byType = {
    CONTENT: projects.filter((p) => p.migrationTypes?.includes('CONTENT')).length,
    EMAIL: projects.filter((p) => p.migrationTypes?.includes('EMAIL')).length,
    MESSAGING: projects.filter((p) => p.migrationTypes?.includes('MESSAGING')).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portfolio Overview</h1>
          <p className="text-gray-500">Comprehensive view of all migration projects</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'cards' ? 'primary' : 'outline'}
            onClick={() => setViewMode('cards')}
            size="sm"
          >
            <LayoutGrid size={16} />
          </Button>
          <Button
            variant={viewMode === 'table' ? 'primary' : 'outline'}
            onClick={() => setViewMode('table')}
            size="sm"
          >
            <List size={16} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <SummaryCard
          title="Total Projects"
          value={stats.total}
          icon={BarChart3}
          color="bg-blue-500"
        />
        <SummaryCard
          title="Active"
          value={stats.active}
          icon={Activity}
          color="bg-green-500"
        />
        <SummaryCard
          title="On Hold"
          value={stats.onHold}
          icon={Clock}
          color="bg-yellow-500"
        />
        <SummaryCard
          title="Completed"
          value={stats.completed}
          icon={CheckCircle}
          color="bg-purple-500"
        />
        <SummaryCard
          title="Delayed"
          value={stats.delayed}
          icon={AlertTriangle}
          color="bg-red-500"
        />
        <SummaryCard
          title="At Risk"
          value={stats.atRisk}
          icon={TrendingDown}
          color="bg-orange-500"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* By Phase */}
        <Card className="p-4">
          <h3 className="font-semibold text-gray-900 mb-4">Projects by Phase</h3>
          <div className="space-y-3">
            {Object.entries(byPhase).map(([phase, count]) => (
              <div key={phase} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{phase}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full"
                      style={{ width: `${stats.total > 0 ? (count / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* By Migration Type */}
        <Card className="p-4">
          <h3 className="font-semibold text-gray-900 mb-4">Projects by Type</h3>
          <div className="space-y-3">
            {Object.entries(byType).map(([type, count]) => {
              const colors: Record<string, string> = {
                CONTENT: 'bg-blue-500',
                EMAIL: 'bg-green-500',
                MESSAGING: 'bg-purple-500',
              };
              return (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{type}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${colors[type]} rounded-full`}
                        style={{ width: `${stats.total > 0 ? (count / stats.total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Budget Overview */}
        <Card className="p-4">
          <h3 className="font-semibold text-gray-900 mb-4">Budget Overview</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Total Budget</span>
                <span className="font-medium">${stats.totalBudget.toLocaleString()}</span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Actual Spend</span>
                <span className="font-medium">${stats.actualSpend.toLocaleString()}</span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    stats.actualSpend > stats.totalBudget ? 'bg-red-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${stats.totalBudget > 0 ? Math.min((stats.actualSpend / stats.totalBudget) * 100, 100) : 0}%` }}
                />
              </div>
            </div>
            <div className="pt-2 border-t">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Variance</span>
                <span className={`font-medium ${stats.actualSpend > stats.totalBudget ? 'text-red-600' : 'text-green-600'}`}>
                  {stats.actualSpend > stats.totalBudget ? '+' : ''}
                  ${(stats.actualSpend - stats.totalBudget).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          <span className="text-sm text-gray-600">Filter:</span>
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="ON_HOLD">On Hold</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">All Types</option>
          <option value="CONTENT">Content</option>
          <option value="EMAIL">Email</option>
          <option value="MESSAGING">Messaging</option>
        </select>
        <span className="text-sm text-gray-500">
          Showing {filteredProjects.length} of {projects.length} projects
        </span>
      </div>

      {/* Projects Grid/Table */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phase</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Health</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">End Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredProjects.map((project) => (
                  <tr key={project.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/projects/${project.id}`} className="text-primary-600 hover:underline font-medium">
                        {project.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{project.customerName}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={project.status} variant="status" />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={project.phase} variant="phase" />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {project.migrationTypes?.split(',').join(', ') || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <HealthIndicator status={project.delayStatus} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(project.plannedEnd).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {filteredProjects.length === 0 && (
        <Card className="p-8 text-center text-gray-500">
          <p>No projects match the selected filters</p>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: any; color: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color} text-white`}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{title}</p>
        </div>
      </div>
    </Card>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const getHealthColor = (status: string) => {
    switch (status) {
      case 'DELAYED': return 'border-l-red-500';
      case 'AT_RISK': return 'border-l-yellow-500';
      default: return 'border-l-green-500';
    }
  };

  return (
    <Card className={`p-4 border-l-4 ${getHealthColor(project.delayStatus)}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <Link href={`/projects/${project.id}`} className="font-semibold text-gray-900 hover:text-primary-600">
            {project.name}
          </Link>
          <p className="text-sm text-gray-500">{project.customerName}</p>
        </div>
        <HealthIndicator status={project.delayStatus} />
      </div>
      
      <div className="flex flex-wrap gap-2 mb-3">
        <StatusBadge status={project.status} variant="status" />
        <StatusBadge status={project.phase} variant="phase" />
        <StatusBadge status={project.planType} variant="plan" />
      </div>

      {project.migrationTypes && (
        <div className="flex flex-wrap gap-1 mb-3">
          {project.migrationTypes.split(',').map((type) => (
            <span key={type} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
              {type.trim()}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t">
        <span className="flex items-center gap-1">
          <Users size={12} />
          {project.projectManager}
        </span>
        <span className="flex items-center gap-1">
          <Calendar size={12} />
          {new Date(project.plannedEnd).toLocaleDateString()}
        </span>
      </div>

      {project.delayDays > 0 && (
        <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle size={12} />
          {project.delayDays} days delayed
        </div>
      )}
    </Card>
  );
}

function HealthIndicator({ status }: { status: string }) {
  const config = {
    DELAYED: { color: 'bg-red-500', label: 'Delayed' },
    AT_RISK: { color: 'bg-yellow-500', label: 'At Risk' },
    NOT_DELAYED: { color: 'bg-green-500', label: 'On Track' },
  };

  const { color, label } = config[status as keyof typeof config] || config.NOT_DELAYED;

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="text-xs text-gray-600">{label}</span>
    </div>
  );
}
