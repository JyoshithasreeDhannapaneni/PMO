'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, FileText, FolderKanban, AlertTriangle, Users, File, BookOpen, User } from 'lucide-react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  highlight?: string;
}

const typeIcons: Record<string, any> = {
  project: FolderKanban,
  task: FileText,
  risk: AlertTriangle,
  team_member: Users,
  document: File,
  case_study: BookOpen,
  user: User,
};

const typeLabels: Record<string, string> = {
  project: 'Project',
  task: 'Task',
  risk: 'Risk',
  team_member: 'Team Member',
  document: 'Document',
  case_study: 'Case Study',
  user: 'User',
};

export function GlobalSearch() {
  const [isFocused, setIsFocused] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const showDropdown = isFocused && (query.length >= 2 || results.length > 0);

  // Ctrl+K / Cmd+K shortcut focuses the input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}&limit=15`);
        const json = await res.json();
        if (json.success) {
          setResults(json.data);
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error('Search error:', err);
      }
      setLoading(false);
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [query]);

  const handleKeyNavigation = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      window.location.href = results[selectedIndex].url;
      handleClear();
    } else if (e.key === 'Escape') {
      setIsFocused(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsFocused(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Inline search input */}
      <div className={`flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 border rounded-lg transition-colors ${
        isFocused
          ? 'border-primary-500 ring-2 ring-primary-100 dark:ring-primary-900'
          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
      }`}>
        <Search size={15} className="flex-shrink-0 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyNavigation}
          placeholder="Search projects, tasks, managers..."
          className="flex-1 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 bg-transparent outline-none min-w-0"
        />
        {query ? (
          <button onClick={handleClear} className="flex-shrink-0 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={14} />
          </button>
        ) : (
          <kbd className="hidden sm:inline-flex flex-shrink-0 items-center justify-center px-1.5 h-5 text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-600 rounded border border-gray-200 dark:border-gray-500 leading-none">
            ⌘K
          </kbd>
        )}
      </div>

      {/* Dropdown results */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                Searching...
              </div>
            )}

            {!loading && query.length >= 2 && results.length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                No results for <span className="font-medium text-gray-700 dark:text-gray-300">"{query}"</span>
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="py-1">
                {results.map((result, index) => {
                  const Icon = typeIcons[result.type] || FileText;
                  return (
                    <Link
                      key={`${result.type}-${result.id}`}
                      href={result.url}
                      onClick={handleClear}
                      className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                        index === selectedIndex ? 'bg-primary-50 dark:bg-primary-900/30' : ''
                      }`}
                    >
                      <div className={`p-1.5 rounded-md flex-shrink-0 ${
                        index === selectedIndex
                          ? 'bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      }`}>
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{result.title}</p>
                        {result.subtitle && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{result.subtitle}</p>
                        )}
                      </div>
                      <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">
                        {typeLabels[result.type] || result.type}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
