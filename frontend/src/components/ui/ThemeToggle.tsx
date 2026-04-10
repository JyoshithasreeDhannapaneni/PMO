'use client';

import { Sun, Moon, Monitor, Loader2 } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

interface ThemeToggleProps {
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'simple' | 'switcher';
}

export function ThemeToggle({ showLabel = false, size = 'md', variant = 'simple' }: ThemeToggleProps) {
  const { theme, setTheme, toggleTheme, resolvedTheme, mounted } = useTheme();

  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;

  // Show loading state before hydration
  if (!mounted) {
    return (
      <button
        className="p-2 text-gray-400 rounded-lg"
        disabled
      >
        <Loader2 size={iconSize} className="animate-spin" />
      </button>
    );
  }

  // Full switcher with all three options
  if (showLabel || variant === 'switcher') {
    return (
      <div className="flex items-center gap-2">
        {showLabel && (
          <span className="text-sm text-gray-600 dark:text-gray-400">Theme:</span>
        )}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setTheme('light')}
            className={`p-2 rounded-md transition-all duration-200 ${
              theme === 'light'
                ? 'bg-white dark:bg-gray-700 shadow-sm text-yellow-500'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            title="Light mode"
            aria-label="Switch to light mode"
          >
            <Sun size={iconSize} />
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`p-2 rounded-md transition-all duration-200 ${
              theme === 'dark'
                ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-500'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            title="Dark mode"
            aria-label="Switch to dark mode"
          >
            <Moon size={iconSize} />
          </button>
          <button
            onClick={() => setTheme('system')}
            className={`p-2 rounded-md transition-all duration-200 ${
              theme === 'system'
                ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-500'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            title="System preference"
            aria-label="Use system theme preference"
          >
            <Monitor size={iconSize} />
          </button>
        </div>
      </div>
    );
  }

  // Simple toggle button
  return (
    <button
      onClick={toggleTheme}
      className="relative p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200 group"
      title={`Switch to ${resolvedTheme === 'light' ? 'dark' : 'light'} mode`}
      aria-label={`Switch to ${resolvedTheme === 'light' ? 'dark' : 'light'} mode`}
    >
      <div className="relative w-5 h-5">
        {/* Sun icon - visible in dark mode */}
        <Sun 
          size={iconSize} 
          className={`absolute inset-0 transition-all duration-300 ${
            resolvedTheme === 'dark' 
              ? 'opacity-100 rotate-0 scale-100 text-yellow-500' 
              : 'opacity-0 rotate-90 scale-0'
          }`}
        />
        {/* Moon icon - visible in light mode */}
        <Moon 
          size={iconSize} 
          className={`absolute inset-0 transition-all duration-300 ${
            resolvedTheme === 'light' 
              ? 'opacity-100 rotate-0 scale-100 text-gray-600' 
              : 'opacity-0 -rotate-90 scale-0'
          }`}
        />
      </div>
      
      {/* Tooltip */}
      <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
        {resolvedTheme === 'light' ? 'Dark mode' : 'Light mode'}
      </span>
    </button>
  );
}
