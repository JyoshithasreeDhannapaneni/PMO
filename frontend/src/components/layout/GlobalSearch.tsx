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
  project: FolderKanban, task: FileText, risk: AlertTriangle,
  team_member: Users, document: File, case_study: BookOpen, user: User,
};
const typeLabels: Record<string, string> = {
  project: 'Project', task: 'Task', risk: 'Risk',
  team_member: 'Team Member', document: 'Document', case_study: 'Case Study', user: 'User',
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); inputRef.current?.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsFocused(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}&limit=15`);
        const json = await res.json();
        if (json.success) { setResults(json.data); setSelectedIndex(0); }
      } catch {}
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const handleKeyNavigation = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(p => Math.min(p + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(p => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter' && results[selectedIndex]) { window.location.href = results[selectedIndex].url; handleClear(); }
    else if (e.key === 'Escape') setIsFocused(false);
  };

  const handleClear = () => { setQuery(''); setResults([]); setIsFocused(false); };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className={`flex items-center gap-2 px-3 py-2 bg-white border rounded-lg transition-all ${
        isFocused ? 'border-blue-400 ring-2 ring-blue-100' : 'border-blue-200 hover:border-blue-300'
      }`}>
        <Search size={15} className="flex-shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyNavigation}
          placeholder="Search projects, tasks, managers..."
          className="flex-1 text-sm text-slate-700 placeholder-slate-400 bg-transparent outline-none min-w-0"
        />
        {query ? (
          <button onClick={handleClear} className="flex-shrink-0 p-0.5 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        ) : (
          <kbd className="hidden sm:inline-flex flex-shrink-0 items-center justify-center px-1.5 h-5 text-xs font-medium text-slate-400 bg-blue-50 rounded border border-blue-200 leading-none">
            ⌘K
          </kbd>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-blue-100 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Searching...
              </div>
            )}
            {!loading && query.length >= 2 && results.length === 0 && (
              <div className="px-4 py-3 text-sm text-slate-500">
                No results for <span className="font-medium text-slate-700">"{query}"</span>
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
                      className={`flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors ${
                        index === selectedIndex ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className={`p-1.5 rounded-md flex-shrink-0 ${
                        index === selectedIndex ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{result.title}</p>
                        {result.subtitle && <p className="text-xs text-slate-500 truncate">{result.subtitle}</p>}
                      </div>
                      <span className="flex-shrink-0 text-xs text-slate-400">{typeLabels[result.type] || result.type}</span>
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
