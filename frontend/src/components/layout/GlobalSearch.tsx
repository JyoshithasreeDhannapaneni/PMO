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
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

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
      setIsOpen(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
      >
        <Search size={16} />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-xs bg-white rounded border border-gray-300">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      
      <div className="relative min-h-screen flex items-start justify-center pt-[15vh] px-4">
        <div
          ref={containerRef}
          className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden"
        >
          {/* Search Input */}
          <div className="flex items-center px-4 border-b border-gray-200">
            <Search size={20} className="text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyNavigation}
              placeholder="Search projects, tasks, risks, documents..."
              className="flex-1 px-4 py-4 text-lg outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            )}
            <button
              onClick={handleClose}
              className="ml-2 px-2 py-1 text-xs text-gray-500 bg-gray-100 rounded"
            >
              ESC
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {loading && (
              <div className="p-8 text-center text-gray-500">
                <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full mx-auto" />
                <p className="mt-2 text-sm">Searching...</p>
              </div>
            )}

            {!loading && query.length >= 2 && results.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                <Search size={40} className="mx-auto mb-4 text-gray-300" />
                <p>No results found for "{query}"</p>
                <p className="text-sm mt-1">Try different keywords</p>
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="py-2">
                {results.map((result, index) => {
                  const Icon = typeIcons[result.type] || FileText;
                  return (
                    <Link
                      key={`${result.type}-${result.id}`}
                      href={result.url}
                      onClick={handleClose}
                      className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 ${
                        index === selectedIndex ? 'bg-primary-50' : ''
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${
                        index === selectedIndex ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        <Icon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{result.title}</p>
                        {result.subtitle && (
                          <p className="text-sm text-gray-500 truncate">{result.subtitle}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {result.highlight && (
                          <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                            {result.highlight}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {typeLabels[result.type] || result.type}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {!loading && query.length < 2 && (
              <div className="p-6">
                <p className="text-sm text-gray-500 mb-4">Quick Links</p>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/projects"
                    onClick={handleClose}
                    className="flex items-center gap-2 p-3 rounded-lg hover:bg-gray-50"
                  >
                    <FolderKanban size={18} className="text-gray-400" />
                    <span className="text-sm">All Projects</span>
                  </Link>
                  <Link
                    href="/portfolio"
                    onClick={handleClose}
                    className="flex items-center gap-2 p-3 rounded-lg hover:bg-gray-50"
                  >
                    <FileText size={18} className="text-gray-400" />
                    <span className="text-sm">Portfolio</span>
                  </Link>
                  <Link
                    href="/projects/new"
                    onClick={handleClose}
                    className="flex items-center gap-2 p-3 rounded-lg hover:bg-gray-50"
                  >
                    <FolderKanban size={18} className="text-gray-400" />
                    <span className="text-sm">New Project</span>
                  </Link>
                  <Link
                    href="/case-studies"
                    onClick={handleClose}
                    className="flex items-center gap-2 p-3 rounded-lg hover:bg-gray-50"
                  >
                    <BookOpen size={18} className="text-gray-400" />
                    <span className="text-sm">Case Studies</span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white rounded border">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-white rounded border">↓</kbd>
                to navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white rounded border">↵</kbd>
                to select
              </span>
            </div>
            <span>Powered by PMO Tracker</span>
          </div>
        </div>
      </div>
    </div>
  );
}
