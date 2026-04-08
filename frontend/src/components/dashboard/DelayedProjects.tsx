'use client';

import { Card, CardHeader } from '@/components/ui/Card';
import { DelayIndicator } from '@/components/ui/DelayIndicator';
import type { DelaySummary } from '@/types';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface DelayedProjectsProps {
  delaySummary: DelaySummary;
}

export function DelayedProjects({ delaySummary }: DelayedProjectsProps) {
  const topDelayed = delaySummary?.topDelayed || [];

  return (
    <Card>
      <CardHeader 
        title="Most Delayed Projects" 
        action={
          <Link href="/projects?delayStatus=DELAYED" className="text-sm text-primary-600 hover:text-primary-700">
            View all
          </Link>
        }
      />
      <div className="space-y-3">
        {topDelayed.length === 0 ? (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-50 mb-3">
              <AlertCircle className="text-green-600" size={24} />
            </div>
            <p className="text-sm text-gray-500">No delayed projects</p>
          </div>
        ) : (
          topDelayed.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="flex items-center justify-between p-3 rounded-lg border border-red-100 bg-red-50/50 hover:bg-red-50 transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{project.name}</p>
                <p className="text-sm text-gray-500 truncate">{project.customerName}</p>
              </div>
              <DelayIndicator status="DELAYED" days={project.delayDays} size="sm" />
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}
