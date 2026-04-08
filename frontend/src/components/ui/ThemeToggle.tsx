'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

interface ThemeToggleProps {
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ThemeToggle({ showLabel = false, size = 'md' }: ThemeToggleProps) {
  const { theme, setTheme, toggleTheme, resolvedTheme } = useTheme();

  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;

  if (showLabel) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">Theme:</span>
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setTheme('light')}
            className={`p-2 rounded-md transition-colors ${
              theme === 'light'
                ? 'bg-white dark:bg-gray-700 shadow-sm'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            title="Light mode"
          >
            <Sun size={iconSize} className={theme === 'light' ? 'text-yellow-500' : 'text-gray-500'} />
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`p-2 rounded-md transition-colors ${
              theme === 'dark'
                ? 'bg-white dark:bg-gray-700 shadow-sm'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            title="Dark mode"
          >
            <Moon size={iconSize} className={theme === 'dark' ? 'text-blue-500' : 'text-gray-500'} />
          </button>
          <button
            onClick={() => setTheme('system')}
            className={`p-2 rounded-md transition-colors ${
              theme === 'system'
                ? 'bg-white dark:bg-gray-700 shadow-sm'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            title="System preference"
          >
            <Monitor size={iconSize} className={theme === 'system' ? 'text-primary-500' : 'text-gray-500'} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
      title={`Switch to ${resolvedTheme === 'light' ? 'dark' : 'light'} mode`}
    >
      {resolvedTheme === 'light' ? <Moon size={iconSize} /> : <Sun size={iconSize} />}
    </button>
  );
}
