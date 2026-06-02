'use client';

import { useState, useMemo, useCallback, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';
import {
  Archive, Search, Download, ChevronLeft, ChevronRight,
  Eye, CheckCircle, XCircle, FileText, BarChart3, Calendar,
  RefreshCw, ChevronDown, History, RotateCw, Layers,
  AlertTriangle, DollarSign, Package,
} from 'lucide-react';
import { format } from 'date-fns';
import { StatusBadge } from '@/components/ui/StatusBadge';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function authFetch(url: string, options?: RequestInit) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers },
  }).then(r => r.json());
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED:     'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  CANCELLED:     'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  CLOSED:        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  DECOMMISSIONED:'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

const STATUS_ICONS: Record<string, any> = {
  COMPLETED: CheckCircle, CANCELLED: XCircle,
  CLOSED: Archive, DECOMMISSIONED: Package,
};

function formatCurrency(n?: number | null) {
  if (!n) return '—';
  return `$${Number(n).toLocaleString()}`;
}

export default function ArchivePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();

  // Filters — non-admins are auto-scoped to their own name
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState('');
  const [managerFilter, setManagerFilter] = useState(!isAdmin && user?.name ? user.name : '');
  const [yearFrom, setYearFrom]           = useState('');
  const [yearTo, setYearTo]               = useState('');
  const [sortBy, setSortBy]               = useState('archived_at');
  const [sortOrder, setSortOrder]         = useState<'asc'|'desc'>('desc');
  const [page, setPage]                   = useState(1);
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [detailProject, setDetailProject] = useState<any | null>(null);
  const PER_PAGE = 20;

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (search)        p.set('search', search);
    if (statusFilter)  p.set('status', statusFilter);
    if (managerFilter) p.set('projectManager', managerFilter);
    if (yearFrom)     p.set('yearFrom', yearFrom);
    if (yearTo)       p.set('yearTo', yearTo);
    p.set('sortBy', sortBy);
    p.set('sortOrder', sortOrder);
    p.set('page', String(page));
    p.set('limit', String(PER_PAGE));
    return p.toString();
  }, [search, statusFilter, managerFilter, yearFrom, yearTo, sortBy, sortOrder, page]);

  const { data: archiveData, isLoading, refetch } = useQuery({
    queryKey: ['archive', queryParams],
    queryFn: () => authFetch(`${API_BASE}/api/archive?${queryParams}`),
    staleTime: 0,
  });

  const { data: statsData } = useQuery({
    queryKey: ['archiveStats'],
    queryFn: () => authFetch(`${API_BASE}/api/archive/stats`),
    staleTime: 60_000,
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => authFetch(`${API_BASE}/api/archive/${id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archive'] });
      queryClient.invalidateQueries({ queryKey: ['archiveStats'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const projects: any[] = archiveData?.projects || [];
  const total: number   = archiveData?.total || 0;
  const totalPages      = archiveData?.totalPages || 1;
  const stats           = statsData?.data;

  const managers = useMemo(() => [...new Set(projects.map((p) => p.projectManager).filter(Boolean))], [projects]);

  const resetFilters = () => {
    setSearch(''); setStatusFilter('');
    setManagerFilter(''); setYearFrom(''); setYearTo('');
    setSortBy('archived_at'); setSortOrder('desc'); setPage(1);
  };

  async function handleExportProject(project: any) {
    try {
      const res = await authFetch(`${API_BASE}/api/archive/${project.id}/export`);
      if (!res.success) { alert('Export failed: ' + (res.error || 'Unknown error')); return; }
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `archive-${project.name.replace(/[^a-z0-9]/gi, '_')}.json`;
      a.click();
    } catch (e) {
      alert('Export failed. Please try again.');
    }
  }

  function downloadCSV() {
    const headers = ['Project Name','Customer','Project Manager','Account Manager',
      'Status','Phase','Migration Types','Plan Type','Planned Start','Planned End',
      'Actual Start','Actual End','Delay Days','Overage Amount','Actual Cost',
      'Archived At','Archive Reason','Archived By'];
    const rows = projects.map((p) => [
      p.name, p.customerName, p.projectManager, p.accountManager || '',
      p.status, p.phase || '', p.migrationTypes || '', p.planType || '',
      p.plannedStart ? format(new Date(p.plannedStart), 'yyyy-MM-dd') : '',
      p.plannedEnd   ? format(new Date(p.plannedEnd),   'yyyy-MM-dd') : '',
      p.actualStart  ? format(new Date(p.actualStart),  'yyyy-MM-dd') : '',
      p.actualEnd    ? format(new Date(p.actualEnd),    'yyyy-MM-dd') : '',
      p.delayDays || 0, p.overageAmount || '', p.actualCost || '',
      p.archivedAt  ? format(new Date(p.archivedAt),  'yyyy-MM-dd HH:mm') : '',
      p.archiveReason || '', p.archivedBy || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `archive-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  }

  async function handleRestore(project: any) {
    if (!confirm(`Restore "${project.name}" to Active status? It will be removed from archive.`)) return;
    await restoreMutation.mutateAsync(project.id);
  }

  async function handleViewDetails(project: any) {
    try {
      const res = await authFetch(`${API_BASE}/api/archive/${project.id}/export`);
      if (res.success) setDetailProject(res.data);
      else alert('Could not load project details: ' + (res.error || 'Unknown error'));
    } catch (e) {
      alert('Could not load project details. Please try again.');
    }
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <nav className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
            <Link href="/" className="hover:text-primary-600">Dashboard</Link>
            <span>/</span>
            <span className="text-gray-700 dark:text-gray-300">History Archive</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Archive size={24} className="text-primary-600" />
            History Archive
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Centralized repository of all completed, closed, cancelled and decommissioned projects
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={downloadCSV} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <Card className="col-span-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
                <Archive size={18} className="text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Archived</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totals.total}</p>
              </div>
            </div>
          </Card>
          <Card className="col-span-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                <CheckCircle size={18} className="text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Completed</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totals.completed}</p>
              </div>
            </div>
          </Card>
          <Card className="col-span-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <XCircle size={18} className="text-red-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cancelled</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totals.cancelled}</p>
              </div>
            </div>
          </Card>
          <Card className="col-span-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <Archive size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Closed</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totals.closed}</p>
              </div>
            </div>
          </Card>
          <Card className="col-span-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <Package size={18} className="text-gray-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Decommissioned</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totals.decommissioned}</p>
              </div>
            </div>
          </Card>
          <Card className="col-span-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                <DollarSign size={18} className="text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Revenue</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(stats.totals.totalActualCost)}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Year-wise breakdown */}
      {stats?.byYear?.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
            <BarChart3 size={15} /> Archive by Year
          </h2>
          <div className="flex items-end gap-3 flex-wrap">
            {stats.byYear.map((y: any) => {
              const max = Math.max(...stats.byYear.map((b: any) => b.count));
              const pct = max > 0 ? Math.round((y.count / max) * 100) : 0;
              return (
                <button key={y.year} onClick={() => { setYearFrom(String(y.year)); setYearTo(String(y.year)); setPage(1); }}
                  className="flex flex-col items-center gap-1 group cursor-pointer">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 group-hover:text-primary-600">{y.count}</span>
                  <div className="w-10 rounded-t-md bg-primary-200 dark:bg-primary-800/50 group-hover:bg-primary-400 transition-colors" style={{ height: `${Math.max(8, pct * 0.6)}px` }} />
                  <span className="text-[10px] text-gray-400">{y.year}</span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search project, customer, manager…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
          </div>
          {isAdmin && (
            <select value={managerFilter} onChange={(e) => { setManagerFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              <option value="">All Managers</option>
              {managers.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Year:</span>
            <select value={yearFrom} onChange={(e) => { setYearFrom(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              <option value="">From</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-gray-400">—</span>
            <select value={yearTo} onChange={(e) => { setYearTo(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              <option value="">To</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Sort:</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              <option value="archived_at">Archived Date</option>
              <option value="name">Project Name</option>
              <option value="status">Status</option>
              <option value="planned_end">SOW End</option>
              <option value="project_manager">Manager</option>
            </select>
            <button onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600">
              {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {total} archived project{total !== 1 ? 's' : ''} found
          </p>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-16 text-gray-400">
            <RefreshCw size={24} className="animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-400 gap-3">
            <Archive size={40} className="opacity-30" />
            <p className="text-sm">No archived projects found</p>
            <p className="text-xs text-gray-400">Projects are automatically archived when their status changes to Completed, Cancelled, Closed, or Decommissioned</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    {['', 'Project Name', 'Manager', 'Migration Type', 'Status', 'SOW End', 'Actual End', 'Delay', 'Cost', 'Archived On', 'Actions'].map((h) => (
                      <th key={h} className={`py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap ${h === 'Project Name' ? 'text-left' : 'text-center'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {projects.map((p) => {
                    const isExpanded = expandedId === p.id;
                    const StatusIcon = STATUS_ICONS[p.status] || Archive;
                    return (
                      <Fragment key={p.id}>
                        <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                          <td className="py-3 px-2 text-center">
                            <ChevronDown size={13} className={`text-gray-400 transition-transform mx-auto ${isExpanded ? 'rotate-180' : ''}`} />
                          </td>
                          <td className="py-3 px-3 max-w-[200px]">
                            <div className="font-medium text-gray-900 dark:text-white truncate">{p.name}</div>
                            <div className="text-xs text-gray-400 truncate">{p.customerName}</div>
                          </td>
                          <td className="py-3 px-3 text-center text-xs text-gray-600 dark:text-gray-400">{p.projectManager || '—'}</td>
                          <td className="py-3 px-3 text-center">
                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px] inline-block">{p.migrationTypes || '—'}</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600'}`}>
                              <StatusIcon size={11} />
                              {p.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {p.plannedEnd ? format(new Date(p.plannedEnd), 'MMM d, yyyy') : '—'}
                          </td>
                          <td className="py-3 px-3 text-center text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {p.actualEnd ? format(new Date(p.actualEnd), 'MMM d, yyyy') : '—'}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {p.delayDays > 0 ? (
                              <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${p.delayDays > 14 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                +{p.delayDays}d
                              </span>
                            ) : <span className="text-xs text-green-600">On time</span>}
                          </td>
                          <td className="py-3 px-3 text-center text-xs text-gray-500 dark:text-gray-400">{formatCurrency(p.actualCost)}</td>
                          <td className="py-3 px-3 text-center text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {p.archivedAt ? format(new Date(p.archivedAt), 'MMM d, yyyy') : '—'}
                            {p.archiveReason && <div className="text-[10px] text-gray-400">{p.archiveReason}</div>}
                          </td>
                          <td className="py-3 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => handleViewDetails(p)} title="View full details"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-primary-100 hover:text-primary-700 transition-colors">
                                <Eye size={13} />
                              </button>
{isAdmin && (
                                <button onClick={() => handleRestore(p)} title="Restore to Active"
                                  disabled={restoreMutation.isPending}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50">
                                  <RotateCw size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${p.id}-exp`} className="bg-gray-50/60 dark:bg-gray-800/40">
                            <td colSpan={11} className="px-6 py-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                <div>
                                  <span className="font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide text-[10px]">Account Manager</span>
                                  <p className="text-gray-800 dark:text-gray-200 mt-0.5">{p.accountManager || '—'}</p>
                                </div>
                                <div>
                                  <span className="font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide text-[10px]">Plan Type</span>
                                  <p className="text-gray-800 dark:text-gray-200 mt-0.5">{p.planType || '—'}</p>
                                </div>
                                <div>
                                  <span className="font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide text-[10px]">Source → Target</span>
                                  <p className="text-gray-800 dark:text-gray-200 mt-0.5">{p.sourcePlatform || '—'} → {p.targetPlatform || '—'}</p>
                                </div>
                                <div>
                                  <span className="font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide text-[10px]">Estimated Cost</span>
                                  <p className="text-gray-800 dark:text-gray-200 mt-0.5">{formatCurrency(p.estimatedCost)}</p>
                                </div>
                                <div>
                                  <span className="font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide text-[10px]">SOW Start</span>
                                  <p className="text-gray-800 dark:text-gray-200 mt-0.5">{p.plannedStart ? format(new Date(p.plannedStart), 'MMM d, yyyy') : '—'}</p>
                                </div>
                                <div>
                                  <span className="font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide text-[10px]">Archived By</span>
                                  <p className="text-gray-800 dark:text-gray-200 mt-0.5">{p.archivedBy || 'system'}</p>
                                </div>
                                {p.restoreCount > 0 && (
                                  <div>
                                    <span className="font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide text-[10px]">Restore Count</span>
                                    <p className="text-orange-600 dark:text-orange-400 font-semibold mt-0.5">{p.restoreCount}×</p>
                                  </div>
                                )}
                                {p.isEscalated && (
                                  <div className="flex items-center gap-1 col-span-1">
                                    <AlertTriangle size={11} className="text-red-500" />
                                    <span className="text-red-600 dark:text-red-400 font-medium">Was Escalated</span>
                                  </div>
                                )}
                                {p.isOveraged && (
                                  <div className="flex items-center gap-1 col-span-1">
                                    <DollarSign size={11} className="text-orange-500" />
                                    <span className="text-orange-600 dark:text-orange-400 font-medium">Was Overaged ({formatCurrency(p.overageAmount)})</span>
                                  </div>
                                )}
                                {p.description && (
                                  <div className="col-span-4">
                                    <span className="font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide text-[10px]">Description</span>
                                    <p className="text-gray-700 dark:text-gray-300 mt-0.5 text-xs">{p.description}</p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total} entries
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1 rounded text-gray-500 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const pg = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page + i - 3;
                  if (pg < 1 || pg > totalPages) return null;
                  return (
                    <button key={pg} onClick={() => setPage(pg)}
                      className={`w-7 h-7 rounded text-xs font-medium ${pg === page ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                      {pg}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1 rounded text-gray-500 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Info banner */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-700 dark:text-blue-300">
        <Archive size={15} className="flex-shrink-0 mt-0.5" />
        <span>Projects are automatically archived when their status is set to <strong>Completed</strong>, <strong>Cancelled</strong>, <strong>Closed</strong>, or <strong>Decommissioned</strong>. Admins can restore any project back to Active status.</span>
      </div>

      {/* Full Detail Modal */}
      {detailProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setDetailProject(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 bg-primary-600 text-white">
              <div>
                <h2 className="text-lg font-bold">{detailProject.project.name}</h2>
                <p className="text-xs opacity-80">{detailProject.project.customerName} · Full Archive Record</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  const blob = new Blob([JSON.stringify(detailProject, null, 2)], { type: 'application/json' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `archive-${detailProject.project.name.replace(/[^a-z0-9]/gi,'_')}.json`;
                  a.click();
                }} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors">
                  <Download size={14} /> Export JSON
                </button>
                <button onClick={() => setDetailProject(null)} className="p-2 rounded-lg hover:bg-white/20 transition-colors">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Project details */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Project Details</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  {[
                    ['Project Manager', detailProject.project.projectManager],
                    ['Account Manager', detailProject.project.accountManager || '—'],
                    ['Status', detailProject.project.status],
                    ['Phase', detailProject.project.phase || '—'],
                    ['Plan Type', detailProject.project.planType || '—'],
                    ['Migration Types', detailProject.project.migrationTypes || '—'],
                    ['Source Platform', detailProject.project.sourcePlatform || '—'],
                    ['Target Platform', detailProject.project.targetPlatform || '—'],
                    ['SOW Start', detailProject.project.plannedStart ? format(new Date(detailProject.project.plannedStart), 'MMM d, yyyy') : '—'],
                    ['SOW End', detailProject.project.plannedEnd ? format(new Date(detailProject.project.plannedEnd), 'MMM d, yyyy') : '—'],
                    ['Actual Start', detailProject.project.actualStart ? format(new Date(detailProject.project.actualStart), 'MMM d, yyyy') : '—'],
                    ['Actual End', detailProject.project.actualEnd ? format(new Date(detailProject.project.actualEnd), 'MMM d, yyyy') : '—'],
                    ['Estimated Cost', formatCurrency(detailProject.project.estimatedCost)],
                    ['Actual Cost', formatCurrency(detailProject.project.actualCost)],
                    ['Delay Days', `${detailProject.project.delayDays || 0} days`],
                    ['Archived On', detailProject.project.archivedAt ? format(new Date(detailProject.project.archivedAt), 'MMM d, yyyy HH:mm') : '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5">
                      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
                      <p className="text-gray-900 dark:text-white font-medium text-xs">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Phases & Tasks */}
              {detailProject.phases?.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Phases & Tasks</h3>
                  <div className="space-y-2">
                    {detailProject.phases.map((ph: any) => (
                      <div key={ph.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/50">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{ph.phaseName}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ph.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : ph.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{ph.status}</span>
                            <span className="text-[10px] text-gray-400">{ph.progress}%</span>
                          </div>
                        </div>
                        {ph.tasks?.length > 0 && (
                          <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {ph.tasks.map((t: any, i: number) => (
                              <div key={t.id || i} className="flex items-center justify-between px-4 py-1.5 text-xs">
                                <span className="text-gray-700 dark:text-gray-300">{t.name}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${t.status === 'DONE' ? 'bg-green-100 text-green-700' : t.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Escalation History */}
              {detailProject.escalationHistory?.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Escalation History</h3>
                  <div className="space-y-2">
                    {detailProject.escalationHistory.map((h: any, i: number) => (
                      <div key={h.id || i} className="flex items-start gap-2 text-xs bg-red-50/50 dark:bg-red-900/10 rounded-lg p-2.5 border border-red-100 dark:border-red-900/30">
                        <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${h.resolved_date ? 'bg-green-400' : 'bg-red-500'}`} />
                        <div>
                          <span className="font-semibold text-gray-700 dark:text-gray-300">{format(new Date(h.escalated_at), 'MMM d, yyyy HH:mm')}</span>
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">{h.priority}</span>
                          {h.escalation_type && <span className="ml-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px]">{h.escalation_type}</span>}
                          {h.resolved_date && <span className="ml-1 text-green-600 text-[10px]">Resolved {format(new Date(h.resolved_date), 'MMM d, yyyy')}</span>}
                          {h.notes && <p className="text-gray-500 dark:text-gray-400 mt-0.5">{h.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Overage History */}
              {detailProject.overageHistory?.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Overage History</h3>
                  <div className="space-y-2">
                    {detailProject.overageHistory.map((h: any, i: number) => (
                      <div key={h.id || i} className="flex items-start gap-2 text-xs bg-orange-50/50 dark:bg-orange-900/10 rounded-lg p-2.5 border border-orange-100 dark:border-orange-900/30">
                        <DollarSign size={12} className="text-orange-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="font-semibold text-gray-700 dark:text-gray-300">{format(new Date(h.created_at), 'MMM d, yyyy')}</span>
                          {h.overage_amount && <span className="ml-2 text-orange-600 font-bold">{formatCurrency(h.overage_amount)}</span>}
                          {h.notes && <p className="text-gray-500 dark:text-gray-400 mt-0.5">{h.notes}</p>}
                          {h.extended_end_date && <p className="text-blue-500 mt-0.5">Extended to: {format(new Date(h.extended_end_date), 'MMM d, yyyy')}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-gray-400 text-center">Exported at {format(new Date(detailProject.exportedAt), 'MMM d, yyyy HH:mm:ss')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
