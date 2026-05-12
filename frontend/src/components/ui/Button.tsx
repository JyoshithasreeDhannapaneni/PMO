'use client';

import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {

    const base = 'inline-flex items-center justify-center font-medium rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-900 disabled:opacity-50 disabled:cursor-not-allowed btn-3d';

    const variants = {
      primary: 'bg-indigo-gradient text-white focus:ring-blue-500/50 shadow-btn hover:shadow-btn-hover',
      secondary: 'bg-white text-slate-700 hover:bg-blue-50 focus:ring-blue-500/30 border border-blue-200',
      outline: 'border border-blue-400 text-blue-600 hover:bg-blue-50 hover:border-blue-500 focus:ring-blue-500/30',
      ghost: 'text-slate-600 hover:bg-blue-50 hover:text-blue-600 focus:ring-blue-500/30',
      danger: 'bg-danger-gradient text-white focus:ring-red-500/50 shadow-btn',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs gap-1.5',
      md: 'px-4 py-2 text-sm gap-2',
      lg: 'px-6 py-3 text-base gap-2',
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
