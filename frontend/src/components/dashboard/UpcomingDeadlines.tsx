'use client';

import { Card, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { UpcomingDeadline } from '@/types';
import { formatDate } from '@/lib/utils';
import { Calendar, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface UpcomingDeadlinesProps {
  deadlines: UpcomingDeadline[];
}

export function UpcomingDeadlines({ deadlines }: UpcomingDeadlinesProps) {
  return (
    <Card>
      <CardHeader 
        title="Upcoming Deadlines" 
        subtitle="Projects ending in the next 14 days"
      />
      <div className="space-y-3">
        {deadlines.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No upcoming deadlines</p>
        ) : (
          deadlines.map((deadline) => (
            <Link
              key={deadline.id}
              href={`/projects/${deadline.id}`}
              className="block p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{deadline.name}</p>
                  <p className="text-sm text-gray-500 truncate">{deadline.customerName}</p>
                </div>
                <StatusBadge status={deadline.phase} variant="phase" />
              </div>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <Calendar size={14} />
                  <span>{formatDate(deadline.plannedEnd)}</span>
                </div>
                <div className={`flex items-center gap-1 text-sm ${
                  deadline.daysRemaining <= 3 ? 'text-red-600' : 
                  deadline.daysRemaining <= 7 ? 'text-yellow-600' : 'text-gray-600'
                }`}>
                  {deadline.daysRemaining <= 7 && <AlertTriangle size={14} />}
                  <span>{deadline.daysRemaining} days remaining</span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}
