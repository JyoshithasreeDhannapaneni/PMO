'use client';

import { useState, useMemo, Fragment } from 'react';
import { useEscalatedProjects, useEscalateProject, useDeescalateProject, useProjects, useUpdateProject, useEscalationDailyNotes, useAddEscalationDailyNote, useDeleteEscalationDailyNote, useAtRiskProjects, useMarkAtRisk, useUnmarkAtRisk } from '@/hooks/useProjects';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';
import {
  Siren, AlertTriangle, Search,
  Download, ChevronLeft, ChevronRight,
  Plus, X, AlertCircle, TrendingUp, ChevronDown, History, Calendar, Trash2, CheckCircle2,
  BookOpen, Send, Loader2, Pencil,
} from 'lucide-react';
import { format } from 'date-fns';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { projectSegment, type Segment } from '@/lib/segments';

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-orange-100 text-orange-700',
  LOW: 'bg-yellow-100 text-yellow-700',
};

const ESCALATION_TYPES = ['Client Issues', 'Tools Issues', 'Process Issues', 'Resource Issues', 'Data Related Issues', 'Others'];

export default function EscalationProjectsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'PROJECT_MANAGER';
  const isViewer = user?.role === 'VIEWER';
  // Everyone sees all escalations; edit rights scoped per-project below
  const canEditProject = (p: any) => !isViewer && (isAdmin || (isManager && p.projectManager === user?.name));

  const { data, isLoading, refetch } = useEscalatedProjects(undefined);
  const escalated: any[] = data?.data || [];

  const { data: allProjectsData } = useProjects({ limit: 500 });
  const allProjects: any[] = allProjectsData?.data || [];

  const escalateProject = useEscalateProject();
  const deescalateProject = useDeescalateProject();
  const updateProject = useUpdateProject();

  const { data: atRiskData, refetch: refetchAtRisk } = useAtRiskProjects(undefined);
  const atRiskProjectsRaw: any[] = atRiskData?.data || [];
  const markAtRisk = useMarkAtRisk();
  const unmarkAtRisk = useUnmarkAtRisk();

  const [kpiFilter, setKpiFilter] = useState<'' | 'active' | 'critical'>('');

  // Escalated vs At Risk — At Risk surfaces projects flagged AT_RISK by the
  // delay calculator that haven't been formally escalated yet, so managers
  // can catch them early and escalate in one click instead of waiting for
  // them to slip into DELAYED.
  const [pageTab, setPageTab] = useState<'escalated' | 'atRisk'>('escalated');
  const [atRiskSearch, setAtRiskSearch] = useState('');

  const [search, setSearch] = useState('');
  const [prioritySels, setPrioritySels] = useState<Set<string>>(new Set());
  const [typeSels, setTypeSels] = useState<Set<string>>(new Set());
  const [showPriorityDrop, setShowPriorityDrop] = useState(false);
  const [showTypeDrop, setShowTypeDrop] = useState(false);
  const [escSegmentTab, setEscSegmentTab] = useState<Segment | 'ALL'>('ALL');
  const [atRiskSegmentTab, setAtRiskSegmentTab] = useState<Segment | 'ALL'>('ALL');
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

  // Add At Risk Modal state
  const [showAtRiskModal, setShowAtRiskModal] = useState(false);
  const [atRiskForm, setAtRiskForm] = useState({ projectId: '', notes: '' });
  const [savingAtRisk, setSavingAtRisk] = useState(false);
  const [atRiskModalError, setAtRiskModalError] = useState('');
  const [atRiskProjectSearch, setAtRiskProjectSearch] = useState('');
  const [showAtRiskProjectDropdown, setShowAtRiskProjectDropdown] = useState(false);

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

  const [historyTab, setHistoryTab] = useState<'activity' | 'timeline'>('activity');

  // Expanded history rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleRow = (id: string) => setExpandedRows((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Daily notes modal
  const [dailyNotesProject, setDailyNotesProject] = useState<any | null>(null);
  const [newDailyNote, setNewDailyNote] = useState('');
  const [dailyNoteDate, setDailyNoteDate] = useState(() => new Date().toISOString().split('T')[0]);
  const { data: dailyNotesData, isLoading: loadingNotes } = useEscalationDailyNotes(dailyNotesProject?.id ?? null);
  const dailyNotes: any[] = dailyNotesData?.data || [];
  // Also fetch daily notes for the history modal so they appear in the unified timeline
  const { data: historyDailyNotesData } = useEscalationDailyNotes(historyProject?.id ?? null);
  const historyDailyNotes: any[] = historyDailyNotesData?.data || [];
  const addDailyNote = useAddEscalationDailyNote();
  const deleteDailyNote = useDeleteEscalationDailyNote();

  async function handleAddDailyNote() {
    if (!dailyNotesProject || !newDailyNote.trim()) return;
    await addDailyNote.mutateAsync({ projectId: dailyNotesProject.id, note: newDailyNote.trim(), author: user?.name, noteDate: dailyNoteDate });
    setNewDailyNote('');
  }

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
      if (prioritySels.size > 0 && !prioritySels.has(p.escalationPriority)) return false;
      if (typeSels.size > 0 && !Array.from(typeSels).some((t) => (p.escalationNotes || '').toLowerCase().includes(t.toLowerCase()))) return false;
      if (kpiFilter === 'active' && !p.isEscalated) return false;
      if (kpiFilter === 'critical' && p.escalationPriority !== 'HIGH') return false;
      return true;
    });
  }, [deduped, search, prioritySels, typeSels, kpiFilter]);

  const escEntCount = filtered.filter((p: any) => projectSegment(p) === 'ENT').length;
  const escSmbCount = filtered.filter((p: any) => projectSegment(p) === 'SMB').length;
  const escSegmentFiltered = escSegmentTab === 'ALL' ? filtered : filtered.filter((p: any) => projectSegment(p) === escSegmentTab);

  const totalPages = Math.max(1, Math.ceil(escSegmentFiltered.length / PER_PAGE));
  const paged = escSegmentFiltered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Show all non-completed/non-cancelled projects for escalation
  const nonEscalated = allProjects.filter((p: any) => p.status !== 'COMPLETED' && p.status !== 'CANCELLED');

  // At Risk — only projects manually marked via "Add At Risk". Escalation and
  // at-risk are independent flags, so a project can appear here even if it's
  // also escalated. Sourced from a dedicated endpoint (like Escalated) so each
  // project carries its full atRiskHistory timeline.
  const atRiskProjects = atRiskProjectsRaw;

  const atRiskFiltered = useMemo(() => {
    const q = atRiskSearch.toLowerCase();
    if (!q) return atRiskProjects;
    return atRiskProjects.filter((p: any) =>
      p.name?.toLowerCase().includes(q) ||
      p.customerName?.toLowerCase().includes(q) ||
      p.projectManager?.toLowerCase().includes(q)
    );
  }, [atRiskProjects, atRiskSearch]);

  const atRiskEntCount = atRiskFiltered.filter((p: any) => projectSegment(p) === 'ENT').length;
  const atRiskSmbCount = atRiskFiltered.filter((p: any) => projectSegment(p) === 'SMB').length;
  const atRiskSegmentFiltered = atRiskSegmentTab === 'ALL' ? atRiskFiltered : atRiskFiltered.filter((p: any) => projectSegment(p) === atRiskSegmentTab);

  const [escalatingId, setEscalatingId] = useState<string | null>(null);
  async function handleEscalateFromAtRisk(p: any) {
    setEscalatingId(p.id);
    try {
      await escalateProject.mutateAsync({ id: p.id, priority: 'MEDIUM', notes: 'Escalated from At Risk view' });
      refetch();
      refetchAtRisk();
    } finally {
      setEscalatingId(null);
    }
  }

  async function handleAddAtRisk() {
    if (!atRiskForm.projectId) { setAtRiskModalError('Please select a project'); return; }
    setAtRiskModalError('');
    setSavingAtRisk(true);
    try {
      await markAtRisk.mutateAsync({ id: atRiskForm.projectId, notes: atRiskForm.notes || undefined });
      setShowAtRiskModal(false);
      setAtRiskForm({ projectId: '', notes: '' });
      setAtRiskProjectSearch('');
      refetchAtRisk();
    } catch {
      setAtRiskModalError('Failed to mark project as at risk. Please try again.');
    } finally {
      setSavingAtRisk(false);
    }
  }

  const [removingAtRiskId, setRemovingAtRiskId] = useState<string | null>(null);
  async function handleRemoveAtRisk(p: any) {
    setRemovingAtRiskId(p.id);
    try {
      await unmarkAtRisk.mutateAsync(p.id);
      refetchAtRisk();
    } finally {
      setRemovingAtRiskId(null);
    }
  }

  // Inline-editable deadline (plannedEnd) on the At Risk table
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [deadlineInput, setDeadlineInput] = useState('');
  const [savingDeadlineId, setSavingDeadlineId] = useState<string | null>(null);
  async function handleSaveDeadline(p: any) {
    if (!deadlineInput) { setEditingDeadlineId(null); return; }
    setSavingDeadlineId(p.id);
    try {
      await updateProject.mutateAsync({ id: p.id, data: { plannedEnd: deadlineInput } });
      refetchAtRisk();
    } finally {
      setSavingDeadlineId(null);
      setEditingDeadlineId(null);
    }
  }

  // Inline-editable notes on the At Risk table — saving appends a new entry
  // to the at-risk history timeline (via markAtRisk) rather than silently
  // overwriting the previous note.
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState('');
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null);
  async function handleSaveNotes(p: any) {
    setSavingNotesId(p.id);
    try {
      await markAtRisk.mutateAsync({ id: p.id, notes: notesInput || undefined });
      refetchAtRisk();
    } finally {
      setSavingNotesId(null);
      setEditingNotesId(null);
    }
  }

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

  function downloadAtRiskCSV() {
    const headers = ['Project Name', 'Customer', 'Project Manager', 'Account Manager', 'Status', 'Phase', 'Deadline', 'Notes', 'Marked At Risk', 'Resolved'];
    const rows: any[][] = [];
    for (const p of atRiskFiltered) {
      if (p.atRiskHistory && p.atRiskHistory.length > 0) {
        for (const h of p.atRiskHistory) {
          rows.push([
            p.name, p.customerName, p.projectManager, p.accountManager || '',
            p.status, p.phase,
            p.expectedEnd ? format(new Date(p.expectedEnd), 'yyyy-MM-dd') : '',
            h.notes || '',
            h.markedAt ? format(new Date(h.markedAt), 'yyyy-MM-dd HH:mm') : '',
            h.resolvedAt ? format(new Date(h.resolvedAt), 'yyyy-MM-dd HH:mm') : '',
          ]);
        }
      } else {
        rows.push([
          p.name, p.customerName, p.projectManager, p.accountManager || '',
          p.status, p.phase,
          p.expectedEnd ? format(new Date(p.expectedEnd), 'yyyy-MM-dd') : '',
          p.atRiskNotes || '',
          p.atRiskMarkedAt ? format(new Date(p.atRiskMarkedAt), 'yyyy-MM-dd HH:mm') : '',
          '',
        ]);
      }
    }
    const csv = [headers, ...rows].map((r) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'at-risk-projects.csv';
    a.click();
  }

  return (
    <div className="space-y-6">
      {(showPriorityDrop || showTypeDrop) && (
        <div className="fixed inset-0 z-10" onClick={() => { setShowPriorityDrop(false); setShowTypeDrop(false); }} />
      )}
      {/* Header — title and actions follow whichever tab is active, so the
          page doesn't keep saying "Escalated Projects" while you're looking
          at At Risk */}
      <div className="flex items-center justify-between">
        <div>
          <nav className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Link href="/" className="hover:text-primary-600">Dashboard</Link>
            <span>/</span>
            <span className="text-gray-700">{pageTab === 'atRisk' ? 'At Risk Projects' : 'Escalated Projects'}</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900">{pageTab === 'atRisk' ? 'At Risk Projects' : 'Escalated Projects'}</h1>
        </div>
        <div className="flex items-center gap-2">
          {pageTab === 'escalated' ? (
            <>
              <button onClick={downloadCSV} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <Download size={14} /> Export
              </button>
              {!isViewer && (
                <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                  <Plus size={14} /> Add Escalation
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={downloadAtRiskCSV} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <Download size={14} /> Export
              </button>
              {!isViewer && (
                <button onClick={() => setShowAtRiskModal(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors">
                  <Plus size={14} /> Add At Risk
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Page tabs — Escalated vs At Risk */}
      <div className="flex border-b border-gray-200 gap-4">
        <button
          onClick={() => setPageTab('escalated')}
          className={`flex items-center gap-1.5 pb-2 text-sm font-medium border-b-2 transition-colors ${
            pageTab === 'escalated' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Siren size={14} /> Escalated
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${pageTab === 'escalated' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{total}</span>
        </button>
        <button
          onClick={() => setPageTab('atRisk')}
          className={`flex items-center gap-1.5 pb-2 text-sm font-medium border-b-2 transition-colors ${
            pageTab === 'atRisk' ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <AlertTriangle size={14} /> At Risk
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${pageTab === 'atRisk' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{atRiskProjects.length}</span>
        </button>
      </div>

      {pageTab === 'atRisk' ? (
        <>
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            <AlertTriangle size={15} />
            Projects whose deadline is within the next 7 days and aren't delayed yet — catch these before they become escalations.
          </div>

          <Card>
            <div className="relative max-w-sm mb-4">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={atRiskSearch}
                onChange={(e) => setAtRiskSearch(e.target.value)}
                placeholder="Search project, customer, manager..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
              />
            </div>

            <div className="flex items-end border-b border-gray-200 bg-gray-50 px-2 pt-2 mb-3">
              {([
                { key: 'ALL' as const, label: 'All', count: atRiskFiltered.length },
                { key: 'ENT' as const, label: 'Enterprise', count: atRiskEntCount },
                { key: 'SMB' as const, label: 'SMB', count: atRiskSmbCount },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setAtRiskSegmentTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    atRiskSegmentTab === tab.key
                      ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    atRiskSegmentTab === tab.key ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {atRiskSegmentFiltered.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
                <AlertTriangle size={32} />
                <p>No at-risk projects{atRiskSearch ? ' match your search' : atRiskSegmentTab !== 'ALL' ? ` in ${atRiskSegmentTab}` : ' right now'}</p>
                {!isViewer && !atRiskSearch && atRiskSegmentTab === 'ALL' && (
                  <button onClick={() => setShowAtRiskModal(true)} className="mt-2 flex items-center gap-1.5 px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600">
                    <Plus size={14} /> Add At Risk
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-amber-50/60">
                    <tr>
                      <th className="py-3 px-4 w-8"></th>
                      {['Project Name', 'Project Manager', 'Status', 'Phase', 'Deadline', 'Notes', 'Action'].map((h) => (
                        <th key={h} className={`py-3 px-4 text-xs font-semibold text-gray-500 ${h === 'Project Name' ? 'text-left' : 'text-center'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {atRiskSegmentFiltered.map((p: any) => {
                      const isExpanded = expandedRows.has(p.id);
                      return (
                      <Fragment key={p.id}>
                      <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleRow(p.id)}>
                        <td className="py-3 px-4 text-center">
                          <ChevronDown size={14} className={`text-gray-400 transition-transform mx-auto ${isExpanded ? 'rotate-180' : ''}`} />
                        </td>
                        <td className="py-3 px-4">
                          <Link href={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-primary-600 hover:underline">{p.name}</Link>
                          {p.clientName && (
                            <Link href={`/clients/${encodeURIComponent(p.clientName)}`} onClick={(e) => e.stopPropagation()} className="text-xs text-indigo-500 hover:underline block">{p.clientName}</Link>
                          )}
                          <div className="text-xs text-gray-400">{p.customerName}</div>
                        </td>
                        <td className="py-3 px-4 text-center text-gray-700">{p.projectManager || '—'}</td>
                        <td className="py-3 px-4 text-center"><StatusBadge status={p.status} variant="status" /></td>
                        <td className="py-3 px-4 text-center"><StatusBadge status={p.phase} variant="phase" /></td>
                        <td className="py-3 px-4 text-center text-gray-500 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {editingDeadlineId === p.id ? (
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="date"
                                autoFocus
                                value={deadlineInput}
                                onChange={(e) => setDeadlineInput(e.target.value)}
                                className="px-2 py-1 text-xs border border-gray-300 rounded-lg bg-white text-gray-900"
                              />
                              <button
                                onClick={() => handleSaveDeadline(p)}
                                disabled={savingDeadlineId === p.id}
                                className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                              >
                                {savingDeadlineId === p.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={12} />}
                              </button>
                              <button
                                onClick={() => setEditingDeadlineId(null)}
                                className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingDeadlineId(p.id);
                                setDeadlineInput(p.expectedEnd ? new Date(p.expectedEnd).toISOString().split('T')[0] : '');
                              }}
                              className="hover:underline hover:text-amber-600"
                              title="Click to edit deadline"
                            >
                              {p.expectedEnd ? format(new Date(p.expectedEnd), 'MMM d, yyyy') : '— set deadline'}
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center text-gray-500 max-w-[220px]" onClick={(e) => e.stopPropagation()}>
                          {editingNotesId === p.id ? (
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="text"
                                autoFocus
                                value={notesInput}
                                onChange={(e) => setNotesInput(e.target.value)}
                                placeholder="Add a note..."
                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded-lg bg-white text-gray-900"
                              />
                              <button
                                onClick={() => handleSaveNotes(p)}
                                disabled={savingNotesId === p.id}
                                className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 flex-shrink-0"
                              >
                                {savingNotesId === p.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={12} />}
                              </button>
                              <button
                                onClick={() => setEditingNotesId(null)}
                                className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 flex-shrink-0"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingNotesId(p.id); setNotesInput(p.atRiskNotes || ''); }}
                              className={
                                p.atRiskNotes
                                  ? 'group inline-flex items-center gap-1.5 max-w-[220px] px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors'
                                  : 'group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed border-gray-300 text-gray-400 hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50 transition-colors'
                              }
                              title={p.atRiskNotes || 'Click to add a note'}
                            >
                              <Pencil size={11} className={p.atRiskNotes ? 'flex-shrink-0 text-gray-400 group-hover:text-amber-500' : 'flex-shrink-0'} />
                              <span className={p.atRiskNotes ? 'truncate' : ''}>{p.atRiskNotes || 'Add note'}</span>
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => { setDailyNotesProject(p); setNewDailyNote(''); setDailyNoteDate(new Date().toISOString().split('T')[0]); }}
                              title="Daily tracking notes"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-teal-600 hover:bg-teal-100 transition-colors"
                            >
                              <BookOpen size={14} />
                            </button>
                            {!isViewer && (
                              <button
                                onClick={() => handleEscalateFromAtRisk(p)}
                                disabled={escalatingId === p.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                              >
                                {escalatingId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Siren size={12} />}
                                Escalate
                              </button>
                            )}
                            {!isViewer && p.isAtRisk && (
                              <button
                                onClick={() => handleRemoveAtRisk(p)}
                                disabled={removingAtRiskId === p.id}
                                title="Remove manual At Risk flag"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                              >
                                {removingAtRiskId === p.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="bg-amber-50/30 px-6 py-4">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2">
                              <History size={13} />
                              At Risk History ({(p.atRiskHistory?.length || 0) > 0 ? p.atRiskHistory.length : '1'} event{(p.atRiskHistory?.length || 0) !== 1 ? 's' : ''})
                            </div>
                            {p.atRiskHistory && p.atRiskHistory.length > 0 ? (
                              <ul className="space-y-3">
                                {p.atRiskHistory.map((h: any, idx: number) => (
                                  <li key={h.id} className="flex gap-3">
                                    <div className="flex flex-col items-center">
                                      <span className={`w-2.5 h-2.5 rounded-full mt-1 ${h.resolvedAt ? 'bg-gray-300' : 'bg-amber-500'}`} />
                                      {idx < p.atRiskHistory.length - 1 && <span className="w-px flex-1 bg-gray-200 min-h-[12px]" />}
                                    </div>
                                    <div className="pb-1">
                                      <div className="text-xs text-gray-500">
                                        Marked at risk {h.markedAt ? format(new Date(h.markedAt), 'MMM d, yyyy h:mm a') : '—'}
                                        {h.resolvedAt && (
                                          <span className="text-gray-400"> · resolved {format(new Date(h.resolvedAt), 'MMM d, yyyy h:mm a')}</span>
                                        )}
                                      </div>
                                      {h.notes && <div className="text-sm text-gray-700 mt-0.5">{h.notes}</div>}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="text-sm text-gray-500">
                                Marked at risk {p.atRiskMarkedAt ? format(new Date(p.atRiskMarkedAt), 'MMM d, yyyy h:mm a') : '—'}
                                {p.atRiskNotes && <div className="text-gray-700 mt-0.5">{p.atRiskNotes}</div>}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                      </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : (
      <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <button
          onClick={() => setKpiFilter('')}
          className={`text-left rounded-xl border p-4 transition-all ${kpiFilter === '' ? 'border-red-500 bg-red-50 ring-2 ring-red-300' : 'border-red-200 bg-white hover:border-red-400 hover:bg-red-50'}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <Siren size={20} className="text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Escalated</p>
              <p className="text-2xl font-bold text-gray-900">{total}</p>
              {kpiFilter === '' && <p className="text-[10px] text-red-600 font-medium mt-0.5">Showing all</p>}
            </div>
          </div>
        </button>
        <button
          onClick={() => setKpiFilter(kpiFilter === 'critical' ? '' : 'critical')}
          className={`text-left rounded-xl border p-4 transition-all ${kpiFilter === 'critical' ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-300' : 'border-orange-200 bg-white hover:border-orange-400 hover:bg-orange-50'}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Critical Escalations</p>
              <p className="text-2xl font-bold text-gray-900">{critical}</p>
              {kpiFilter === 'critical' && <p className="text-[10px] text-orange-600 font-medium mt-0.5">Filtered — click to clear</p>}
            </div>
          </div>
        </button>
        <button
          onClick={() => setKpiFilter(kpiFilter === 'active' ? '' : 'active')}
          className={`text-left rounded-xl border p-4 transition-all ${kpiFilter === 'active' ? 'border-green-500 bg-green-50 ring-2 ring-green-300' : 'border-green-200 bg-white hover:border-green-400 hover:bg-green-50'}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Active Escalations</p>
              <p className="text-2xl font-bold text-gray-900">{escalated.filter((p) => p.isEscalated && p.status !== 'COMPLETED' && p.status !== 'CANCELLED').length}</p>
              {kpiFilter === 'active' && <p className="text-[10px] text-green-600 font-medium mt-0.5">Filtered — click to clear</p>}
            </div>
          </div>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-blue-100 p-4 sm:p-6 shadow-sm">
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

          {/* Priority multi-select */}
          <div className="relative">
            <button
              onClick={() => { setShowPriorityDrop((v) => !v); setShowTypeDrop(false); }}
              className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg bg-white transition-colors ${prioritySels.size > 0 ? 'border-red-400 text-red-700 bg-red-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              Priority
              {prioritySels.size > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full">{prioritySels.size}</span>
              )}
              <ChevronDown size={13} className={`transition-transform ${showPriorityDrop ? 'rotate-180' : ''}`} />
            </button>
            {showPriorityDrop && (
              <div className="absolute z-20 top-full mt-1 left-0 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-2" onClick={(e) => e.stopPropagation()}>
                {[{ value: 'HIGH', label: 'Critical (High)' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'LOW', label: 'Low' }].map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={prioritySels.has(value)}
                      onChange={() => {
                        setPrioritySels((prev) => {
                          const next = new Set(prev);
                          next.has(value) ? next.delete(value) : next.add(value);
                          return next;
                        });
                        setPage(1);
                      }}
                      className="accent-red-500 w-3.5 h-3.5"
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Type multi-select */}
          <div className="relative">
            <button
              onClick={() => { setShowTypeDrop((v) => !v); setShowPriorityDrop(false); }}
              className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg bg-white transition-colors ${typeSels.size > 0 ? 'border-purple-400 text-purple-700 bg-purple-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              Escalation Type
              {typeSels.size > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-purple-500 text-white rounded-full">{typeSels.size}</span>
              )}
              <ChevronDown size={13} className={`transition-transform ${showTypeDrop ? 'rotate-180' : ''}`} />
            </button>
            {showTypeDrop && (
              <div className="absolute z-20 top-full mt-1 left-0 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-2" onClick={(e) => e.stopPropagation()}>
                {ESCALATION_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={typeSels.has(t)}
                      onChange={() => {
                        setTypeSels((prev) => {
                          const next = new Set(prev);
                          next.has(t) ? next.delete(t) : next.add(t);
                          return next;
                        });
                        setPage(1);
                      }}
                      className="accent-purple-500 w-3.5 h-3.5"
                    />
                    {t}
                  </label>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Active filter chips */}
        {(prioritySels.size > 0 || typeSels.size > 0) && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
            {Array.from(prioritySels).map((v) => (
              <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 border border-red-200">
                {v === 'HIGH' ? 'Critical' : v === 'MEDIUM' ? 'Medium' : 'Low'}
                <button onClick={() => { setPrioritySels((prev) => { const n = new Set(prev); n.delete(v); return n; }); setPage(1); }} className="hover:text-red-900"><X size={10} /></button>
              </span>
            ))}
            {Array.from(typeSels).map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700 border border-purple-200">
                {t}
                <button onClick={() => { setTypeSels((prev) => { const n = new Set(prev); n.delete(t); return n; }); setPage(1); }} className="hover:text-purple-900"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Escalations Table */}
      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12 text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
            <Siren size={32} />
            <p>No escalation projects found</p>
            {!isViewer && (
              <button onClick={() => setShowModal(true)} className="mt-2 flex items-center gap-1.5 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
                <Plus size={14} /> Add First Escalation
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-end border-b border-gray-200 bg-gray-50 px-4 pt-3">
              {([
                { key: 'ALL' as const, label: 'All', count: filtered.length },
                { key: 'ENT' as const, label: 'Enterprise', count: escEntCount },
                { key: 'SMB' as const, label: 'SMB', count: escSmbCount },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setEscSegmentTab(tab.key); setPage(1); }}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    escSegmentTab === tab.key
                      ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    escSegmentTab === tab.key ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-blue-50/60">
                  <tr>
                    {['', 'Project Name', 'Project Manager', 'Escalation Type', 'Priority', 'Status', 'Phase', 'Delay Days', 'Escalated At', 'Resolved Date', 'Action'].map((h) => (
                      <th key={h} className={`py-3 px-4 text-xs font-semibold text-gray-500 ${h === 'Project Name' ? 'text-left' : 'text-center'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((p) => {
                    const notes = p.escalationNotes || '';
                    const escType = ESCALATION_TYPES.find((t) => notes.startsWith(t)) || (notes ? notes.split(' — ')[0] : 'Others');
                    const userNote = notes.includes(' — ') ? notes.split(' — ').slice(1).join(' — ') : '';
                    const isExpanded = expandedRows.has(p.id);
                    return (
                      <Fragment key={p.id}>
                        <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleRow(p.id)}>
                          <td className="py-3 px-2 text-center">
                            <ChevronDown size={14} className={`text-gray-400 transition-transform mx-auto ${isExpanded ? 'rotate-180' : ''}`} />
                          </td>
                          <td className="py-3 px-4">
                            <Link href={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-primary-600 hover:underline">{p.name}</Link>
                            <div className="text-xs text-gray-400">{p.customerName}</div>
                          </td>
                          <td className="py-3 px-4 text-center text-gray-700">{p.projectManager || '—'}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">{escType}</span>
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
                          <td className="py-3 px-4 text-center text-gray-500 whitespace-nowrap">
                            {p.escalatedAt ? format(new Date(p.escalatedAt), 'MMM d, yyyy') : '—'}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {canEditProject(p) && editingResolvedId === p.id ? (
                              <div className="flex items-center gap-1 justify-center">
                                <input
                                  type="date"
                                  value={resolvedDateInput}
                                  onChange={(e) => setResolvedDateInput(e.target.value)}
                                  className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white text-gray-900"
                                  autoFocus
                                />
                                <button onClick={() => handleSaveResolvedDate(p.id)} className="text-green-600 hover:text-green-700 p-0.5">
                                  <CheckCircle2 size={14} />
                                </button>
                                <button onClick={() => setEditingResolvedId(null)} className="text-gray-400 hover:text-gray-600 p-0.5">
                                  <X size={14} />
                                </button>
                              </div>
                            ) : canEditProject(p) ? (
                              <button
                                onClick={() => { setEditingResolvedId(p.id); setResolvedDateInput(p.resolvedDate ? p.resolvedDate.split('T')[0] : ''); }}
                                className="group flex items-center gap-1 mx-auto"
                                title="Click to set resolved date"
                              >
                                {p.resolvedDate ? (
                                  <span className="text-green-600 text-xs font-medium group-hover:underline">{format(new Date(p.resolvedDate), 'MMM d, yyyy')}</span>
                                ) : (
                                  <span className="text-gray-400 text-xs group-hover:text-gray-600">Pending</span>
                                )}
                              </button>
                            ) : (
                              p.resolvedDate ? (
                                <span className="text-green-600 text-xs font-medium">{format(new Date(p.resolvedDate), 'MMM d, yyyy')}</span>
                              ) : (
                                <span className="text-gray-400 text-xs">Pending</span>
                              )
                            )}
                          </td>
                          <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => { setHistoryProject(p); setNewNoteText(''); setNewNoteType('Client Issues'); setNewNotePriority('MEDIUM'); setHistoryTab('activity'); }}
                                title="View escalation history & timeline"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-purple-500 hover:bg-purple-100 transition-colors"
                              >
                                <History size={14} />
                              </button>
                              <button
                                onClick={() => { setDailyNotesProject(p); setNewDailyNote(''); setDailyNoteDate(new Date().toISOString().split('T')[0]); }}
                                title="Daily tracking notes"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-teal-600 hover:bg-teal-100 transition-colors"
                              >
                                <BookOpen size={14} />
                              </button>
                              {canEditProject(p) && (
                                <button
                                  onClick={() => handleDeleteProject(p.id)}
                                  title="Remove from escalation"
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-red-500 hover:bg-red-100 transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-red-50/50">
                            <td colSpan={12} className="px-6 py-4">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <History size={15} className="text-red-600" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-xs font-semibold text-gray-700 mb-3">
                                    Escalation History ({(p.escalationHistory?.length || 0) > 0 ? p.escalationHistory.length : '1'} event{(p.escalationHistory?.length || 0) !== 1 ? 's' : ''})
                                  </p>
                                  {/* Full history from DB */}
                                  {p.escalationHistory && p.escalationHistory.length > 0 ? (
                                    <div className="space-y-3">
                                      {p.escalationHistory.map((h: any, idx: number) => (
                                        <div key={h.id || idx} className="flex items-start gap-3 text-xs bg-white rounded-lg p-3 border border-red-100">
                                          <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                                            <span className={`w-2.5 h-2.5 rounded-full ${h.resolvedDate ? 'bg-green-400' : 'bg-red-500'}`} />
                                            {idx < p.escalationHistory.length - 1 && <span className="w-px flex-1 bg-gray-200 min-h-[12px]" />}
                                          </div>
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                              <span className="font-semibold text-gray-800">
                                                {format(new Date(h.escalatedAt), 'MMM d, yyyy HH:mm')}
                                              </span>
                                              <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${h.priority === 'HIGH' ? 'bg-red-100 text-red-700' : h.priority === 'MEDIUM' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {h.priority}
                                              </span>
                                              {h.escalationType && (
                                                <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">{h.escalationType}</span>
                                              )}
                                              {h.resolvedDate ? (
                                                <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-xs font-medium">Resolved {format(new Date(h.resolvedDate), 'MMM d, yyyy')}</span>
                                              ) : (
                                                <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-xs border border-red-200">Open</span>
                                              )}
                                            </div>
                                            {h.notes && <p className="text-gray-600 mt-0.5">{h.notes}</p>}
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
                                            <span className="font-medium text-gray-800">Escalated on </span>
                                            <span className="text-gray-600">{format(new Date(p.escalatedAt), 'MMM d, yyyy HH:mm')}</span>
                                            <span className="ml-2 px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">{p.escalationPriority || 'MEDIUM'}</span>
                                          </div>
                                        </div>
                                      )}
                                      {escType && (
                                        <div className="flex items-start gap-3">
                                          <span className="w-2 h-2 rounded-full bg-purple-400 mt-1 flex-shrink-0" />
                                          <span className="text-gray-600">Type: {escType}</span>
                                        </div>
                                      )}
                                      {userNote && (
                                        <div className="flex items-start gap-3">
                                          <span className="w-2 h-2 rounded-full bg-gray-400 mt-1 flex-shrink-0" />
                                          <span className="text-gray-600">Notes: {userNote}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
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
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, escSegmentFiltered.length)} of {escSegmentFiltered.length} entries
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
      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        <AlertCircle size={15} />
        Escalation projects are those that have been delayed, breached SLA, or escalated by customers.
      </div>
      </>
      )}

      {/* Add Escalation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Siren size={18} className="text-red-600" /> Add Escalation
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
                    setForm({ ...form, projectId: '' });
                    setShowProjectDropdown(true);
                  }}
                  onFocus={() => setShowProjectDropdown(true)}
                  placeholder="Type to search a project..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
                  autoComplete="off"
                />
                {showProjectDropdown && (
                  <div className="absolute z-10 w-full mt-1 max-h-48 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg">
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
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-900"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Escalation Type</label>
                <select
                  value={form.escalationType}
                  onChange={(e) => setForm({ ...form, escalationType: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
                >
                  {ESCALATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
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
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Describe the escalation reason..."
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

      {/* Add At Risk Modal */}
      {showAtRiskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" /> Add At Risk
              </h2>
              <button onClick={() => { setShowAtRiskModal(false); setAtRiskModalError(''); setAtRiskProjectSearch(''); setShowAtRiskProjectDropdown(false); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Project <span className="text-red-500">*</span></label>
                  <Link
                    href="/projects/new?atRisk=1"
                    onClick={() => setShowAtRiskModal(false)}
                    className="text-xs text-amber-600 hover:text-amber-700 hover:underline"
                  >
                    Don't see it? Create a new project
                  </Link>
                </div>
                <input
                  type="text"
                  value={atRiskProjectSearch}
                  onChange={(e) => {
                    setAtRiskProjectSearch(e.target.value);
                    setAtRiskForm({ ...atRiskForm, projectId: '' });
                    setShowAtRiskProjectDropdown(true);
                  }}
                  onFocus={() => setShowAtRiskProjectDropdown(true)}
                  placeholder="Type to search a project..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
                  autoComplete="off"
                />
                {showAtRiskProjectDropdown && (
                  <div className="absolute z-10 w-full mt-1 max-h-48 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg">
                    {allProjects
                      .filter((p: any) =>
                        !atRiskProjectSearch ||
                        p.name?.toLowerCase().includes(atRiskProjectSearch.toLowerCase()) ||
                        p.customerName?.toLowerCase().includes(atRiskProjectSearch.toLowerCase())
                      )
                      .slice(0, 20)
                      .map((p: any) => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={() => {
                            setAtRiskForm({ ...atRiskForm, projectId: p.id });
                            setAtRiskProjectSearch(`${p.name} — ${p.customerName}`);
                            setShowAtRiskProjectDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-900"
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="text-gray-400 ml-1 text-xs">— {p.customerName}</span>
                        </button>
                      ))}
                    {allProjects.filter((p: any) =>
                      !atRiskProjectSearch ||
                      p.name?.toLowerCase().includes(atRiskProjectSearch.toLowerCase()) ||
                      p.customerName?.toLowerCase().includes(atRiskProjectSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="px-3 py-2 text-sm text-gray-400">No matching projects found</div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={atRiskForm.notes}
                  onChange={(e) => setAtRiskForm({ ...atRiskForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Why is this project at risk?"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 resize-none"
                />
              </div>

              {atRiskModalError && (
                <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {atRiskModalError}</p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowAtRiskModal(false); setAtRiskModalError(''); setAtRiskProjectSearch(''); setShowAtRiskProjectDropdown(false); }}
                className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAtRisk}
                disabled={savingAtRisk}
                className="flex-1 px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-60 transition-colors font-medium"
              >
                {savingAtRisk ? 'Saving…' : 'Add At Risk'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escalation History Modal */}
      {historyProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setHistoryProject(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 bg-red-600 text-white">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                  <History size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold">{historyProject.name}</h2>
                  <p className="text-xs opacity-80">{historyProject.customerName}</p>
                </div>
              </div>
              <button onClick={() => setHistoryProject(null)} className="p-2 rounded-lg hover:bg-white/20 transition-colors">
                <X size={17} />
              </button>
            </div>

            {/* Tab switcher */}
            <div className="flex border-b border-gray-200 bg-white px-5 pt-3 gap-4">
              <button
                onClick={() => setHistoryTab('activity')}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${historyTab === 'activity' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Activity History
              </button>
              <button
                onClick={() => setHistoryTab('timeline')}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${historyTab === 'timeline' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                <Calendar size={13} /> Timeline
              </button>
            </div>

            {/* Activity tab: unified timeline + daily notes */}
            {historyTab === 'activity' && <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {(() => {
                const escalationItems: any[] = (historyProject.escalationHistory || []).map((h: any) => ({
                  type: 'escalation',
                  sortDate: new Date(h.escalatedAt).getTime(),
                  data: h,
                }));
                const noteItems: any[] = historyDailyNotes.map((n: any) => ({
                  type: 'note',
                  sortDate: new Date(n.noteDate ? (n.noteDate.split('T')[0] + 'T12:00:00') : (n.createdAt || new Date().toISOString())).getTime(),
                  data: n,
                }));
                const combined = [...escalationItems, ...noteItems].sort((a, b) => b.sortDate - a.sortDate);

                if (combined.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-400">
                      <History size={32} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No history or daily notes yet</p>
                    </div>
                  );
                }

                return combined.map((item, idx) => {
                  if (item.type === 'escalation') {
                    const h = item.data;
                    return (
                      <div key={`esc-${h.id || idx}`} className="flex items-start gap-3 text-sm bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <div className="flex-shrink-0 pt-1">
                          <span className={`block w-2.5 h-2.5 rounded-full ${h.resolvedDate ? 'bg-green-400' : 'bg-red-500'}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-gray-800 text-xs">
                              {format(new Date(h.escalatedAt), 'MMM d, yyyy HH:mm')}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-[10px] border border-red-200 font-semibold">Escalation</span>
                            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${h.priority === 'HIGH' ? 'bg-red-100 text-red-700' : h.priority === 'MEDIUM' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {h.priority}
                            </span>
                            {h.escalationType && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-xs">{h.escalationType}</span>
                            )}
                            {h.resolvedDate ? (
                              <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-xs font-medium">Resolved {format(new Date(h.resolvedDate), 'MMM d, yyyy')}</span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-xs border border-red-200">Open</span>
                            )}
                          </div>
                          {h.notes && <p className="text-gray-600 text-xs mt-1">{h.notes}</p>}
                        </div>
                      </div>
                    );
                  } else {
                    const n = item.data;
                    return (
                      <div key={`note-${n.id || idx}`} className="flex items-start gap-3 text-sm bg-teal-50 rounded-xl p-4 border border-teal-100">
                        <div className="flex-shrink-0 pt-1">
                          <span className="block w-2.5 h-2.5 rounded-full bg-teal-400" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-gray-800 text-xs">
                              {format(new Date(n.noteDate ? (n.noteDate.split('T')[0] + 'T12:00:00') : (n.createdAt || new Date().toISOString())), 'MMM d, yyyy')}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 text-[10px] border border-teal-200 font-semibold">Daily Note</span>
                            {n.author && <span className="text-xs text-gray-400">by {n.author}</span>}
                          </div>
                          <p className="text-gray-700 text-xs mt-1 whitespace-pre-wrap">{n.note}</p>
                        </div>
                      </div>
                    );
                  }
                });
              })()}
            </div>}

            {/* Add new note — only for admin or the project's PM */}
            {historyTab === 'activity' && canEditProject(historyProject) && <div className="border-t border-gray-200 p-5 space-y-3 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700">Add New Note</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Escalation Type</label>
                  <select
                    value={newNoteType}
                    onChange={(e) => setNewNoteType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
                  >
                    {ESCALATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Priority</label>
                  <div className="flex gap-1.5">
                    {(['LOW', 'MEDIUM', 'HIGH'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setNewNotePriority(p)}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${newNotePriority === p
                          ? p === 'HIGH' ? 'bg-red-600 text-white border-red-600'
                            : p === 'MEDIUM' ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-yellow-500 text-white border-yellow-500'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
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
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <div className="flex justify-end gap-3">
                <button onClick={() => setHistoryProject(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
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
            </div>}
            {historyTab === 'activity' && !canEditProject(historyProject) && (
              <div className="border-t border-gray-200 p-4 bg-gray-50 flex justify-end">
                <button onClick={() => setHistoryProject(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
                  Close
                </button>
              </div>
            )}

            {/* Timeline tab */}
            {historyTab === 'timeline' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Escalation Timeline</p>
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                    <div className="space-y-4">
                      {historyProject.plannedEnd && (
                        <div className="flex items-start gap-4">
                          <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-gray-300 flex items-center justify-center flex-shrink-0 z-10">
                            <Calendar size={13} className="text-gray-500" />
                          </div>
                          <div className="pt-1">
                            <p className="text-xs font-semibold text-gray-700">SOW End Date</p>
                            <p className="text-sm font-bold text-gray-900">{format(new Date(historyProject.plannedEnd), 'MMM d, yyyy')}</p>
                          </div>
                        </div>
                      )}
                      {historyProject.escalationHistory && historyProject.escalationHistory.length > 0 ? (
                        [...historyProject.escalationHistory].reverse().map((h: any, idx: number) => (
                          <div key={h.id || idx} className="flex items-start gap-4">
                            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10 ${h.resolvedDate ? 'bg-green-100 border-green-400' : 'bg-red-100 border-red-400'}`}>
                              {h.resolvedDate ? <CheckCircle2 size={13} className="text-green-600" /> : <AlertTriangle size={13} className="text-red-600" />}
                            </div>
                            <div className="pt-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs font-semibold text-gray-700">{h.resolvedDate ? 'Resolved' : 'Escalated'}</p>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${h.priority === 'HIGH' ? 'bg-red-100 text-red-700' : h.priority === 'MEDIUM' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                  {h.priority}
                                </span>
                                {h.escalationType && (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px]">{h.escalationType}</span>
                                )}
                              </div>
                              <p className="text-sm font-bold text-gray-900">{format(new Date(h.resolvedDate || h.escalatedAt), 'MMM d, yyyy')}</p>
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
                            <p className="text-xs font-semibold text-gray-700">Escalated</p>
                            <p className="text-sm font-bold text-gray-900">
                              {historyProject.escalatedAt ? format(new Date(historyProject.escalatedAt), 'MMM d, yyyy') : '—'}
                            </p>
                            {historyProject.escalationNotes && <p className="text-xs text-gray-500 mt-0.5">{historyProject.escalationNotes}</p>}
                          </div>
                        </div>
                      )}
                      {historyProject.resolvedDate && (
                        <div className="flex items-start gap-4">
                          <div className="w-8 h-8 rounded-full bg-green-100 border-2 border-green-500 flex items-center justify-center flex-shrink-0 z-10">
                            <CheckCircle2 size={13} className="text-green-600" />
                          </div>
                          <div className="pt-1">
                            <p className="text-xs font-semibold text-gray-700">Resolved</p>
                            <p className="text-sm font-bold text-green-700">{format(new Date(historyProject.resolvedDate), 'MMM d, yyyy')}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="border-t border-gray-200 px-5 py-4 bg-gray-50 flex justify-end">
                  <button onClick={() => setHistoryProject(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Daily Notes Modal */}
      {dailyNotesProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setDailyNotesProject(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-teal-600 text-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen size={18} />
                <div>
                  <p className="font-bold text-sm">{dailyNotesProject.name}</p>
                  <p className="text-xs opacity-80">{dailyNotesProject.customerName} · Daily Tracking Notes</p>
                </div>
              </div>
              <button onClick={() => setDailyNotesProject(null)} className="p-1.5 rounded hover:bg-white/20 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Notes list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {loadingNotes ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-teal-600" size={24} /></div>
              ) : dailyNotes.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No daily notes yet. Add the first note below.</p>
                </div>
              ) : (
                (() => {
                  // Group by date
                  const grouped: Record<string, any[]> = {};
                  dailyNotes.forEach((n: any) => {
                    const d = n.noteDate?.split('T')[0] || n.noteDate;
                    if (!grouped[d]) grouped[d] = [];
                    grouped[d].push(n);
                  });
                  return Object.entries(grouped).map(([date, notes]) => (
                    <div key={date}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
                          {format(new Date(date + 'T12:00:00'), 'EEE, MMM d, yyyy')}
                        </span>
                        <div className="flex-1 h-px bg-gray-100" />
                      </div>
                      <div className="space-y-2 pl-2">
                        {notes.map((n: any) => (
                          <div key={n.id} className="flex items-start gap-3 bg-gray-50 rounded-lg p-3 group border border-gray-100">
                            <div className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.note}</p>
                              {n.author && <p className="text-xs text-gray-400 mt-1">— {n.author} · {n.createdAt ? format(new Date(n.createdAt), 'HH:mm') : ''}</p>}
                            </div>
                            <button
                              onClick={() => deleteDailyNote.mutate({ projectId: dailyNotesProject.id, noteId: n.id })}
                              className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all flex-shrink-0 p-0.5"
                              title="Delete note"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()
              )}
            </div>

            {/* Add note form */}
            <div className="border-t border-gray-200 p-4 bg-gray-50 flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs font-medium text-gray-600">Date:</label>
                <input
                  type="date"
                  value={dailyNoteDate}
                  onChange={(e) => setDailyNoteDate(e.target.value)}
                  className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white text-gray-900"
                />
              </div>
              <div className="flex gap-2">
                <textarea
                  value={newDailyNote}
                  onChange={(e) => setNewDailyNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddDailyNote(); }}
                  placeholder="Write today's tracking note… (Ctrl+Enter to submit)"
                  rows={3}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <button
                  onClick={handleAddDailyNote}
                  disabled={addDailyNote.isPending || !newDailyNote.trim()}
                  className="px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-60 transition-colors self-end flex items-center gap-1.5 text-sm font-medium"
                >
                  {addDailyNote.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
