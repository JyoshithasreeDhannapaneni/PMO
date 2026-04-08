'use client';

import { cn } from '@/lib/utils';
import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import type { DelayStatus } from '@/types';

interface DelayIndicatorProps {
  status: DelayStatus;
  days: number;
  showDays?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function DelayIndicator({
  status,
  days,
  showDays = true,
  size = 'md',
  className,
}: DelayIndicatorProps) {
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 20,
  };

  const config = {
    NOT_DELAYED: {
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      label: 'On Track',
    },
    AT_RISK: {
      icon: AlertTriangle,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      label: 'At Risk',
    },
    DELAYED: {
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      label: 'Delayed',
    },
  };

  const { icon: Icon, color, bgColor, label } = config[status];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-md',
        bgColor,
        sizeClasses[size],
        className
      )}
    >
      <Icon className={color} size={iconSizes[size]} />
      <span className={cn('font-medium', color)}>
        {label}
        {showDays && days > 0 && ` (${days}d)`}
      </span>
    </div>
  );
}
