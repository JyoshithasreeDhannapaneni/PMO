'use client';

import { useState, useMemo } from 'react';
import { useEscalatedProjects, useEscalateProject, useDeescalateProject, useProjects } from '@/hooks/useProjects';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';
import {
  Siren, AlertTriangle, Search,
  RotateCcw, Eye, Download, ChevronLeft, ChevronRight,
  Plus, X, AlertCircle, TrendingUp, ChevronDown, History, Calendar, Trash2, CheckCircle2,
} from 'lucide-react';
import { format } from 'date-fns';
import { StatusBadge } from '@/components/ui/StatusBadge';

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  MEDIUM: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  LOW: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
};

const ESCALATION_TYPES = ['Client Issues', 'Tools Issues', 'Process Issues', 'Resource Issues', 'Data Related Issues', 'Others'];

export default function EscalationProjectsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const managerFilter = isAdmin ? undefined : user?.name;

  const { data, isLoading, refetch } = useEscalatedProjects(managerFilter);
  const escalated: any[] = data?.data || [];

  const { data: allProjectsData } = useProjects({ limit: 1000, status: 'ACTIVE' });
  const allProjects: any[] = allProjectsData?.data || [];

  const escalateProject = useEscalateProject();
  const deescalateProject = useDeescalateProject();

  const [search, setSearch] = useState('');
  const [prioritySel, setPrioritySel] = useState('');
  const [typeSel, setTypeSel] = useState('');
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  // Add Escalation Modal state
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ projectId: '', priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH', escalationType: 'Client Issues', notes: '' });
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // Searchable project combobox state
  const [projectSearch, setProjectSearch] = useState('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  // Stats (use deduped — computed after deduped is defined below, so use escalated for now and re-derive)
  const total = escalated.length;
  const critical = escalated.filter((p) => p.escalationPriority === 'HIGH').length;

  // History detail modal
  const [historyProject, setHistoryProject] = useState<any | null>(null);
  const [newNoteType, setNewNoteType] = useState('Client Issues');
  const [newNotePriority, setNewNotePriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  async function handleAddNote() {
    if (!historyProject || !newNoteText.trim()) return;
    setAddingNote(true);
    try {
      const notes = [newNoteType, newNoteText.trim()].filter(Boolean).join(' — ');
      await escalateProject.mutateAsync({ id: historyProject.id, priority: newNotePriority, notes });
      setNewNoteText('');
      const result = await refetch();
      // Sync historyProject with fresh escalation history
      const freshProjects: any[] = result.data?.data || [];
      const fresh = freshProjects.find((p: any) => p.id === historyProject.id);
      if (fresh) setHistoryProject(fresh);
    } catch {
      // silently fail
    } finally {
      setAddingNote(false);
    }
  }

  // Resolved date inline editing
  const [editingResolvedId, setEditingResolvedId] = useState<string | null>(null);
  const [resolvedDateInput, setResolvedDateInput] = useState('');

  async function handleSaveResolvedDate(projectId: string) {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      await fetch(`${API_BASE}/api/dashboard/set-resolved-date/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ resolvedDate: resolvedDateInput || null }),
      });
      setEditingResolvedId(null);
      refetch();
    } catch { /* silent */ }
  }

  // Calendar timeline popup
  const [calendarProject, setCalendarProject] = useState<any | null>(null);

  // Expanded history rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleRow = (id: string) => setExpandedRows((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Per-project inline notes (persisted to localStorage)
  const [projectNotes, setProjectNotes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('escalationProjectNotes') || '{}'); } catch { return {}; }
  });
  const saveNote = (projectId: string, note: string) => {
    const updated = { ...projectNotes, [projectId]: note };
    setProjectNotes(updated);
    localStorage.setItem('escalationProjectNotes', JSON.stringify(updated));
  };

  // Deduplicate escalated projects by ID (same project may appear from both is_escalated flag and DELAYED status)
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    return escalated.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
  }, [escalated]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return deduped.filter((p) => {
      if (q && !p.name?.toLowerCase().includes(q) && !p.customerName?.toLowerCase().includes(q) && !p.projectManager?.toLowerCase().includes(q)) return false;
      if (prioritySel && p.escalationPriority !== prioritySel) return false;
      if (typeSel && !(p.escalationNotes || '').toLowerCase().includes(typeSel.toLowerCase())) return false;
      return true;
    });
  }, [deduped, search, prioritySel, typeSel]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // All active projects can be re-escalated (multiple escalations allowed)
  const nonEscalated = allProjects;

  async function handleAddEscalation() {
    if (!form.projectId) { setModalError('Please select a project'); return; }
    setModalError('');
    setSaving(true);
    try {
      const notes = [form.escalationType, form.notes].filter(Boolean).join(' — ');
      await escalateProject.mutateAsync({ id: form.projectId, priority: form.priority, notes });
      setShowModal(false);
      setForm({ projectId: '', priority: 'MEDIUM', escalationType: 'Client Issues', notes: '' });
      setProjectSearch('');
      refetch();
    } catch {
      setModalError('Failed to escalate project. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeescalate(id: string) {
    if (!confirm('Remove escalation from this project?')) return;
    await deescalateProject.mutateAsync(id);
    refetch();
  }

  async function handleDeleteProject(id: string) {
    if (!confirm('Remove escalation from this project?')) return;
    await deescalateProject.mutateAsync(id);
    refetch();
  }

  function downloadCSV() {
    const headers = ['Project Name', 'Customer', 'Project Manager', 'Account Manager', 'Priority', 'Escalation Type', 'Notes', 'Escalated At', 'Resolved Date', 'Project Status', 'Project Phase', 'Delay Days'];
    const rows: any[][] = [];
    for (const p of filtered) {
      if (p.escalationHistory && p.escalationHistory.length > 0) {
        for (const h of p.escalationHistory) {
          rows.push([
            p.name, p.customerName, p.projectManager, p.accountManager || '',
            h.priority || '',
            h.escalationType || '',
            h.notes || '',
            h.escalatedAt ? format(new Date(h.escalatedAt), 'yyyy-MM-dd') : '',
            h.resolvedDate ? format(new Date(h.resolvedDate), 'yyyy-MM-dd') : '',
            p.status, p.phase, p.delayDays,
          ]);
        }
      } else {
        // Fallback for projects without history entries
        rows.push([
          p.name, p.customerName, p.projectManager, p.accountManager || '',
          p.escalationPriority || '',
          p.escalationNotes ? (ESCALATION_TYPES.find((t) => p.escalationNotes.startsWith(t)) || '') : '',
          p.escalationNotes ? (p.escalationNotes.includes(' — ') ? p.escalationNotes.split(' — ').slice(1).join(' — ') : p.escalationNotes) : '',
          p.escalatedAt ? format(new Date(p.escalatedAt), 'yyyy-MM-dd') : '',
          p.resolvedDate ? format(new Date(p.resolvedDate), 'yyyy-MM-dd') : '',
          p.status, p.phase, p.delayDays,
        ]);
      }
    }
    const csv = [headers, ...rows].map((r) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'escalation-projects.csv';
    a.click();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <nav className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
            <Link href="/" className="hover:text-primary-600">Dashboard</Link>
            <span>/</span>
            <span className="text-gray-700 dark:text-gray-300">Escalated Projects</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Escalated Projects</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <RotateCcw size={14} /> Refresh
          </button>
          <button onClick={downloadCSV} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Download size={14} /> Export
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
            <Plus size={14} /> Add Escalation
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border-red-200 dark:border-red-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
              <Siren size={20} className="text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Escalated</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{total}</p>
            </div>
          </div>
        </Card>
        <Card className="border-orange-200 dark:border-orange-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
              <AlertTriangle size={20} className="text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Critical Escalations</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{critical}</p>
            </div>
          </div>
        </Card>
        <Card className="border-green-200 dark:border-green-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <TrendingUp size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Active Escalations</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{escalated.filter((p) => p.isEscalated && p.status !== 'COMPLETED' && p.status !== 'CANCELLED').length}</p>
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
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <select
            value={prioritySel}
            onChange={(e) => { setPrioritySel(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All Priorities</option>
            <option value="HIGH">Critical (High)</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <select
            value={typeSel}
            onChange={(e) => { setTypeSel(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All Types</option>
            {ESCALATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            onClick={() => { setSearch(''); setPrioritySel(''); setTypeSel(''); setPage(1); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
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
            <Siren size={32} />
            <p>No escalation projects found</p>
            <button onClick={() => setShowModal(true)} className="mt-2 flex items-center gap-1.5 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
              <Plus size={14} /> Add First Escalation
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    {['', 'Project Name', 'Project Manager', 'Escalation Type', 'Priority', 'Status', 'Phase', 'Delay Days', 'Escalated At', 'Resolved Date', 'Notes', 'Action'].map((h) => (
                      <th key={h} className={`py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 ${h === 'Project Name' || h === 'Notes' ? 'text-left' : 'text-center'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {paged.map((p) => {
                    const notes = p.escalationNotes || '';
                    const escType = ESCALATION_TYPES.find((t) => notes.startsWith(t)) || (notes ? notes.split(' — ')[0] : 'Others');
                    const userNote = notes.includes(' — ') ? notes.split(' — ').slice(1).join(' — ') : '';
                    const isExpanded = expandedRows.has(p.id);
                    return (
                      <>
                        <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => toggleRow(p.id)}>
                          <td className="py-3 px-2 text-center">
                            <ChevronDown size={14} className={`text-gray-400 transition-transform mx-auto ${isExpanded ? 'rotate-180' : ''}`} />
                          </td>
                          <td className="py-3 px-4">
                            <Link href={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-primary-600 hover:underline">{p.name}</Link>
                            <div className="text-xs text-gray-400">{p.customerName}</div>
                          </td>
                          <td className="py-3 px-4 text-center text-gray-700 dark:text-gray-300">{p.projectManager || '—'}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">{escType}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {p.escalationPriority ? (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[p.escalationPriority] || 'bg-gray-100 text-gray-600'}`}>
                                {p.escalationPriority}
                              </span>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}><StatusBadge status={p.status} variant="status" /></td>
                          <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}><StatusBadge status={p.phase} variant="phase" /></td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.delayDays > 14 ? 'bg-red-100 text-red-700' : p.delayDays > 7 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {p.delayDays} day{p.delayDays !== 1 ? 's' : ''}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {p.escalatedAt ? format(new Date(p.escalatedAt), 'MMM d, yyyy') : '—'}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {editingResolvedId === p.id ? (
                              <div className="flex items-center gap-1 justify-center">
                                <input
                                  type="date"
                                  value={resolvedDateInput}
                                  onChange={(e) => setResolvedDateInput(e.target.value)}
                                  className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                  autoFocus
                                />
                                <button onClick={() => handleSaveResolvedDate(p.id)} className="text-green-600 hover:text-green-700 p-0.5">
                                  <CheckCircle2 size={14} />
                                </button>
                                <button onClick={() => setEditingResolvedId(null)} className="text-gray-400 hover:text-gray-600 p-0.5">
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setEditingResolvedId(p.id); setResolvedDateInput(p.resolvedDate ? p.resolvedDate.split('T')[0] : ''); }}
                                className="group flex items-center gap-1 mx-auto"
                                title="Click to set resolved date"
                              >
                                {p.resolvedDate ? (
                                  <span className="text-green-600 dark:text-green-400 text-xs font-medium group-hover:underline">{format(new Date(p.resolvedDate), 'MMM d, yyyy')}</span>
                                ) : (
                                  <span className="text-gray-400 text-xs group-hover:text-gray-600 dark:group-hover:text-gray-300">Pending</span>
                                )}
                              </button>
                            )}
                          </td>
                          <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                            <textarea
                              value={projectNotes[p.id] || ''}
                              onChange={(e) => saveNote(p.id, e.target.value)}
                              placeholder="Add note…"
                              rows={2}
                              className="w-44 text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 resize-none bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400 placeholder-gray-300"
                            />
                          </td>
                          <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <Link href={`/projects/${p.id}`} className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-primary-100 hover:text-primary-700 transition-colors">
                                <Eye size={14} />
                              </Link>
                              <button
                                onClick={() => { setHistoryProject(p); setNewNoteText(''); setNewNoteType('Client Issues'); setNewNotePriority('MEDIUM'); }}
                                title="View escalation history"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 text-purple-500 hover:bg-purple-100 transition-colors"
                              >
                                <History size={14} />
                              </button>
                              <button
                                onClick={() => setCalendarProject(p)}
                                title="View escalation timeline"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 text-blue-500 hover:bg-blue-100 transition-colors"
                              >
                                <Calendar size={14} />
                              </button>
                              {isAdmin && p.isEscalated && (
                                <button
                                  onClick={() => handleDeescalate(p.id)}
                                  title="Remove escalation"
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 text-red-500 hover:bg-red-100 transition-colors"
                                >
                                  <X size={14} />
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  onClick={() => handleDeleteProject(p.id)}
                                  title="Remove from escalation"
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 text-red-500 hover:bg-red-100 transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${p.id}-history`} className="bg-red-50/50 dark:bg-red-900/10">
                            <td colSpan={12} className="px-6 py-4">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <History size={15} className="text-red-600" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">
                                    Escalation History ({(p.escalationHistory?.length || 0) > 0 ? p.escalationHistory.length : '1'} event{(p.escalationHistory?.length || 0) !== 1 ? 's' : ''})
                                  </p>
                                  {/* Full history from DB */}
                                  {p.escalationHistory && p.escalationHistory.length > 0 ? (
                                    <div className="space-y-3">
                                      {p.escalationHistory.map((h: any, idx: number) => (
                                        <div key={h.id || idx} className="flex items-start gap-3 text-xs bg-white dark:bg-gray-800 rounded-lg p-3 border border-red-100 dark:border-red-900/30">
                                          <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                                            <span className={`w-2.5 h-2.5 rounded-full ${h.resolvedDate ? 'bg-green-400' : 'bg-red-500'}`} />
                                            {idx < p.escalationHistory.length - 1 && <span className="w-px flex-1 bg-gray-200 dark:bg-gray-700 min-h-[12px]" />}
                                          </div>
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                              <span className="font-semibold text-gray-800 dark:text-gray-200">
                                                {format(new Date(h.escalatedAt), 'MMM d, yyyy HH:mm')}
                                              </span>
                                              <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${h.priority === 'HIGH' ? 'bg-red-100 text-red-700' : h.priority === 'MEDIUM' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {h.priority}
                                              </span>
                                              {h.escalationType && (
                                                <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">{h.escalationType}</span>
                                              )}
                                              {h.resolvedDate ? (
                                                <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-xs font-medium">Resolved {format(new Date(h.resolvedDate), 'MMM d, yyyy')}</span>
                                              ) : (
                                                <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-xs border border-red-200">Open</span>
                                              )}
                                            </div>
                                            {h.notes && <p className="text-gray-600 dark:text-gray-400 mt-0.5">{h.notes}</p>}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    /* Fallback for legacy records without history */
                                    <div className="space-y-2 text-xs">
                                      {p.escalatedAt && (
                                        <div className="flex items-start gap-3">
                                          <span className="w-2 h-2 rounded-full bg-red-500 mt-1 flex-shrink-0" />
                                          <div>
                                            <span className="font-medium text-gray-800 dark:text-gray-200">Escalated on </span>
                                            <span className="text-gray-600 dark:text-gray-400">{format(new Date(p.escalatedAt), 'MMM d, yyyy HH:mm')}</span>
                                            <span className="ml-2 px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">{p.escalationPriority || 'MEDIUM'}</span>
                                          </div>
                                        </div>
                                      )}
                                      {escType && (
                                        <div className="flex items-start gap-3">
                                          <span className="w-2 h-2 rounded-full bg-purple-400 mt-1 flex-shrink-0" />
                                          <span className="text-gray-600 dark:text-gray-400">Type: {escType}</span>
                                        </div>
                                      )}
                                      {userNote && (
                                        <div className="flex items-start gap-3">
                                          <span className="w-2 h-2 rounded-full bg-gray-400 mt-1 flex-shrink-0" />
                                          <span className="text-gray-600 dark:text-gray-400">Notes: {userNote}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <button
                                    onClick={() => downloadICS(p)}
                                    className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                                  >
                                    <Calendar size={12} /> Download Calendar (.ics)
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length} entries
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded text-gray-500 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`w-7 h-7 rounded text-xs font-medium ${n === page ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 rounded text-gray-500 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Footer note */}
      <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
        <AlertCircle size={15} />
        Escalation projects are those that have been delayed, breached SLA, or escalated by customers.
      </div>

      {/* Add Escalation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Siren size={18} className="text-red-600" /> Add Escalation
              </h2>
              <button onClick={() => { setShowModal(false); setModalError(''); setProjectSearch(''); setShowProjectDropdown(false); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={projectSearch}
                  onChange={(e) => {
                    setProjectSearch(e.target.value);
                    setForm({ ...form, projectId: '' });
                    setShowProjectDropdown(true);
                  }}
                  onFocus={() => setShowProjectDropdown(true)}
                  placeholder="Type to search a project..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  autoComplete="off"
                />
                {showProjectDropdown && (
                  <div className="absolute z-10 w-full mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg">
                    {nonEscalated
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
                            setForm({ ...form, projectId: p.id });
                            setProjectSearch(`${p.name} — ${p.customerName}`);
                            setShowProjectDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="text-gray-400 ml-1 text-xs">— {p.customerName}</span>
                        </button>
                      ))}
                    {nonEscalated.filter((p: any) =>
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Escalation Type</label>
                <select
                  value={form.escalationType}
                  onChange={(e) => setForm({ ...form, escalationType: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {ESCALATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                <div className="flex gap-2">
                  {(['LOW', 'MEDIUM', 'HIGH'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setForm({ ...form, priority: p })}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                        form.priority === p
                          ? p === 'HIGH' ? 'bg-red-600 text-white border-red-600'
                            : p === 'MEDIUM' ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-yellow-500 text-white border-yellow-500'
                          : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Describe the escalation reason..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                />
              </div>

              {modalError && (
                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1"><AlertCircle size={13} /> {modalError}</p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowModal(false); setModalError(''); setProjectSearch(''); setShowProjectDropdown(false); }}
                className="flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddEscalation}
                disabled={saving}
                className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors font-medium"
              >
                {saving ? 'Saving…' : 'Add Escalation'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Escalation History Modal */}
      {historyProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setHistoryProject(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 bg-red-600 text-white">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                  <History size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold">{historyProject.name}</h2>
                  <p className="text-xs opacity-80">{historyProject.customerName} · Escalation History</p>
                </div>
              </div>
              <button onClick={() => setHistoryProject(null)} className="p-2 rounded-lg hover:bg-white/20 transition-colors">
                <X size={17} />
              </button>
            </div>

            {/* History list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {(historyProject.escalationHistory && historyProject.escalationHistory.length > 0) ? (
                historyProject.escalationHistory.map((h: any, idx: number) => (
                  <div key={h.id || idx} className="flex items-start gap-3 text-sm bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-1">
                      <span className={`w-2.5 h-2.5 rounded-full ${h.resolvedDate ? 'bg-green-400' : 'bg-red-500'}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-gray-800 dark:text-gray-200 text-xs">
                          {format(new Date(h.escalatedAt), 'MMM d, yyyy HH:mm')}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${h.priority === 'HIGH' ? 'bg-red-100 text-red-700' : h.priority === 'MEDIUM' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {h.priority}
                        </span>
                        {h.escalationType && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-xs">{h.escalationType}</span>
                        )}
                        {h.resolvedDate ? (
                          <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-xs font-medium">Resolved {format(new Date(h.resolvedDate), 'MMM d, yyyy')}</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-xs border border-red-200">Open</span>
                        )}
                      </div>
                      {h.notes && <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">{h.notes}</p>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <History size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No escalation history yet</p>
                </div>
              )}
            </div>

            {/* Add new note */}
            <div className="border-t border-gray-200 dark:border-gray-700 p-5 space-y-3 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Add New Note</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Escalation Type</label>
                  <select
                    value={newNoteType}
                    onChange={(e) => setNewNoteType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {ESCALATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Priority</label>
                  <div className="flex gap-1.5">
                    {(['LOW', 'MEDIUM', 'HIGH'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setNewNotePriority(p)}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${newNotePriority === p
                          ? p === 'HIGH' ? 'bg-red-600 text-white border-red-600'
                            : p === 'MEDIUM' ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-yellow-500 text-white border-yellow-500'
                          : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >{p}</button>
                    ))}
                  </div>
                </div>
              </div>
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Write a note about this escalation…"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <div className="flex justify-end gap-3">
                <button onClick={() => setHistoryProject(null)} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  Close
                </button>
                <button
                  onClick={handleAddNote}
                  disabled={addingNote || !newNoteText.trim()}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors font-medium"
                >
                  {addingNote ? 'Adding…' : 'Add Note'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Timeline Popup */}
      {calendarProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setCalendarProject(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 bg-blue-600 text-white">
              <div className="flex items-center gap-2">
                <Calendar size={18} />
                <div>
                  <p className="font-bold text-sm">{calendarProject.name}</p>
                  <p className="text-xs opacity-80">{calendarProject.customerName}</p>
                </div>
              </div>
              <button onClick={() => setCalendarProject(null)} className="p-1.5 rounded hover:bg-white/20 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Escalation Timeline</p>
              {/* Timeline */}
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
                <div className="space-y-4">
                  {/* SOW End Date */}
                  {calendarProject.plannedEnd && (
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center flex-shrink-0 z-10">
                        <Calendar size={13} className="text-gray-500" />
                      </div>
                      <div className="pt-1">
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">SOW End Date</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{format(new Date(calendarProject.plannedEnd), 'MMM d, yyyy')}</p>
                      </div>
                    </div>
                  )}
                  {/* Full escalation history events */}
                  {calendarProject.escalationHistory && calendarProject.escalationHistory.length > 0 ? (
                    [...calendarProject.escalationHistory].reverse().map((h: any, idx: number) => (
                      <div key={h.id || idx} className="flex items-start gap-4">
                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10 ${h.resolvedDate ? 'bg-green-100 border-green-400' : 'bg-red-100 border-red-400'}`}>
                          {h.resolvedDate ? <CheckCircle2 size={13} className="text-green-600" /> : <AlertTriangle size={13} className="text-red-600" />}
                        </div>
                        <div className="pt-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                              {h.resolvedDate ? 'Resolved' : 'Escalated'}
                            </p>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${h.priority === 'HIGH' ? 'bg-red-100 text-red-700' : h.priority === 'MEDIUM' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {h.priority}
                            </span>
                            {h.escalationType && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px]">{h.escalationType}</span>
                            )}
                          </div>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">
                            {format(new Date(h.resolvedDate || h.escalatedAt), 'MMM d, yyyy')}
                          </p>
                          {h.notes && <p className="text-xs text-gray-500 mt-0.5">{h.notes}</p>}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-red-100 border-2 border-red-400 flex items-center justify-center flex-shrink-0 z-10">
                        <AlertTriangle size={13} className="text-red-600" />
                      </div>
                      <div className="pt-1">
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Escalated</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                          {calendarProject.escalatedAt ? format(new Date(calendarProject.escalatedAt), 'MMM d, yyyy') : '—'}
                        </p>
                        {calendarProject.escalationNotes && <p className="text-xs text-gray-500 mt-0.5">{calendarProject.escalationNotes}</p>}
                      </div>
                    </div>
                  )}
                  {/* Resolved date (from project) */}
                  {calendarProject.resolvedDate && (
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-green-100 border-2 border-green-500 flex items-center justify-center flex-shrink-0 z-10">
                        <CheckCircle2 size={13} className="text-green-600" />
                      </div>
                      <div className="pt-1">
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Resolved</p>
                        <p className="text-sm font-bold text-green-700 dark:text-green-400">{format(new Date(calendarProject.resolvedDate), 'MMM d, yyyy')}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button onClick={() => setCalendarProject(null)} className="w-full px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
