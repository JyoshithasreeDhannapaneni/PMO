'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useManagerGoalsWithStats, useJiraSla, useJiraEngineers, useJiraExcelStatus, useJiraOAuthStatus, useEscalatedProjects } from '@/hooks/useProjects';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Loader2, AlertCircle, X, PlayCircle, PauseCircle,
  CheckCircle, Clock, ChevronRight, Search, Link2Off,
  ArrowLeft, ExternalLink, Upload, FileSpreadsheet, Trash2,
} from 'lucide-react';
import api from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Segment = 'ENT' | 'SMB';
type ActiveTab = 'ENT' | 'SMB' | 'ENGINEERS';

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

// Future contract for Jira SLA — wired up when credentials are configured
interface JiraSlaData {
  ticketCount: number;
  breachCount: number;
  breachRate: number;
  firstResponseBreaches: number;
  resolutionBreaches: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SEGMENT_CONFIG: { label: Segment; managers: string[] }[] = [
  { label: 'ENT', managers: ['Abhishek Sakala', 'Lakshmi Prasanna'] },
  { label: 'SMB', managers: ['Ajay Singh', 'Abhishikth', 'Harika', 'Sravan', 'Raghu Yellani'] },
];

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
                <p className="text-sm font-semibold text-green-800">
                  Jira data loaded from Excel
                </p>
                <p className="text-xs text-green-700 mt-0.5">
                  <span className="font-medium">{data.filename}</span>
                  {' · '}{data.ticketCount} tickets
                  {' · '}Uploaded {new Date(data.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                {data.columnMap && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {[
                      { key: 'pm',       label: 'Project Manager' },
                      { key: 'customer', label: 'Customer Name'   },
                      { key: 'assignee', label: 'Assignee'        },
                      { key: 'frSla',    label: 'FR SLA Breach'   },
                      { key: 'resSla',   label: 'Resolution SLA Breach' },
                    ].map(({ key, label }) => {
                      const val = data.columnMap[key];
                      const found = val && val !== 'NOT FOUND';
                      return (
                        <span key={key} className={`text-xs ${found ? 'text-green-700' : 'text-gray-400'}`}>
                          {label}: <span className="font-medium">{found ? '✓' : '—'}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-blue-800">Upload Jira Export (Excel)</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  Export tickets from Jira using the Excel add-in or native export, then upload here to display SLA data.
                </p>
                <p className="text-xs text-blue-500 mt-1">
                  Required columns: <span className="font-medium">Assignee, Project Manager</span> · Optional: Customer/Organization, Time to first response, Time to resolution
                </p>
              </>
            )}
            {uploadError && (
              <p className="text-xs text-red-600 mt-1 font-medium">{uploadError}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {available && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg transition"
            >
              <Trash2 size={13} />
              Remove
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition whitespace-nowrap
              ${available
                ? 'bg-white border border-green-300 text-green-700 hover:bg-green-50'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              } disabled:opacity-60`}
          >
            {uploading ? (
              <><Loader2 size={14} className="animate-spin" /> Uploading…</>
            ) : (
              <><Upload size={14} /> {available ? 'Replace File' : 'Upload Excel'}</>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Jira OAuth connection button ────────────────────────────────────────────

function JiraOAuthBanner() {
  const { data, isLoading, refetch } = useJiraOAuthStatus();
  const queryClient = useQueryClient();

  if (isLoading) return null;

  const handleDisconnect = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
    await fetch(`${API_BASE_URL}/api/jira/oauth/disconnect`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    queryClient.invalidateQueries({ queryKey: ['jira-oauth-status'] });
    queryClient.invalidateQueries({ queryKey: ['jira-sla'] });
    queryClient.invalidateQueries({ queryKey: ['jira-engineers'] });
    refetch();
  };

  // Connected
  if (data?.connected) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <CheckCircle size={15} className="text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800">
            <span className="font-semibold">Jira connected via OAuth</span>
            {data.connectedAs && <span className="text-green-600 ml-1">as {data.connectedAs}</span>}
          </p>
        </div>
        <button onClick={handleDisconnect} className="text-xs text-red-500 hover:text-red-700 font-medium transition">
          Disconnect
        </button>
      </div>
    );
  }

  // Configured but not connected — show compact connect button
  if (data?.configured) {
    return (
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ExternalLink size={15} className="text-indigo-500 flex-shrink-0" />
          <p className="text-sm text-indigo-800">
            Connect Jira via OAuth to pull live ticket data automatically.
          </p>
        </div>
        <a
          href={`${API_BASE_URL}/api/jira/oauth/connect`}
          className="flex-shrink-0 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition whitespace-nowrap"
        >
          Connect to Jira
        </a>
      </div>
    );
  }

  // Not configured — show minimal hint
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 flex items-center gap-2">
      <AlertCircle size={14} className="text-gray-400 flex-shrink-0" />
      <p className="text-xs text-gray-500">
        To connect Jira via OAuth, add <code className="bg-gray-100 px-1 rounded">JIRA_OAUTH_CLIENT_ID</code> &amp; <code className="bg-gray-100 px-1 rounded">JIRA_OAUTH_CLIENT_SECRET</code> to <code className="bg-gray-100 px-1 rounded">backend/.env</code> then restart.
      </p>
    </div>
  );
}

// ─── JiraSlaSection ──────────────────────────────────────────────────────────

interface TicketRow {
  key: string;
  summary: string;
  assignee: string;
  status: string;
  frBreached: boolean;
  resBreached: boolean;
}

interface JiraProject {
  customerName: string;
  totalTickets: number;
  breachCount: number;
  breachRate: number;
  firstResponseBreaches: number;
  resolutionBreaches: number;
  tickets: TicketRow[];
}

function TicketModal({ title, tickets, jiraBaseUrl, onClose }: {
  title: string;
  tickets: TicketRow[];
  jiraBaseUrl: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 p-6"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col"
        style={{ width: '90vw', maxWidth: '1000px', height: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-800">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''} · click any key to open in Jira</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          {tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
              <AlertCircle size={28} />
              <p className="text-sm">No tickets found.</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap w-32">Key</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">Summary</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">Assignee</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">Status</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">FR SLA</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">Resolution SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tickets.map((t, i) => (
                  <tr key={t.key || `row-${i}`} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-5 py-3 whitespace-nowrap">
                      {t.key ? (
                        <a
                          href={`${jiraBaseUrl}/browse/${t.key}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-primary-600 hover:text-primary-800 hover:underline inline-flex items-center gap-1.5"
                        >
                          {t.key}
                          <ExternalLink size={12} className="text-primary-400 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="text-gray-300 italic text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-700 max-w-sm" title={t.summary}>
                      <span className="line-clamp-2">{t.summary || '—'}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{t.assignee || '—'}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.status?.toLowerCase() === 'closed' || t.status?.toLowerCase() === 'done' || t.status?.toLowerCase() === 'resolved'
                          ? 'bg-green-100 text-green-700'
                          : t.status?.toLowerCase() === 'open' || t.status?.toLowerCase() === 'to do'
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {t.status || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {t.frBreached
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Breached</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-600">OK</span>}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {t.resBreached
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Breached</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-600">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function JiraSlaSection({ managerName }: { managerName: string }) {
  const { data, isLoading, isError } = useJiraSla(managerName);

  // Not configured yet
  if (!isLoading && (!data?.configured || data?.configured === false)) {
    return (
      <div className="border border-dashed border-gray-200 rounded-xl p-4 bg-gray-50 flex items-start gap-3">
        <Link2Off size={18} className="text-gray-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-gray-600">Jira SLA Tracking — No Data</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Upload a Jira Excel export using the button above to view SLA data for this manager.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="border border-gray-100 rounded-xl p-4 flex items-center gap-3">
        <Loader2 size={16} className="animate-spin text-primary-500 flex-shrink-0" />
        <p className="text-sm text-gray-500">Loading Jira SLA data for last month…</p>
      </div>
    );
  }

  if (isError || (data && !data.success)) {
    const msg = data?.error || 'Failed to load Jira SLA data.';
    return (
      <div className="border border-red-100 rounded-xl p-4 flex items-start gap-3 bg-red-50">
        <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-red-600">Jira API Error</p>
          <p className="text-xs text-red-500 mt-0.5">{msg}</p>
        </div>
      </div>
    );
  }

  const jira = data?.data;
  if (!jira || jira.projects.length === 0) {
    return (
      <div className="border border-gray-100 rounded-xl p-4 bg-gray-50 flex items-start gap-3">
        <ExternalLink size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-gray-600">Jira SLA — {jira?.period?.startDate} to {jira?.period?.endDate}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {jira?.hint
              ? jira.hint
              : 'No tickets found for this manager in this period.'}
          </p>
        </div>
      </div>
    );
  }

  const projects: JiraProject[] = jira.projects;
  const brColor = jira.overallBreachRate > 20 ? 'text-red-700' : jira.overallBreachRate > 10 ? 'text-yellow-700' : 'text-green-700';
  const brBg    = jira.overallBreachRate > 20 ? 'bg-red-50'    : jira.overallBreachRate > 10 ? 'bg-yellow-50'    : 'bg-green-50';
  const jiraBaseUrl: string = (data as any)?.jiraBaseUrl || 'https://cf2020.atlassian.net';

  return (
    <JiraSlaContent jira={jira} projects={projects} brColor={brColor} brBg={brBg} jiraBaseUrl={jiraBaseUrl} />
  );
}

function JiraSlaContent({ jira, projects, brColor, brBg, jiraBaseUrl }: {
  jira: any; projects: JiraProject[]; brColor: string; brBg: string; jiraBaseUrl: string;
}) {
  const [tableOpen, setTableOpen] = useState(false);
  const [ticketModal, setTicketModal] = useState<{ title: string; tickets: TicketRow[] } | null>(null);

  function openModal(title: string, tickets: TicketRow[]) {
    setTicketModal({ title, tickets });
  }

  return (
    <div className="space-y-3">
      {/* 3 summary KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 rounded-xl p-4 flex items-center gap-3 border border-white">
          <FileSpreadsheet size={20} className="text-blue-600" />
          <div>
            <p className="text-2xl font-bold text-blue-700">{jira.totalTickets}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total Tickets</p>
          </div>
        </div>
        <div className={`${jira.totalBreaches > 0 ? 'bg-red-50' : 'bg-green-50'} rounded-xl p-4 flex items-center gap-3 border border-white`}>
          <AlertCircle size={20} className={jira.totalBreaches > 0 ? 'text-red-600' : 'text-green-600'} />
          <div>
            <p className={`text-2xl font-bold ${jira.totalBreaches > 0 ? 'text-red-700' : 'text-green-700'}`}>{jira.totalBreaches}</p>
            <p className="text-xs text-gray-500 mt-0.5">Breaches</p>
          </div>
        </div>
        <div className={`${brBg} rounded-xl p-4 flex items-center gap-3 border border-white`}>
          <AlertCircle size={20} className={brColor} />
          <div>
            <p className={`text-2xl font-bold ${brColor}`}>{jira.overallBreachRate}%</p>
            <p className="text-xs text-gray-500 mt-0.5">Breach Rate</p>
          </div>
        </div>
      </div>

      {/* Collapsible ticket breakdown */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setTableOpen((o) => !o)}
          className="w-full px-5 py-3 flex items-center gap-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        >
          <h3 className="text-sm font-semibold text-gray-700 flex-shrink-0">Ticket Breakdown by Customer</h3>
          <span className="text-xs text-gray-400">{projects.length} customers</span>
          <ChevronRight
            size={15}
            className={`ml-auto text-gray-400 transition-transform duration-200 ${tableOpen ? 'rotate-90' : ''}`}
          />
        </button>

        {tableOpen && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Customer / Project', 'Total Tickets', 'FR Breaches', 'Resolution Breaches', 'Total Breaches', 'Breach Rate'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projects.map((p) => {
                  const rate = p.breachRate;
                  const rateColor = rate > 20 ? 'text-red-600' : rate > 10 ? 'text-yellow-600' : 'text-green-600';
                  const tickets: TicketRow[] = p.tickets ?? [];
                  return (
                    <tr key={p.customerName} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{p.customerName}</td>
                      <td
                        className="px-4 py-2.5 text-center font-semibold text-gray-700 cursor-pointer hover:text-primary-600 hover:bg-blue-50 transition-colors"
                        title="Click to view tickets"
                        onClick={() => openModal(`All Tickets — ${p.customerName}`, tickets)}
                      >
                        {p.totalTickets}
                      </td>
                      <td
                        className="px-4 py-2.5 text-center cursor-pointer hover:bg-red-50 transition-colors"
                        title="Click to view FR breached tickets"
                        onClick={() => openModal(`FR Breaches — ${p.customerName}`, tickets.filter((t) => t.frBreached))}
                      >
                        <span className={`font-semibold ${p.firstResponseBreaches > 0 ? 'text-red-600' : 'text-gray-400'}`}>{p.firstResponseBreaches}</span>
                      </td>
                      <td
                        className="px-4 py-2.5 text-center cursor-pointer hover:bg-red-50 transition-colors"
                        title="Click to view resolution breached tickets"
                        onClick={() => openModal(`Resolution Breaches — ${p.customerName}`, tickets.filter((t) => t.resBreached))}
                      >
                        <span className={`font-semibold ${p.resolutionBreaches > 0 ? 'text-red-600' : 'text-gray-400'}`}>{p.resolutionBreaches}</span>
                      </td>
                      <td
                        className="px-4 py-2.5 text-center cursor-pointer hover:bg-red-50 transition-colors"
                        title="Click to view all breached tickets"
                        onClick={() => openModal(`Total Breaches — ${p.customerName}`, tickets.filter((t) => t.frBreached || t.resBreached))}
                      >
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${p.breachCount > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{p.breachCount}</span>
                      </td>
                      <td
                        className="px-4 py-2.5 cursor-pointer hover:bg-red-50 transition-colors"
                        title="Click to view all breached tickets"
                        onClick={() => openModal(`Breached Tickets — ${p.customerName} (${rate}%)`, tickets.filter((t) => t.frBreached || t.resBreached))}
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[50px]">
                            <div className={`h-1.5 rounded-full ${rate > 20 ? 'bg-red-400' : rate > 10 ? 'bg-yellow-400' : 'bg-green-400'}`} style={{ width: `${Math.min(rate, 100)}%` }} />
                          </div>
                          <span className={`text-xs font-semibold w-9 text-right ${rateColor}`}>{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ticketModal && (
        <TicketModal
          title={ticketModal.title}
          tickets={ticketModal.tickets}
          jiraBaseUrl={jiraBaseUrl}
          onClose={() => setTicketModal(null)}
        />
      )}
    </div>
  );
}

// ─── ManagerDetailView (inline, not a popup) ─────────────────────────────────

function ManagerDetailView({
  stat,
  isOthers,
  onBack,
}: {
  stat: ManagerStat;
  isOthers: boolean;
  onBack: () => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [escalationsOpen, setEscalationsOpen] = useState(false);

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

      {/* Jira SLA section — outside and below Active Projects */}
      {!isOthers && <JiraSlaSection managerName={stat.manager} />}
    </div>
  );
}

// ─── Manager stats table row ──────────────────────────────────────────────────

function ManagerRow({
  name,
  stat,
  isOthers,
  onSelect,
}: {
  name: string;
  stat: ManagerStat | null;
  isOthers: boolean;
  onSelect: () => void;
}) {
  const initials = isOthers ? 'OT' : toInitials(name);
  const loading = stat === null;

  return (
    <tr
      onClick={onSelect}
      className="hover:bg-primary-50/40 cursor-pointer transition-colors group border-b border-gray-100 last:border-0"
    >
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700 flex-shrink-0 group-hover:bg-primary-200 transition-colors">
            {initials}
          </div>
          <span className="font-medium text-gray-900 text-sm">{name}</span>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ManagerDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('ENT');
  const [selectedManager, setSelectedManager] = useState<string | null>(null);
  const activeSegment = activeTab as Segment;
  const queryClient = useQueryClient();

  // Handle OAuth callback redirect (?jira_oauth=success or error)
  useState(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get('jira_oauth');
    if (oauthResult) {
      queryClient.invalidateQueries({ queryKey: ['jira-oauth-status'] });
      queryClient.invalidateQueries({ queryKey: ['jira-sla'] });
      queryClient.invalidateQueries({ queryKey: ['jira-engineers'] });
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  });

  const { data: statsData, isLoading: statsLoading } = useManagerGoalsWithStats();
  const allStats: ManagerStat[] = useMemo(() => {
    const raw: any[] = statsData?.data ?? [];
    return raw;
  }, [statsData]);

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

  const currentSegment = SEGMENT_CONFIG.find((s) => s.label === activeSegment)!;

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
      <div className="flex gap-1 border-b border-gray-200">
        {(['ENT', 'SMB', 'ENGINEERS'] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSelectedManager(null); }}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              activeTab === tab
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab === 'ENGINEERS' ? 'Engineers' : tab}
          </button>
        ))}
      </div>

      {/* Jira data banners — Excel upload + OAuth connect */}
      <div className="space-y-2">
        <ExcelUploadBanner />
        <JiraOAuthBanner />
      </div>

      {/* Engineers tab */}
      {activeTab === 'ENGINEERS' && <EngineersView />}

      {/* Manager stats table (ENT / SMB) */}
      {activeTab !== 'ENGINEERS' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {statsLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-[#1b4f72] text-white text-xs font-semibold">
                  <th className="px-5 py-3 text-left">Project Manager</th>
                  <th className="px-5 py-3 text-center">Total Projects</th>
                  <th className="px-5 py-3 text-center">On Time</th>
                  <th className="px-5 py-3 text-center">Delayed</th>
                  <th className="px-5 py-3 text-center">At Risk</th>
                  <th className="px-5 py-3 text-left min-w-[140px]">% On Time</th>
                  <th className="px-5 py-3 text-center whitespace-nowrap">Avg Delay (Days, Late Only)</th>
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {currentSegment.managers.map((name) => (
                  <ManagerRow
                    key={name}
                    name={name}
                    stat={getStatForManager(name)}
                    isOthers={false}
                    onSelect={() => setSelectedManager(name)}
                  />
                ))}
                {currentSegment.label === 'SMB' && (
                  <ManagerRow
                    key="others"
                    name="Others"
                    stat={othersStats}
                    isOthers={true}
                    onSelect={() => setSelectedManager('Others')}
                  />
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Engineers tab view ───────────────────────────────────────────────────────

function EngineersView() {
  const { data, isLoading, isError } = useJiraEngineers();
  const [ticketModal, setTicketModal] = useState<{ title: string; tickets: TicketRow[] } | null>(null);

  if (!isLoading && (!data?.configured || data?.configured === false)) {
    return (
      <div className="border border-dashed border-gray-200 rounded-xl p-6 bg-gray-50 flex items-start gap-3">
        <Link2Off size={18} className="text-gray-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-gray-600">Jira Not Connected</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Upload a Jira Excel export to enable this view.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3">
        <Loader2 size={20} className="animate-spin text-primary-500" />
        <p className="text-sm text-gray-500">Loading engineer ticket stats…</p>
      </div>
    );
  }

  if (isError || (data && !data.success)) {
    return (
      <div className="border border-red-100 rounded-xl p-4 bg-red-50 flex items-start gap-3">
        <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-red-600">Jira API Error</p>
          <p className="text-xs text-red-500 mt-0.5">{data?.error || 'Failed to load engineer stats.'}</p>
        </div>
      </div>
    );
  }

  const result = data?.data;
  if (!result) return null;

  const jiraBaseUrl: string = (data as any)?.jiraBaseUrl || 'https://cf2020.atlassian.net';
  const { engineers, totalTickets, totalBreached } = result;
  const overallRate = totalTickets > 0 ? ((totalBreached / totalTickets) * 100).toFixed(1) : '0.0';
  const rateNum = Number(overallRate);

  const engineerRows = (engineers as any[]).filter((e) => !NAMED_MANAGER_SET.has(e.engineerName));
  const allTickets: TicketRow[] = engineerRows.flatMap((e: any) => e.tickets ?? []);
  const allBreached: TicketRow[] = allTickets.filter((t) => t.frBreached || t.resBreached);

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <button
          className="bg-blue-50 rounded-xl p-4 flex items-center gap-3 border border-white hover:bg-blue-100 transition-colors text-left"
          onClick={() => setTicketModal({ title: 'All Tickets — Engineers', tickets: allTickets })}
        >
          <FileSpreadsheet size={20} className="text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-2xl font-bold text-blue-700">{totalTickets}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total Tickets</p>
          </div>
        </button>
        <button
          className={`${totalBreached > 0 ? 'bg-red-50 hover:bg-red-100' : 'bg-green-50 hover:bg-green-100'} rounded-xl p-4 flex items-center gap-3 border border-white transition-colors text-left`}
          onClick={() => setTicketModal({ title: 'Breached Tickets — Engineers', tickets: allBreached })}
        >
          <AlertCircle size={20} className={totalBreached > 0 ? 'text-red-600' : 'text-green-600'} />
          <div>
            <p className={`text-2xl font-bold ${totalBreached > 0 ? 'text-red-700' : 'text-green-700'}`}>{totalBreached}</p>
            <p className="text-xs text-gray-500 mt-0.5">Breached</p>
          </div>
        </button>
        <button
          className={`${rateNum > 20 ? 'bg-red-50 hover:bg-red-100' : rateNum > 10 ? 'bg-yellow-50 hover:bg-yellow-100' : 'bg-green-50 hover:bg-green-100'} rounded-xl p-4 flex items-center gap-3 border border-white transition-colors text-left`}
          onClick={() => setTicketModal({ title: 'Breached Tickets — Overall', tickets: allBreached })}
        >
          <AlertCircle size={20} className={rateNum > 20 ? 'text-red-600' : rateNum > 10 ? 'text-yellow-600' : 'text-green-600'} />
          <div>
            <p className={`text-2xl font-bold ${rateNum > 20 ? 'text-red-700' : rateNum > 10 ? 'text-yellow-700' : 'text-green-700'}`}>{overallRate}%</p>
            <p className="text-xs text-gray-500 mt-0.5">Overall Breach Rate</p>
          </div>
        </button>
      </div>

      {/* Engineers table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#1b4f72] text-white text-xs font-semibold">
              <th className="px-5 py-3 text-left">Engineer</th>
              <th className="px-5 py-3 text-center">Total Tickets</th>
              <th className="px-5 py-3 text-center">Breached Tickets</th>
              <th className="px-5 py-3 text-left min-w-[160px]">Breach Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {engineerRows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">
                  No engineer tickets found for this period.
                </td>
              </tr>
            )}
            {engineerRows.map((e: any) => {
              const rate = e.breachRate as number;
              const rateColor = rate > 20 ? 'text-red-600' : rate > 10 ? 'text-yellow-600' : 'text-green-600';
              const barColor  = rate > 20 ? 'bg-red-400' : rate > 10 ? 'bg-yellow-400' : 'bg-green-400';
              const eTickets: TicketRow[] = e.tickets ?? [];
              const eBreached: TicketRow[] = eTickets.filter((t: TicketRow) => t.frBreached || t.resBreached);
              return (
                <tr key={e.engineerName} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                        {toInitials(e.engineerName)}
                      </div>
                      <span className="font-medium text-gray-900 text-sm">{e.engineerName}</span>
                    </div>
                  </td>
                  <td
                    className="px-5 py-3.5 text-center cursor-pointer hover:bg-blue-50 transition-colors"
                    title="Click to view tickets"
                    onClick={() => setTicketModal({ title: `All Tickets — ${e.engineerName}`, tickets: eTickets })}
                  >
                    <span className="font-semibold text-gray-800 hover:text-primary-600">{e.totalTickets}</span>
                  </td>
                  <td
                    className="px-5 py-3.5 text-center cursor-pointer hover:bg-red-50 transition-colors"
                    title="Click to view breached tickets"
                    onClick={() => setTicketModal({ title: `Breached Tickets — ${e.engineerName}`, tickets: eBreached })}
                  >
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${e.breachedTickets > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                      {e.breachedTickets}
                    </span>
                  </td>
                  <td
                    className="px-5 py-3.5 cursor-pointer hover:bg-red-50 transition-colors"
                    title="Click to view breached tickets"
                    onClick={() => setTicketModal({ title: `Breached Tickets — ${e.engineerName} (${rate}%)`, tickets: eBreached })}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2 min-w-[80px]">
                        <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${Math.min(rate, 100)}%` }} />
                      </div>
                      <span className={`text-sm font-semibold w-10 text-right ${rateColor}`}>{rate}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ticketModal && (
        <TicketModal
          title={ticketModal.title}
          tickets={ticketModal.tickets}
          jiraBaseUrl={jiraBaseUrl}
          onClose={() => setTicketModal(null)}
        />
      )}
    </div>
  );
}
