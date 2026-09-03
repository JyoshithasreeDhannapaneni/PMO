'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useManagerGoalsWithStats, useEscalatedProjects, useNtaStats, useNtaEnabled, useNtaToggle, useNtaSpaces, useNtaIssues, useNtaSearch, useNtaTrends, useNtaAssignees, useNtaReporters, useNtaProjectManagers, useNtaDepartments, useJiraExcelStatus, useNtaByManagers, useEngineersByManager, useJiraEngineers, useEmailHygiene, useActionItems, useCreateActionItem, useUpdateActionItem, useDeleteActionItem, useManagerDashboardLeaderboard } from '@/hooks/useProjects';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Loader2, AlertCircle, X, PlayCircle, PauseCircle,
  CheckCircle, Clock, ChevronRight, ChevronLeft, Search, Link2Off,
  ArrowLeft, ExternalLink, Upload, FileSpreadsheet, Trash2,
  Plus, Pencil, Check,
} from 'lucide-react';
import api from '@/services/api';
import { SEGMENT_CONFIG, SEGMENT_HIERARCHY, MANAGER_QUERY_NAMES, ENGINEER_ASSIGNMENTS, LMS_SCORES, MEETING_ATTENDANCE, CHECKIN_DELAYS, AUDIO_PERCENTAGES, segmentOfManager, isNamedManager, type Segment } from '@/lib/segments';
import { ScoreBreakdownPanel } from '@/components/EmailHygieneBreakdown';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveTab = 'ENT' | 'SMB' | 'ENGINEERS' | 'OBSERVATIONS' | 'TICKETS' | 'ACTION_ITEMS' | 'LEADERBOARD';

interface ManagerStat {
  manager: string;
  dbManager?: string;   // actual project_manager value stored in DB (may differ in casing/alias)
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
  // Skip bare-symbol "words" (e.g. the "&" in a combined card like "Neelima &
  // Meghna") so the badge shows real initials ("NM") instead of "N&".
  return name.split(' ').filter((w) => /[a-zA-Z]/.test(w)).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2);
}

// One-off handover notices for managers who inherited another manager's
// projects mid-cycle — shown on the manager's detail-view header so it's
// clear the project count reflects a transferred book of business, not
// this person's original workload.
const MANAGER_HANDOVER_NOTES: Record<string, string> = {
  'Sriram': "Sravan and Raghu projects transferred to Sriram on Aug 26 — he is handling from Aug 26 onward.",
  'Meghana Chowdada': "Abhishikth's projects transferred to Meghana on Aug 31 — she started handling from Aug 31 onwards.",
};

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Ensures a stored URL has a proper protocol so the browser doesn't treat it
// as a relative path (common when users paste URLs without https://).
function toAbsoluteUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `https://${url}`;
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
                {data.fieldDiagnostics && (
                  <p className="text-[11px] text-green-600 mt-1">
                    {(['productType', 'slaBreachedBy'] as const).map((key) => {
                      const label = key === 'productType' ? 'Product Type' : 'SLA Breached By';
                      const d = data.fieldDiagnostics[key];
                      const found = d.columnDetected !== 'NOT FOUND';
                      return (
                        <span key={key} className="block">
                          <span className="font-semibold">{label}:</span>{' '}
                          {found
                            ? `column "${d.columnDetected}" · ${d.nonBlankCount} ticket${d.nonBlankCount !== 1 ? 's' : ''} with a value${d.distinctSample.length ? ` · e.g. ${d.distinctSample.join(', ')}` : ''}`
                            : 'column not found in this file'}
                        </span>
                      );
                    })}
                  </p>
                )}
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

// ─── Manager tab view (Projects tab + Engineers tab) ─────────────────────────

function ProjectsTabView({ managerName, dbManager, isOthers }: { managerName: string; dbManager?: string; isOthers: boolean }) {
  // Build a deduplicated set of PM names to query:
  // - canonical aliases from MANAGER_QUERY_NAMES (handles "Abhishek,Chandra Mouli")
  // - the actual DB value in dbManager (handles casing differences like "Raghu Yellani", "Lakshmi prasanna")
  const queryNames = isOthers ? '' : (() => {
    const parts = new Set<string>();
    (MANAGER_QUERY_NAMES[managerName] ?? managerName).split(',').map(s => s.trim()).forEach(n => parts.add(n));
    // dbManager can itself be a comma-joined value for a combined card (e.g.
    // "Neelima,Meghana Chowdada") — split it too, or it gets added as one
    // malformed name instead of two real ones.
    if (dbManager) dbManager.split(',').map(s => s.trim()).forEach(n => parts.add(n));
    return Array.from(parts).join(',');
  })();

  const { data, isLoading } = useQuery({
    queryKey: ['manager-projects-tab', managerName, dbManager, isOthers],
    queryFn: () => {
      if (isOthers) return api.get('/projects?excludeStatus=COMPLETED&limit=500').then((r: any) => r.data);
      return api.get(`/projects?projectManager=${encodeURIComponent(queryNames)}&excludeStatus=COMPLETED&limit=500`).then((r: any) => r.data);
    },
    staleTime: 30_000,
  });

  const allFetched: any[] = data?.data ?? [];
  const projects = useMemo(
    () => isOthers ? allFetched.filter((p: any) => !isNamedManager(p.projectManager)) : allFetched,
    [allFetched, isOthers]
  );

  const getProjectStatus = (p: any): { label: string; cls: string } => {
    if (p.delayStatus === 'DELAYED') return { label: 'Delayed', cls: 'bg-red-100 text-red-700' };
    if (p.extendedEndDate) return { label: 'Extended', cls: 'bg-amber-100 text-amber-700' };
    return { label: 'On Track', cls: 'bg-green-100 text-green-700' };
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }
  if (projects.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-gray-400">
        {isOthers ? 'No unmapped projects — every project is mapped to a named ENT/SMB manager.' : `No projects found for ${managerName}.`}
      </div>
    );
  }

  const delayReasonLabel = (v: string | null | undefined) => {
    if (v === 'CUSTOMER_DELAY') return { text: 'Customer', cls: 'bg-orange-100 text-orange-700' };
    if (v === 'INTERNAL_DELAY') return { text: 'Internal', cls: 'bg-purple-100 text-purple-700' };
    if (v === 'BOTH')           return { text: 'Both',     cls: 'bg-red-100 text-red-700'    };
    return null;
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-gray-700">Projects</h3>
        <span className="text-xs text-gray-400">{projects.length} total</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">Project Name</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">Status</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">Delay</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">Delay Reason</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">RCA</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">Kickoff Date</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">Project End Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {projects.map((p: any) => {
              const { label, cls } = getProjectStatus(p);
              const kickoffDate = p.actualStart ?? p.plannedStart;
              const reason = delayReasonLabel(p.delayHappened);
              return (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 max-w-[200px]">
                    <Link href={`/projects/${p.id}`} className="font-medium text-gray-900 hover:text-primary-600 hover:underline line-clamp-2">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {p.delayDays > 0 ? (
                      <span className="text-xs font-semibold text-red-600">+{p.delayDays}d</span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {reason ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${reason.cls}`}>{reason.text}</span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.rcaDocUrl ? (
                      <a href={toAbsoluteUrl(p.rcaDocUrl)} target="_blank" rel="noopener noreferrer"
                        title={p.rcaDocUrl}
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-medium">
                        <ExternalLink size={12} /> View
                      </a>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(kickoffDate)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(p.plannedEnd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type EngPopupMode = 'all' | 'fr' | 'res' | 'hygiene' | 'productType';

interface EngPopupState {
  engName: string;
  mode: EngPopupMode;
  tickets: any[];
}

function EngMetricPopup({
  state,
  hygieneMetric,
  jiraBaseUrl,
  onClose,
}: {
  state: EngPopupState;
  hygieneMetric: any | null;
  jiraBaseUrl: string;
  onClose: () => void;
}) {
  const titles: Record<EngPopupMode, string> = {
    all:         'All Tickets',
    fr:          'FR Breached Tickets',
    res:         'Resolution Breached Tickets',
    hygiene:     'Email Hygiene Score',
    productType: 'Product Types',
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900 text-sm">
            {state.engName} — {titles[state.mode]}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-auto flex-1">
          {state.mode === 'all' && (
            state.tickets.length > 0
              ? <ExcelTicketTable tickets={state.tickets} jiraBaseUrl={jiraBaseUrl} />
              : <p className="text-center text-sm text-gray-400 py-10">No tickets found for {state.engName}.</p>
          )}
          {(state.mode === 'fr' || state.mode === 'res') && (
            state.tickets.length > 0
              ? <BreachedTicketSections tickets={state.tickets} jiraBaseUrl={jiraBaseUrl} />
              : <p className="text-center text-sm text-gray-400 py-10">No breached tickets.</p>
          )}
          {state.mode === 'hygiene' && hygieneMetric && <HygienePanel metric={hygieneMetric} />}
          {state.mode === 'hygiene' && !hygieneMetric && (
            <p className="text-center text-sm text-gray-400 py-10">No hygiene data available for {state.engName}.</p>
          )}
          {state.mode === 'productType' && <ProductTypeBreakdown tickets={state.tickets} jiraBaseUrl={jiraBaseUrl} />}
        </div>
      </div>
    </div>,
    document.body
  );
}

// Groups an engineer's tickets by their "Product Type" column value -- expand a row to
// see the actual tickets behind that count, reusing the same ticket table used elsewhere
// in this popup.
function ProductTypeBreakdown({ tickets, jiraBaseUrl }: { tickets: any[]; jiraBaseUrl: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const grouped: Record<string, any[]> = {};
  for (const t of tickets) {
    const pt = (t.productType || '').trim() || 'Unspecified';
    if (!grouped[pt]) grouped[pt] = [];
    grouped[pt].push(t);
  }
  const rows = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);

  if (rows.length === 0) {
    return <p className="text-center text-sm text-gray-400 py-10">No product type data for this engineer.</p>;
  }

  return (
    <div className="divide-y divide-gray-100">
      {rows.map(([pt, list]) => {
        const isOpen = expanded === pt;
        return (
          <div key={pt}>
            <button
              onClick={() => setExpanded(isOpen ? null : pt)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="text-sm font-medium text-gray-800">{pt}</span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
                  {list.length} ticket{list.length !== 1 ? 's' : ''}
                </span>
                <ChevronRight size={14} className={`text-gray-400 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} />
              </span>
            </button>
            {isOpen && <ExcelTicketTable tickets={list} jiraBaseUrl={jiraBaseUrl} />}
          </div>
        );
      })}
    </div>
  );
}

function EngineersTabView({
  managerName,
  jiraBaseUrl,
  allHygieneMetrics,
  allJiraEngineers,
  jiraAvailable,
}: {
  managerName: string;
  jiraBaseUrl: string;
  allHygieneMetrics: any[];
  allJiraEngineers: any[];
  jiraAvailable: boolean;
}) {
  const engineers = ENGINEER_ASSIGNMENTS[managerName] ?? [];
  const [popup, setPopup] = useState<EngPopupState | null>(null);

  // All rows: manager first (always shown), then direct reports
  const allRows: { name: string; isManager: boolean }[] = [
    { name: managerName, isManager: true },
    ...engineers.map(n => ({ name: n, isManager: false })),
  ];

  const renderRow = (rowName: string, isManager: boolean) => {
    const { totalTickets, resBreaches, breachRate, productTypes, tickets, resTickets } = getEngineerJiraData(allJiraEngineers, rowName);
    const hygieneMetric = getEngineerHygieneData(allHygieneMetrics, rowName);
    const lmsScore      = getEngineerLmsScore(rowName);
    const checkinDelay  = getEngineerCheckinDelay(rowName);
    const audioPct      = getEngineerAudioPct(rowName);

    return (
      <tr key={rowName} className={`hover:bg-gray-50 transition-colors ${isManager ? 'bg-indigo-50/40' : ''}`}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
              ${isManager ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
              {toInitials(rowName)}
            </div>
            <span className={`font-medium text-sm ${isManager ? 'text-indigo-700' : 'text-gray-800'}`}>{rowName}</span>
            {isManager && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 uppercase tracking-wide">Mgr</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-center">
          {jiraAvailable ? (
            <button
              onClick={() => totalTickets > 0 && setPopup({ engName: rowName, mode: 'all', tickets })}
              className={`font-semibold text-gray-800 ${totalTickets > 0 ? 'hover:text-indigo-600 cursor-pointer' : 'cursor-default'}`}
            >
              {totalTickets}
            </button>
          ) : <span className="text-gray-300">—</span>}
        </td>
        <td className="px-4 py-3 text-center">
          {jiraAvailable ? (
            <button
              onClick={() => resBreaches > 0 && setPopup({ engName: rowName, mode: 'res', tickets: resTickets })}
              className={`px-2 py-0.5 rounded-full text-xs font-semibold
                ${resBreaches > 0 ? 'bg-red-100 text-red-700 hover:bg-red-200 cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-default'}`}
            >
              {resBreaches}
            </button>
          ) : <span className="text-gray-300">—</span>}
        </td>
        <td className="px-4 py-3 text-center">
          {jiraAvailable ? (
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold
              ${breachRate > 20 ? 'bg-red-100 text-red-700' : breachRate > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
              {breachRate}%
            </span>
          ) : <span className="text-gray-300">—</span>}
        </td>
        <td className="px-4 py-3 text-center">
          {jiraAvailable ? (
            <button
              onClick={() => productTypes.length > 0 && setPopup({ engName: rowName, mode: 'productType', tickets })}
              className={`font-semibold text-gray-800 ${productTypes.length > 0 ? 'hover:text-indigo-600 cursor-pointer' : 'cursor-default text-gray-300'}`}
              title={productTypes.length > 0 ? productTypes.join(', ') : undefined}
            >
              {productTypes.length}
            </button>
          ) : <span className="text-gray-300">—</span>}
        </td>
        <td className="px-4 py-3 text-center">
          {hygieneMetric ? (
            <button
              onClick={() => setPopup({ engName: rowName, mode: 'hygiene', tickets: [] })}
              className={`px-2 py-0.5 rounded-full text-xs font-bold ring-1 hover:opacity-80 cursor-pointer ${hygieneScoreBadgeClass(hygieneMetric.emailHygieneScore)}`}
            >
              {hygieneMetric.emailHygieneScore}
            </button>
          ) : <span className="text-gray-300">—</span>}
        </td>
        <td className="px-4 py-3 text-center">
          {lmsScore !== null ? (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${lmsScore.score >= lmsScore.max ? 'bg-green-100 text-green-700' : lmsScore.score >= lmsScore.max * 0.8 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
              {lmsScore.score}/{lmsScore.max}
            </span>
          ) : <span className="text-gray-300">—</span>}
        </td>
        <td className="px-4 py-3 text-center">
          {checkinDelay !== null ? (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${checkinDelay <= 5 ? 'bg-green-100 text-green-700' : checkinDelay <= 15 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
              {checkinDelay} min
            </span>
          ) : <span className="text-gray-300">—</span>}
        </td>
        <td className="px-4 py-3 text-center">
          {audioPct !== null ? (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${audioPct >= 80 ? 'bg-green-100 text-green-700' : audioPct >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
              {audioPct}%
            </span>
          ) : <span className="text-gray-300">—</span>}
        </td>
      </tr>
    );
  };

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-700">Team</h3>
          <span className="text-xs text-gray-400">{engineers.length} engineer{engineers.length !== 1 ? 's' : ''}</span>
          {!jiraAvailable && (
            <span className="text-xs text-gray-400 italic ml-auto">Upload Excel to see ticket data</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Name</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">Total</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">Res</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">Breach%</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">Product Types</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">Hygiene</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">LMS /10</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">Avg. Delay</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">Audio %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allRows.map(({ name, isManager }) => renderRow(name, isManager))}
            </tbody>
          </table>
        </div>
      </div>

      {popup && (
        <EngMetricPopup
          state={popup}
          hygieneMetric={popup.mode === 'hygiene' ? getEngineerHygieneData(allHygieneMetrics, popup.engName) : null}
          jiraBaseUrl={jiraBaseUrl}
          onClose={() => setPopup(null)}
        />
      )}
    </>
  );
}

function ManagerTabView({
  stat,
  isOthers,
  onBack,
  jiraBaseUrl,
  allHygieneMetrics,
  allJiraEngineers,
  jiraAvailable,
}: {
  stat: ManagerStat;
  isOthers: boolean;
  onBack: () => void;
  jiraBaseUrl: string;
  allHygieneMetrics: any[];
  allJiraEngineers: any[];
  jiraAvailable: boolean;
}) {
  const [tab, setTab] = useState<'projects' | 'engineers'>('projects');

  return (
    <div className="space-y-4 animate-fadeIn">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 font-medium transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Dashboard
      </button>

      <div className="bg-gradient-to-r from-[#1b4f72] to-[#2980b9] rounded-2xl p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
          {isOthers ? '?' : toInitials(stat.manager)}
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{isOthers ? 'Not Mapped to ENT/SMB' : stat.manager}</h2>
          <p className="text-sm text-blue-100 mt-0.5">
            {isOthers ? `${stat.total} project${stat.total !== 1 ? 's' : ''} with no ENT/SMB manager` : `Project Manager · ${stat.total} total projects`}
          </p>
        </div>
        {!isOthers && (
          <Link
            href={`/projects?projectManager=${encodeURIComponent(MANAGER_QUERY_NAMES[stat.manager] ?? stat.manager)}`}
            className="ml-auto flex items-center gap-1.5 text-xs text-white/80 hover:text-white font-medium px-3 py-1.5 rounded-lg border border-white/30 hover:border-white/60 transition"
          >
            View in All Projects <ChevronRight size={12} />
          </Link>
        )}
      </div>

      {!isOthers && MANAGER_HANDOVER_NOTES[stat.manager] && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-800">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-amber-500" />
          <span>{MANAGER_HANDOVER_NOTES[stat.manager]}</span>
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['projects', 'engineers'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'projects' ? 'Projects' : 'Engineers'}
          </button>
        ))}
      </div>

      {tab === 'projects' && (
        <ProjectsTabView managerName={stat.manager} dbManager={stat.dbManager} isOthers={isOthers} />
      )}
      {tab === 'engineers' && (
        <EngineersTabView
          managerName={stat.manager}
          jiraBaseUrl={jiraBaseUrl}
          allHygieneMetrics={allHygieneMetrics}
          allJiraEngineers={allJiraEngineers}
          jiraAvailable={jiraAvailable}
        />
      )}
    </div>
  );
}

// ─── Engineer data helpers ────────────────────────────────────────────────────

function ExcelTicketTable({ tickets, jiraBaseUrl }: { tickets: any[]; jiraBaseUrl: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-gray-500">
            <th className="px-4 py-2 text-left font-medium whitespace-nowrap">Key</th>
            <th className="px-3 py-2 text-left font-medium">Summary</th>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Status</th>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Reporter</th>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Assignee</th>
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
              <td className="px-3 py-2 whitespace-nowrap text-gray-600">{t.reporter || t.reporterName || '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-600">{t.assignee || 'Unassigned'}</td>
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

// engineerMatch()'s `cn.startsWith(jv)` check is true for ANY canonicalName when jv is ''
// (every string starts with the empty string) -- so it must never be called with a blank
// "SLA Breached By" value, or every unbreached ticket would look like a match for
// everyone. This wrapper makes that guard impossible to forget at the call sites below.
function slaBreachedByMatch(slaBreachedBy: string, canonicalName: string): boolean {
  return (slaBreachedBy || '').trim() !== '' && engineerMatch(slaBreachedBy, canonicalName);
}

function getEngineerJiraData(allJiraEngineers: any[], canonicalName: string) {
  // Every ticket appears under exactly one assignee bucket, so flattening all of them
  // reconstructs the full uploaded ticket set -- needed because "SLA Breached By" can
  // name someone other than the ticket's assignee (e.g. assigned to one engineer, but
  // another engineer's delay is what actually breached it).
  const allTickets = allJiraEngineers.flatMap((e: any) => e.tickets ?? []);
  const usesSlaBreachedBy = allTickets.some((t: any) => (t.slaBreachedBy || '').trim() !== '');

  const matches     = allJiraEngineers.filter(e => engineerMatch(e.engineerName, canonicalName));
  const tickets     = matches.flatMap(e => e.tickets ?? []);
  const totalTickets = tickets.length;
  const frBreaches  = tickets.filter((t: any) => t.frBreached).length;

  // Prefer "SLA Breached By" (searched across ALL tickets, not just this engineer's own
  // assignments) whenever the uploaded file has that column; fall back to the older
  // assignee-scoped "Resolution SLA Breach" flag for files that don't.
  const resTickets = usesSlaBreachedBy
    ? allTickets.filter((t: any) => slaBreachedByMatch(t.slaBreachedBy, canonicalName))
    : tickets.filter((t: any) => t.resBreached);
  const resBreaches = resTickets.length;

  const openTickets = tickets.filter((t: any) => {
    const s = (t.status || '').toLowerCase();
    return !['done', 'resolved', 'closed', 'completed'].some(x => s.includes(x));
  }).length;
  // Breach% is literally Res/Total -- must use the same resBreaches count shown in the
  // Res column (searched across ALL tickets via SLA Breached By), not a separate
  // own-tickets-only check, which undercounted whenever this engineer's SLA breach was
  // attributed on a ticket assigned to someone else.
  const breachRate  = totalTickets > 0 ? Math.round((resBreaches / totalTickets) * 100) : 0;
  // Distinct Product Type values across this engineer's tickets -- how many different
  // products/migration types they're working across, not just how many tickets.
  const productTypes = Array.from(new Set(
    tickets.map((t: any) => (t.productType || '').trim()).filter(Boolean)
  )).sort();
  return { totalTickets, frBreaches, resBreaches, openTickets, breachRate, productTypes, tickets, resTickets };
}

function getEngineerHygieneData(allHygieneMetrics: any[], canonicalName: string) {
  const cn = canonicalName.toLowerCase();
  const cnNorm = cn.replace(/[\s._-]/g, '');            // "Chandra Mouli" → "chandramouli"
  const cnWords = cn.split(/\s+/).filter(w => w.length > 2);
  const match = allHygieneMetrics.find(m => {
    const un = (m.userName || '').toLowerCase();
    const emailPrefix = (m.userEmail || '').split('@')[0].toLowerCase();
    if (un === cn || emailPrefix === cn) return true;
    if (un.startsWith(cn) || cn.startsWith(un)) return true;
    const unFirst = un.split(/[\s.]/)[0];
    const cnFirst = cn.split(/\s/)[0];
    if (unFirst.length > 2 && cnFirst.length > 2 && unFirst === cnFirst) return true;
    if (cnWords.length > 0 && cnWords.every(w => un.includes(w))) return true;
    // Normalized comparison: strip spaces/dots/underscores before matching
    // Handles "Chandramouli" ↔ "Chandra Mouli", "Saikumar" ↔ "Sai Kumar", etc.
    const unNorm = un.replace(/[\s._-]/g, '');
    const epNorm = emailPrefix.replace(/[\s._-]/g, '');
    if (unNorm === cnNorm || epNorm === cnNorm) return true;
    if (cnNorm.length >= 4 && (unNorm.startsWith(cnNorm) || cnNorm.startsWith(unNorm))) return true;
    return false;
  });
  return match ?? null;
}

function getEngineerLmsScore(canonicalName: string): { score: number; max: number } | null {
  const cn = canonicalName.toLowerCase();
  const cnNorm = cn.replace(/[\s._-]/g, '');
  const cnWords = cn.split(/\s+/).filter(w => w.length > 2);
  const match = LMS_SCORES.find(entry => {
    const ln = entry.name.toLowerCase();
    const lnNorm = ln.replace(/[\s._-]/g, '');
    const lnWords = ln.split(/\s+/).filter(w => w.length > 2);
    if (cn === ln) return true;
    const cnFirst = cn.split(/\s/)[0];
    const lnFirst = ln.split(/\s/)[0];
    if (cnFirst.length > 2 && cnFirst === lnFirst) return true;
    if (cnWords.length > 0 && cnWords.every(w => ln.includes(w))) return true;
    if (lnWords.length > 0 && lnWords.every(w => cn.includes(w))) return true;
    if (cnNorm.length >= 4 && (lnNorm.includes(cnNorm) || cnNorm.includes(lnNorm))) return true;
    return false;
  });
  return match ? { score: match.score, max: match.max } : null;
}

function getEngineerMeetingData(canonicalName: string): { attended: number; total: number } | null {
  const cn = canonicalName.toLowerCase();
  const cnNorm = cn.replace(/[\s._-]/g, '');
  const cnWords = cn.split(/\s+/).filter(w => w.length > 2);
  const match = MEETING_ATTENDANCE.find(entry => {
    const ln = entry.name.toLowerCase();
    const lnNorm = ln.replace(/[\s._-]/g, '');
    const lnWords = ln.split(/\s+/).filter(w => w.length > 2);
    if (cn === ln) return true;
    const cnFirst = cn.split(/\s/)[0];
    const lnFirst = ln.split(/\s/)[0];
    // First-word match including prefix variants ("Ganesh" ↔ "Ganesha", "Habeeb" ↔ "Habeebunnisa")
    if (cnFirst.length > 3 && lnFirst.length > 3 && (cnFirst === lnFirst || cnFirst.startsWith(lnFirst) || lnFirst.startsWith(cnFirst))) return true;
    // All canonical words present in attendance name (e.g. "Ravi Hemanth" ↔ "Ravi H")
    if (cnWords.length > 0 && cnWords.every(w => ln.includes(w))) return true;
    // All attendance words present in canonical name (e.g. "Meena Lakshmi" ↔ "Meena Lakshmi Triveni")
    if (lnWords.length > 0 && lnWords.every(w => cn.includes(w))) return true;
    // Normalized substring ("David raj" ↔ "Davidraj", "Sri Ramkrishna" ↔ "Sriram")
    if (cnNorm.length >= 4 && (lnNorm.includes(cnNorm) || cnNorm.includes(lnNorm))) return true;
    return false;
  });
  return match ? { attended: match.attended, total: match.total } : null;
}

function getEngineerCheckinDelay(canonicalName: string): number | null {
  const cn = canonicalName.toLowerCase();
  const cnNorm = cn.replace(/[\s._-]/g, '');
  const cnWords = cn.split(/\s+/).filter(w => w.length > 2);
  const match = CHECKIN_DELAYS.find(entry => {
    const ln = entry.name.toLowerCase();
    const lnNorm = ln.replace(/[\s._-]/g, '');
    const lnWords = ln.split(/\s+/).filter(w => w.length > 2);
    if (cn === ln) return true;
    const cnFirst = cn.split(/\s/)[0];
    const lnFirst = ln.split(/\s/)[0];
    if (cnFirst.length > 3 && lnFirst.length > 3 && (cnFirst === lnFirst || cnFirst.startsWith(lnFirst) || lnFirst.startsWith(cnFirst))) return true;
    if (cnWords.length > 0 && cnWords.every(w => ln.includes(w))) return true;
    if (lnWords.length > 0 && lnWords.every(w => cn.includes(w))) return true;
    if (cnNorm.length >= 4 && (lnNorm.includes(cnNorm) || cnNorm.includes(lnNorm))) return true;
    return false;
  });
  return match ? match.delayMin : null;
}

function getEngineerAudioPct(canonicalName: string): number | null {
  const cn = canonicalName.toLowerCase();
  const cnNorm = cn.replace(/[\s._-]/g, '');
  const cnWords = cn.split(/\s+/).filter(w => w.length > 2);
  const match = AUDIO_PERCENTAGES.find(entry => {
    const ln = entry.name.toLowerCase();
    const lnNorm = ln.replace(/[\s._-]/g, '');
    const lnWords = ln.split(/\s+/).filter(w => w.length > 2);
    if (cn === ln) return true;
    const cnFirst = cn.split(/\s/)[0];
    const lnFirst = ln.split(/\s/)[0];
    if (cnFirst.length > 3 && lnFirst.length > 3 && (cnFirst === lnFirst || cnFirst.startsWith(lnFirst) || lnFirst.startsWith(cnFirst))) return true;
    if (cnWords.length > 0 && cnWords.every(w => ln.includes(w))) return true;
    if (lnWords.length > 0 && lnWords.every(w => cn.includes(w))) return true;
    if (cnNorm.length >= 4 && (lnNorm.includes(cnNorm) || cnNorm.includes(lnNorm))) return true;
    return false;
  });
  return match ? match.pct : null;
}

function hygieneScoreBadgeClass(score: number): string {
  if (score >= 80) return 'bg-green-100 text-green-700 ring-green-200';
  if (score >= 60) return 'bg-amber-100 text-amber-700 ring-amber-200';
  return 'bg-red-100 text-red-700 ring-red-200';
}

function HygienePanel({ metric }: { metric: any }) {
  return (
    <div className="border-t border-gray-100 p-4 bg-gray-50/50">
      {/* Overall score header */}
      <div className="flex items-center gap-3 mb-3">
        <span className={`text-2xl font-bold px-3 py-1 rounded-xl ring-1 ${hygieneScoreBadgeClass(metric.emailHygieneScore)}`}>
          {metric.emailHygieneScore}
          <span className="text-xs font-normal">/100</span>
        </span>
        <div>
          <p className="text-xs font-semibold text-gray-700">Overall Email Hygiene Score</p>
          <p className="text-xs text-gray-400">{metric.uniqueCustomerThreads} customer threads · {metric.userEmail}</p>
        </div>
      </div>

      {/* Same per-sub-metric breakdown (value, tip, real proof examples) as the Email
          Hygiene page -- kept in one shared component so the two surfaces can't drift. */}
      <ScoreBreakdownPanel breakdown={metric.scoreBreakdown} category={null} />
    </div>
  );
}

function OrgNode({
  name,
  isLead,
  isUnmapped = false,
  stat,
  onClick,
}: {
  name: string;
  isLead: boolean;
  isUnmapped?: boolean;
  stat: ManagerStat | null;
  onClick: () => void;
}) {
  const loading = stat === null;

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border cursor-pointer transition-all hover:shadow-md select-none w-full
        ${isLead
          ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 border-indigo-500'
          : isUnmapped
          ? 'bg-amber-50/60 border-dashed border-amber-300 hover:border-amber-400'
          : 'bg-white border-gray-200 hover:border-indigo-300'}`}
    >
      <div className="px-4 py-3 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
          ${isLead ? 'bg-white/20 text-white' : isUnmapped ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
          {isUnmapped ? '?' : toInitials(name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold text-sm ${isLead ? 'text-white' : 'text-gray-900'}`}>{name}</span>
            {isLead && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white tracking-wide">LEAD</span>
            )}
          </div>
          {loading ? (
            <span className={`text-xs ${isLead ? 'text-indigo-200' : 'text-gray-400'}`}>loading…</span>
          ) : (
            <div className={`text-xs mt-0.5 flex items-center gap-2 flex-wrap ${isLead ? 'text-indigo-200' : 'text-gray-500'}`}>
              <span>{stat!.total} project{stat!.total !== 1 ? 's' : ''}</span>
              {stat!.delayed > 0 && (
                <span className={isLead ? 'text-red-300' : 'text-red-500'}>· {stat!.delayed} delayed</span>
              )}
              {stat!.pctOnTime > 0 && (
                <span className={stat!.pctOnTime >= 80 ? (isLead ? 'text-green-300' : 'text-green-600') : (isLead ? 'text-yellow-300' : 'text-yellow-600')}>
                  · {stat!.pctOnTime}% on time
                </span>
              )}
            </div>
          )}
        </div>
        <ChevronRight size={14} className={`flex-shrink-0 ${isLead ? 'text-indigo-300' : 'text-gray-300'}`} />
      </div>
    </div>
  );
}

function OrgChart({
  segment,
  getStatForManager,
  onSelectManager,
  othersStats,
}: {
  segment: Segment;
  getStatForManager: (name: string) => ManagerStat | null;
  onSelectManager: (name: string) => void;
  othersStats: ManagerStat | null;
}) {
  const hier = SEGMENT_HIERARCHY.find(h => h.label === segment);
  if (!hier) return null;
  const n = hier.managers.length;

  return (
    <div className="py-2">
      {/* Lead node */}
      <div className="max-w-sm mx-auto">
        <OrgNode
          name={hier.lead}
          isLead
          stat={getStatForManager(hier.lead)}
          onClick={() => onSelectManager(hier.lead)}
        />
      </div>

      {/* Connector: vertical stem + horizontal bridge to children */}
      <div className="relative flex justify-center" style={{ height: '48px' }}>
        <div className="w-px bg-gray-200 h-full" />
        <div
          className="absolute bottom-0 bg-gray-200"
          style={{ height: '1px', left: `${100 / (2 * n)}%`, right: `${100 / (2 * n)}%` }}
        />
      </div>

      {/* Manager nodes */}
      <div className="flex gap-4">
        {hier.managers.map(name => (
          <div key={name} className="flex flex-col items-center flex-1">
            <div className="w-px h-8 bg-gray-200" />
            <OrgNode
              name={name}
              isLead={false}
              stat={getStatForManager(name)}
              onClick={() => onSelectManager(name)}
            />
          </div>
        ))}
      </div>

      {/* Not mapped to ENT/SMB — projects whose PM isn't any named manager above.
          Shown once per segment tab as a click-through to the same underlying
          "Others" bucket (it's global, not segment-specific). */}
      <div className="max-w-sm mx-auto mt-4">
        <OrgNode
          name="Not Mapped to ENT/SMB"
          isLead={false}
          isUnmapped
          stat={othersStats}
          onClick={() => onSelectManager('Others')}
        />
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

  const { data: emailHygieneData } = useEmailHygiene();
  const allHygieneMetrics: any[] = emailHygieneData?.data?.metrics ?? [];

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
  const EMPTY_MANAGER_STAT_FIELDS = { total: 0, active: 0, inactive: 0, completed: 0, delayed: 0, atRisk: 0, onTime: 0, pctOnTime: 0, avgDelayDays: 0, achievedPct: 0, goalPct: 80, variance: -80 };

  const findOneStat = (cn: string) => allStats.find((s) => {
    const dn = s.manager.toLowerCase();
    return dn === cn || dn.startsWith(cn + ' ') || cn.startsWith(dn + ' ');
  });

  const getStatForManager = (name: string): ManagerStat | null => {
    if (statsLoading) return null;

    // A card can represent more than one real person ("Neelima & Meghna" is
    // one node for Neelima + Meghana Chowdada) — MANAGER_QUERY_NAMES already
    // holds the comma-separated real names for these combined cards. Look up
    // each one and sum the numeric fields instead of a single find().
    const aliasNames = (MANAGER_QUERY_NAMES[name] ?? name).split(',').map((s) => s.trim());
    if (aliasNames.length > 1) {
      const foundStats = aliasNames.map((n) => findOneStat(n.toLowerCase())).filter(Boolean) as ManagerStat[];
      if (foundStats.length === 0) {
        return { manager: name, dbManager: aliasNames.join(','), ...EMPTY_MANAGER_STAT_FIELDS };
      }
      const totalGoal = foundStats.reduce((sum, s) => sum + (s.goalPct || 0), 0) / foundStats.length;
      const summed = foundStats.reduce((acc, s) => ({
        total: acc.total + s.total, active: acc.active + s.active, inactive: acc.inactive + s.inactive,
        completed: acc.completed + s.completed, delayed: acc.delayed + s.delayed, atRisk: acc.atRisk + s.atRisk,
        onTime: acc.onTime + s.onTime,
      }), { total: 0, active: 0, inactive: 0, completed: 0, delayed: 0, atRisk: 0, onTime: 0 });
      const pctOnTime = summed.total > 0 ? Math.round((summed.onTime / summed.total) * 100) : 0;
      return {
        manager: name,
        dbManager: foundStats.map((s) => s.dbManager || s.manager).join(','),
        ...summed,
        pctOnTime,
        avgDelayDays: foundStats.reduce((sum, s) => sum + s.avgDelayDays, 0) / foundStats.length,
        achievedPct: pctOnTime,
        goalPct: totalGoal,
        variance: pctOnTime - totalGoal,
      };
    }

    // Single-name card: find by exact match OR by DB name starting with the
    // canonical name ("Raghu Yellani" in DB → canonical "Raghu"; "Lakshmi
    // prasanna" → "Lakshmi Prasanna")
    const found = findOneStat(name.toLowerCase());
    // Override manager with the canonical config name (for ENGINEER_ASSIGNMENTS lookup)
    // but preserve the original DB value in dbManager (for the Projects API query)
    return found ? { ...found, manager: name, dbManager: found.manager } : {
      manager: name, dbManager: name, ...EMPTY_MANAGER_STAT_FIELDS,
    };
  };

  // "Others" = aggregate of all managers that don't resolve to a named ENT/SMB manager
  const EMPTY_STAT: ManagerStat = { manager: 'Others', total: 0, active: 0, inactive: 0, completed: 0, delayed: 0, atRisk: 0, onTime: 0, pctOnTime: 0, avgDelayDays: 0, achievedPct: 0, goalPct: 80, variance: -80 };

  const othersStats: ManagerStat | null = useMemo(() => {
    if (statsLoading) return null;
    const others = allStats.filter((s) => !isNamedManager(s.manager));
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
        <ManagerTabView
          stat={selectedStat}
          isOthers={selectedManager === 'Others'}
          onBack={() => setSelectedManager(null)}
          jiraBaseUrl={jiraBaseUrl}
          allHygieneMetrics={allHygieneMetrics}
          allJiraEngineers={allJiraEngineers}
          jiraAvailable={jiraAvailable}
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
        {(['ENT', 'SMB', 'LEADERBOARD', ...(ntaEnabled ? ['ENGINEERS', 'TICKETS'] as ActiveTab[] : []), 'OBSERVATIONS', 'ACTION_ITEMS'] as ActiveTab[]).map((tab) => {
          const labels: Record<ActiveTab, string> = {
            ENT: 'ENT', SMB: 'SMB', ENGINEERS: 'Engineers', LEADERBOARD: 'Leaderboard',
            OBSERVATIONS: 'Observations', TICKETS: 'Tickets', ACTION_ITEMS: 'Action Items',
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

      {/* Action Items tab */}
      {activeTab === 'ACTION_ITEMS' && <ActionItemsView />}

      {/* Leaderboard tab */}
      {activeTab === 'LEADERBOARD' && <LeaderboardView />}

      {/* Tickets tab — only when NTA is linked */}
      {ntaEnabled && activeTab === 'TICKETS' && <TicketsView />}

      {/* Engineers tab — only when NTA is linked */}
      {ntaEnabled && activeTab === 'ENGINEERS' && <EngineersView />}

      {/* Segment tree view (ENT / SMB) */}
      {activeTab !== 'OBSERVATIONS' && activeTab !== 'TICKETS' && activeTab !== 'ENGINEERS' && activeTab !== 'ACTION_ITEMS' && activeTab !== 'LEADERBOARD' && (
        statsLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
          </div>
        ) : (
          <OrgChart
            segment={activeSegment}
            getStatForManager={getStatForManager}
            onSelectManager={setSelectedManager}
            othersStats={othersStats}
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
              <>
              <div className="flex items-center gap-4 mb-3 justify-end">
                <span className="flex items-center gap-1.5 text-xs text-gray-600"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-700 inline-block" />Done</span>
                <span className="flex items-center gap-1.5 text-xs text-gray-600"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-700 inline-block" />In Progress</span>
                <span className="flex items-center gap-1.5 text-xs text-gray-600"><span className="w-2.5 h-2.5 rounded-sm bg-slate-500 inline-block" />To Do</span>
              </div>
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
                          className="w-full max-w-[36px] rounded-t-md rounded-b-sm overflow-hidden flex flex-col-reverse bg-gray-200"
                          style={{ height: stackHeight }}
                        >
                          <div className="w-full bg-emerald-700" style={{ height: `${donePct}%` }} />
                          <div className="w-full bg-indigo-700" style={{ height: `${inProgPct}%` }} />
                          <div className="w-full bg-slate-500" style={{ height: `${todoPct}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-400 text-center leading-tight whitespace-nowrap">{shortLabel}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              </>
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

interface LeaderboardRow {
  manager: string;
  segment: 'ENT' | 'SMB';
  totalProjects: number;
  distinctCustomers: number;
  delayed: number;
  atRisk: number;
  onTime: number;
  pctOnTime: number;
  hygieneScore: number | null;
  volumeScore: number;
  compositeScore: number;
}

// Whichever of the three weighted inputs is highest/lowest FOR THIS PERSON -- "why do
// they rank here" rather than just "where do they rank". Hygiene missing entirely (null)
// is excluded from being called out as a strength/weakness since there's no real signal.
function bestAndWorstMetric(r: LeaderboardRow): { best: [string, number]; worst: [string, number] } {
  const entries: [string, number][] = [
    ['customer volume', r.volumeScore],
    ['on-time delivery', r.pctOnTime],
    ...(r.hygieneScore !== null ? [['PMO Hygiene', r.hygieneScore] as [string, number]] : []),
  ];
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

function formatMetricValue(name: string, value: number): string {
  return name === 'on-time delivery' ? `${value}%` : String(value);
}

// Auto-generated comparison, same spirit as the Reports → Audit leaderboard's insight
// bullets -- names who's ahead, by how much, and what's actually driving it, rather than
// leaving the reader to reverse-engineer a comparison from a column of numbers.
function LeaderboardInsights({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length < 2) return null;
  const leader = rows[0];
  const runnerUp = rows[1];
  const laggard = rows[rows.length - 1];
  const gap = leader.compositeScore - runnerUp.compositeScore;
  const leaderBest = bestAndWorstMetric(leader).best;
  const laggardWorst = bestAndWorstMetric(laggard).worst;

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3">
        <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Leading</p>
        <p className="text-sm text-green-900">
          <span className="font-semibold">{leader.manager}</span> is on top with a score of{' '}
          <span className="font-semibold">{leader.compositeScore}</span>
          {gap > 0 && <> — {gap} point{gap !== 1 ? 's' : ''} ahead of {runnerUp.manager}</>}, driven by{' '}
          {leaderBest[0]} ({formatMetricValue(leaderBest[0], leaderBest[1])}).
        </p>
      </div>
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Most room to improve</p>
        <p className="text-sm text-amber-900">
          <span className="font-semibold">{laggard.manager}</span> is ranked last at{' '}
          <span className="font-semibold">{laggard.compositeScore}</span>, mainly held back by{' '}
          {laggardWorst[0]} ({formatMetricValue(laggardWorst[0], laggardWorst[1])}).
        </p>
      </div>
    </div>
  );
}

function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 py-10 text-center">No leaderboard data for this segment yet.</p>;
  }
  const leaderScore = rows[0].compositeScore;
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <th className="px-4 py-3 w-12">Rank</th>
            <th className="px-4 py-3">Manager</th>
            <th className="px-4 py-3">Segment</th>
            <th className="px-4 py-3 text-center">Customers</th>
            <th className="px-4 py-3 text-center">Projects</th>
            <th className="px-4 py-3 text-center">On-Time %</th>
            <th className="px-4 py-3 text-center">PMO Hygiene</th>
            <th className="px-4 py-3">Score</th>
            <th className="px-4 py-3 text-center">Vs. Leader</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.segment}-${r.manager}`} className={`border-b border-gray-100 last:border-0 ${i < 3 ? 'bg-amber-50/40' : ''}`}>
              <td className="px-4 py-3 font-bold text-gray-400">{i + 1}</td>
              <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{r.manager}</td>
              <td className="px-4 py-3">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.segment === 'ENT' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                  {r.segment}
                </span>
              </td>
              <td className="px-4 py-3 text-center text-gray-600">{r.distinctCustomers}</td>
              <td className="px-4 py-3 text-center text-gray-600">{r.totalProjects}</td>
              <td className="px-4 py-3 text-center">
                <span className={r.pctOnTime >= 80 ? 'text-green-600' : r.pctOnTime >= 60 ? 'text-amber-600' : 'text-red-600'}>
                  {r.pctOnTime}%
                </span>
              </td>
              <td className="px-4 py-3 text-center text-gray-600">{r.hygieneScore ?? '—'}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2 min-w-[120px]">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${r.compositeScore >= 70 ? 'bg-green-500' : r.compositeScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, r.compositeScore)}%` }}
                    />
                  </div>
                  <span className="font-bold text-gray-800 w-6 text-right">{r.compositeScore}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-center text-xs">
                {i === 0
                  ? <span className="text-green-600 font-semibold">Leader</span>
                  : <span className="text-gray-500">−{leaderScore - r.compositeScore}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeaderboardView() {
  const { data, isLoading } = useManagerDashboardLeaderboard();
  const [segmentFilter, setSegmentFilter] = useState<'ALL' | 'ENT' | 'SMB'>('ALL');

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
      </div>
    );
  }

  const payload = data?.data as { overall: LeaderboardRow[]; ENT: LeaderboardRow[]; SMB: LeaderboardRow[] } | undefined;
  const rows: LeaderboardRow[] = (segmentFilter === 'ALL' ? payload?.overall : payload?.[segmentFilter]) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Manager Leaderboard</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Ranked by customer volume (30%, relative to peers in the same segment), on-time delivery (35%), and PMO Hygiene (35%)
          </p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['ALL', 'ENT', 'SMB'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSegmentFilter(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                segmentFilter === s ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s === 'ALL' ? 'All Managers' : s}
            </button>
          ))}
        </div>
      </div>
      <LeaderboardInsights rows={rows} />
      <LeaderboardTable rows={rows} />
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

// ─── Action Items View ────────────────────────────────────────────────────────

// Single Green/Orange/Red status field — replaces the old separate Status
// (Done/WIP/Open) and Priority (Low/Medium/High) fields. Still stored in the
// same `status` column (OPEN/IN_PROGRESS/DONE) so no backend/schema change
// was needed — this is purely how it's presented and edited now.
const STATUS_DOT: Record<string, { letter: string; short: string; label: string; cls: string; dotCls: string }> = {
  DONE: { letter: 'G', short: 'Done', label: 'Green — Done', cls: 'bg-emerald-100 text-emerald-700 border-emerald-300', dotCls: 'bg-emerald-500' },
  IN_PROGRESS: { letter: 'O', short: 'In Progress', label: 'Orange — In Progress', cls: 'bg-orange-100 text-orange-700 border-orange-300', dotCls: 'bg-orange-500' },
  OPEN: { letter: 'R', short: 'Not Started', label: 'Red — Not Started', cls: 'bg-red-100 text-red-700 border-red-300', dotCls: 'bg-red-500' },
};
const STATUS_ORDER = ['DONE', 'IN_PROGRESS', 'OPEN'] as const;

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_SHORT_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// One card per calendar month (Jan–Dec) for the selected year — no day-level
// dates, since items are only ever tracked by month + year. Each item is
// editable inline right where it lives; there's no separate table/filter UI
// to keep this simple.
function ActionItemsView() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER';

  const { data: itemsResp, isLoading } = useActionItems();
  const createItem = useCreateActionItem();
  const updateItem = useUpdateActionItem();
  const deleteItem = useDeleteActionItem();

  const allItems: any[] = itemsResp ?? [];

  // One month in view at a time (like a phone calendar) instead of 12 cards
  // on screen at once — far less to scan, and Prev/Next/Today is a familiar
  // pattern people already know.
  const [monthKey, setMonthKey] = useState(currentMonthStr());
  const shiftMonth = (delta: number) => {
    setMonthKey((mk) => {
      const [y, m] = mk.split('-').map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  };
  const [y, m] = monthKey.split('-').map(Number);
  const monthLabel = `${MONTH_SHORT_NAMES[m - 1]} ${y}`;
  const isCurrentMonth = monthKey === currentMonthStr();
  const isPastMonth = monthKey < currentMonthStr();

  const items = useMemo(
    () => allItems.filter((i) => i.month === monthKey),
    [allItems, monthKey]
  );

  const [showAdd, setShowAdd] = useState(false);
  const [addText, setAddText] = useState('');
  const [addAccountable, setAddAccountable] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editAccountable, setEditAccountable] = useState('');

  const submitAdd = async () => {
    if (!addText.trim()) {
      showToast('warning', 'Action item required', 'Type what needs to be done.');
      return;
    }
    try {
      await createItem.mutateAsync({
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        month: monthKey, item: addText, accountable: addAccountable, status: 'OPEN',
      });
      showToast('success', 'Action item added');
      setAddText(''); setAddAccountable(''); setShowAdd(false);
    } catch (err: any) {
      showToast('error', 'Save failed', err?.response?.data?.error?.message || err?.message || 'Could not save the action item.');
    }
  };

  const startEdit = (i: any) => {
    setEditingId(i.id);
    setEditText(i.item);
    setEditAccountable(i.accountable || '');
  };
  const cancelEdit = () => setEditingId(null);

  const submitEdit = async (id: string) => {
    if (!editText.trim()) {
      showToast('warning', 'Action item required', 'Type what needs to be done.');
      return;
    }
    try {
      await updateItem.mutateAsync({ id, data: { item: editText, accountable: editAccountable } });
      showToast('success', 'Action item updated');
      setEditingId(null);
    } catch (err: any) {
      showToast('error', 'Save failed', err?.response?.data?.error?.message || err?.message || 'Could not save the action item.');
    }
  };

  const setStatus = async (i: any, status: string) => {
    if (!canEdit || i.status === status) return;
    try {
      await updateItem.mutateAsync({ id: i.id, data: { status } });
    } catch {
      showToast('error', 'Could not update status', 'Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this action item? This cannot be undone.')) return;
    try {
      await deleteItem.mutateAsync(id);
      showToast('success', 'Action item deleted');
    } catch {
      showToast('error', 'Delete failed', 'Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 py-2">
      {/* Month switcher */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={() => shiftMonth(-1)} title="Previous month"
          className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors">
          <ChevronLeft size={15} />
        </button>
        <span className="text-lg font-bold text-gray-800 w-32 text-center">{monthLabel}</span>
        <button onClick={() => shiftMonth(1)} title="Next month"
          className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors">
          <ChevronRight size={15} />
        </button>
        {!isCurrentMonth && (
          <button onClick={() => setMonthKey(currentMonthStr())}
            className="text-xs font-medium text-indigo-600 hover:underline">
            Today
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="divide-y divide-gray-50">
          {items.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">No action items for {monthLabel} yet.</p>
          )}

          {items.map((i) => {
            const overdue = isPastMonth && i.status !== 'DONE';
            const isEditingThis = editingId === i.id;

            if (isEditingThis) {
              return (
                <div key={i.id} className="px-4 py-3 space-y-2 bg-indigo-50/40">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    autoFocus
                    className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5"
                    placeholder="What needs to be done…"
                  />
                  <input
                    type="text"
                    value={editAccountable}
                    onChange={(e) => setEditAccountable(e.target.value)}
                    placeholder="Who owns this… (optional)"
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button onClick={cancelEdit} className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-100">Cancel</button>
                    <button
                      onClick={() => submitEdit(i.id)}
                      disabled={updateItem.isPending}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Check size={11} /> Save
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={i.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-gray-700 leading-snug flex-1 min-w-0">{i.item}</p>
                  {canEdit && (
                    <div className="flex-shrink-0 flex items-center gap-1">
                      <button onClick={() => startEdit(i)} title="Edit" className="text-gray-300 hover:text-indigo-600">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleDelete(i.id)} title="Delete" className="text-gray-300 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {/* Explicit status buttons, not a click-to-cycle dot — what
                      each color means and how to change it is visible at a glance. */}
                  <div className="flex items-center gap-1">
                    {STATUS_ORDER.map((k) => {
                      const s = STATUS_DOT[k];
                      const active = i.status === k;
                      return (
                        <button
                          key={k}
                          onClick={() => setStatus(i, k)}
                          disabled={!canEdit}
                          title={s.label}
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                            active ? s.cls : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'
                          } ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                          {s.short}
                        </button>
                      );
                    })}
                  </div>
                  {i.accountable && <span className="text-xs text-gray-400">· {i.accountable}</span>}
                  {overdue && <span className="text-[10px] font-semibold text-red-600">Overdue</span>}
                </div>
              </div>
            );
          })}
        </div>

        {canEdit && (
          showAdd ? (
            <div className="px-4 py-3 space-y-2 bg-indigo-50/40 border-t border-gray-100">
              <textarea
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                rows={2}
                autoFocus
                placeholder="What needs to be done…"
                className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5"
              />
              <input
                type="text"
                value={addAccountable}
                onChange={(e) => setAddAccountable(e.target.value)}
                placeholder="Who owns this… (optional)"
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5"
              />
              <div className="flex justify-end gap-1.5">
                <button onClick={() => { setShowAdd(false); setAddText(''); setAddAccountable(''); }} className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-100">Cancel</button>
                <button
                  onClick={submitAdd}
                  disabled={createItem.isPending}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Check size={11} /> Add
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 border-t border-gray-100 transition-colors"
            >
              <Plus size={13} /> Add item for {monthLabel}
            </button>
          )
        )}
      </div>
    </div>
  );
}

