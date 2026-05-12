'use client';

import { Sun } from 'lucide-react';

interface ThemeToggleProps {
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'simple' | 'switcher';
}

export function ThemeToggle({ showLabel = false, size = 'md', variant = 'simple' }: ThemeToggleProps) {
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;

  return (
    <button
      className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
      title="Light mode"
      aria-label="Light mode"
    >
      <Sun size={iconSize} className="text-amber-400" />
    </button>
  );
}
