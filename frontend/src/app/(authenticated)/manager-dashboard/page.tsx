'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useManagerGoalsWithStats, useEscalatedProjects, useNtaStats, useNtaEnabled, useNtaToggle, useNtaSpaces, useNtaIssues, useNtaSearch, useNtaTrends, useNtaAssignees, useNtaReporters, useNtaProjectManagers, useNtaDepartments, useJiraExcelStatus, useNtaByManagers, useEngineersByManager, useJiraEngineers } from '@/hooks/useProjects';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Loader2, AlertCircle, X, PlayCircle, PauseCircle,
  CheckCircle, Clock, ChevronRight, Search, Link2Off,
  ArrowLeft, ExternalLink, Upload, FileSpreadsheet, Trash2,
} from 'lucide-react';
import api from '@/services/api';
import { SEGMENT_CONFIG, SEGMENT_HIERARCHY, MANAGER_QUERY_NAMES, ENGINEER_ASSIGNMENTS, segmentOfManager, type Segment } from '@/lib/segments';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveTab = 'ENT' | 'SMB' | 'ENGINEERS' | 'OBSERVATIONS' | 'TICKETS';

interface ManagerStat {
  manager: string;
  total: number;
  active: number;
  inactive: number;
  completed: number;
  delayed: number;
  atRisk: number;
  onTime: number;
  pctOnTime: number;
  avgDelayDays: number;
  achievedPct: number;
  goalPct: number;
  variance: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const NAMED_MANAGER_SET = new Set(SEGMENT_CONFIG.flatMap((s) => s.managers));

// ─── Badge styles ─────────────────────────────────────────────────────────────

const DELAY_COLORS: Record<string, string> = {
  DELAYED:     'bg-red-100 text-red-700',
  AT_RISK:     'bg-yellow-100 text-yellow-700',
  NOT_DELAYED: 'bg-green-100 text-green-700',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'bg-green-100 text-green-700',
  ON_HOLD:   'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toInitials(name: string): string {
  return name.split(' ').map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function sumStats(stats: ManagerStat[]) {
  const total      = stats.reduce((s, m) => s + m.total, 0);
  const onTime     = stats.reduce((s, m) => s + m.onTime, 0);
  const delayed    = stats.reduce((s, m) => s + m.delayed, 0);
  const atRisk     = stats.reduce((s, m) => s + m.atRisk, 0);
  const completed  = stats.reduce((s, m) => s + m.completed, 0);
  const active     = stats.reduce((s, m) => s + m.active, 0);
  const inactive   = stats.reduce((s, m) => s + m.inactive, 0);
  const pctOnTime  = total > 0 ? Math.round((onTime / total) * 100) : 0;
  const avgDelayDays = delayed > 0
    ? Math.round(stats.reduce((s, m) => s + m.avgDelayDays * m.delayed, 0) / delayed)
    : 0;
  return { total, onTime, delayed, atRisk, completed, active, inactive, pctOnTime, avgDelayDays };
}

// ─── NTA connectivity banner ─────────────────────────────────────────────────

function NtaConnectBanner() {
  const { data: configData, isLoading: configLoading } = useNtaEnabled();
  const { data: statsData, isLoading: statsLoading, isError } = useNtaStats();

  if (configLoading || statsLoading) return null;

  // NTA not configured — hide banner entirely (not an error state)
  if (!configData?.configured) return null;

  if (isError || !statsData) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-center gap-2">
        <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
        <p className="text-sm text-red-800">
          <span className="font-semibold">Neutara Ticketing — connection failed.</span>
          <span className="text-red-600 ml-2 text-xs">Check NTA_API_KEY in backend/.env</span>
        </p>
      </div>
    );
  }

  const stats = statsData?.data || statsData;
  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-3 flex items-center gap-2">
      <CheckCircle size={15} className="text-green-600 flex-shrink-0" />
      <p className="text-sm text-green-800">
        <span className="font-semibold">Neutara Ticketing connected</span>
        <span className="text-green-500 mx-2">·</span>
        <span className="text-green-700">{(stats.totalTickets || 0).toLocaleString()} tickets</span>
        <span className="text-green-500 mx-2">·</span>
        <span className="text-green-700">{stats.totalBoards || 0} boards</span>
        <span className="text-green-500 mx-2">·</span>
        <span className="text-green-700">{stats.totalAgents || 0} agents</span>
      </p>
    </div>
  );
}

// ─── Jira Excel upload banner ────────────────────────────────────────────────

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function ExcelUploadBanner() {
  const { data, isLoading, refetch } = useJiraExcelStatus();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['jira-excel-status'] });
    queryClient.invalidateQueries({ queryKey: ['jira-sla'] });
    queryClient.invalidateQueries({ queryKey: ['jira-engineers'] });
    queryClient.invalidateQueries({ queryKey: ['jira-engineers-by-manager'] });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/jira/excel/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Upload failed');
      invalidateAll();
      refetch();
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClear = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
    await fetch(`${API_BASE_URL}/api/jira/excel/clear`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    invalidateAll();
    refetch();
  };

  if (isLoading) return null;
  const available = data?.available;

  return (
    <div className={`rounded-xl border p-4 ${available ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheet size={18} className={`flex-shrink-0 mt-0.5 ${available ? 'text-green-600' : 'text-blue-500'}`} />
          <div>
            {available ? (
              <>
                <p className="text-sm font-semibold text-green-800">Jira data loaded from Excel</p>
                <p className="text-xs text-green-700 mt-0.5">
                  <span className="font-medium">{data.filename}</span>
                  {' · '}{data.ticketCount} tickets
                  {' · '}Uploaded {new Date(data.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-blue-800">Upload Jira Export (Excel)</p>
                <p className="text-xs text-blue-600 mt-0.5">Export tickets from Jira, then upload here to display SLA data.</p>
              </>
            )}
            {uploadError && <p className="text-xs text-red-600 mt-1 font-medium">{uploadError}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {available && (
            <button onClick={handleClear} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg transition">
              <Trash2 size={13} /> Remove
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition whitespace-nowrap
              ${available ? 'bg-white border border-green-300 text-green-700 hover:bg-green-50' : 'bg-blue-600 text-white hover:bg-blue-700'} disabled:opacity-60`}
          >
            {uploading ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : <><Upload size={14} /> {available ? 'Replace File' : 'Upload Excel'}</>}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
        </div>
      </div>
    </div>
  );
}

// ─── ManagerDetailView (inline, not a popup) ─────────────────────────────────

function ManagerDetailView({
  stat,
  isOthers,
  onBack,
  jiraBaseUrl,
}: {
  stat: ManagerStat;
  isOthers: boolean;
  onBack: () => void;
  jiraBaseUrl: string;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [escalationsOpen, setEscalationsOpen] = useState(false);

  const { data: ntaConfigData } = useNtaEnabled();
  const ntaEnabled: boolean = (ntaConfigData?.data?.configured ?? ntaConfigData?.configured ?? false)
    && (ntaConfigData?.data?.enabled ?? ntaConfigData?.enabled ?? true);

  const { data: escalatedData } = useEscalatedProjects(isOthers ? undefined : stat.manager);
  const escalationCount: number = Array.isArray(escalatedData) ? escalatedData.length : (escalatedData as any)?.data?.length ?? 0;
  const escalations: any[] = Array.isArray(escalatedData) ? escalatedData : (escalatedData as any)?.data ?? [];

  const { data: projectData, isLoading: projectsLoading } = useQuery({
    queryKey: isOthers ? ['managerDashboard', 'others', 'projects'] : ['managerDashboard', stat.manager, 'projects'],
    queryFn: () =>
      isOthers
        ? api.get('/projects?limit=500').then((r: any) => r.data)
        : api.get(`/projects?projectManager=${encodeURIComponent(stat.manager)}&limit=200`).then((r: any) => r.data),
    staleTime: 30_000,
  });

  const allFetched: any[] = projectData?.data ?? [];
  const projects = useMemo(
    () => isOthers ? allFetched.filter((p: any) => !NAMED_MANAGER_SET.has(p.projectManager)) : allFetched,
    [allFetched, isOthers]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return projects.filter((p: any) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (q && !p.name?.toLowerCase().includes(q) && !p.customerName?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projects, search, statusFilter]);

  const kpis = [
    { label: 'Active',    value: stat.active,    color: 'text-green-700',  bg: 'bg-green-50',  icon: PlayCircle },
    { label: 'On Hold',   value: stat.inactive,  color: 'text-yellow-700', bg: 'bg-yellow-50', icon: PauseCircle },
    { label: 'Completed', value: stat.completed, color: 'text-blue-700',   bg: 'bg-blue-50',   icon: CheckCircle },
    { label: 'Delayed',   value: stat.delayed,   color: 'text-red-700',    bg: 'bg-red-50',    icon: Clock },
    { label: 'At Risk',   value: stat.atRisk,    color: 'text-orange-700', bg: 'bg-orange-50', icon: AlertCircle },
  ];

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Back button + manager header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 font-medium transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>
      </div>

      <div className="bg-gradient-to-r from-[#1b4f72] to-[#2980b9] rounded-2xl p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
          {isOthers ? 'OT' : toInitials(stat.manager)}
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{stat.manager}</h2>
          <p className="text-sm text-blue-100 mt-0.5">
            Project Manager · {stat.total} total projects
          </p>
        </div>
        {!isOthers && (
          <Link
            href={`/projects?projectManager=${encodeURIComponent(stat.manager)}`}
            className="ml-auto flex items-center gap-1.5 text-xs text-white/80 hover:text-white font-medium px-3 py-1.5 rounded-lg border border-white/30 hover:border-white/60 transition"
          >
            View in All Projects <ChevronRight size={12} />
          </Link>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-5 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={`${k.bg} rounded-xl p-4 flex items-center gap-3 border border-white`}>
            <k.icon size={20} className={k.color} />
            <div>
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* On Time + Avg Delay + Escalations summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">% On Time</p>
            <p className={`text-2xl font-bold ${stat.pctOnTime >= 80 ? 'text-green-600' : stat.pctOnTime >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
              {stat.pctOnTime}%
            </p>
          </div>
          <div className="flex-1">
            <div className="bg-gray-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${stat.pctOnTime >= 80 ? 'bg-green-500' : stat.pctOnTime >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                style={{ width: `${stat.pctOnTime}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">{stat.onTime} of {stat.total} projects on time</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Avg Delay (Late Projects Only)</p>
          {stat.avgDelayDays > 0 ? (
            <p className="text-2xl font-bold text-red-600">{stat.avgDelayDays} <span className="text-base font-normal text-gray-400">days</span></p>
          ) : (
            <p className="text-2xl font-bold text-green-600">0 <span className="text-base font-normal text-gray-400">days</span></p>
          )}
        </div>
        <button
          onClick={() => setEscalationsOpen((o) => !o)}
          className="bg-red-50 rounded-xl border border-red-100 p-4 flex items-center gap-3 cursor-pointer hover:bg-red-100 transition-colors h-full w-full text-left"
        >
          <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-2xl font-bold text-red-600">{escalationCount}</p>
            <p className="text-xs text-gray-500 mt-0.5">Escalations</p>
          </div>
          <ChevronRight size={15} className={`text-red-400 transition-transform duration-200 ${escalationsOpen ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Inline escalations panel */}
      {escalationsOpen && (
        <div className="bg-white rounded-2xl border border-red-100 overflow-hidden">
          <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
            <AlertCircle size={15} className="text-red-600" />
            <h3 className="text-sm font-semibold text-red-700">Escalated Projects</h3>
            <span className="text-xs text-red-400 ml-1">{escalations.length} total</span>
          </div>
          {escalations.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No escalated projects found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Project Name', 'Customer', 'Priority', 'Status', 'Delay Days', 'Escalated At'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {escalations.map((p: any) => (
                    <tr key={p.id} className="hover:bg-red-50/40">
                      <td className="px-4 py-2.5">
                        <Link href={`/projects/${p.id}`} className="font-medium text-primary-600 hover:underline">{p.name}</Link>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{p.customerName || '—'}</td>
                      <td className="px-4 py-2.5">
                        {p.escalationPriority ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.escalationPriority === 'HIGH' ? 'bg-red-100 text-red-700' : p.escalationPriority === 'MEDIUM' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {p.escalationPriority}
                          </span>
                        ) : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{p.status?.replace('_', ' ') || '—'}</td>
                      <td className="px-4 py-2.5">
                        {p.delayDays > 0 ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.delayDays > 14 ? 'bg-red-100 text-red-700' : p.delayDays > 7 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {p.delayDays}d
                          </span>
                        ) : <span className="text-gray-400 text-xs">0d</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                        {p.escalatedAt ? new Date(p.escalatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Project list — collapsible */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {/* Clickable header toggle */}
        <button
          onClick={() => setProjectsOpen((o) => !o)}
          className="w-full px-5 py-3 flex items-center gap-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        >
          <h3 className="text-sm font-semibold text-gray-700 flex-shrink-0">Active Projects</h3>
          <span className="text-xs text-gray-400">{projects.length} projects</span>
          <ChevronRight
            size={15}
            className={`ml-auto text-gray-400 transition-transform duration-200 ${projectsOpen ? 'rotate-90' : ''}`}
          />
        </button>

        {projectsOpen && (
          <>
            {/* Filters — shown only when open */}
            <div className="px-5 py-2.5 border-t border-b border-gray-100 flex items-center gap-3 bg-white">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary-400"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none"
              >
                <option value="">All Status</option>
                {['ACTIVE', 'ON_HOLD', 'CANCELLED'].map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
              <span className="text-xs text-gray-400 flex-shrink-0">{filtered.length} results</span>
            </div>

            {projectsLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">
                {projects.length === 0 ? 'No active projects found for this manager.' : 'No projects match the current filters.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Project Name', 'Customer', 'Phase', 'Status', 'Delay', 'Planned End', 'SOW End'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p: any) => {
                  const sowEnd = p.extendedEndDate ?? p.plannedEnd;
                  const isExtended = !!p.extendedEndDate;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/projects/${p.id}`}
                          className="font-medium text-gray-900 hover:text-primary-600 hover:underline"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{p.customerName || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium whitespace-nowrap">
                          {p.phase?.replace(/_/g, ' ') || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-500'}`}>
                          {p.status?.replace('_', ' ') || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.delayStatus && p.delayStatus !== 'NOT_DELAYED' ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${DELAY_COLORS[p.delayStatus]}`}>
                            {p.delayStatus === 'DELAYED' && p.delayDays > 0 ? `Delayed (${p.delayDays}d)` : 'At Risk'}
                          </span>
                        ) : (
                          <span className="text-xs text-green-600 font-medium">On Track</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(p.plannedEnd)}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span className={isExtended ? 'text-amber-600 font-medium' : 'text-gray-500'}>
                          {fmtDate(sowEnd)}{isExtended && <span className="ml-1">↑</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

          </>
        )}
      </div>

      {/* Engineers under this manager (from uploaded Jira Excel) */}
      {!isOthers && <ManagerEngineersSection manager={stat.manager} jiraBaseUrl={jiraBaseUrl} />}

      {/* NTA tickets for this manager — only when NTA is linked */}
      {!isOthers && ntaEnabled && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Tickets</p>
          <ManagerTicketAccordion name={stat.manager} />
        </div>
      )}

    </div>
  );
}

// ─── Engineers under a manager (from uploaded Jira Excel) ────────────────────

function PMEngineerRow({ e, jiraBaseUrl }: { e: any; jiraBaseUrl: string }) {
  const [openMode, setOpenMode] = useState<null | 'all' | 'fr' | 'res'>(null);
  const tickets: any[] = e.tickets ?? [];
  const frBreaches  = tickets.filter((t: any) => t.frBreached).length;
  const resBreaches = tickets.filter((t: any) => t.resBreached).length;
  const openTickets = tickets.filter((t: any) => !isTicketRetried(t)).length;
  const anyBreached = tickets.filter((t: any) => t.frBreached || t.resBreached).length;
  const breachRate  = tickets.length > 0 ? Math.round((anyBreached / tickets.length) * 100) : 0;
  const frTickets   = tickets.filter((t: any) => t.frBreached);
  const resTickets  = tickets.filter((t: any) => t.resBreached);

  const toggle = (mode: 'all' | 'fr' | 'res') =>
    setOpenMode(prev => (prev === mode ? null : mode));

  return (
    <div>
      <div className="flex items-center gap-2 px-5 py-2.5 hover:bg-gray-50 transition-colors">
        <button
          onClick={() => tickets.length > 0 && toggle('all')}
          className={`flex items-center gap-2 flex-1 min-w-0 text-left ${tickets.length > 0 ? 'cursor-pointer group' : 'cursor-default'}`}
        >
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
            {toInitials(e.engineerName)}
          </div>
          <span className="font-medium text-sm text-gray-800 group-hover:text-indigo-600 transition-colors">{e.engineerName}</span>
          {tickets.length > 0 && (
            <ChevronRight size={13} className={`text-gray-300 transition-transform flex-shrink-0 ${openMode === 'all' ? 'rotate-90' : ''}`} />
          )}
        </button>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
            {e.totalTickets} total
          </span>
          {openTickets > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
              {openTickets} open
            </span>
          )}
          {frBreaches > 0 && (
            <button
              onClick={() => toggle('fr')}
              className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ring-1 transition-colors
                ${openMode === 'fr'
                  ? 'bg-orange-500 text-white ring-orange-400'
                  : 'bg-orange-100 text-orange-700 ring-orange-200 hover:bg-orange-200'}`}
            >
              FR {frBreaches}
            </button>
          )}
          {resBreaches > 0 && (
            <button
              onClick={() => toggle('res')}
              className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ring-1 transition-colors
                ${openMode === 'res'
                  ? 'bg-red-500 text-white ring-red-400'
                  : 'bg-red-100 text-red-700 ring-red-200 hover:bg-red-200'}`}
            >
              Res {resBreaches}
            </button>
          )}
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ring-1 whitespace-nowrap
            ${breachRate > 20 ? 'bg-red-100 text-red-700 ring-red-200'
              : breachRate > 0 ? 'bg-amber-100 text-amber-700 ring-amber-200'
              : 'bg-green-100 text-green-700 ring-green-200'}`}>
            {breachRate}% breach
          </span>
        </div>
      </div>

      {openMode === 'all' && (
        tickets.length > 0
          ? <div className="border-t border-gray-100"><ExcelTicketTable tickets={tickets} jiraBaseUrl={jiraBaseUrl} /></div>
          : <div className="px-5 py-3 text-xs text-gray-400 border-t border-gray-50">No tickets found.</div>
      )}
      {openMode === 'fr' && frTickets.length > 0 && (
        <BreachedTicketSections tickets={frTickets} jiraBaseUrl={jiraBaseUrl} />
      )}
      {openMode === 'res' && resTickets.length > 0 && (
        <BreachedTicketSections tickets={resTickets} jiraBaseUrl={jiraBaseUrl} />
      )}
    </div>
  );
}

function ExcelTicketTable({ tickets, jiraBaseUrl }: { tickets: any[]; jiraBaseUrl: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-gray-500">
            <th className="px-4 py-2 text-left font-medium whitespace-nowrap">Key</th>
            <th className="px-3 py-2 text-left font-medium">Summary</th>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Status</th>
            <th className="px-3 py-2 text-center font-medium whitespace-nowrap">FR Breach</th>
            <th className="px-3 py-2 text-center font-medium whitespace-nowrap">Res Breach</th>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {tickets.map((t: any, i: number) => (
            <tr key={t.key || i} className="hover:bg-indigo-50/30 transition-colors">
              <td className="px-4 py-2 whitespace-nowrap font-mono">
                {t.key ? (
                  <a
                    href={`${jiraBaseUrl}/browse/${t.key}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:text-indigo-800 hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    {t.key}
                  </a>
                ) : '—'}
              </td>
              <td className="px-3 py-2 max-w-[320px] truncate text-gray-700" title={t.summary}>{t.summary || '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-600">{t.status || '—'}</td>
              <td className="px-3 py-2 text-center">
                {t.frBreached
                  ? <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">Yes</span>
                  : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-3 py-2 text-center">
                {t.resBreached
                  ? <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Yes</span>
                  : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-500">{t.created ? t.created.slice(0, 10) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const RETRY_KEYWORDS = ['retry', 'went into conflict', 'not moving', 'not picking'];

function isTicketRetried(t: any): boolean {
  const text = (t.summary || '').toLowerCase();
  return RETRY_KEYWORDS.some(kw => text.includes(kw));
}

function BreachedTicketSections({
  tickets,
  jiraBaseUrl,
}: {
  tickets: any[];
  jiraBaseUrl: string;
}) {
  const retry    = tickets.filter(isTicketRetried);
  const nonRetry = tickets.filter(t => !isTicketRetried(t));
  const [tab, setTab] = useState<'retry' | 'nonretry'>(retry.length > 0 ? 'retry' : 'nonretry');

  return (
    <div className="border-t border-gray-100">
      {/* Tab bar */}
      <div className="flex border-b border-gray-100 bg-gray-50/80">
        <button
          onClick={() => setTab('retry')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 -mb-px transition whitespace-nowrap
            ${tab === 'retry'
              ? 'border-amber-500 text-amber-700'
              : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Breached — Retry
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none
            ${tab === 'retry' ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
            {retry.length}
          </span>
        </button>
        <button
          onClick={() => setTab('nonretry')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 -mb-px transition whitespace-nowrap
            ${tab === 'nonretry'
              ? 'border-red-500 text-red-700'
              : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Breached — Non-retry
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none
            ${tab === 'nonretry' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
            {nonRetry.length}
          </span>
        </button>
      </div>

      {/* Tab content */}
      <div className="bg-white">
        {tab === 'retry' && (
          retry.length > 0
            ? <ExcelTicketTable tickets={retry} jiraBaseUrl={jiraBaseUrl} />
            : <p className="px-5 py-6 text-center text-xs text-gray-400">No retry tickets — none match retry / conflict / not moving / not picking.</p>
        )}
        {tab === 'nonretry' && (
          nonRetry.length > 0
            ? <ExcelTicketTable tickets={nonRetry} jiraBaseUrl={jiraBaseUrl} />
            : <p className="px-5 py-6 text-center text-xs text-gray-400">No non-retry breached tickets.</p>
        )}
      </div>
    </div>
  );
}

function pmFuzzyMatch(excelPm: string, dbName: string): boolean {
  const jv = excelPm.toLowerCase().trim();
  const cn = dbName.toLowerCase().trim();
  if (!jv || !cn) return false;
  if (jv === cn) return true;
  const jvFirst = jv.split(/\s+/)[0];
  const cnFirst = cn.split(/\s+/)[0];
  if (jvFirst.length > 2 && jvFirst === cnFirst) return true;
  return jv.includes(cn) || cn.includes(jv);
}

function ManagerEngineersSection({ manager, jiraBaseUrl }: { manager: string; jiraBaseUrl: string }) {
  const { data, isLoading } = useEngineersByManager();

  const available: boolean = data?.available ?? false;
  const pmColumnFound: boolean = data?.pmColumnFound ?? true;
  const managers: any[] = data?.data?.managers ?? [];
  const matchingEntries = managers.filter(
    (m: any) => pmFuzzyMatch(m.manager || '', manager)
  );
  const engineers: any[] = matchingEntries.flatMap((e: any) => e.engineers ?? []);

  return (
    <div className="mt-4 bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-gray-700">Engineers</h3>
        {!isLoading && <span className="text-xs text-gray-400">{engineers.length} mapped</span>}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin text-indigo-500" />
        </div>
      ) : !available ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          <p className="font-medium text-gray-500 mb-1">No engineer data yet</p>
          <p className="text-xs">Upload a Jira export above to populate engineers.</p>
        </div>
      ) : !pmColumnFound ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          <p className="font-medium text-gray-600 mb-1">&#34;Project Manager&#34; column not found in the uploaded Excel</p>
          <p className="text-xs max-w-md mx-auto">Re-export from Jira and include the <strong>Project Manager</strong> and <strong>Customer Name</strong> columns. The current file only has: Assignee, Reporter, Combination, Status, Priority, and SLA breach columns.</p>
        </div>
      ) : engineers.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          <p>No engineers found for <strong className="text-gray-600">{manager}</strong> in the uploaded Jira export.</p>
          {managers.length > 0 && (
            <p className="mt-2 text-xs">PM names in Excel: {managers.map((m: any) => m.manager).join(', ')}</p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {engineers.map((e: any) => (
            <PMEngineerRow key={e.engineerName} e={e} jiraBaseUrl={jiraBaseUrl} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Segment tree view (hierarchy: lead → managers → engineers → tickets) ─────

function normalizeForEngineerMatch(s: string): string {
  const base = s.includes('@') ? s.split('@')[0] : s;
  return base.toLowerCase().replace(/[.\s_-]/g, '');
}

function engineerMatch(jiraAssignee: string, canonicalName: string): boolean {
  const jv = normalizeForEngineerMatch(jiraAssignee);
  const cn = normalizeForEngineerMatch(canonicalName);
  if (jv === cn) return true;
  if (jv.startsWith(cn) || cn.startsWith(jv)) return true;

  // First-word match (e.g. "Arun Kandula" → canonical "Arun")
  const jvRaw = jiraAssignee.includes('@') ? jiraAssignee.split('@')[0] : jiraAssignee;
  const jvFirst = jvRaw.toLowerCase().split(/[\s.]/)[0];
  const cnFirst = canonicalName.toLowerCase().split(/\s/)[0];
  if (jvFirst.length > 2 && cnFirst.length > 2 && jvFirst === cnFirst) return true;

  // All canonical words appear anywhere in the jira assignee name.
  // Handles reversed/prefixed Indian names, e.g.:
  //   "kondameedi ganesh"      → "Ganesh Kondameedi"
  //   "Chinthala Ravi Hemanth" → "Ravi Hemanth"
  //   "Lakshmi Triveni Meena"  → "Meena Lakshmi Triveni"
  const cnWords = canonicalName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const jvLower = jiraAssignee.toLowerCase();
  if (cnWords.length > 0 && cnWords.every(w => jvLower.includes(w))) return true;

  return false;
}

function getEngineerJiraData(allJiraEngineers: any[], canonicalName: string) {
  const matches     = allJiraEngineers.filter(e => engineerMatch(e.engineerName, canonicalName));
  const tickets     = matches.flatMap(e => e.tickets ?? []);
  const totalTickets = tickets.length;
  const frBreaches  = tickets.filter((t: any) => t.frBreached).length;
  const resBreaches = tickets.filter((t: any) => t.resBreached).length;
  const openTickets = tickets.filter((t: any) => {
    const s = (t.status || '').toLowerCase();
    return !['done', 'resolved', 'closed', 'completed'].some(x => s.includes(x));
  }).length;
  const anyBreached   = tickets.filter((t: any) => t.frBreached || t.resBreached).length;
  const breachRate  = totalTickets > 0 ? Math.round((anyBreached / totalTickets) * 100) : 0;
  return { totalTickets, frBreaches, resBreaches, openTickets, breachRate, tickets };
}

function EngineerTreeRow({
  name,
  allJiraEngineers,
  jiraAvailable,
  jiraBaseUrl,
}: {
  name: string;
  allJiraEngineers: any[];
  jiraAvailable: boolean;
  jiraBaseUrl: string;
}) {
  const [openMode, setOpenMode] = useState<null | 'all' | 'fr' | 'res'>(null);
  const { totalTickets, frBreaches, resBreaches, openTickets, breachRate, tickets } = getEngineerJiraData(allJiraEngineers, name);
  const frTickets  = tickets.filter((t: any) => t.frBreached);
  const resTickets = tickets.filter((t: any) => t.resBreached);

  const toggle = (mode: 'all' | 'fr' | 'res') =>
    setOpenMode(prev => (prev === mode ? null : mode));

  return (
    <div>
      <div className="flex items-center gap-2 px-5 py-2.5 hover:bg-gray-50 transition-colors">
        {/* Avatar + name → click to see all tickets */}
        <button
          onClick={() => jiraAvailable && totalTickets > 0 && toggle('all')}
          className={`flex items-center gap-2 flex-1 min-w-0 text-left ${jiraAvailable && totalTickets > 0 ? 'cursor-pointer group' : 'cursor-default'}`}
        >
          <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {toInitials(name)}
          </div>
          <span className="font-medium text-sm text-gray-700 group-hover:text-indigo-600 transition-colors">{name}</span>
          {jiraAvailable && totalTickets > 0 && (
            <ChevronRight size={13} className={`text-gray-300 transition-transform flex-shrink-0 ${openMode === 'all' ? 'rotate-90' : ''}`} />
          )}
        </button>

        {jiraAvailable ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
              {totalTickets} total
            </span>
            {openTickets > 0 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                {openTickets} open
              </span>
            )}
            {frBreaches > 0 && (
              <button
                onClick={() => toggle('fr')}
                className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ring-1 transition-colors
                  ${openMode === 'fr'
                    ? 'bg-orange-500 text-white ring-orange-400'
                    : 'bg-orange-100 text-orange-700 ring-orange-200 hover:bg-orange-200'}`}
              >
                FR {frBreaches}
              </button>
            )}
            {resBreaches > 0 && (
              <button
                onClick={() => toggle('res')}
                className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ring-1 transition-colors
                  ${openMode === 'res'
                    ? 'bg-red-500 text-white ring-red-400'
                    : 'bg-red-100 text-red-700 ring-red-200 hover:bg-red-200'}`}
              >
                Res {resBreaches}
              </button>
            )}
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ring-1 whitespace-nowrap
              ${breachRate > 20 ? 'bg-red-100 text-red-700 ring-red-200'
                : breachRate > 0 ? 'bg-amber-100 text-amber-700 ring-amber-200'
                : 'bg-green-100 text-green-700 ring-green-200'}`}>
              {breachRate}% breach
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-300 italic">upload Excel to see tickets</span>
        )}
      </div>

      {/* All-tickets panel */}
      {openMode === 'all' && (
        tickets.length > 0
          ? <div className="border-t border-gray-100"><ExcelTicketTable tickets={tickets} jiraBaseUrl={jiraBaseUrl} /></div>
          : <div className="px-5 py-3 text-xs text-gray-400 border-t border-gray-50">No tickets found for {name} in the uploaded Excel.</div>
      )}

      {/* FR breach panel — retry / non-retry */}
      {openMode === 'fr' && frTickets.length > 0 && (
        <BreachedTicketSections tickets={frTickets} jiraBaseUrl={jiraBaseUrl} />
      )}

      {/* Res breach panel — retry / non-retry */}
      {openMode === 'res' && resTickets.length > 0 && (
        <BreachedTicketSections tickets={resTickets} jiraBaseUrl={jiraBaseUrl} />
      )}
    </div>
  );
}

function ManagerTreeCard({
  name,
  isLead,
  stat,
  engineers,
  allJiraEngineers,
  jiraAvailable,
  jiraBaseUrl,
  onViewProjects,
}: {
  name: string;
  isLead: boolean;
  stat: ManagerStat | null;
  engineers: string[];
  allJiraEngineers: any[];
  jiraAvailable: boolean;
  jiraBaseUrl: string;
  onViewProjects: () => void;
}) {
  const [expanded, setExpanded] = useState(isLead);

  return (
    <div className={isLead ? '' : 'ml-6 pl-4 border-l-2 border-gray-100'}>
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer select-none transition-colors
          ${isLead ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}
        onClick={() => setExpanded(e => !e)}
      >
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
          ${isLead ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
          {toInitials(name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold text-sm ${isLead ? 'text-white' : 'text-gray-900'}`}>{name}</span>
            {isLead && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">LEAD</span>}
          </div>
          <div className={`text-xs mt-0.5 ${isLead ? 'text-indigo-200' : 'text-gray-500'}`}>
            {stat ? (
              <>
                {stat.total} project{stat.total !== 1 ? 's' : ''}
                {stat.pctOnTime > 0 || stat.total > 0 ? (
                  <> · <span className={stat.pctOnTime >= 80 ? (isLead ? 'text-green-300' : 'text-green-600') : (isLead ? 'text-yellow-300' : 'text-yellow-600')}>
                    {stat.pctOnTime}% on time
                  </span></>
                ) : null}
                {stat.delayed > 0 && <> · <span className={isLead ? 'text-red-300' : 'text-red-500'}>{stat.delayed} delayed</span></>}
              </>
            ) : <span className="opacity-50">loading…</span>}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onViewProjects(); }}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border whitespace-nowrap flex-shrink-0 transition-colors
            ${isLead ? 'border-white/30 text-white hover:bg-white/10' : 'border-gray-200 text-gray-600 hover:bg-gray-100'}`}
        >
          Projects →
        </button>
        <span className={`text-xs flex-shrink-0 ${isLead ? 'text-indigo-200' : 'text-gray-400'}`}>{engineers.length} eng</span>
        <ChevronRight size={16} className={`flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''} ${isLead ? 'text-white/60' : 'text-gray-300'}`} />
      </div>

      {expanded && (
        <div className="mt-1.5 rounded-xl border border-gray-100 bg-white overflow-hidden">
          <div className="px-5 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-500 tracking-wide">ENGINEERS</span>
            <span className="text-xs text-gray-400">({engineers.length})</span>
          </div>
          <div className="divide-y divide-gray-50">
            {engineers.map(eng => (
              <EngineerTreeRow key={eng} name={eng} allJiraEngineers={allJiraEngineers} jiraAvailable={jiraAvailable} jiraBaseUrl={jiraBaseUrl} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SegmentTreeView({
  segment,
  getStatForManager,
  allJiraEngineers,
  jiraAvailable,
  jiraBaseUrl,
  onSelectManager,
}: {
  segment: Segment;
  getStatForManager: (name: string) => ManagerStat | null;
  allJiraEngineers: any[];
  jiraAvailable: boolean;
  jiraBaseUrl: string;
  onSelectManager: (name: string) => void;
}) {
  const hier = SEGMENT_HIERARCHY.find(h => h.label === segment);
  if (!hier) return null;

  return (
    <div className="space-y-3">
      <ManagerTreeCard
        name={hier.lead}
        isLead
        stat={getStatForManager(hier.lead)}
        engineers={ENGINEER_ASSIGNMENTS[hier.lead] ?? []}
        allJiraEngineers={allJiraEngineers}
        jiraAvailable={jiraAvailable}
        jiraBaseUrl={jiraBaseUrl}
        onViewProjects={() => onSelectManager(hier.lead)}
      />
      <div className="space-y-2 mt-1">
        {hier.managers.map(managerName => (
          <ManagerTreeCard
            key={managerName}
            name={managerName}
            isLead={false}
            stat={getStatForManager(managerName)}
            engineers={ENGINEER_ASSIGNMENTS[managerName] ?? []}
            allJiraEngineers={allJiraEngineers}
            jiraAvailable={jiraAvailable}
            jiraBaseUrl={jiraBaseUrl}
            onViewProjects={() => onSelectManager(managerName)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Manager stats table row ──────────────────────────────────────────────────

function ManagerRow({
  name,
  stat,
  isOthers,
  onSelect,
  isLead = false,
  isIndented = false,
}: {
  name: string;
  stat: ManagerStat | null;
  isOthers: boolean;
  onSelect: () => void;
  isLead?: boolean;
  isIndented?: boolean;
}) {
  const initials = isOthers ? 'OT' : toInitials(name);
  const loading = stat === null;

  return (
    <tr
      onClick={onSelect}
      className={`hover:bg-primary-50/40 cursor-pointer transition-colors group border-b border-gray-100 last:border-0 ${isLead ? 'bg-primary-50/30' : ''}`}
    >
      <td className={`px-5 py-3.5 ${isIndented ? 'pl-12' : ''}`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${isLead ? 'bg-primary-600 text-white' : 'bg-primary-100 text-primary-700 group-hover:bg-primary-200'}`}>
            {initials}
          </div>
          <span className={`text-gray-900 text-sm ${isLead ? 'font-bold' : 'font-medium'}`}>{name}</span>
          {isLead && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-600 text-white whitespace-nowrap tracking-wide">
              LEAD · ROLLED UP
            </span>
          )}
        </div>
      </td>

      <td className="px-5 py-3.5 text-center">
        {loading ? <Loader2 size={13} className="animate-spin text-gray-300 mx-auto" /> : (
          <span className="font-semibold text-gray-800">{stat.total}</span>
        )}
      </td>

      <td className="px-5 py-3.5 text-center">
        {loading ? '—' : (
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-50 text-green-700 font-semibold text-sm">
            {stat.onTime}
          </span>
        )}
      </td>

      <td className="px-5 py-3.5 text-center">
        {loading ? '—' : (
          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm ${stat.delayed > 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-400'}`}>
            {stat.delayed}
          </span>
        )}
      </td>

      <td className="px-5 py-3.5 text-center">
        {loading ? '—' : (
          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm ${stat.atRisk > 0 ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-50 text-gray-400'}`}>
            {stat.atRisk}
          </span>
        )}
      </td>

      <td className="px-5 py-3.5">
        {loading ? '—' : (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[60px]">
              <div
                className={`h-1.5 rounded-full transition-all ${stat.pctOnTime >= 80 ? 'bg-green-500' : stat.pctOnTime >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                style={{ width: `${stat.pctOnTime}%` }}
              />
            </div>
            <span className={`text-sm font-semibold w-10 text-right ${stat.pctOnTime >= 80 ? 'text-green-700' : stat.pctOnTime >= 50 ? 'text-yellow-700' : 'text-red-700'}`}>
              {stat.pctOnTime}%
            </span>
          </div>
        )}
      </td>

      <td className="px-5 py-3.5 text-center">
        {loading ? '—' : (
          stat.avgDelayDays > 0
            ? <span className="text-sm font-semibold text-red-600">{stat.avgDelayDays}d</span>
            : <span className="text-sm text-gray-400">—</span>
        )}
      </td>

      <td className="px-3 py-3.5 text-right">
        <ChevronRight size={16} className="text-gray-300 group-hover:text-primary-500 ml-auto transition-colors" />
      </td>
    </tr>
  );
}

// ─── Per-manager ticket accordion (one hook call per manager) ────────────────

function ManagerTicketAccordion({ name }: { name: string }) {
  const query = MANAGER_QUERY_NAMES[name] ?? name;
  const { data, isLoading } = useNtaSearch({ projectManager: query });
  const [isOpen, setIsOpen] = useState(false);
  const tickets: any[] = data?.data ?? [];

  const open   = tickets.filter((t: any) => (t.status?.category || '').toLowerCase() === 'todo').length;
  const inProg = tickets.filter((t: any) => (t.status?.category || '').toLowerCase() === 'in-progress').length;
  const done   = tickets.filter((t: any) => (t.status?.category || '').toLowerCase() === 'done').length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="font-medium text-sm text-gray-800">{name}</span>
        {isLoading ? (
          <Loader2 size={12} className="animate-spin text-gray-400" />
        ) : (
          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
            {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
          </span>
        )}
        {!isLoading && open > 0 && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{open} open</span>}
        {!isLoading && inProg > 0 && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{inProg} in progress</span>}
        {!isLoading && done > 0 && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{done} done</span>}
        <ChevronRight size={14} className={`ml-auto text-gray-400 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} />
      </button>
      {isOpen && !isLoading && tickets.length === 0 && (
        <div className="border-t border-gray-100 py-6 text-center text-sm text-gray-400">No tickets found for this manager.</div>
      )}
      {isOpen && tickets.length > 0 && <TicketTable tickets={tickets} />}
    </div>
  );
}

// ─── Jira Board Section (ENT / SMB tickets by manager) ───────────────────────

const STATUS_CAT_STYLE: Record<string, string> = {
  'todo':        'bg-gray-100 text-gray-600',
  'in-progress': 'bg-blue-100 text-blue-700',
  'done':        'bg-green-100 text-green-700',
};

const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high:   'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-gray-100 text-gray-500',
};

function TicketTable({ tickets }: { tickets: any[] }) {
  return (
    <div className="border-t border-gray-100 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-gray-500">
            <th className="px-4 py-2 text-left font-medium whitespace-nowrap">Key</th>
            <th className="px-3 py-2 text-left font-medium">Summary</th>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Customer</th>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Assignee</th>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Status</th>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Priority</th>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {tickets.map((t: any) => {
            const cat = (t.status?.category || 'todo').toLowerCase();
            const pri = (t.priority || 'low').toLowerCase();
            return (
              <tr key={t.id || t.key} className="hover:bg-indigo-50/30 transition-colors">
                <td className="px-4 py-2 whitespace-nowrap font-mono text-indigo-600">{t.key || '—'}</td>
                <td className="px-3 py-2 max-w-[260px] truncate text-gray-700" title={t.summary}>{t.summary}</td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{t.customerName || t.clientName || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{t.assignee?.displayName || t.assignee?.name || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${STATUS_CAT_STYLE[cat] || 'bg-gray-100 text-gray-600'}`}>
                    {t.status?.name || cat}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`px-1.5 py-0.5 rounded font-medium capitalize ${PRIORITY_STYLE[pri] || 'bg-gray-100 text-gray-500'}`}>
                    {pri}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                  {t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NtaBoardSection({ segment }: { segment: Segment }) {
  const managers = SEGMENT_CONFIG.find((s) => s.label === segment)?.managers ?? [];

  return (
    <div className="mt-6 space-y-3">
      <span className="text-sm font-semibold text-gray-700">Tickets — {segment} Board</span>
      <div className="space-y-2">
        {managers.map((name) => (
          <ManagerTicketAccordion key={name} name={name} />
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ManagerDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('ENT');
  const [selectedManager, setSelectedManager] = useState<string | null>(null);
  const activeSegment = activeTab as Segment;
  const queryClient = useQueryClient();

  const { data: ntaConfigData, isLoading: ntaConfigLoading } = useNtaEnabled();
  const ntaApiKeyPresent: boolean = ntaConfigData?.data?.configured ?? ntaConfigData?.configured ?? false;
  const ntaEnabled: boolean = ntaApiKeyPresent && (ntaConfigData?.data?.enabled ?? ntaConfigData?.enabled ?? true);
  const ntaToggle = useNtaToggle();

  const { data: statsData, isLoading: statsLoading } = useManagerGoalsWithStats();
  const allStats: ManagerStat[] = useMemo(() => {
    const raw: any[] = statsData?.data ?? [];
    return raw;
  }, [statsData]);

  const { data: jiraEngineersData } = useJiraEngineers();
  const allJiraEngineers: any[] = jiraEngineersData?.data?.engineers ?? [];
  const jiraAvailable: boolean = allJiraEngineers.length > 0;
  const jiraBaseUrl: string = jiraEngineersData?.jiraBaseUrl ?? 'https://cf2020.atlassian.net';

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
      </div>
    );
  }

  if (user?.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-lg font-semibold text-gray-700">Access Denied</p>
        <p className="text-sm text-gray-400">This page is only accessible to administrators.</p>
      </div>
    );
  }

  const currentSegment = SEGMENT_CONFIG.find((s) => s.label === activeSegment);

  // Build per-manager stat lookup
  const getStatForManager = (name: string): ManagerStat | null => {
    if (statsLoading) return null;
    return allStats.find((s) => s.manager.toLowerCase() === name.toLowerCase()) ?? {
      manager: name, total: 0, active: 0, inactive: 0, completed: 0,
      delayed: 0, atRisk: 0, onTime: 0, pctOnTime: 0, avgDelayDays: 0,
      achievedPct: 0, goalPct: 80, variance: -80,
    };
  };

  // "Others" = aggregate of all managers NOT in NAMED_MANAGER_SET
  const EMPTY_STAT: ManagerStat = { manager: 'Others', total: 0, active: 0, inactive: 0, completed: 0, delayed: 0, atRisk: 0, onTime: 0, pctOnTime: 0, avgDelayDays: 0, achievedPct: 0, goalPct: 80, variance: -80 };

  const othersStats: ManagerStat | null = useMemo(() => {
    if (statsLoading) return null;
    const others = allStats.filter((s) => !NAMED_MANAGER_SET.has(s.manager));
    if (others.length === 0) return { ...EMPTY_STAT, manager: 'Others' };
    const s = sumStats(others);
    return { ...EMPTY_STAT, manager: 'Others', ...s };
  }, [allStats, statsLoading]);

  // Resolve stat for selected manager (used in detail view)
  const selectedStat = useMemo(() => {
    if (!selectedManager) return null;
    if (selectedManager === 'Others') return othersStats;
    return getStatForManager(selectedManager);
  }, [selectedManager, allStats, othersStats]);

  // If a manager is selected, show the detail view instead of the table
  if (selectedManager !== null && selectedStat !== null) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Project health overview by business segment and manager</p>
        </div>
        <ManagerDetailView
          stat={selectedStat}
          isOthers={selectedManager === 'Others'}
          onBack={() => setSelectedManager(null)}
          jiraBaseUrl={jiraBaseUrl}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Project health overview by business segment and manager</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {(['ENT', 'SMB', ...(ntaEnabled ? ['ENGINEERS', 'TICKETS'] as ActiveTab[] : []), 'OBSERVATIONS'] as ActiveTab[]).map((tab) => {
          const labels: Record<ActiveTab, string> = {
            ENT: 'ENT', SMB: 'SMB', ENGINEERS: 'Engineers',
            OBSERVATIONS: 'Observations', TICKETS: 'Tickets',
          };
          return (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSelectedManager(null); }}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition -mb-px whitespace-nowrap ${
                activeTab === tab
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* Banners */}
      <div className="space-y-2">
        <ExcelUploadBanner />
        <NtaConnectBanner />
        {/* Neutara Link / Unlink card — only visible to admin and only when API key is present in .env */}
        {!ntaConfigLoading && ntaApiKeyPresent && (
          <div className={`rounded-xl border p-3 flex items-center justify-between gap-4 ${ntaEnabled ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center gap-2.5">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ntaEnabled ? 'bg-indigo-500' : 'bg-gray-400'}`} />
              <div>
                <p className="text-sm font-semibold text-gray-800">Neutara Ticketing</p>
                <p className="text-xs text-gray-500">{ntaEnabled ? 'Linked — Tickets, Engineers & NTA sections are active' : 'Unlinked — Tickets, Engineers & NTA sections are hidden'}</p>
              </div>
            </div>
            <button
              disabled={ntaToggle.isPending}
              onClick={() => ntaToggle.mutate(!ntaEnabled)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-lg border transition whitespace-nowrap disabled:opacity-60 ${
                ntaEnabled
                  ? 'border-red-300 text-red-600 bg-white hover:bg-red-50'
                  : 'border-indigo-400 text-indigo-700 bg-white hover:bg-indigo-50'
              }`}
            >
              {ntaToggle.isPending ? 'Saving…' : ntaEnabled ? 'Unlink' : 'Link'}
            </button>
          </div>
        )}
      </div>

      {/* Observations tab */}
      {activeTab === 'OBSERVATIONS' && <ObservationsView />}

      {/* Tickets tab — only when NTA is linked */}
      {ntaEnabled && activeTab === 'TICKETS' && <TicketsView />}

      {/* Engineers tab — only when NTA is linked */}
      {ntaEnabled && activeTab === 'ENGINEERS' && <EngineersView />}

      {/* Segment tree view (ENT / SMB) */}
      {activeTab !== 'OBSERVATIONS' && activeTab !== 'TICKETS' && activeTab !== 'ENGINEERS' && (
        statsLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
          </div>
        ) : (
          <SegmentTreeView
            segment={activeSegment}
            getStatForManager={getStatForManager}
            allJiraEngineers={allJiraEngineers}
            jiraAvailable={jiraAvailable}
            jiraBaseUrl={jiraBaseUrl}
            onSelectManager={setSelectedManager}
          />
        )
      )}

      {/* NTA Tickets by Manager (ENT / SMB) — only when NTA is linked */}
      {ntaEnabled && (activeTab === 'ENT' || activeTab === 'SMB') && (
        <NtaBoardSection segment={activeSegment} />
      )}
    </div>
  );
}


// ─── Engineers tab ────────────────────────────────────────────────────────────

const ALL_MANAGERS = SEGMENT_CONFIG.flatMap((s) => s.managers).flatMap((m) =>
  (MANAGER_QUERY_NAMES[m] ?? m).split(',').map((n) => n.trim())
);

function EngineersView() {
  const { data, isLoading, isError } = useNtaByManagers(ALL_MANAGERS);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const allTickets: any[] = data?.data ?? [];

  // Group by assignee
  const grouped: Record<string, any[]> = {};
  for (const t of allTickets) {
    const name = t.assignee?.displayName || t.assignee?.name || 'Unassigned';
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push(t);
  }

  const engineers = Object.entries(grouped)
    .map(([name, tickets]) => ({ name, tickets }))
    .sort((a, b) => b.tickets.length - a.tickets.length)
    .filter(({ name }) => !search || name.toLowerCase().includes(search.toLowerCase()));

  const totalTickets = allTickets.length;

  function toggle(name: string) {
    const next = new Set(expanded);
    if (next.has(name)) next.delete(name); else next.add(name);
    setExpanded(next);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-indigo-500" size={28} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertCircle size={16} />
        Could not reach the ticketing service. Check NTA_API_KEY in backend/.env.
      </div>
    );
  }

  if (allTickets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
        <p className="font-medium text-gray-500 mb-1">No tickets found</p>
        <p>No tickets were found for the configured managers.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-indigo-50 rounded-xl p-4 border border-white">
          <div className="text-2xl font-bold text-indigo-700">{Object.keys(grouped).length}</div>
          <div className="text-xs text-indigo-500 mt-0.5">Assignees</div>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-white">
          <div className="text-2xl font-bold text-blue-700">{totalTickets}</div>
          <div className="text-xs text-blue-500 mt-0.5">Total Tickets</div>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-white">
          <div className="text-2xl font-bold text-green-700">
            {allTickets.filter((t: any) => (t.status?.category || '').toLowerCase() === 'done').length}
          </div>
          <div className="text-xs text-green-500 mt-0.5">Done</div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <Search size={14} className="text-gray-400 shrink-0" />
        <input
          type="text"
          placeholder="Search assignee…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      {/* Engineer list */}
      <div className="space-y-2">
        {engineers.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">No assignees match your search.</div>
        ) : engineers.map(({ name, tickets }) => {
          const isOpen = expanded.has(name);
          const open   = tickets.filter((t: any) => (t.status?.category || '').toLowerCase() === 'todo').length;
          const inProg = tickets.filter((t: any) => (t.status?.category || '').toLowerCase() === 'in-progress').length;
          const done   = tickets.filter((t: any) => (t.status?.category || '').toLowerCase() === 'done').length;
          return (
            <div key={name} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <button
                onClick={() => toggle(name)}
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {name.split(' ').map((w: string) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2)}
                </div>
                <span className="font-medium text-sm text-gray-800">{name}</span>
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                  {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
                </span>
                {open > 0 && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{open} open</span>}
                {inProg > 0 && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{inProg} in progress</span>}
                {done > 0 && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{done} done</span>}
                <ChevronRight size={14} className={`ml-auto text-gray-400 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} />
              </button>
              {isOpen && <TicketTable tickets={tickets} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Observations tab ─────────────────────────────────────────────────────────

const JIRA_BASE = 'https://cf2020.atlassian.net/browse';

interface ObservedPattern {
  id: number;
  ticket: string;
  title: string;
  type: string;
  typeBg: string;
  typeText: string;
  engineer: string;
  timeline: { date: string; event: string; highlight?: boolean }[];
  gap: string;
  observation: string;
  impact: string;
}

const OBSERVED_PATTERNS: ObservedPattern[] = [
  {
    id: 1,
    ticket: 'CFITS-5187',
    title: 'MEDC — Need to Check user not present in clouds',
    type: 'Delayed CFITS Closure',
    typeBg: 'bg-orange-100', typeText: 'text-orange-700',
    engineer: 'kondameedi ganesh',
    timeline: [
      { date: 'Apr 15, 2026', event: 'Developer closed the L2 ticket' },
      { date: 'Apr 21, 2026', event: 'CFITS (customer) ticket finally closed', highlight: true },
    ],
    gap: '6-day gap',
    observation: 'The engineer resolved the underlying L2 ticket on April 15th but the customer-facing CFITS ticket was left open for 6 days with no action. The CFITS ticket was only closed on April 21st.',
    impact: 'Customer ticket stayed open 6 days after the issue was resolved — misleading SLA metrics and poor customer experience.',
  },
  {
    id: 2,
    ticket: 'CFITS-3819',
    title: 'Tunnel to Towers — Need to retry the File Conflicts',
    type: 'Extended Delay + Multiple Reminders',
    typeBg: 'bg-red-100', typeText: 'text-red-700',
    engineer: 'kondameedi ganesh',
    timeline: [
      { date: 'Mar 6, 2026',  event: 'Developer closed the L2 ticket' },
      { date: 'Apr 21, 2026', event: 'CFITS ticket closed after multiple reminders', highlight: true },
    ],
    gap: '~46-day gap',
    observation: 'The L2 ticket was marked resolved on March 6th. The corresponding CFITS ticket was not closed until April 21st and required repeated follow-ups from the manager.',
    impact: 'Over 6 weeks of open customer ticket after resolution — significantly impacts SLA metrics and reporting accuracy.',
  },
  {
    id: 3,
    ticket: 'CFITS-5438',
    title: 'Estee Lauder — File Conflicts',
    type: 'Reminder Required',
    typeBg: 'bg-yellow-100', typeText: 'text-yellow-700',
    engineer: 'saikumar kustapuram',
    timeline: [
      { date: 'Apr 16, 2026', event: 'Developer closed their ticket (WAITING FOR L2 → RESOLVED)' },
      { date: 'Apr 19, 2026', event: 'CFITS ticket closed — only after a reminder', highlight: true },
    ],
    gap: '3-day gap',
    observation: 'The developer resolved their ticket on April 16th but the CFITS ticket was not updated. A reminder had to be sent before the customer ticket was closed on April 19th.',
    impact: 'Process relies on reminders rather than proactive ticket hygiene — creates unnecessary overhead for managers.',
  },
  {
    id: 4,
    ticket: 'L2B-369',
    title: 'CEG Solutions — Issues with the Hyperlinks',
    type: 'Missing Notes After Closure',
    typeBg: 'bg-purple-100', typeText: 'text-purple-700',
    engineer: 'Rehan Khan',
    timeline: [
      { date: 'Feb 23, 2026', event: 'Developer closed the ticket' },
      { date: 'Feb 27, 2026', event: 'Fix description & root cause added — only after being explicitly asked', highlight: true },
    ],
    gap: '4-day gap',
    observation: 'Rehan Khan closed the L2 ticket on February 23rd without adding fix description, root cause, or resolution notes. These were only added on February 27th after being specifically asked to update the ticket.',
    impact: 'Tickets closed without resolution notes make audits, retrospectives, and pattern analysis impossible.',
  },
  {
    id: 5,
    ticket: 'L2B-14721',
    title: 'Legal Soft — Google Sheets migrated with XLXS extension',
    type: 'PM Delayed Data Provision',
    typeBg: 'bg-sky-100', typeText: 'text-sky-700',
    engineer: 'Lakshmi Prasanna (PM)',
    timeline: [
      { date: 'Jun 23, 2026', event: 'Developer (Mayank) asked for the count of affected files' },
      { date: 'Jun 29, 2026', event: 'PM finally provided the list of 1,578 affected files', highlight: true },
    ],
    gap: '6-day delay',
    observation: 'PM Lakshmi Prasanna did not respond to the developer\'s request for data for 6 days. The developer was blocked waiting for information needed to proceed with the migration.',
    impact: 'Engineers blocked for 6 days — migration work for 1,578 files stalled while waiting for PM to provide the data.',
  },
  {
    id: 6,
    ticket: 'L2B-14324',
    title: 'Ticket Moved to Developer Board Without Intimation',
    type: 'Improper Handoff',
    typeBg: 'bg-rose-100', typeText: 'text-rose-700',
    engineer: 'Manoj',
    timeline: [
      { date: 'Jun 16, 2026', event: 'Developers updated the ticket with latest progress' },
      { date: 'Jun 17, 2026', event: 'Manoj moved the ticket to Developer board — no intimation, nothing pending from developers\' end', highlight: true },
    ],
    gap: '1-day turnaround, no context',
    observation: 'Manoj directly moved the ticket to the Developer\'s board without any intimation, comment, or justification. There was nothing pending from the developers\' end, making the handoff invalid. No context was shared about why the ticket was escalated or what action was expected.',
    impact: 'Developers received an unexpected ticket with no context and no pending action item — wasted investigation time and created confusion about ticket ownership.',
  },
  {
    id: 7,
    ticket: 'L2B-12946',
    title: 'Premature Closure Request Before Resolution Confirmed',
    type: 'Premature Closure Request',
    typeBg: 'bg-fuchsia-100', typeText: 'text-fuchsia-700',
    engineer: 'Harshith Kaduluri / Adari Venkata Jaswanth',
    timeline: [
      { date: 'May 8, 2026 – 08:34', event: 'Adari Venkata Jaswanth: "The files are moving — please monitor"' },
      { date: 'May 8, 2026 – 18:16', event: 'Harshith Kaduluri asked team to close the ticket', highlight: true },
    ],
    gap: 'Same day — issue still open',
    observation: 'At 08:34, Adari confirmed files were still moving and asked the team to monitor. At 18:16, Harshith asked @srinu gudimitla and @Adari Venkata Jaswanth to close the ticket — even though active monitoring was still in progress.',
    impact: 'Premature closure hides unresolved issues from SLA tracking and gives a false sense of completion to customers and management.',
  },
];

const OBS_ICONS: Record<string, string> = {
  'Delayed CFITS Closure': '⏱',
  'Extended Delay + Multiple Reminders': '🔁',
  'Reminder Required': '📣',
  'Missing Notes After Closure': '📝',
  'PM Delayed Data Provision': '🚧',
  'Improper Handoff': '🔀',
  'Premature Closure Request': '⛔',
};

// ─── Tickets View (NTA) ───────────────────────────────────────────────────────

// Multi-select dropdown for the Assignee/Reporter/Project Manager column filters
// — replaces free-text entry so managers can pick one or several real people
// off a real list instead of guessing spellings, to track tickets per-person.
function PeopleMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: { name: string; count: number }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 240 });

  useEffect(() => {
    if (!open) return;
    const updatePos = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setCoords({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 240) });
    };
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (btnRef.current && !btnRef.current.contains(target) && !target.closest('[data-assignee-panel]')) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [open]);

  const filtered = options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()));
  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);

  const label = selected.length === 0 ? 'All' : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        className="w-full mt-1 flex items-center justify-between gap-1 px-2 py-1 text-xs border border-gray-200 rounded-md bg-white hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"
      >
        <span className={`truncate ${selected.length ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>{label}</span>
        <ChevronRight size={11} className={`flex-none text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open &&
        createPortal(
          <div
            data-assignee-panel
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg"
            style={{ top: coords.top, left: coords.left, width: coords.width }}
          >
            <div className="p-2 border-b border-gray-100">
              <input
                autoFocus
                placeholder="Search assignee…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-400"
              />
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-400">No matches</p>
              ) : (
                filtered.map((o) => (
                  <label key={o.name} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.includes(o.name)}
                      onChange={() => toggle(o.name)}
                      className="accent-primary-600"
                    />
                    <span className="flex-1 truncate">{o.name}</span>
                    <span className="text-gray-400">{o.count}</span>
                  </label>
                ))
              )}
            </div>
            {selected.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
                <button type="button" onClick={() => onChange([])} className="text-xs text-red-500 hover:text-red-700">
                  Clear
                </button>
                <span className="text-xs text-gray-400">{selected.length} selected</span>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

function TicketsView() {
  const [spaceFilter, setSpaceFilter] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  // Column filters
  const [fKey,      setFKey]      = useState('');
  const [fSummary,  setFSummary]  = useState('');
  const [fStatus,   setFStatus]   = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fCustomer, setFCustomer] = useState('');
  const [assigneeSelection, setAssigneeSelection] = useState<string[]>([]);
  const fAssignee = assigneeSelection.join(',');
  const [reporterSelection, setReporterSelection] = useState<string[]>([]);
  const fReporter = reporterSelection.join(',');
  const [pmSelection, setPmSelection] = useState<string[]>([]);
  const fProjectManager = pmSelection.join(',');
  const [deptSelection, setDeptSelection] = useState<string[]>([]);
  const fDept = deptSelection.join(',');

  // Week / Month view + date range
  const [groupView, setGroupView] = useState<'all' | 'week' | 'month'>('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo,   setCreatedTo]   = useState('');

  // Board filter only works via the cached full-index search — the external
  // ticketing API ignores a `spaces` query param on the paginated /issues endpoint.
  const hasAnyColFilter = !!(fKey || fSummary || fStatus || fPriority || fCustomer || fAssignee || fReporter || fProjectManager || fDept || createdFrom || createdTo || spaceFilter);

  // <input type="date"> gives a bare "YYYY-MM-DD" with no timezone. Parsing that
  // directly as UTC (new Date("2026-07-07")) cuts the day off 5.5h early/late for
  // IST users — a ticket created in the early hours of "the next day" locally can
  // still fall inside that UTC window. Resolving the boundary in the browser's own
  // local timezone first (then converting to ISO) keeps "July 7" meaning July 7 here.
  const createdFromISO = createdFrom ? new Date(`${createdFrom}T00:00:00`).toISOString() : undefined;
  const createdToISO = createdTo ? new Date(`${createdTo}T23:59:59.999`).toISOString() : undefined;

  const { data: statsData } = useNtaStats();
  const { data: spacesData } = useNtaSpaces();
  const { data: assigneesData } = useNtaAssignees();
  const assigneeOptions: { name: string; count: number }[] = assigneesData?.data || [];
  const { data: reportersData } = useNtaReporters();
  const reporterOptions: { name: string; count: number }[] = reportersData?.data || [];
  const { data: pmsData } = useNtaProjectManagers();
  const pmOptions: { name: string; count: number }[] = pmsData?.data || [];
  const { data: deptsData } = useNtaDepartments();
  const deptOptions: { name: string; count: number }[] = deptsData?.data || [];
  const { data: trendsData, isLoading: trendsLoading } = useNtaTrends({
    groupBy: groupView === 'month' ? 'month' : 'week',
    createdFrom: createdFromISO,
    createdTo: createdToISO,
    spaces: spaceFilter || undefined,
    reporter: fReporter || undefined,
    projectManager: fProjectManager || undefined,
    department: fDept || undefined,
    status: fStatus || undefined,
    priority: fPriority || undefined,
    customer: fCustomer || undefined,
    assignee: fAssignee || undefined,
    key: fKey || undefined,
    summary: fSummary || undefined,
    enabled: groupView !== 'all',
  });

  // Paginated mode (no column filters active)
  const { data: issuesData, isLoading: issuesLoading, isError: issuesError } = useNtaIssues({
    page,
    limit: LIMIT,
    spaces: spaceFilter || undefined,
  });

  // Global search mode (any column filter active — searches all tickets, backend-cached)
  const searchFilters = { key: fKey, summary: fSummary, status: fStatus, priority: fPriority,
    customer: fCustomer, assignee: fAssignee, reporter: fReporter, projectManager: fProjectManager,
    department: fDept, spaces: spaceFilter || undefined,
    createdFrom: createdFromISO, createdTo: createdToISO };
  const { data: searchData, isLoading: searchLoading, isFetching: searchFetching } = useNtaSearch(searchFilters);

  const stats  = statsData?.data  || statsData  || {};
  const rawSpaces = spacesData?.data ?? spacesData;
  const spaces: any[] = Array.isArray(rawSpaces) ? rawSpaces : [];

  const isLoading = hasAnyColFilter ? searchLoading : issuesLoading;
  const isError   = hasAnyColFilter ? false         : issuesError;

  // In search mode, paginate client-side over the full matched set (already
  // fetched in one shot) — rendering thousands of rows at once made the tab
  // feel frozen. In page mode, the server already returns just one page.
  const byNewest = (a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  const allMatches: any[] = (searchData?.data || []).slice().sort(byNewest);
  const displayTickets: any[] = hasAnyColFilter
    ? allMatches.slice((page - 1) * LIMIT, page * LIMIT)
    : (issuesData?.data || []).slice().sort(byNewest);
  const total: number = hasAnyColFilter
    ? (searchData?.total ?? 0)
    : (issuesData?.total ?? 0);
  const totalPages: number = hasAnyColFilter
    ? Math.max(1, Math.ceil((searchData?.total ?? 0) / LIMIT))
    : (issuesData?.totalPages ?? 1);

  const lc = (v: string) => (v || '').toLowerCase();

  const kpis = [
    { label: 'Total Tickets', value: stats.totalTickets ?? '—',                                                                                   bg: 'bg-gray-50',   text: 'text-gray-700'   },
    { label: 'Open',          value: displayTickets.filter((t) => t.status?.category === 'todo').length,                                          bg: 'bg-sky-50',    text: 'text-sky-700'    },
    { label: 'In Progress',   value: displayTickets.filter((t) => t.status?.category === 'in-progress').length,                                   bg: 'bg-blue-50',   text: 'text-blue-700'   },
    { label: 'Done',          value: displayTickets.filter((t) => t.status?.category === 'done').length,                                          bg: 'bg-green-50',  text: 'text-green-700'  },
    { label: 'High / Urgent', value: displayTickets.filter((t) => ['high','urgent'].includes(lc(t.priority))).length,                             bg: 'bg-red-50',    text: 'text-red-700'    },
    { label: 'Total Boards',  value: stats.totalBoards ?? spaces.length,                                                                          bg: 'bg-purple-50', text: 'text-purple-700' },
  ];

  const inputCls = 'w-full mt-1 px-2 py-1 text-xs border border-gray-200 rounded-md text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white font-normal';
  const selectCls = inputCls + ' cursor-pointer';

  function clearFilters() {
    setFKey(''); setFSummary(''); setFStatus(''); setFPriority('');
    setFCustomer(''); setAssigneeSelection([]); setReporterSelection([]); setPmSelection([]); setDeptSelection([]);
    setCreatedFrom(''); setCreatedTo(''); setPage(1);
  }

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={`${k.bg} rounded-xl px-4 py-3`}>
            <p className={`text-2xl font-bold ${k.text}`}>{typeof k.value === 'number' ? k.value.toLocaleString() : k.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Week / Month view + date range */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex bg-gray-50 border border-gray-200 rounded-lg p-0.5 gap-0.5">
          {(['all', 'week', 'month'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setGroupView(v)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md transition ${
                groupView === v ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {v === 'all' ? 'All' : v === 'week' ? 'Week-on-Week' : 'Month-on-Month'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <label>From</label>
          <input
            type="date"
            value={createdFrom}
            onChange={(e) => { setCreatedFrom(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
          <span className="text-gray-300">→</span>
          <label>To</label>
          <input
            type="date"
            value={createdTo}
            onChange={(e) => { setCreatedTo(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
          {(createdFrom || createdTo) && (
            <button
              onClick={() => { setCreatedFrom(''); setCreatedTo(''); setPage(1); }}
              className="text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-2 py-1.5 hover:bg-red-50 transition"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      {/* Week/Month trend chart */}
      {groupView !== 'all' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          {trendsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : (() => {
            const buckets: any[] = trendsData?.data || [];
            if (!buckets.length) {
              return <div className="text-center py-10 text-sm text-gray-400">No tickets found for this range</div>;
            }
            const maxTotal = Math.max(...buckets.map((b) => b.total), 1);
            // Fixed bar width + horizontal scroll — squeezing every bucket into the
            // panel's width (as many as 60+ weeks with no date range set) crushed
            // every label into an unreadable pile. A wide chart you scroll beats a
            // narrow one you can't read.
            const COL_W = groupView === 'month' ? 72 : 56;
            return (
              <div className="overflow-x-auto -mx-1 px-1 pb-1">
                <div
                  className="grid gap-2 items-end"
                  style={{ gridTemplateColumns: `repeat(${buckets.length}, ${COL_W}px)`, height: 170, width: buckets.length * (COL_W + 8) }}
                >
                  {buckets.map((b) => {
                    const stackHeight = Math.round((b.total / maxTotal) * 120);
                    const donePct = b.total ? (b.done / b.total) * 100 : 0;
                    const inProgPct = b.total ? (b.inProgress / b.total) * 100 : 0;
                    const todoPct = b.total ? (b.todo / b.total) * 100 : 0;
                    // Weekly labels are a full "Mon D – Mon D" range — too wide for a
                    // 56px column. Show just the week's start date; full range is a title tooltip.
                    const shortLabel = groupView === 'week' ? b.label.split(' – ')[0] : b.label;
                    return (
                      <div key={b.key} className="flex flex-col items-center justify-end h-full gap-1.5" title={b.label}>
                        <p className="text-xs font-bold text-gray-700 whitespace-nowrap">{b.total.toLocaleString()}</p>
                        <div
                          className="w-full max-w-[36px] rounded-t-md rounded-b-sm overflow-hidden flex flex-col-reverse bg-gray-100"
                          style={{ height: stackHeight }}
                        >
                          <div className="w-full bg-green-600" style={{ height: `${donePct}%` }} />
                          <div className="w-full bg-blue-600" style={{ height: `${inProgPct}%` }} />
                          <div className="w-full bg-gray-400" style={{ height: `${todoPct}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-400 text-center leading-tight whitespace-nowrap">{shortLabel}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Board filter + controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">Board:</label>
          <select
            value={spaceFilter}
            onChange={(e) => { setSpaceFilter(e.target.value); setPage(1); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-300"
          >
            <option value="">All Boards</option>
            {spaces.map((s: any) => (
              <option key={s.key || s.id} value={s.key || s.name}>{s.name}</option>
            ))}
          </select>
        </div>

        {hasAnyColFilter && (
          <button onClick={clearFilters}
            className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition"
          >
            Clear filters
          </button>
        )}

        <span className="text-xs text-gray-400 ml-auto flex items-center gap-1.5">
          {hasAnyColFilter && searchFetching && !searchLoading && (
            <Loader2 size={12} className="animate-spin text-primary-400" />
          )}
          {hasAnyColFilter
            ? `${total.toLocaleString()} match${total !== 1 ? 'es' : ''} across all tickets · page ${page}/${totalPages}`
            : `${total.toLocaleString()} total · page ${page}/${totalPages}`
          }
        </span>
      </div>

      {/* Search mode notice */}
      {hasAnyColFilter && (
        <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          <span className="font-medium">Searching all tickets</span>
          <span className="text-blue-500">·</span>
          <span>Results load from a full index of all {(stats.totalTickets || 0).toLocaleString()} tickets (cached for 10 min). First search may take a few seconds.</span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
            {hasAnyColFilter && (
              <p className="text-sm text-gray-500">Building search index… this takes a few seconds on first use.</p>
            )}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <AlertCircle size={28} className="text-red-400" />
            <p className="text-sm font-medium text-red-600">Neutara Ticketing is not responding</p>
            <p className="text-xs text-gray-400 text-center max-w-sm">
              The ticketing service at neutaraticketing.cftools.live is currently unreachable.
              Check that the service is running and the API key is valid, then refresh the page.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1b4f72] text-white text-xs font-semibold">
                  <th className="px-3 py-2.5 text-left min-w-[80px]">Key</th>
                  <th className="px-3 py-2.5 text-left min-w-[220px]">Summary</th>
                  <th className="px-3 py-2.5 text-left min-w-[110px]">Status</th>
                  <th className="px-3 py-2.5 text-left min-w-[100px]">Priority</th>
                  <th className="px-3 py-2.5 text-left min-w-[120px]">Customer</th>
                  <th className="px-3 py-2.5 text-left min-w-[130px]">Assignee</th>
                  <th className="px-3 py-2.5 text-left min-w-[130px]">Reporter</th>
                  <th className="px-3 py-2.5 text-left min-w-[140px]">Project Manager</th>
                  <th className="px-3 py-2.5 text-left min-w-[140px]">Department</th>
                  <th className="px-3 py-2.5 text-left min-w-[130px]">Created</th>
                </tr>
                {/* Column filter row */}
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 font-normal">
                    <input className={inputCls} placeholder="Key…" value={fKey} onChange={(e) => { setFKey(e.target.value); setPage(1); }} />
                  </th>
                  <th className="px-3 py-2 font-normal">
                    <input className={inputCls} placeholder="Search summary…" value={fSummary} onChange={(e) => { setFSummary(e.target.value); setPage(1); }} />
                  </th>
                  <th className="px-3 py-2 font-normal">
                    <select className={selectCls} value={fStatus} onChange={(e) => { setFStatus(e.target.value); setPage(1); }}>
                      <option value="">All</option>
                      <option value="todo">To Do</option>
                      <option value="in-progress">In Progress</option>
                      <option value="done">Done</option>
                      <optgroup label="Waiting / Pending">
                        <option value="Waiting for L1">Waiting for L1</option>
                        <option value="Waiting for L2">Waiting for L2</option>
                        <option value="Waiting for L3">Waiting for L3</option>
                        <option value="Pending with L1">Pending with L1</option>
                        <option value="Pending with L2">Pending with L2</option>
                        <option value="Pending with L3">Pending with L3</option>
                        <option value="Pending with L2 Bug">Pending with L2 Bug</option>
                        <option value="Pending with L3 Bug">Pending with L3 Bug</option>
                        <option value="Pending with Infra">Pending with Infra</option>
                        <option value="Pending with QA">Pending with QA</option>
                        <option value="Pending with Migration">Pending with Migration</option>
                        <option value="Pending with dev">Pending with Dev</option>
                        <option value="Waiting for Migration Team">Waiting for Migration Team</option>
                        <option value="Waiting for Dev">Waiting for Dev</option>
                        <option value="Waiting for Customer">Waiting for Customer</option>
                        <option value="Waiting for Pre-Sales">Waiting for Pre-Sales</option>
                      </optgroup>
                    </select>
                  </th>
                  <th className="px-3 py-2 font-normal">
                    <select className={selectCls} value={fPriority} onChange={(e) => { setFPriority(e.target.value); setPage(1); }}>
                      <option value="">All</option>
                      <option value="urgent">Urgent</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </th>
                  <th className="px-3 py-2 font-normal">
                    <input className={inputCls} placeholder="Customer…" value={fCustomer} onChange={(e) => { setFCustomer(e.target.value); setPage(1); }} />
                  </th>
                  <th className="px-3 py-2 font-normal">
                    <PeopleMultiSelect
                      options={assigneeOptions}
                      selected={assigneeSelection}
                      onChange={(next) => { setAssigneeSelection(next); setPage(1); }}
                    />
                  </th>
                  <th className="px-3 py-2 font-normal">
                    <PeopleMultiSelect
                      options={reporterOptions}
                      selected={reporterSelection}
                      onChange={(next) => { setReporterSelection(next); setPage(1); }}
                    />
                  </th>
                  <th className="px-3 py-2 font-normal">
                    <PeopleMultiSelect
                      options={pmOptions}
                      selected={pmSelection}
                      onChange={(next) => { setPmSelection(next); setPage(1); }}
                    />
                  </th>
                  <th className="px-3 py-2 font-normal">
                    <PeopleMultiSelect
                      options={deptOptions}
                      selected={deptSelection}
                      onChange={(next) => { setDeptSelection(next); setPage(1); }}
                    />
                  </th>
                  <th className="px-3 py-2 font-normal">
                    <input type="date" className={inputCls} value={createdFrom} onChange={(e) => { setCreatedFrom(e.target.value); setPage(1); }} title="Created from" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayTickets.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-gray-400 text-sm">
                      {hasAnyColFilter ? 'No tickets match your filters' : 'No tickets found'}
                    </td>
                  </tr>
                ) : displayTickets.map((t: any) => {
                  const cat = lc(t.status?.category || 'todo');
                  const pri = lc(t.priority || 'low');
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-xs text-primary-700 whitespace-nowrap">{t.key}</td>
                      <td className="px-3 py-2.5 max-w-xs">
                        <p className="truncate text-sm text-gray-800" title={t.summary}>{t.summary}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CAT_STYLE[cat] || 'bg-gray-100 text-gray-600'}`}>
                          {t.status?.name || cat}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${PRIORITY_STYLE[pri] || 'bg-gray-100 text-gray-500'}`}>
                          {pri}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">{t.customerName || t.clientName || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">{t.assignee?.displayName || t.assignee?.name || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{t.reporter?.displayName || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{t.projectManager || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{t.current_department || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination — server-paginated in normal mode, client-paginated over the matched set in search mode */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-4 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-600">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-4 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function ObservationsView() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Observations', value: 7, bg: 'bg-gray-50',   text: 'text-gray-700'   },
          { label: 'Closure Delays',     value: 3, bg: 'bg-orange-50', text: 'text-orange-700' },
          { label: 'Process Gaps',       value: 3, bg: 'bg-red-50',    text: 'text-red-700'    },
          { label: 'PM / Handoff',       value: 2, bg: 'bg-sky-50',    text: 'text-sky-700'    },
        ].map((c) => (
          <div key={c.label} className={`${c.bg} rounded-xl px-4 py-3`}>
            <p className={`text-2xl font-bold ${c.text}`}>{c.value}</p>
            <p className="text-xs text-gray-500">{c.label}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400">
        Documented observations from real Jira tickets. Click any row to expand full details.
      </p>

      {OBSERVED_PATTERNS.map((p) => {
        const isOpen = expanded === p.id;
        return (
          <div key={p.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <button
              className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
              onClick={() => setExpanded(isOpen ? null : p.id)}
            >
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-sm font-bold text-primary-700 flex-shrink-0 mt-0.5">
                {p.id}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.typeBg} ${p.typeText}`}>
                    {OBS_ICONS[p.type]} {p.type}
                  </span>
                  <a
                    href={`${JIRA_BASE}/${p.ticket}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-semibold text-primary-600 hover:underline inline-flex items-center gap-1"
                  >
                    {p.ticket} <ExternalLink size={10} />
                  </a>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{p.gap}</span>
                </div>
                <p className="text-sm font-medium text-gray-800 mt-1 truncate">{p.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">Engineer / PM: {p.engineer}</p>
              </div>
              <ChevronRight size={16} className={`text-gray-400 flex-shrink-0 mt-1 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 grid grid-cols-3 divide-x divide-gray-100">
                {/* Timeline */}
                <div className="px-5 py-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Timeline</p>
                  <div className="space-y-3">
                    {p.timeline.map((ev, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div className={`w-2.5 h-2.5 rounded-full mt-0.5 ${ev.highlight ? 'bg-red-400' : 'bg-gray-300'}`} />
                          {i < p.timeline.length - 1 && <div className="w-px bg-gray-200 mt-1" style={{ minHeight: '20px' }} />}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-600">{ev.date}</p>
                          <p className={`text-xs mt-0.5 ${ev.highlight ? 'text-red-600 font-medium' : 'text-gray-500'}`}>{ev.event}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${p.typeBg} ${p.typeText}`}>Gap: {p.gap}</span>
                  </div>
                </div>

                {/* What happened */}
                <div className="px-5 py-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">What Happened</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{p.observation}</p>
                </div>

                {/* Impact */}
                <div className="px-5 py-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Impact</p>
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
                    <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 leading-relaxed">{p.impact}</p>
                  </div>
                  <div className="mt-3">
                    <a
                      href={`${JIRA_BASE}/${p.ticket}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium hover:underline"
                    >
                      <ExternalLink size={12} /> Open {p.ticket} in Jira
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

