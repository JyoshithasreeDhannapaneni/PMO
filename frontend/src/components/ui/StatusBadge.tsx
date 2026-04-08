'use client';

import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  variant?: 'status' | 'phase' | 'delay' | 'plan';
  className?: string;
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-blue-100 text-blue-800 border-blue-200',
  COMPLETED: 'bg-green-100 text-green-800 border-green-200',
  ON_HOLD: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  CANCELLED: 'bg-red-100 text-red-800 border-red-200',
};

const phaseColors: Record<string, string> = {
  KICKOFF: 'bg-purple-100 text-purple-800 border-purple-200',
  MIGRATION: 'bg-blue-100 text-blue-800 border-blue-200',
  VALIDATION: 'bg-orange-100 text-orange-800 border-orange-200',
  CLOSURE: 'bg-teal-100 text-teal-800 border-teal-200',
  COMPLETED: 'bg-green-100 text-green-800 border-green-200',
};

const delayColors: Record<string, string> = {
  NOT_DELAYED: 'bg-green-100 text-green-800 border-green-200',
  AT_RISK: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  DELAYED: 'bg-red-100 text-red-800 border-red-200',
};

const planColors: Record<string, string> = {
  PLATINUM: 'bg-purple-100 text-purple-800 border-purple-200',
  GOLD: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  SILVER: 'bg-gray-100 text-gray-800 border-gray-200',
  BRONZE: 'bg-orange-100 text-orange-800 border-orange-200',
};

export function StatusBadge({ status, variant = 'status', className }: StatusBadgeProps) {
  const colorMap = {
    status: statusColors,
    phase: phaseColors,
    delay: delayColors,
    plan: planColors,
  };

  const colors = colorMap[variant];
  const colorClass = colors[status] || 'bg-gray-100 text-gray-800 border-gray-200';

  const displayText = status.replace(/_/g, ' ');

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        colorClass,
        className
      )}
    >
      {displayText}
    </span>
  );
}
