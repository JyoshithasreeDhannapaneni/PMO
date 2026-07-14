'use client';

import { useState, useMemo, Fragment } from 'react';
import { useOveragedProjects, useMarkOverageProject, useUpdateOverageProject, useUnmarkOverageProject, useDeleteOverageHistoryEntry, useProjects } from '@/hooks/useProjects';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';
import {
  DollarSign, Clock, TrendingUp, Calendar, Search,
  RotateCcw, Eye, Download, ChevronLeft, ChevronRight, AlertCircle,
  Plus, X, Trash2, ChevronDown, ChevronUp, Pencil,
} from 'lucide-react';
import { format, isThisWeek } from 'date-fns';
import { StatusBadge } from '@/components/ui/StatusBadge';

function formatCurrency(n?: number | null) {
  if (!n) return '—';
  return `$${Number(n).toLocaleString()}`;
}

function daysLabel(d: number) {
  return d === 0 ? '0 days' : `${d} day${d !== 1 ? 's' : ''}`;
}

export default function OverageProjectsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'PROJECT_MANAGER';
  const isViewer = user?.role === 'VIEWER';
  // Everyone sees all overage projects; edit rights are per-project
  const canEditProject = (p: any) => !isViewer && (isAdmin || (isManager && p.projectManager === user?.name));

  const { data, isLoading, refetch } = useOveragedProjects(undefined);
  const projects: any[] = data?.data || [];

  const { data: allProjectsData } = useProjects({ limit: 1000 });
  const allProjects: any[] = allProjectsData?.data || [];

  const markOverage = useMarkOverageProject();
  const updateOverage = useUpdateOverageProject();
  const unmarkOverage = useUnmarkOverageProject();
  const deleteHistoryEntry = useDeleteOverageHistoryEntry();

  const [search, setSearch] = useState('');
  const [managerSel, setManagerSel] = useState('');
  const [typeSel, setTypeSel] = useState('');
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  // Add Overage Modal state
  const [showModal, setShowModal] = useState(false);
  const [overageForm, setOverageForm] = useState({ projectId: '', overageAmount: '', notes: '', extendedStartDate: '', extendedEndDate: '' });
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // Edit Overage Modal state
  const [editProject, setEditProject] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ overageAmount: '', notes: '', extendedStartDate: '', extendedEndDate: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  function openEditModal(p: any) {
    setEditProject(p);
    setEditForm({
      overageAmount: p.overageAmount != null ? String(p.overageAmount) : '',
      notes: p.overageNotes || '',
      extendedStartDate: p.extendedStartDate ? p.extendedStartDate.split('T')[0] : '',
      extendedEndDate: p.extendedEndDate ? p.extendedEndDate.split('T')[0] : '',
    });
    setEditError('');
  }

  async function handleEditOverage() {
    if (!editProject) return;
    setEditSaving(true);
    setEditError('');
    try {
      await updateOverage.mutateAsync({
        id: editProject.id,
        overageAmount: editForm.overageAmount ? parseFloat(editForm.overageAmount) : undefined,
        notes: editForm.notes || undefined,
        extendedStartDate: editForm.extendedStartDate || undefined,
        extendedEndDate: editForm.extendedEndDate || undefined,
      });
      setEditProject(null);
      refetch();
    } catch {
      setEditError('Failed to update overage. Please try again.');
    } finally {
      setEditSaving(false);
    }
  }
  const [projectSearch, setProjectSearch] = useState('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // All active projects can be re-added to overage (history table tracks multiple entries)
  const nonOveraged = allProjects;

  async function handleAddOverage() {
    if (!overageForm.projectId) { setModalError('Please select a project'); return; }
    setModalError('');
    setSaving(true);
    try {
      const amount = overageForm.overageAmount ? parseFloat(overageForm.overageAmount) : undefined;
      await markOverage.mutateAsync({
        id: overageForm.projectId,
        overageAmount: amount,
        notes: overageForm.notes || undefined,
        extendedStartDate: overageForm.extendedStartDate || undefined,
        extendedEndDate: overageForm.extendedEndDate || undefined,
      });
      setShowModal(false);
      setOverageForm({ projectId: '', overageAmount: '', notes: '', extendedStartDate: '', extendedEndDate: '' });
      setProjectSearch('');
      refetch();
    } catch {
      setModalError('Failed to mark project as overaged. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUnmarkOverage(id: string) {
    if (!confirm('Remove overage from this project?')) return;
    await unmarkOverage.mutateAsync(id);
    refetch();
  }

  async function handleDeleteProject(id: string) {
    if (!confirm('Remove this project from overage?')) return;
    await unmarkOverage.mutateAsync(id);
    refetch();
  }

  async function handleDeleteHistoryEntry(historyId: string) {
    if (!confirm('Delete this overage history entry? This cannot be undone.')) return;
    await deleteHistoryEntry.mutateAsync(historyId);
    refetch();
  }

  const managers = useMemo(() => [...new Set(projects.map((p) => p.projectManager).filter(Boolean))], [projects]);
  const types = useMemo(() => {
    const all: string[] = [];
    projects.forEach((p) => {
      (p.migrationTypes || '').split(',').forEach((t: string) => {
        const trimmed = t.trim();
        if (trimmed) all.push(trimmed);
      });
    });
    return [...new Set(all)];
  }, [projects]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return projects.filter((p) => {
      if (q && !p.name?.toLowerCase().includes(q) && !p.customerName?.toLowerCase().includes(q) && !p.projectManager?.toLowerCase().includes(q)) return false;
      if (managerSel && p.projectManager !== managerSel) return false;
      if (typeSel && !(p.migrationTypes || '').toLowerCase().includes(typeSel.toLowerCase())) return false;
      return true;
    });
  }, [projects, search, managerSel, typeSel]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Per-project cumulative overage = sum of all history entries for that project
  function projectCumulativeAmount(p: any): number {
    const hist: any[] = p.overageHistory || [];
    return hist.reduce((s, h) => s + (parseFloat(h.overageAmount) || 0), 0);
  }

  // Stats
  const totalOverageAmount = projects.reduce((sum, p) => sum + projectCumulativeAmount(p), 0);
  const newThisWeek = projects.filter((p) => p.plannedEnd && isThisWeek(new Date(p.plannedEnd))).length;

  function downloadCSV() {
    const headers = ['Project Name', 'Customer', 'Project Manager', 'Account Manager', 'Migration Type', 'Status', 'Phase', 'Planned End', 'Days Overdue', 'Overage Amount'];
    const rows = filtered.map((p) => [
      p.name, p.customerName, p.projectManager, p.accountManager || '',
      p.migrationTypes || '', p.status, p.phase,
      p.plannedEnd ? format(new Date(p.plannedEnd), 'yyyy-MM-dd') : '',
      p.daysOverdue, p.overageAmount || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'overage-projects.csv';
    a.click();
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb + Header */}
      <div className="flex items-center justify-between">
        <div>
          <nav className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Link href="/" className="hover:text-primary-600">Dashboard</Link>
            <span>/</span>
            <span className="text-gray-700">Overage Projects</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900">Overage Projects</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RotateCcw size={14} /> Refresh
          </button>
          <button
            onClick={downloadCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download size={14} /> Export
          </button>
          {!isViewer && (
            <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors">
              <Plus size={14} /> Add Overage
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-orange-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <Clock size={20} className="text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Overaged Projects</p>
              <p className="text-2xl font-bold text-gray-900">{projects.length}</p>
            </div>
          </div>
        </Card>
        <Card className="border-green-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <DollarSign size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Overage Amount</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(totalOverageAmount) || '—'}</p>
            </div>
          </div>
        </Card>
        <Card className="border-blue-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Calendar size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Extended Projects</p>
              <p className="text-2xl font-bold text-gray-900">{projects.filter((p) => p.isOveraged).length}</p>
            </div>
          </div>
        </Card>
        <Card className="border-purple-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <TrendingUp size={20} className="text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">New This Week</p>
              <p className="text-2xl font-bold text-gray-900">{newThisWeek}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search project, customer, manager..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
            />
          </div>
          <select
            value={managerSel}
            onChange={(e) => { setManagerSel(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
          >
            <option value="">All Managers</option>
            {managers.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={typeSel}
            onChange={(e) => { setTypeSel(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
          >
            <option value="">All Migration Types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            onClick={() => { setSearch(''); setManagerSel(''); setTypeSel(''); setPage(1); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RotateCcw size={13} /> Reset
          </button>
        </div>
      </Card>

      {/* Table */}
      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12 text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
            <DollarSign size={32} />
            <p>No overaged projects found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-blue-50/60">
                  <tr>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-500 text-left">Project Name</th>
                    {['Project Manager', 'Account Manager', 'Migration Type', 'Overage Amount', 'Days Overdue', 'Current Phase', 'Status'].map((h) => (
                      <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 text-center">{h}</th>
                    ))}
                    <th className="py-3 px-4 text-xs font-semibold text-gray-500 text-center">
                      Planned End
                    </th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-500 text-center">Extended Start</th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-500 text-center">Extended End</th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-500 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((p) => (
                    <Fragment key={p.id}>
                      <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleRow(p.id)}>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            {expandedRows.has(p.id) ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
                            <div>
                              <Link href={`/projects/${p.id}`} className="font-medium text-primary-600 hover:underline" onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                              <div className="text-xs text-gray-400">{p.customerName}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center text-gray-700">{p.projectManager || '—'}</td>
                        <td className="py-3 px-4 text-center text-gray-700">{p.accountManager || '—'}</td>
                        <td className="py-3 px-4 text-center">
                          {(p.migrationTypes || '').split(',').filter(Boolean).map((t: string, i: number) => (
                            <span key={i} className="inline-block mr-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{t.trim()}</span>
                          ))}
                          {!p.migrationTypes && <span className="text-gray-400">—</span>}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-semibold text-green-700">{formatCurrency(projectCumulativeAmount(p)) || '—'}</span>
                          {(p.overageHistory?.length || 0) > 1 && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                              {p.overageHistory.length} events
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.daysOverdue > 14 ? 'bg-red-100 text-red-700' : p.daysOverdue > 7 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {daysLabel(p.daysOverdue)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <StatusBadge status={p.phase} variant="phase" />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <StatusBadge status={p.status} variant="status" />
                        </td>
                        <td className="py-3 px-4 text-center text-gray-500">
                          {p.plannedEnd ? format(new Date(p.plannedEnd), 'MMM d, yyyy') : '—'}
                        </td>
                        <td className="py-3 px-4 text-center text-gray-500">
                          {p.extendedStartDate ? format(new Date(p.extendedStartDate), 'MMM d, yyyy') : '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {p.extendedEndDate ? (
                            <span className={p.extendedEndDate !== p.plannedEnd ? 'text-orange-600 font-medium' : 'text-gray-500'}>
                              {format(new Date(p.extendedEndDate), 'MMM d, yyyy')}
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <Link href={`/projects/${p.id}`} className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-gray-600 hover:bg-primary-100 hover:text-primary-700 transition-colors">
                              <Eye size={14} />
                            </Link>
                            {canEditProject(p) && (
                              <button
                                onClick={() => openEditModal(p)}
                                title="Edit overage details"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-blue-500 hover:bg-blue-100 transition-colors"
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            {canEditProject(p) && (
                              <button
                                onClick={() => handleDeleteProject(p.id)}
                                title="Remove from overage"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-red-500 hover:bg-red-100 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedRows.has(p.id) && (
                        <tr>
                          <td colSpan={12} className="px-4 pb-4 pt-0 bg-orange-50/40">
                            <div className="pl-6">
                              <p className="text-xs font-semibold text-gray-500 mb-2 mt-2">Overage History</p>
                              {(!p.overageHistory || p.overageHistory.length === 0) ? (
                                <p className="text-xs text-gray-400 italic">No overage history recorded.</p>
                              ) : (
                                <table className="w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="text-gray-500 border-b border-gray-200">
                                      <th className="text-left py-1 pr-3 font-medium">Date Added</th>
                                      <th className="text-left py-1 pr-3 font-medium">Amount</th>
                                      <th className="text-left py-1 pr-3 font-medium">Extended Start</th>
                                      <th className="text-left py-1 pr-3 font-medium">Extended End</th>
                                      <th className="text-left py-1 pr-3 font-medium">Notes</th>
                                      {canEditProject(p) && <th className="py-1 font-medium"></th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {p.overageHistory.map((h: any) => (
                                      <tr key={h.id} className="border-b border-gray-100 last:border-0 group">
                                        <td className="py-1 pr-3 text-gray-600">{h.createdAt ? format(new Date(h.createdAt), 'MMM d, yyyy') : '—'}</td>
                                        <td className="py-1 pr-3 text-green-700 font-medium">{formatCurrency(h.overageAmount)}</td>
                                        <td className="py-1 pr-3 text-gray-600">{h.extendedStartDate ? format(new Date(h.extendedStartDate), 'MMM d, yyyy') : '—'}</td>
                                        <td className="py-1 pr-3 text-orange-600">{h.extendedEndDate ? format(new Date(h.extendedEndDate), 'MMM d, yyyy') : '—'}</td>
                                        <td className="py-1 pr-3 text-gray-600">{h.notes || '—'}</td>
                                        {canEditProject(p) && (
                                          <td className="py-1">
                                            <button
                                              onClick={() => handleDeleteHistoryEntry(h.id)}
                                              title="Delete this entry"
                                              className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-6 h-6 rounded text-red-400 hover:bg-red-100 hover:text-red-600 transition-all"
                                            >
                                              <Trash2 size={12} />
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length} entries
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded text-gray-500 disabled:opacity-40 hover:bg-gray-100">
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`w-7 h-7 rounded text-xs font-medium ${n === page ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 rounded text-gray-500 disabled:opacity-40 hover:bg-gray-100">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Footer note */}
      <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
        <AlertCircle size={15} />
        Overage projects are those that require additional payment or extension beyond the original scope.
      </div>

      {/* Edit Overage Modal */}
      {editProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Pencil size={18} className="text-blue-600" /> Edit Overage
              </h2>
              <button onClick={() => setEditProject(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">{editProject.name} — {editProject.customerName}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Overage Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={editForm.overageAmount}
                    onChange={(e) => setEditForm({ ...editForm, overageAmount: e.target.value })}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Extended Start Date</label>
                  <input
                    type="date"
                    value={editForm.extendedStartDate}
                    onChange={(e) => setEditForm({ ...editForm, extendedStartDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Extended End Date</label>
                  <input
                    type="date"
                    value={editForm.extendedEndDate}
                    onChange={(e) => setEditForm({ ...editForm, extendedEndDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Describe the overage reason..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 resize-none"
                />
              </div>
              {editError && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {editError}</p>}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditProject(null)}
                className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditOverage}
                disabled={editSaving}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors font-medium"
              >
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Overage Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <DollarSign size={18} className="text-orange-600" /> Add Overage
              </h2>
              <button onClick={() => { setShowModal(false); setModalError(''); setProjectSearch(''); setShowProjectDropdown(false); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Project <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={projectSearch}
                  onChange={(e) => {
                    setProjectSearch(e.target.value);
                    setOverageForm({ ...overageForm, projectId: '' });
                    setShowProjectDropdown(true);
                  }}
                  onFocus={() => setShowProjectDropdown(true)}
                  placeholder="Type to search a project..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
                  autoComplete="off"
                />
                {showProjectDropdown && (
                  <div className="absolute z-10 w-full mt-1 max-h-48 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg">
                    {nonOveraged
                      .filter((p: any) =>
                        !projectSearch ||
                        p.name?.toLowerCase().includes(projectSearch.toLowerCase()) ||
                        p.customerName?.toLowerCase().includes(projectSearch.toLowerCase())
                      )
                      .slice(0, 20)
                      .map((p: any) => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={() => {
                            setOverageForm({ ...overageForm, projectId: p.id });
                            setProjectSearch(`${p.name} — ${p.customerName}`);
                            setShowProjectDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-900"
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="text-gray-400 ml-1 text-xs">— {p.customerName}</span>
                        </button>
                      ))}
                    {nonOveraged.filter((p: any) =>
                      !projectSearch ||
                      p.name?.toLowerCase().includes(projectSearch.toLowerCase()) ||
                      p.customerName?.toLowerCase().includes(projectSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="px-3 py-2 text-sm text-gray-400">No matching projects found</div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Overage Amount (optional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={overageForm.overageAmount}
                    onChange={(e) => setOverageForm({ ...overageForm, overageAmount: e.target.value })}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Extended Start Date (optional)</label>
                  <input
                    type="date"
                    value={overageForm.extendedStartDate}
                    onChange={(e) => setOverageForm({ ...overageForm, extendedStartDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Extended End Date (optional)</label>
                  <input
                    type="date"
                    value={overageForm.extendedEndDate}
                    onChange={(e) => setOverageForm({ ...overageForm, extendedEndDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={overageForm.notes}
                  onChange={(e) => setOverageForm({ ...overageForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Describe the overage reason..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 resize-none"
                />
              </div>

              {modalError && (
                <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {modalError}</p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowModal(false); setModalError(''); setProjectSearch(''); setShowProjectDropdown(false); }}
                className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddOverage}
                disabled={saving}
                className="flex-1 px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-60 transition-colors font-medium"
              >
                {saving ? 'Saving…' : 'Add Overage'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
