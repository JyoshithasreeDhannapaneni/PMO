'use client';

import { Card } from '@/components/ui/Card';
import { 
  FolderOpen, 
  Mail, 
  MessageSquare, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  PauseCircle, 
  AlertTriangle,
  Plus,
  BarChart3
} from 'lucide-react';

interface MigrationTypeStat {
  type: string;
  total: number;
  active: number;
  inactive: number;
  completed: number;
  cancelled: number;
  newProjects: number;
  overaged: number;
  delayed: number;
  atRisk: number;
}

interface MigrationTypeStatsProps {
  stats: {
    byType: MigrationTypeStat[];
    totals: {
      total: number;
      active: number;
      inactive: number;
      completed: number;
      cancelled: number;
      newProjects: number;
      overaged: number;
      delayed: number;
      atRisk: number;
    };
  };
}

const typeConfig: Record<string, { icon: React.ReactNode; color: string; bgColor: string; label: string }> = {
  CONTENT: {
    icon: <FolderOpen size={24} />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200',
    label: 'Content Migration',
  },
  EMAIL: {
    icon: <Mail size={24} />,
    color: 'text-green-600',
    bgColor: 'bg-green-50 border-green-200',
    label: 'Email Migration',
  },
  MESSAGING: {
    icon: <MessageSquare size={24} />,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 border-purple-200',
    label: 'Messaging Migration',
  },
};

function KPICard({ 
  label, 
  value, 
  icon, 
  color, 
  bgColor,
  trend,
}: { 
  label: string; 
  value: number; 
  icon: React.ReactNode; 
  color: string;
  bgColor: string;
  trend?: number;
}) {
  return (
    <div className={`p-4 rounded-lg border ${bgColor} transition-all hover:shadow-md`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`${color}`}>{icon}</span>
        {trend !== undefined && trend > 0 && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <TrendingUp size={12} />
            +{trend}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-600">{label}</p>
    </div>
  );
}

function MigrationTypeSection({ stat }: { stat: MigrationTypeStat }) {
  const config = typeConfig[stat.type] || {
    icon: <BarChart3 size={24} />,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50 border-gray-200',
    label: stat.type,
  };

  return (
    <div className="mb-8">
      {/* Section Header */}
      <div className={`flex items-center gap-3 mb-4 p-3 rounded-lg ${config.bgColor} border`}>
        <div className={config.color}>{config.icon}</div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{config.label}</h3>
          <p className="text-sm text-gray-500">Total: {stat.total} projects</p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard
          label="Active"
          value={stat.active}
          icon={<TrendingUp size={18} />}
          color="text-green-600"
          bgColor="bg-green-50 border-green-100"
        />
        <KPICard
          label="Inactive"
          value={stat.inactive}
          icon={<PauseCircle size={18} />}
          color="text-gray-500"
          bgColor="bg-gray-50 border-gray-100"
        />
        <KPICard
          label="Completed"
          value={stat.completed}
          icon={<CheckCircle size={18} />}
          color="text-blue-600"
          bgColor="bg-blue-50 border-blue-100"
        />
        <KPICard
          label="New (30d)"
          value={stat.newProjects}
          icon={<Plus size={18} />}
          color="text-purple-600"
          bgColor="bg-purple-50 border-purple-100"
          trend={stat.newProjects}
        />
        <KPICard
          label="Overaged"
          value={stat.overaged}
          icon={<Clock size={18} />}
          color="text-orange-600"
          bgColor="bg-orange-50 border-orange-100"
        />
        <KPICard
          label="Delayed"
          value={stat.delayed}
          icon={<AlertTriangle size={18} />}
          color="text-red-600"
          bgColor="bg-red-50 border-red-100"
        />
      </div>
    </div>
  );
}

export function MigrationTypeStats({ stats }: MigrationTypeStatsProps) {
  if (!stats || !stats.byType) {
    return (
      <Card>
        <div className="text-center py-8 text-gray-500">
          No migration type data available
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Summary */}
      <Card>
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-gradient-to-r from-primary-50 to-primary-100 border border-primary-200">
          <div className="p-2 bg-primary-600 rounded-lg text-white">
            <BarChart3 size={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">All Projects Summary</h3>
            <p className="text-sm text-gray-500">Total: {stats.totals.total} projects across all migration types</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPICard
            label="Active"
            value={stats.totals.active}
            icon={<TrendingUp size={18} />}
            color="text-green-600"
            bgColor="bg-green-50 border-green-100"
          />
          <KPICard
            label="Inactive"
            value={stats.totals.inactive}
            icon={<PauseCircle size={18} />}
            color="text-gray-500"
            bgColor="bg-gray-50 border-gray-100"
          />
          <KPICard
            label="Completed"
            value={stats.totals.completed}
            icon={<CheckCircle size={18} />}
            color="text-blue-600"
            bgColor="bg-blue-50 border-blue-100"
          />
          <KPICard
            label="New (30d)"
            value={stats.totals.newProjects}
            icon={<Plus size={18} />}
            color="text-purple-600"
            bgColor="bg-purple-50 border-purple-100"
            trend={stats.totals.newProjects}
          />
          <KPICard
            label="Overaged"
            value={stats.totals.overaged}
            icon={<Clock size={18} />}
            color="text-orange-600"
            bgColor="bg-orange-50 border-orange-100"
          />
          <KPICard
            label="Delayed"
            value={stats.totals.delayed}
            icon={<AlertTriangle size={18} />}
            color="text-red-600"
            bgColor="bg-red-50 border-red-100"
          />
        </div>
      </Card>

      {/* Migration Type Sections */}
      {stats.byType.map((stat) => (
        <Card key={stat.type}>
          <MigrationTypeSection stat={stat} />
        </Card>
      ))}

      {/* Quick Stats Table */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Migration Type Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Type</th>
                <th className="text-center py-3 px-4 font-semibold text-green-600">Active</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-500">Inactive</th>
                <th className="text-center py-3 px-4 font-semibold text-blue-600">Completed</th>
                <th className="text-center py-3 px-4 font-semibold text-purple-600">New</th>
                <th className="text-center py-3 px-4 font-semibold text-orange-600">Overaged</th>
                <th className="text-center py-3 px-4 font-semibold text-red-600">Delayed</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-900">Total</th>
              </tr>
            </thead>
            <tbody>
              {stats.byType.map((stat) => {
                const config = typeConfig[stat.type];
                return (
                  <tr key={stat.type} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className={config?.color || 'text-gray-600'}>{config?.icon}</span>
                        <span className="font-medium">{config?.label || stat.type}</span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-4">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-700 font-semibold">
                        {stat.active}
                      </span>
                    </td>
                    <td className="text-center py-3 px-4">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-semibold">
                        {stat.inactive}
                      </span>
                    </td>
                    <td className="text-center py-3 px-4">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-semibold">
                        {stat.completed}
                      </span>
                    </td>
                    <td className="text-center py-3 px-4">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-semibold">
                        {stat.newProjects}
                      </span>
                    </td>
                    <td className="text-center py-3 px-4">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold ${
                        stat.overaged > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {stat.overaged}
                      </span>
                    </td>
                    <td className="text-center py-3 px-4">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold ${
                        stat.delayed > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {stat.delayed}
                      </span>
                    </td>
                    <td className="text-center py-3 px-4">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-800 text-white font-semibold">
                        {stat.total}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {/* Totals Row */}
              <tr className="bg-gray-100 font-semibold">
                <td className="py-3 px-4">
                  <span className="font-bold text-gray-900">TOTAL</span>
                </td>
                <td className="text-center py-3 px-4 text-green-700">{stats.totals.active}</td>
                <td className="text-center py-3 px-4 text-gray-600">{stats.totals.inactive}</td>
                <td className="text-center py-3 px-4 text-blue-700">{stats.totals.completed}</td>
                <td className="text-center py-3 px-4 text-purple-700">{stats.totals.newProjects}</td>
                <td className="text-center py-3 px-4 text-orange-700">{stats.totals.overaged}</td>
                <td className="text-center py-3 px-4 text-red-700">{stats.totals.delayed}</td>
                <td className="text-center py-3 px-4 text-gray-900">{stats.totals.total}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
