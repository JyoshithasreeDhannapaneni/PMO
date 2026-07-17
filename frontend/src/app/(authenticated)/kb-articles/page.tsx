'use client';

import { useState } from 'react';
import { useKbArticles, useDeleteKbArticle } from '@/hooks/useProjects';
import { useAuth } from '@/context/AuthContext';

const CATEGORIES = ['All', 'General', 'Lessons', 'Performance', 'Security', 'Configuration', 'Data', 'Network'];

const CATEGORY_COLORS: Record<string, string> = {
  General: 'bg-gray-100 text-gray-700',
  Lessons: 'bg-blue-100 text-blue-700',
  Performance: 'bg-orange-100 text-orange-700',
  Security: 'bg-red-100 text-red-700',
  Configuration: 'bg-purple-100 text-purple-700',
  Data: 'bg-green-100 text-green-700',
  Network: 'bg-cyan-100 text-cyan-700',
};

function ArticleCard({ article, onDelete, canDelete }: { article: any; onDelete: (id: string) => void; canDelete: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[article.category] || CATEGORY_COLORS.General}`}>
                {article.category}
              </span>
              {article.migrationTypes && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">
                  {article.migrationTypes.split(',')[0].trim()}
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-gray-900 leading-tight">{article.title}</h3>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
              {article.customerName && <span>{article.customerName}</span>}
              {article.projectManager && <span>{article.projectManager}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {canDelete && (
              <button
                onClick={() => onDelete(article.id)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-xs"
                title="Delete"
              >
                ✕
              </button>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {expanded ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {article.issue && !expanded && (
          <p className="text-xs text-gray-600 mt-2 line-clamp-2">{article.issue}</p>
        )}
      </div>

      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {article.issue && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-red-600 mb-1">Issue / Error</p>
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{article.issue}</p>
            </div>
          )}
          {article.rootCause && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-orange-600 mb-1">Root Cause</p>
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{article.rootCause}</p>
            </div>
          )}
          {article.fix && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-green-600 mb-1">Fix / Workaround</p>
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{article.fix}</p>
            </div>
          )}
          {article.prevention && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-blue-600 mb-1">Prevention</p>
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{article.prevention}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function KbArticlesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data, isLoading, refetch } = useKbArticles({
    search: activeSearch || undefined,
    category: categoryFilter !== 'All' ? categoryFilter : undefined,
  });
  const deleteMutation = useDeleteKbArticle();

  const articles: any[] = data?.data || [];

  const handleDelete = async (id: string) => {
    if (deleteConfirm !== id) { setDeleteConfirm(id); return; }
    await deleteMutation.mutateAsync(id);
    setDeleteConfirm(null);
    refetch();
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">KB Articles</h1>
        <p className="text-sm text-gray-500 mt-0.5">Knowledge base extracted from completed case studies</p>
      </div>

      {/* Category stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {CATEGORIES.slice(1).map((cat) => {
          const count = articles.filter((a) => a.category === cat).length;
          return (
            <button key={cat} onClick={() => setCategoryFilter(cat === categoryFilter ? 'All' : cat)}
              className={`p-3 rounded-xl border text-left transition-all ${categoryFilter === cat ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white hover:border-indigo-200'}`}>
              <p className="text-lg font-bold text-gray-900">{count}</p>
              <p className="text-xs text-gray-500">{cat}</p>
            </button>
          );
        })}
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Search articles, issues, fixes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setActiveSearch(search)}
          className="flex-1 min-w-48 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button onClick={() => setActiveSearch(search)}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
          Search
        </button>
        {(activeSearch || categoryFilter !== 'All') && (
          <button onClick={() => { setSearch(''); setActiveSearch(''); setCategoryFilter('All'); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
            Clear
          </button>
        )}
        <div className="flex items-center gap-1 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                categoryFilter === cat ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Articles grid */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      ) : articles.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <p className="text-sm font-medium text-gray-600">No KB articles yet</p>
          <p className="text-xs text-gray-400 mt-1">Open a completed case study and click "Extract KB Articles" to get started</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500">{articles.length} article{articles.length !== 1 ? 's' : ''}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} canDelete={isAdmin} onDelete={handleDelete} />
            ))}
          </div>
        </>
      )}

      {deleteConfirm && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-white border border-red-200 rounded-xl shadow-lg">
          <span className="text-sm text-gray-700">Delete this KB article?</span>
          <button onClick={() => handleDelete(deleteConfirm)}
            className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">
            Confirm
          </button>
          <button onClick={() => setDeleteConfirm(null)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
