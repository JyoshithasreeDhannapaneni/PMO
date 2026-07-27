'use client';

import { useMemo, useState, useRef, useCallback } from 'react';
import {
  useProjects,
  useEscalationMails,
  useEscalationStats,
  useEscalationConfig,
  useParseEscalationMail,
  useCreateEscalationMail,
  useUpdateEscalationStatus,
  useUpdateEscalationOwner,
  useUpdateEscalationReceivedAt,
  useResolveEscalation,
  useUpdateEscalationResolution,
  useUploadRcaDocs,
  useUploadEscalationMedia,
  useDeleteEscalationMail,
} from '@/hooks/useProjects';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  Mail, Upload, X, Loader2, CheckCircle2, Search, Eye, Trash2,
  AlertTriangle, Users, Send, ChevronLeft, ChevronRight,
  FileText, UserCheck, ArrowRight, Image as ImageIcon, Film, Play, Plus,
} from 'lucide-react';

// Media is served by the BACKEND (/uploads), not the Next.js frontend. Resolve
// the backend origin from the env var, falling back to localhost:3001 in dev if
// NEXT_PUBLIC_API_URL wasn't baked in — otherwise "/uploads/..." would resolve
// against the frontend origin (port 3000) and 404 (broken thumbnails).
function resolveApiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined') {
    const { protocol, hostname, origin } = window.location;
    // Dev: frontend on :3000, backend on :3001.
    if (hostname === 'localhost' || hostname === '127.0.0.1') return `${protocol}//${hostname}:3001`;
    return origin;
  }
  return '';
}
const MEDIA_BASE = resolveApiBase();
const mediaSrc = (url: string) => (url?.startsWith('http') ? url : `${MEDIA_BASE}${url}`);

// Convert an ISO timestamp to the value a <input type="datetime-local"> expects
// (local "YYYY-MM-DDTHH:mm"), and back to ISO on change.
function isoToLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

interface Attachment {
  url: string;
  type: 'image' | 'video';
  name?: string;
}

interface RcaDoc {
  url: string;
  name: string;
}

const LEADERS = ['Abhishek', 'Ajay', 'Ankit', 'Mayank'];
const PROJECT_MANAGERS = [
  'Abhishek Sakala',
  'Lakshmi Prasanna',
  'Pranavi',
  'Ajay Singh',
  'Harika',
  'Sravan',
  'Raghu Yellani',
];
const PAGE_SIZE = 5;

const ISSUE_TYPE_META: Record<string, { label: string }> = {
  TECHNICAL: { label: 'Technical / migration' },
  SLA: { label: 'SLA / response' },
  COMMUNICATION: { label: 'Communication' },
  BILLING: { label: 'Billing / overage' },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  OPEN: { label: 'Open', cls: 'bg-orange-100 text-orange-700' },
  IN_PROGRESS: { label: 'In Progress', cls: 'bg-blue-100 text-blue-700' },
  RESOLVED: { label: 'Resolved', cls: 'bg-green-100 text-green-700' },
};

interface Draft {
  leaderName: string;
  customerName: string;
  issueType: string;
  issueSummary: string;
  raisedBy: string;
  raisedVia: string;
  receivedAt: string;
  projectManager: string | null;
  escalationOwner: string;
  rawMail: string;
  attachments: Attachment[];
}

export default function EscalationMailsPage() {
  const { user } = useAuth();
  const isViewer = user?.role === 'VIEWER';
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const [boardTab, setBoardTab] = useState<'active' | 'history'>('active');
  const [managerFilter, setManagerFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [viewRecord, setViewRecord] = useState<any | null>(null);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  // Resolve flow: the record being closed + editable resolved date + RCA + RCA docs.
  const [resolving, setResolving] = useState<any | null>(null);
  const [resolveDate, setResolveDate] = useState('');
  const [resolveRca, setResolveRca] = useState('');
  const [resolveDocs, setResolveDocs] = useState<RcaDoc[]>([]);
  const rcaDocInputRef = useRef<HTMLInputElement>(null);
  const viewRcaDocInputRef = useRef<HTMLInputElement>(null);

  const { data: listResp, isLoading, isError } = useEscalationMails();
  const { data: statsResp } = useEscalationStats();
  const { data: configResp } = useEscalationConfig();
  const { data: projectsResp } = useProjects({ limit: 10000 });

  const parseMail = useParseEscalationMail();
  const createMail = useCreateEscalationMail();
  const updateStatus = useUpdateEscalationStatus();
  const updateOwner = useUpdateEscalationOwner();
  const updateReceivedAt = useUpdateEscalationReceivedAt();
  const resolveEscalation = useResolveEscalation();
  const updateResolution = useUpdateEscalationResolution();
  const uploadRcaDocs = useUploadRcaDocs();
  const uploadMedia = useUploadEscalationMedia();
  const deleteMail = useDeleteEscalationMail();

  const allMails: any[] = listResp?.data ?? [];
  const stats = statsResp?.data ?? { total: 0, open: 0, resolved: 0, assigned: 0 };
  const owners: string[] = configResp?.data?.owners ?? ['Abhishek', 'Ajay', 'Ankit', 'Mayank'];

  const projectList: any[] = projectsResp?.data ?? [];

  // Filter lists the fixed project managers, plus any manager already on a
  // record that isn't in the fixed list (so older rows stay filterable).
  const managerOptions = useMemo(() => {
    const set = new Set<string>(PROJECT_MANAGERS);
    allMails.forEach((m) => { if (m.projectManager) set.add(m.projectManager); });
    return Array.from(set);
  }, [allMails]);

  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    projectList.forEach((p) => { if (p.customerName) set.add(p.customerName); });
    allMails.forEach((m) => { if (m.customerName) set.add(m.customerName); });
    return Array.from(set).sort();
  }, [projectList, allMails]);

  // Active = anything not yet resolved; History = resolved escalations.
  const activeMails = useMemo(() => allMails.filter((m) => m.status !== 'RESOLVED'), [allMails]);
  const historyMails = useMemo(() => allMails.filter((m) => m.status === 'RESOLVED'), [allMails]);

  const filtered = useMemo(() => {
    const source = boardTab === 'history' ? historyMails : activeMails;
    const q = search.trim().toLowerCase();
    return source.filter((m) => {
      if (managerFilter && m.projectManager !== managerFilter) return false;
      if (projectFilter && m.customerName !== projectFilter) return false;
      // On the Active tab the status filter still applies (Open / In Progress).
      if (boardTab === 'active' && statusFilter && m.status !== statusFilter) return false;
      if (q) {
        const hay = `${m.leaderName} ${m.projectManager || ''} ${m.customerName} ${m.issueSummary} ${m.escalationOwner} ${m.raisedBy}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activeMails, historyMails, boardTab, managerFilter, projectFilter, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filtered.length);

  const resetUpload = () => {
    setUploadOpen(false);
    setDraft(null);
    setPasteText('');
    setDragOver(false);
    setManualMode(false);
  };

  // Open the review form directly with a blank draft — no upload/parse step.
  const startManual = () => {
    const routing: Record<string, string> = configResp?.data?.routing || {};
    setManualMode(true);
    setUploadOpen(true);
    setDraft({
      leaderName: LEADERS[0],
      customerName: '',
      issueType: 'TECHNICAL',
      issueSummary: '',
      raisedBy: '',
      raisedVia: 'Manual',
      receivedAt: new Date().toISOString(),
      projectManager: null,
      escalationOwner: routing.TECHNICAL || owners[0] || '',
      rawMail: '',
      attachments: [],
    });
  };

  const applyParsed = useCallback((resp: any) => {
    const d = resp?.data;
    if (!d) {
      showToast('error', 'Could not parse mail', 'No readable content was found.');
      return;
    }
    setDraft({
      leaderName: LEADERS[0],
      customerName: d.customerName || '',
      issueType: d.issueType || 'TECHNICAL',
      issueSummary: d.issueSummary || '',
      raisedBy: d.raisedBy || '',
      raisedVia: d.raisedVia || 'Email',
      receivedAt: d.receivedAt || new Date().toISOString(),
      projectManager: d.projectManager ?? null,
      escalationOwner: d.escalationOwner || '',
      rawMail: d.rawMail || '',
      attachments: [],
    });
  }, [showToast]);

  // Upload screenshots / screen-recordings, then attach the returned URLs to the draft.
  const handleMediaFiles = useCallback((files: FileList | null) => {
    if (!files || !files.length) return;
    const arr = Array.from(files);
    uploadMedia.mutate(arr, {
      onSuccess: (resp: any) => {
        const uploaded: Attachment[] = resp?.data || [];
        setDraft((prev) => (prev ? { ...prev, attachments: [...prev.attachments, ...uploaded] } : prev));
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error?.message || err?.response?.data?.error || 'Could not upload the file(s).';
        showToast('error', 'Upload failed', typeof msg === 'string' ? msg : 'Could not upload the file(s).');
      },
    });
  }, [uploadMedia, showToast]);

  // Intercept a status change: choosing "Resolved" opens the resolve form
  // (editable date + RCA) instead of silently flipping and auto-stamping now.
  const handleStatusChange = (m: any, status: string) => {
    if (status === 'RESOLVED') {
      setResolving(m);
      setResolveDate(isoToLocalInput(m.resolvedAt || new Date().toISOString()));
      setResolveRca(m.rca || '');
      setResolveDocs(Array.isArray(m.rcaDocs) ? m.rcaDocs : []);
    } else {
      updateStatus.mutate({ id: m.id, status });
    }
  };

  // Upload RCA document(s) in the resolve form; append returned URLs to the list.
  const handleRcaDocFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    uploadRcaDocs.mutate(Array.from(files), {
      onSuccess: (resp: any) => setResolveDocs((prev) => [...prev, ...(resp?.data || [])]),
      onError: (err: any) => {
        const msg = err?.response?.data?.error?.message || err?.response?.data?.error || 'Could not upload the document(s).';
        showToast('error', 'Upload failed', typeof msg === 'string' ? msg : 'Could not upload the document(s).');
      },
    });
  };

  const submitResolve = () => {
    if (!resolving) return;
    const iso = localInputToIso(resolveDate);
    if (!iso) {
      showToast('warning', 'Resolved date required', 'Pick the date the escalation was actually resolved.');
      return;
    }
    resolveEscalation.mutate(
      { id: resolving.id, resolvedAt: iso, rca: resolveRca, rcaDocs: resolveDocs },
      {
        onSuccess: () => {
          showToast('success', 'Escalation resolved', 'Moved to History.');
          setResolving(null); setResolveDate(''); setResolveRca(''); setResolveDocs([]);
        },
        onError: () => showToast('error', 'Could not resolve', 'Please try again.'),
      }
    );
  };

  const removeAttachment = (url: string) => {
    setDraft((prev) => (prev ? { ...prev, attachments: prev.attachments.filter((a) => a.url !== url) } : prev));
  };

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || !files.length) return;
    parseMail.mutate({ file: files[0] }, {
      onSuccess: applyParsed,
      onError: () => showToast('error', 'Parse failed', 'The file could not be read as an email.'),
    });
  }, [parseMail, applyParsed, showToast]);

  const handlePaste = () => {
    if (!pasteText.trim()) return;
    parseMail.mutate({ rawMail: pasteText }, {
      onSuccess: (resp) => { applyParsed(resp); setPasteText(''); },
      onError: () => showToast('error', 'Parse failed', 'Could not parse the pasted text.'),
    });
  };

  const saveDraft = () => {
    if (!draft) return;
    if (!draft.customerName.trim()) {
      showToast('warning', 'Customer / project required', 'Type the customer or project name to continue.');
      return;
    }
    createMail.mutate(
      {
        leaderName: draft.leaderName,
        customerName: draft.customerName,
        projectManager: draft.projectManager,
        issueType: draft.issueType,
        issueSummary: draft.issueSummary,
        raisedBy: draft.raisedBy,
        raisedVia: draft.raisedVia,
        escalationOwner: draft.escalationOwner,
        receivedAt: draft.receivedAt,
        rawMail: draft.rawMail,
        attachments: draft.attachments,
      },
      {
        onSuccess: (resp) => {
          const owner = resp?.data?.escalationOwner || draft.escalationOwner;
          showToast('success', 'Escalation saved', `Routed automatically to ${owner}.`);
          resetUpload();
        },
        onError: () => showToast('error', 'Save failed', 'Could not save the escalation.'),
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Escalation Mails</h1>
          <p className="text-sm text-slate-500">Upload, track and manage escalation emails</p>
        </div>
        {!isViewer && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={startManual}>
              <Plus size={16} /> Add Manually
            </Button>
            <Button onClick={() => setUploadOpen(true)}>
              <Upload size={16} /> Upload &amp; Trigger Mail
            </Button>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Mail size={20} className="text-blue-600" />} tint="bg-blue-100" label="Total Escalations" value={stats.total} />
        <KpiCard icon={<AlertTriangle size={20} className="text-orange-600" />} tint="bg-orange-100" label="Open" value={stats.open} />
        <KpiCard icon={<CheckCircle2 size={20} className="text-green-600" />} tint="bg-green-100" label="Resolved" value={stats.resolved} />
        <KpiCard icon={<Users size={20} className="text-indigo-600" />} tint="bg-indigo-100" label="Assigned" value={stats.assigned} />
      </div>

      {/* Active / History tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {([
          { id: 'active' as const, label: 'Active Escalations', count: activeMails.length },
          { id: 'history' as const, label: 'History (Resolved)', count: historyMails.length },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => { setBoardTab(t.id); setPage(1); }}
            className={cn(
              'px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-2',
              boardTab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {t.label}
            <span className={cn('text-[11px] font-bold px-1.5 py-0.5 rounded-full', boardTab === t.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500')}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <Card padding="sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <select value={managerFilter} onChange={(e) => { setManagerFilter(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">All Managers</option>
            {managerOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setPage(1); }} className={selectCls}>
            <option value="">All Projects</option>
            {projectOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {boardTab === 'active' && (
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">All Status</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
            </select>
          )}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search escalation..."
              className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        {isLoading ? (
          <div className="p-10 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2" size={18} /> Loading…</div>
        ) : isError ? (
          <div className="p-10 text-center text-red-500 text-sm">Could not load escalations. Check that you are signed in.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1160px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="px-5 py-3.5 font-bold">Date Raised</th>
                    <th className="px-5 py-3.5 font-bold">Leader Name</th>
                    <th className="px-5 py-3.5 font-bold">Manager (Project)</th>
                    <th className="px-5 py-3.5 font-bold">Customer / Project</th>
                    <th className="px-5 py-3.5 font-bold">Issue (Why Escalated)</th>
                    <th className="px-5 py-3.5 font-bold">Raised By</th>
                    <th className="px-5 py-3.5 font-bold">Raised Via</th>
                    <th className="px-5 py-3.5 font-bold">Escalated To</th>
                    {boardTab === 'history' && <th className="px-5 py-3.5 font-bold">Resolved Date</th>}
                    <th className="px-5 py-3.5 font-bold">Status</th>
                    <th className="px-5 py-3.5 font-bold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr><td colSpan={boardTab === 'history' ? 11 : 10} className="px-5 py-12 text-center text-slate-400 text-sm">{boardTab === 'history' ? 'No resolved escalations yet. Mark an escalation as Resolved and it moves here.' : 'No active escalations. Add one with “Upload & Trigger Mail” or “Add Manually”.'}</td></tr>
                  ) : pageRows.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 align-top">
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="font-medium text-slate-700 tabular-nums">{m.receivedAt ? format(new Date(m.receivedAt), 'dd MMM yyyy') : '—'}</div>
                        <div className="text-xs text-slate-400 tabular-nums">{m.receivedAt ? format(new Date(m.receivedAt), 'hh:mm a') : ''}</div>
                      </td>
                      <td className="px-5 py-4 font-medium text-slate-700">{m.leaderName}</td>
                      <td className="px-5 py-4 text-slate-600">{m.projectManager || '—'}</td>
                      <td className="px-5 py-4 text-slate-600">{m.customerName}</td>
                      <td className="px-5 py-4 text-slate-600 max-w-[220px]">
                        <div>{m.issueSummary}</div>
                        {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-blue-600">
                            <ImageIcon size={11} /> {m.attachments.length} attachment{m.attachments.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {(() => {
                          const { name, email } = splitRaisedBy(m.raisedBy);
                          return (
                            <>
                              <div className="font-medium text-slate-700">{name || '—'}</div>
                              {email && <div className="text-xs text-slate-400 break-all">{email}</div>}
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-4 text-slate-500">{m.raisedVia || 'Email'}</td>
                      <td className="px-5 py-4">
                        <select
                          value={m.escalationOwner}
                          disabled={isViewer}
                          onChange={(e) => updateOwner.mutate({ id: m.id, escalationOwner: e.target.value })}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60"
                        >
                          {!owners.includes(m.escalationOwner) && m.escalationOwner && <option value={m.escalationOwner}>{m.escalationOwner}</option>}
                          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      {boardTab === 'history' && (
                        <td className="px-5 py-4 whitespace-nowrap tabular-nums text-slate-600">
                          {m.resolvedAt ? format(new Date(m.resolvedAt), 'dd MMM yyyy') : '—'}
                        </td>
                      )}
                      <td className="px-5 py-4">
                        <select
                          value={m.status}
                          disabled={isViewer}
                          onChange={(e) => handleStatusChange(m, e.target.value)}
                          className={cn('rounded-full border-0 px-3 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer', (STATUS_META[m.status] || STATUS_META.OPEN).cls)}
                        >
                          <option value="OPEN">Open</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="RESOLVED">Resolved</option>
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => setViewRecord(m)} title="View" className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors">
                            <Eye size={15} />
                          </button>
                          {!isViewer && (
                            <button onClick={() => deleteMail.mutate(m.id)} title="Delete" className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-300 transition-colors">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100">
              <span className="text-sm text-slate-500">
                Showing {rangeStart} to {rangeEnd} of {filtered.length} entries
              </span>
              <div className="flex items-center gap-1.5">
                <PageBtn disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><ChevronLeft size={15} /></PageBtn>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                      p === safePage ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    )}
                  >{p}</button>
                ))}
                <PageBtn disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}><ChevronRight size={15} /></PageBtn>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* How it works */}
      <Card>
        <h3 className="text-sm font-bold text-blue-600 mb-4">How it works</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-start">
          <HowStep icon={<Upload size={18} className="text-blue-600" />} n="1. Upload File" desc="Upload the escalation email, PDF or Word doc" />
          <StepArrow />
          <HowStep icon={<Mail size={18} className="text-blue-600" />} n="2. Trigger & Fetch" desc="System reads the mail and extracts key details" />
          <StepArrow />
          <HowStep icon={<FileText size={18} className="text-blue-600" />} n="3. Auto Populate" desc="Escalation details are populated in the table" />
          <StepArrow />
          <HowStep icon={<UserCheck size={18} className="text-blue-600" />} n="4. Assign & Track" desc="Assign to respective owner and track resolution" />
        </div>
      </Card>

      {/* Upload / Trigger modal */}
      {uploadOpen && (
        <Modal onClose={resetUpload} title={manualMode ? 'Add escalation manually' : draft ? 'Review parsed escalation' : 'Upload & Trigger Mail'} wide={!!draft}>
          {!draft ? (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                className={cn('rounded-xl border-2 border-dashed p-8 text-center transition-colors', dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50')}
              >
                <Mail className="mx-auto text-blue-500 mb-2" size={26} />
                <div className="font-semibold text-slate-700">Drop the escalation file here</div>
                <div className="text-sm text-slate-500 mt-1">Email (.eml / .msg), PDF (.pdf) or Word (.docx)</div>
                <Button className="mt-4" onClick={() => fileInputRef.current?.click()} isLoading={parseMail.isPending}>
                  <Upload size={16} /> Choose file
                </Button>
                <input ref={fileInputRef} type="file" accept=".eml,.msg,.pdf,.docx,message/rfc822,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              </div>
              <div className="text-center text-xs uppercase tracking-wide text-slate-400">or paste mail text</div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                placeholder="Paste the full escalation email including From:, Subject:, Date: headers…"
                className="w-full rounded-lg border border-slate-200 p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <div className="flex justify-end">
                <Button variant="outline" onClick={handlePaste} isLoading={parseMail.isPending}><Send size={16} /> Parse text</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Leader Name">
                  <select value={draft.leaderName} onChange={(e) => setDraft({ ...draft, leaderName: e.target.value })} className={fieldCls}>
                    {LEADERS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Manager (Project)">
                  <select
                    value={draft.projectManager || ''}
                    onChange={(e) => setDraft({ ...draft, projectManager: e.target.value })}
                    className={fieldCls}
                  >
                    <option value="">Select manager…</option>
                    {PROJECT_MANAGERS.map((m) => <option key={m} value={m}>{m}</option>)}
                    {draft.projectManager && !PROJECT_MANAGERS.includes(draft.projectManager) && (
                      <option value={draft.projectManager}>{draft.projectManager}</option>
                    )}
                  </select>
                </Field>
                <Field label="Customer / Project (type if unmatched)">
                  <input value={draft.customerName} onChange={(e) => setDraft({ ...draft, customerName: e.target.value })} placeholder="e.g. Acme Corp - Share Migration" className={fieldCls} />
                </Field>
                <Field label="Date Raised (editable)">
                  <input
                    type="datetime-local"
                    value={isoToLocalInput(draft.receivedAt)}
                    onChange={(e) => setDraft({ ...draft, receivedAt: localInputToIso(e.target.value) || draft.receivedAt })}
                    className={fieldCls}
                  />
                </Field>
                <Field label="Raised Via">
                  <select value={draft.raisedVia} onChange={(e) => setDraft({ ...draft, raisedVia: e.target.value })} className={fieldCls}>
                    <option value="Email">Email</option>
                    <option value="Outlook">Outlook</option>
                    <option value="PDF">PDF</option>
                    <option value="Word">Word</option>
                    <option value="Manual">Manual</option>
                    <option value="Phone">Phone</option>
                    <option value="Teams">Teams</option>
                  </select>
                </Field>
                <Field label="Raised by — who raised the issue (name / email)">
                  <input value={draft.raisedBy} onChange={(e) => setDraft({ ...draft, raisedBy: e.target.value })} placeholder="e.g. John Doe <john@acme.com>" className={fieldCls} />
                </Field>
                <Field label="Issue type (drives auto-routing)">
                  <select value={draft.issueType} onChange={(e) => setDraft({ ...draft, issueType: e.target.value })} className={fieldCls}>
                    {Object.entries(ISSUE_TYPE_META).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="Issue — why it escalated">
                    <textarea value={draft.issueSummary} onChange={(e) => setDraft({ ...draft, issueSummary: e.target.value })} rows={3} className={fieldCls} />
                  </Field>
                </div>

                <div className="md:col-span-2">
                  <Field label="Attachments — screenshots / screen recordings (optional)">
                    <div className="flex flex-wrap gap-3">
                      {draft.attachments.map((a) => (
                        <div key={a.url} className="relative w-24 h-24 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 group">
                          {a.type === 'video' ? (
                            <video src={mediaSrc(a.url)} className="w-full h-full object-cover bg-black" />
                          ) : (
                            <img src={mediaSrc(a.url)} alt={a.name || 'attachment'} className="w-full h-full object-cover" />
                          )}
                          <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] px-1 py-0.5 flex items-center gap-1">
                            {a.type === 'video' ? <Film size={10} /> : <ImageIcon size={10} />}
                            {a.type}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAttachment(a.url)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => mediaInputRef.current?.click()}
                        disabled={uploadMedia.isPending}
                        className="w-24 h-24 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-60"
                      >
                        {uploadMedia.isPending ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
                        <span className="text-[10px]">Add media</span>
                      </button>
                      <input
                        ref={mediaInputRef}
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        className="hidden"
                        onChange={(e) => { handleMediaFiles(e.target.files); e.target.value = ''; }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5">Images up to 10MB, videos up to 500MB. Add multiple files.</p>
                  </Field>
                </div>

                <Field label="Escalated To (auto — editable)">
                  <select
                    value={draft.escalationOwner}
                    onChange={(e) => setDraft({ ...draft, escalationOwner: e.target.value })}
                    className={cn(fieldCls, 'font-semibold text-blue-700')}
                  >
                    {!owners.includes(draft.escalationOwner) && draft.escalationOwner && (
                      <option value={draft.escalationOwner}>{draft.escalationOwner}</option>
                    )}
                    {owners.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDraft(null)}>Back</Button>
                <Button onClick={saveDraft} isLoading={createMail.isPending}><CheckCircle2 size={16} /> Save escalation</Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* View record modal */}
      {viewRecord && (
        <Modal onClose={() => setViewRecord(null)} title="Escalation details">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
              <span className="text-slate-400 font-medium">Date Raised</span>
              <input
                type="datetime-local"
                disabled={isViewer}
                value={isoToLocalInput(viewRecord.receivedAt)}
                onChange={(e) => {
                  const iso = localInputToIso(e.target.value);
                  if (!iso) return;
                  setViewRecord({ ...viewRecord, receivedAt: iso });
                  updateReceivedAt.mutate(
                    { id: viewRecord.id, receivedAt: iso },
                    {
                      onSuccess: () => showToast('success', 'Date updated', 'Raised date saved.'),
                      onError: () => showToast('error', 'Update failed', 'Could not save the date.'),
                    }
                  );
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60"
              />
            </div>
            <DetailRow label="Leader Name" value={viewRecord.leaderName} />
            <DetailRow label="Manager (Project)" value={viewRecord.projectManager || '—'} />
            <DetailRow label="Customer / Project" value={viewRecord.customerName} />
            <DetailRow label="Issue Type" value={(ISSUE_TYPE_META[viewRecord.issueType] || {}).label || viewRecord.issueType} />
            <DetailRow label="Raised Via" value={viewRecord.raisedVia || 'Email'} />
            <DetailRow label="Raised By" value={viewRecord.raisedBy || '—'} />
            <DetailRow label="Escalated To" value={viewRecord.escalationOwner} />
            <DetailRow label="Status" value={(STATUS_META[viewRecord.status] || STATUS_META.OPEN).label} />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Issue (Why Escalated)</div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-slate-700">{viewRecord.issueSummary || '—'}</div>
            </div>

            {/* Resolution details — editable for resolved escalations */}
            {viewRecord.status === 'RESOLVED' && (
              <div className="space-y-3 rounded-lg border border-green-200 bg-green-50/50 p-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500 font-medium text-xs uppercase tracking-wide">Resolved Date</span>
                  <input
                    type="datetime-local"
                    disabled={isViewer}
                    value={isoToLocalInput(viewRecord.resolvedAt || '')}
                    onChange={(e) => {
                      const iso = localInputToIso(e.target.value);
                      if (!iso) return;
                      setViewRecord({ ...viewRecord, resolvedAt: iso });
                      updateResolution.mutate({ id: viewRecord.id, resolvedAt: iso }, {
                        onSuccess: () => showToast('success', 'Resolved date updated', ''),
                        onError: () => showToast('error', 'Update failed', 'Could not save the date.'),
                      });
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-60"
                  />
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">RCA (Root Cause Analysis)</div>
                  <textarea
                    disabled={isViewer}
                    defaultValue={viewRecord.rca || ''}
                    rows={3}
                    placeholder="Root cause and resolution details…"
                    onBlur={(e) => {
                      if (e.target.value === (viewRecord.rca || '')) return;
                      const val = e.target.value;
                      setViewRecord({ ...viewRecord, rca: val });
                      updateResolution.mutate({ id: viewRecord.id, rca: val }, {
                        onSuccess: () => showToast('success', 'RCA saved', ''),
                        onError: () => showToast('error', 'Update failed', 'Could not save the RCA.'),
                      });
                    }}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-60"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Changes save when you click outside the box.</p>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">RCA Document(s)</div>
                  <div className="space-y-2">
                    {(viewRecord.rcaDocs || []).map((d: RcaDoc, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <a href={mediaSrc(d.url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 truncate">
                          <FileText size={14} /> <span className="truncate">{d.name}</span>
                        </a>
                        {!isViewer && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = (viewRecord.rcaDocs || []).filter((_: RcaDoc, idx: number) => idx !== i);
                              setViewRecord({ ...viewRecord, rcaDocs: next });
                              updateResolution.mutate({ id: viewRecord.id, rcaDocs: next }, {
                                onSuccess: () => showToast('success', 'Document removed', ''),
                                onError: () => showToast('error', 'Update failed', 'Could not remove the document.'),
                              });
                            }}
                            className="text-slate-400 hover:text-red-500"
                          ><X size={14} /></button>
                        )}
                      </div>
                    ))}
                    {!isViewer && (
                      <button
                        type="button"
                        onClick={() => viewRcaDocInputRef.current?.click()}
                        disabled={uploadRcaDocs.isPending}
                        className="flex items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-60 w-full justify-center"
                      >
                        {uploadRcaDocs.isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                        Upload RCA document
                      </button>
                    )}
                    <input
                      ref={viewRcaDocInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*,application/pdf"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files;
                        e.target.value = '';
                        if (!files || !files.length) return;
                        uploadRcaDocs.mutate(Array.from(files), {
                          onSuccess: (resp: any) => {
                            const next = [...(viewRecord.rcaDocs || []), ...(resp?.data || [])];
                            setViewRecord({ ...viewRecord, rcaDocs: next });
                            updateResolution.mutate({ id: viewRecord.id, rcaDocs: next }, {
                              onSuccess: () => showToast('success', 'RCA document added', ''),
                              onError: () => showToast('error', 'Update failed', 'Could not save the document.'),
                            });
                          },
                          onError: () => showToast('error', 'Upload failed', 'Could not upload the document.'),
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {Array.isArray(viewRecord.attachments) && viewRecord.attachments.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Attachments ({viewRecord.attachments.length})</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {viewRecord.attachments.map((a: Attachment, i: number) => (
                    <div key={i} className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                      <button
                        type="button"
                        onClick={() => setLightbox(a)}
                        className="block w-full aspect-video bg-black/5 relative group"
                        title={a.name || 'Open'}
                      >
                        {a.type === 'video' ? (
                          <>
                            <video src={mediaSrc(a.url)} className="w-full h-full object-cover bg-black" muted preload="metadata" />
                            <span className="absolute inset-0 flex items-center justify-center">
                              <span className="w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center"><Play size={16} /></span>
                            </span>
                          </>
                        ) : (
                          <img src={mediaSrc(a.url)} alt={a.name || `attachment ${i + 1}`} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
                        )}
                        <span className="absolute top-1.5 left-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-black/55 text-white flex items-center gap-1">
                          {a.type === 'video' ? <Film size={9} /> : <ImageIcon size={9} />}{a.type}
                        </span>
                      </button>
                      <div className="px-2 py-1.5 text-[11px] text-slate-600 truncate border-t border-slate-100" title={a.name}>{a.name || 'attachment'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Resolve modal — editable resolved date (required) + RCA (optional) */}
      {resolving && (
        <Modal onClose={() => setResolving(null)} title="Resolve escalation">
          <div className="space-y-4">
            <div className="text-sm text-slate-500">
              Closing <span className="font-semibold text-slate-700">{resolving.customerName}</span>. Set the date it was actually resolved and (optionally) the root cause.
            </div>
            <Field label="Resolved date (required)">
              <input
                type="datetime-local"
                value={resolveDate}
                onChange={(e) => setResolveDate(e.target.value)}
                className={fieldCls}
              />
            </Field>
            <Field label="RCA — Root Cause Analysis (type, optional)">
              <textarea
                value={resolveRca}
                onChange={(e) => setResolveRca(e.target.value)}
                rows={4}
                placeholder="What was the root cause and how was it resolved?"
                className={fieldCls}
              />
            </Field>
            <Field label="RCA Document(s) — upload (optional)">
              <div className="space-y-2">
                {resolveDocs.map((d, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <a href={mediaSrc(d.url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 truncate">
                      <FileText size={14} /> <span className="truncate">{d.name}</span>
                    </a>
                    <button type="button" onClick={() => setResolveDocs((prev) => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => rcaDocInputRef.current?.click()}
                  disabled={uploadRcaDocs.isPending}
                  className="flex items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-60 w-full justify-center"
                >
                  {uploadRcaDocs.isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  Upload RCA document (PDF / Word / Excel)
                </button>
                <input
                  ref={rcaDocInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => { handleRcaDocFiles(e.target.files); e.target.value = ''; }}
                />
              </div>
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setResolving(null)}>Cancel</Button>
              <Button onClick={submitResolve} isLoading={resolveEscalation.isPending}><CheckCircle2 size={16} /> Resolve &amp; move to History</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Lightbox — full-size image / playable video */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20" title="Close"><X size={22} /></button>
          <div className="max-w-5xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            {lightbox.type === 'video' ? (
              <video src={mediaSrc(lightbox.url)} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg bg-black" />
            ) : (
              <img src={mediaSrc(lightbox.url)} alt={lightbox.name || 'attachment'} className="max-w-full max-h-[85vh] rounded-lg object-contain" />
            )}
            {lightbox.name && <div className="text-center text-white/80 text-sm mt-3">{lightbox.name}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// "Raised by" is stored as `Name <email>`, just `email`, or just a name.
// Split it so the table can show the person's name prominently, email below.
function splitRaisedBy(raw: string): { name: string; email: string } {
  const value = (raw || '').trim();
  if (!value) return { name: '', email: '' };
  const m = value.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].replace(/^"|"$/g, '').trim(), email: m[2].trim() };
  if (/^\S+@\S+$/.test(value)) {
    // Bare email — derive a readable name from the local part (john.doe → John Doe).
    const local = value.split('@')[0].replace(/[._-]+/g, ' ').trim();
    const name = local.replace(/\b\w/g, (c) => c.toUpperCase());
    return { name, email: value };
  }
  return { name: value, email: '' };
}

const selectCls = 'rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400 lg:w-44';
const fieldCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';

function KpiCard({ icon, tint, label, value }: { icon: React.ReactNode; tint: string; label: string; value: number }) {
  return (
    <Card padding="sm">
      <div className="flex items-center gap-3">
        <div className={cn('w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0', tint)}>{icon}</div>
        <div>
          <div className="text-xs font-medium text-slate-500">{label}</div>
          <div className="text-2xl font-bold text-slate-800 tabular-nums leading-tight">{value ?? 0}</div>
        </div>
      </div>
    </Card>
  );
}

function HowStep({ icon, n, desc }: { icon: React.ReactNode; n: string; desc: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 px-2">
      <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">{icon}</div>
      <div className="font-semibold text-sm text-slate-700">{n}</div>
      <div className="text-xs text-slate-500 max-w-[160px]">{desc}</div>
    </div>
  );
}

function StepArrow() {
  return <div className="hidden md:flex items-center justify-center text-slate-300"><ArrowRight size={18} /></div>;
}

function PageBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} className="w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent flex items-center justify-center">
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
      <span className="text-slate-400 font-medium">{label}</span>
      <span className="text-slate-700 text-right">{value}</span>
    </div>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className={cn('bg-white rounded-2xl shadow-xl w-full max-h-[90vh] overflow-y-auto', wide ? 'max-w-3xl' : 'max-w-lg')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
