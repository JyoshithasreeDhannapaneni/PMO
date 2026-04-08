'use client';

import { Card } from '@/components/ui/Card';
import type { DashboardStats } from '@/types';
import { 
  FolderKanban, 
  PlayCircle, 
  CheckCircle, 
  PauseCircle, 
  AlertTriangle,
  AlertCircle,
  FileText,
  Clock
} from 'lucide-react';

interface StatsCardsProps {
  stats: DashboardStats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      title: 'Total Projects',
      value: stats.totalProjects,
      icon: FolderKanban,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Active Projects',
      value: stats.activeProjects,
      icon: PlayCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Completed',
      value: stats.completedProjects,
      icon: CheckCircle,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      title: 'On Hold',
      value: stats.onHoldProjects,
      icon: PauseCircle,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
    },
    {
      title: 'Delayed',
      value: stats.delayedProjects,
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      title: 'At Risk',
      value: stats.atRiskProjects,
      icon: AlertTriangle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Pending Case Studies',
      value: stats.pendingCaseStudies,
      icon: FileText,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Avg Delay (days)',
      value: stats.avgDelayDays,
      icon: Clock,
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title} className="relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">{card.title}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
            </div>
            <div className={`p-2 rounded-lg ${card.bgColor}`}>
              <card.icon className={card.color} size={24} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
