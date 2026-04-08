'use client';

import { Card, CardHeader } from '@/components/ui/Card';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip,
  Legend
} from 'recharts';
import type { ProjectsByStatus, ProjectsByPhase, ProjectsByPlan } from '@/types';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#3b82f6',
  COMPLETED: '#22c55e',
  ON_HOLD: '#eab308',
  CANCELLED: '#ef4444',
};

const PHASE_COLORS: Record<string, string> = {
  KICKOFF: '#8b5cf6',
  MIGRATION: '#3b82f6',
  VALIDATION: '#f97316',
  CLOSURE: '#14b8a6',
  COMPLETED: '#22c55e',
};

const PLAN_COLORS: Record<string, string> = {
  PLATINUM: '#8b5cf6',
  GOLD: '#eab308',
  SILVER: '#6b7280',
  BRONZE: '#f97316',
};

interface ChartsProps {
  projectsByStatus: ProjectsByStatus[];
  projectsByPhase: ProjectsByPhase[];
  projectsByPlan: ProjectsByPlan[];
}

export function Charts({ projectsByStatus, projectsByPhase, projectsByPlan }: ChartsProps) {
  const statusData = projectsByStatus.map((item) => ({
    name: item.status,
    value: item.count,
    color: STATUS_COLORS[item.status] || '#6b7280',
  }));

  const phaseData = projectsByPhase.map((item) => ({
    name: item.phase,
    value: item.count,
    color: PHASE_COLORS[item.phase] || '#6b7280',
  }));

  const planData = projectsByPlan.map((item) => ({
    name: item.planType,
    value: item.count,
    color: PLAN_COLORS[item.planType] || '#6b7280',
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Projects by Status */}
      <Card>
        <CardHeader title="Projects by Status" />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
                labelLine={false}
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap justify-center gap-3 mt-2">
          {statusData.map((item) => (
            <div key={item.name} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-xs text-gray-600">{item.name}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Projects by Phase */}
      <Card>
        <CardHeader title="Active Projects by Phase" />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={phaseData} layout="vertical">
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {phaseData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Projects by Plan */}
      <Card>
        <CardHeader title="Projects by Plan Type" />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={planData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
                labelLine={false}
              >
                {planData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap justify-center gap-3 mt-2">
          {planData.map((item) => (
            <div key={item.name} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-xs text-gray-600">{item.name}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
