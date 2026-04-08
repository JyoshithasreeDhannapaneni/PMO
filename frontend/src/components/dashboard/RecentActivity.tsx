'use client';

import { Card, CardHeader } from '@/components/ui/Card';
import type { RecentActivity as RecentActivityType } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { 
  FolderPlus, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle 
} from 'lucide-react';
import Link from 'next/link';

interface RecentActivityProps {
  activities: RecentActivityType[];
}

const activityIcons: Record<string, any> = {
  project_created: FolderPlus,
  project_updated: RefreshCw,
  phase_completed: CheckCircle2,
  delay_detected: AlertTriangle,
};

const activityColors: Record<string, string> = {
  project_created: 'text-green-600 bg-green-50',
  project_updated: 'text-blue-600 bg-blue-50',
  phase_completed: 'text-purple-600 bg-purple-50',
  delay_detected: 'text-red-600 bg-red-50',
};

export function RecentActivity({ activities }: RecentActivityProps) {
  return (
    <Card>
      <CardHeader 
        title="Recent Activity" 
        action={
          <Link href="/projects" className="text-sm text-primary-600 hover:text-primary-700">
            View all
          </Link>
        }
      />
      <div className="space-y-4">
        {activities.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No recent activity</p>
        ) : (
          activities.map((activity) => {
            const Icon = activityIcons[activity.type] || RefreshCw;
            const colorClass = activityColors[activity.type] || 'text-gray-600 bg-gray-50';

            return (
              <div key={activity.id} className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${colorClass}`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <Link 
                    href={`/projects/${activity.projectId}`}
                    className="text-sm font-medium text-gray-900 hover:text-primary-600 truncate block"
                  >
                    {activity.projectName}
                  </Link>
                  <p className="text-xs text-gray-500 truncate">{activity.details}</p>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                </span>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
