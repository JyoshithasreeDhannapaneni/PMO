'use client';

import { useState, useEffect } from 'react';
import { 
  FolderKanban, CheckCircle, MessageSquare, FileText, AlertTriangle, 
  Users, BarChart3, GitPullRequest, Flag, Clock
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Activity {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  description: string;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
}

const activityIcons: Record<string, any> = {
  PROJECT_CREATED: FolderKanban,
  PROJECT_UPDATED: FolderKanban,
  PROJECT_COMPLETED: CheckCircle,
  TASK_CREATED: FileText,
  TASK_COMPLETED: CheckCircle,
  TASK_ASSIGNED: Users,
  COMMENT_ADDED: MessageSquare,
  DOCUMENT_UPLOADED: FileText,
  RISK_IDENTIFIED: AlertTriangle,
  RISK_RESOLVED: CheckCircle,
  TEAM_MEMBER_ADDED: Users,
  STATUS_REPORT_GENERATED: BarChart3,
  CHANGE_REQUEST_SUBMITTED: GitPullRequest,
  CHANGE_REQUEST_APPROVED: CheckCircle,
  MILESTONE_REACHED: Flag,
};

const activityColors: Record<string, string> = {
  PROJECT_CREATED: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400',
  PROJECT_COMPLETED: 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400',
  TASK_COMPLETED: 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400',
  RISK_IDENTIFIED: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400',
  RISK_RESOLVED: 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400',
  MILESTONE_REACHED: 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400',
  CHANGE_REQUEST_APPROVED: 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400',
};

interface ActivityFeedProps {
  entityType?: string;
  entityId?: string;
  limit?: number;
  showHeader?: boolean;
}

export function ActivityFeed({ entityType, entityId, limit = 20, showHeader = true }: ActivityFeedProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
  }, [entityType, entityId]);

  const fetchActivities = async () => {
    try {
      let url = `${API_URL}/api/activities/recent?limit=${limit}`;
      if (entityType && entityId) {
        url = `${API_URL}/api/activities/entity/${entityType}/${entityId}?limit=${limit}`;
      }
      
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setActivities(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch activities:', err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
        <Clock className="w-6 h-6 animate-spin mx-auto mb-2" />
        <p className="text-sm">Loading activity...</p>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <p>No activity yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showHeader && (
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Recent Activity</h3>
      )}
      
      <div className="space-y-3">
        {activities.map((activity) => {
          const Icon = activityIcons[activity.type] || Clock;
          const colorClass = activityColors[activity.type] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
          
          return (
            <div key={activity.id} className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${colorClass}`}>
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {activity.user && (
                    <span className="font-medium">{activity.user.name}</span>
                  )}{' '}
                  {activity.description}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
