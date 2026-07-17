'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { auditApi } from '@/services/api';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import {
  ScrollText, RefreshCw, Download, AlertCircle, Loader2,
  ChevronLeft, ChevronRight, Calendar, Trophy, Siren, DollarSign,
  Building2, Users, Presentation, Printer, X, Sparkles,
} from 'lucide-react';
import { format, subDays, addDays } from 'date-fns';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const ENT_COLOR = '#7c3aed';
const SMB_COLOR = '#0891b2';

interface WeekTrendPoint {
  weekStart: string;
  weekEnd: string;
  ENT: { total: number; completed: number; escalations: number; overageAmount: number };
  SMB: { total: number; completed: number; escalations: number; overageAmount: number };
}

function TrendCharts({ trend, isLoading }: { trend: WeekTrendPoint[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
      </Card>
    );
  }
  if (trend.length === 0) return null;

  const chartData = trend.map((w) => ({
    week: format(new Date(w.weekStart), 'MMM d'),
    'ENT Completed': w.ENT.completed,
    'SMB Completed': w.SMB.completed,
    'ENT Escalations': w.ENT.escalations,
    'SMB Escalations': w.SMB.escalations,
    'ENT Overage': w.ENT.overageAmount,
    'SMB Overage': w.SMB.overageAmount,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Completed projects, week on week</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="ENT Completed" stroke={ENT_COLOR} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="SMB Completed" stroke={SMB_COLOR} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Escalations, week on week</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="ENT Escalations" fill={ENT_COLOR} radius={[3, 3, 0, 0]} />
            <Bar dataKey="SMB Escalations" fill={SMB_COLOR} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Overage $, week on week</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
            <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="ENT Overage" fill={ENT_COLOR} radius={[3, 3, 0, 0]} />
            <Bar dataKey="SMB Overage" fill={SMB_COLOR} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700', 'bg-teal-100 text-teal-700',
  'bg-amber-100 text-amber-700', 'bg-pink-100 text-pink-700', 'bg-green-100 text-green-700',
];
function avatarColor(name: string) {
  const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

interface LeaderboardRow {
  id: string;
  name: string;
  email: string;
  segment: 'SMB' | 'ENT';
  total: number;
  completed: number;
  completionRate: number;
  newlyAdded: number;
  escalations: number;
  overageCount: number;
  overageAmount: number;
}

function ManagerBoard({ title, rows }: { title: string; rows: LeaderboardRow[] }) {
  return (
    <Card padding="none" className="overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-primary-500" />
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <span className="text-xs text-gray-400 ml-auto">completed · newly added · escalations · overage</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-400 text-center">No managers with data for this range</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="py-2 px-4 text-xs font-semibold text-gray-500">Manager</th>
                <th className="py-2 px-4 text-xs font-semibold text-gray-500 text-right">Total</th>
                <th className="py-2 px-4 text-xs font-semibold text-gray-500 text-right">Completed</th>
                <th className="py-2 px-4 text-xs font-semibold text-gray-500 text-right">Newly Added</th>
                <th className="py-2 px-4 text-xs font-semibold text-gray-500 text-right">Escalations</th>
                <th className="py-2 px-4 text-xs font-semibold text-gray-500 text-right">Overage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-400 w-4">{i + 1}</span>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${avatarColor(r.name)}`}>
                        {initials(r.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900 truncate max-w-[150px]">{r.name}</p>
                        {r.email && <p className="text-xs text-gray-400 truncate max-w-[150px]">{r.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right text-gray-700">{r.total}</td>
                  <td className="py-2.5 px-4 text-right">
                    <span className="text-sm font-semibold text-gray-900">{r.completed}</span>
                    <span className="text-xs text-gray-400"> / {r.total}</span>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {r.newlyAdded > 0 ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-600">+{r.newlyAdded}</span>
                    ) : (
                      <span className="text-xs text-gray-400">0</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {r.escalations > 0 ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-50 text-red-600">{r.escalations} active</span>
                    ) : (
                      <span className="text-xs text-gray-400">0</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {r.overageCount > 0 ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-pink-50 text-pink-600">{r.overageCount}</span>
                    ) : (
                      <span className="text-xs text-gray-400">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// Big-format, chrome-free view of the same real data — meant to be
// screen-shared or printed in a monthly call, not clicked around in.
function PresentationView({
  weekStart, weekEnd, board, onClose,
}: {
  weekStart: string; weekEnd: string; board: any; onClose: () => void;
}) {
  const summary = board?.summary;
  const segments: Array<'ENT' | 'SMB'> = ['ENT', 'SMB'];

  return (
    <div className="presentation-print-root fixed inset-0 z-50 bg-white overflow-y-auto print:static">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .presentation-print-root, .presentation-print-root * { visibility: visible; }
          .presentation-print-root { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      <div className="max-w-5xl mx-auto px-8 py-10 print:px-0 print:py-0">
        <div className="flex items-start justify-between mb-8 print:hidden">
          <div>
            <p className="text-xs font-semibold text-primary-600 uppercase tracking-wide">Monthly Snapshot</p>
            <h1 className="text-3xl font-bold text-gray-900 mt-1">Manager Leaderboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              {format(new Date(weekStart), 'MMM d')} – {format(new Date(weekEnd), 'MMM d, yyyy')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <Printer size={14} /> Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Print-only header */}
        <div className="hidden print:block mb-8">
          <p className="text-xs font-semibold text-primary-600 uppercase tracking-wide">Monthly Snapshot</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Manager Leaderboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {format(new Date(weekStart), 'MMM d')} – {format(new Date(weekEnd), 'MMM d, yyyy')}
          </p>
        </div>

        {/* Headline numbers */}
        <div className="grid grid-cols-4 gap-4 mb-10">
          <div className="text-center p-4 rounded-xl bg-red-50">
            <p className="text-3xl font-bold text-red-600">{summary?.totalEscalations ?? 0}</p>
            <p className="text-xs text-gray-600 mt-1">Escalations</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-pink-50">
            <p className="text-3xl font-bold text-pink-600">${(summary?.totalOverageAmount ?? 0).toLocaleString()}</p>
            <p className="text-xs text-gray-600 mt-1">Overage</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-purple-50">
            <p className="text-3xl font-bold text-purple-600">{summary?.entProjects ?? 0}</p>
            <p className="text-xs text-gray-600 mt-1">Enterprise Projects</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-teal-50">
            <p className="text-3xl font-bold text-teal-600">{summary?.smbProjects ?? 0}</p>
            <p className="text-xs text-gray-600 mt-1">SMB Projects</p>
          </div>
        </div>

        {segments.map((seg) => {
          const pmRows: LeaderboardRow[] = board?.projectManagers?.[seg] || [];
          const amRows: LeaderboardRow[] = board?.accountManagers?.[seg] || [];
          const insights = buildInsights(pmRows, amRows, summary, seg === 'ENT' ? 'Enterprise' : 'SMB');
          return (
            <div key={seg} className="mb-10 break-inside-avoid">
              <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${seg === 'ENT' ? 'bg-purple-500' : 'bg-teal-500'}`} />
                {seg === 'ENT' ? 'Enterprise' : 'SMB'}
              </h2>

              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4">
                <Sparkles size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                  {insights.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ManagerBoard title="Project Managers" rows={pmRows} />
                <ManagerBoard title="Account Managers" rows={amRows} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Turns the raw leaderboard numbers into plain-English bullets — this is
// what a non-technical audience in a monthly call actually reads, not the
// tables themselves.
function buildInsights(pmRows: LeaderboardRow[], amRows: LeaderboardRow[], summary: any, segmentLabel: string): string[] {
  const insights: string[] = [];
  const allRows = [...pmRows, ...amRows];

  if (allRows.length === 0) {
    return [`No ${segmentLabel} project activity recorded for this period.`];
  }

  const topPm = [...pmRows].sort((a, b) => b.completed - a.completed)[0];
  if (topPm && topPm.total > 0) {
    insights.push(`${topPm.name} leads ${segmentLabel} project managers with ${topPm.completed} of ${topPm.total} project${topPm.total !== 1 ? 's' : ''} completed.`);
  }

  const topAm = [...amRows].sort((a, b) => b.completed - a.completed)[0];
  if (topAm && topAm.total > 0) {
    insights.push(`${topAm.name} leads ${segmentLabel} account managers with ${topAm.completed} of ${topAm.total} project${topAm.total !== 1 ? 's' : ''} completed.`);
  }

  const escalated = allRows.filter((r) => r.escalations > 0);
  if (escalated.length > 0) {
    const names = escalated.map((r) => r.name).slice(0, 3).join(', ');
    insights.push(`${escalated.reduce((s, r) => s + r.escalations, 0)} active escalation${escalated.reduce((s, r) => s + r.escalations, 0) !== 1 ? 's' : ''} this period, concentrated with ${names}${escalated.length > 3 ? ' and others' : ''}.`);
  } else {
    insights.push(`No active escalations for ${segmentLabel} this period.`);
  }

  const overaged = allRows.filter((r) => r.overageCount > 0);
  if (overaged.length > 0) {
    const totalCount = overaged.reduce((s, r) => s + r.overageCount, 0);
    insights.push(`${totalCount} overaged project${totalCount !== 1 ? 's' : ''} across ${overaged.length} manager${overaged.length !== 1 ? 's' : ''}.`);
  } else {
    insights.push(`No overage recorded for ${segmentLabel} this period.`);
  }

  return insights;
}

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'STATUS_CHANGE', 'EXPORT'];

const ACTION_STYLE: Record<string, string> = {
  CREATE: 'bg-green-50 text-green-700 border-green-200',
  UPDATE: 'bg-blue-50 text-blue-700 border-blue-200',
  DELETE: 'bg-red-50 text-red-700 border-red-200',
  LOGIN: 'bg-gray-50 text-gray-700 border-gray-200',
  LOGOUT: 'bg-gray-50 text-gray-700 border-gray-200',
  PASSWORD_CHANGE: 'bg-purple-50 text-purple-700 border-purple-200',
  STATUS_CHANGE: 'bg-amber-50 text-amber-700 border-amber-200',
  EXPORT: 'bg-teal-50 text-teal-700 border-teal-200',
};

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AuditReportPage() {
  const [activeTab, setActiveTab] = useState<'log' | 'leaderboard'>('log');

  const today = new Date();
  const [startDate, setStartDate] = useState(format(subDays(today, 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(today, 'yyyy-MM-dd'));
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  // Weekly snapshot — Manager Leaderboard tab
  const [weekStart, setWeekStart] = useState(() => format(subDays(today, 6), 'yyyy-MM-dd'));
  const [weekEnd, setWeekEnd] = useState(() => format(today, 'yyyy-MM-dd'));
  const [showPresentation, setShowPresentation] = useState(false);

  const shiftWeek = (dir: 1 | -1) => {
    setWeekStart(format(addDays(new Date(weekStart), dir * 7), 'yyyy-MM-dd'));
    setWeekEnd(format(addDays(new Date(weekEnd), dir * 7), 'yyyy-MM-dd'));
  };

  const { data: leaderboardData, isLoading: leaderboardLoading, refetch: refetchLeaderboard } = useQuery({
    queryKey: ['managerLeaderboard', weekStart, weekEnd],
    queryFn: () => auditApi.getManagerLeaderboard({
      startDate: new Date(weekStart).toISOString(),
      endDate: new Date(new Date(weekEnd).setHours(23, 59, 59, 999)).toISOString(),
    }),
    enabled: activeTab === 'leaderboard',
  });

  const board = leaderboardData?.data;
  const summary = board?.summary;

  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey: ['weeklyTrend', weekEnd],
    queryFn: () => auditApi.getWeeklyTrend({ endDate: new Date(weekEnd).toISOString(), weeks: 8 }),
    enabled: activeTab === 'leaderboard',
  });
  const trend: WeekTrendPoint[] = trendData?.data || [];

  useEffect(() => { setPage(1); }, [startDate, endDate, action, entityType]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['auditLog', startDate, endDate, action, entityType, page],
    queryFn: () => auditApi.getAll({
      page, limit,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      endDate: endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)).toISOString() : undefined,
      action: action || undefined,
      entityType: entityType || undefined,
    }),
    enabled: activeTab === 'log',
  });

  const logs: any[] = data?.data || [];
  const pagination = data?.pagination;

  const [isExporting, setIsExporting] = useState(false);

  async function handleExportLog() {
    setIsExporting(true);
    try {
      const blob = await auditApi.exportLogExcel({
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)).toISOString() : undefined,
        action: action || undefined,
        entityType: entityType || undefined,
      });
      downloadBlob(blob, `audit-log-${startDate}-to-${endDate}.xlsx`);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleExportLeaderboard() {
    setIsExporting(true);
    try {
      const blob = await auditApi.exportLeaderboardExcel({
        startDate: new Date(weekStart).toISOString(),
        endDate: new Date(new Date(weekEnd).setHours(23, 59, 59, 999)).toISOString(),
      });
      downloadBlob(blob, `manager-leaderboard-${weekStart}-to-${weekEnd}.xlsx`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <nav className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Link href="/" className="hover:text-primary-600">Dashboard</Link>
            <span>/</span>
            <span className="text-gray-700">Audit Report</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ScrollText size={22} className="text-primary-600" /> Audit Report
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Who changed what, and when — across the whole application</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => (activeTab === 'log' ? refetch() : refetchLeaderboard())}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {activeTab === 'log' && (
            <button
              onClick={handleExportLog}
              disabled={logs.length === 0 || isExporting}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export to Excel
            </button>
          )}
          {activeTab === 'leaderboard' && (
            <>
              <button
                onClick={handleExportLeaderboard}
                disabled={!board || isExporting}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export to Excel
              </button>
              <button
                onClick={() => setShowPresentation(true)}
                disabled={!board}
                title="Full-screen view for screen-sharing or printing in a meeting"
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Presentation size={14} /> Present
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-4">
        <button
          onClick={() => setActiveTab('log')}
          className={`flex items-center gap-1.5 pb-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'log' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ScrollText size={14} /> Activity Log
        </button>
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`flex items-center gap-1.5 pb-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'leaderboard' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Trophy size={14} /> Manager Leaderboard
        </button>
      </div>

      {activeTab === 'log' ? (
      <>
      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
              <Calendar size={12} /> Start date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
              <Calendar size={12} /> End date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
            <Select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              options={[{ value: '', label: 'All actions' }, ...ACTIONS.map((a) => ({ value: a, label: a.replace('_', ' ') }))]}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Entity type</label>
            <input
              type="text"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              placeholder="e.g. project, user..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card padding="none" className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-red-500">
            <AlertCircle size={28} />
            <p className="text-sm">Failed to load audit log</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
            <ScrollText size={28} />
            <p className="text-sm">No activity found for this filter</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600 whitespace-nowrap">Timestamp</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">User</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">Action</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">Entity</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-600">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">
                      {l.createdAt ? format(new Date(l.createdAt), 'MMM d, yyyy h:mm a') : '—'}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="text-gray-900">{l.user?.name || '—'}</div>
                      {l.user?.email && <div className="text-xs text-gray-400">{l.user.email}</div>}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${ACTION_STYLE[l.action] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                        {l.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="text-gray-900">{l.entityName || l.entityId || '—'}</div>
                      <div className="text-xs text-gray-400">{l.entityType}</div>
                    </td>
                    <td className="py-2.5 px-4 text-gray-500">{l.ipAddress || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
            <span>Page {pagination.page} of {pagination.totalPages} · {pagination.total} total</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="p-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </Card>
      </>
      ) : (
      <>
      {/* Week navigator */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => shiftWeek(-1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
              title="Previous week"
            >
              <ChevronLeft size={15} />
            </button>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {format(new Date(weekStart), 'MMM d')} – {format(new Date(weekEnd), 'MMM d, yyyy')}
              </p>
              <p className="text-xs text-gray-400">Weekly snapshot</p>
            </div>
            <button
              onClick={() => shiftWeek(1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
              title="Next week"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </Card>

      {/* Snapshot stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
            <Siren size={18} className="text-red-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Escalations this week</p>
            <p className="text-xl font-bold text-gray-900">{summary?.totalEscalations ?? '—'}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-pink-50 flex items-center justify-center flex-shrink-0">
            <DollarSign size={18} className="text-pink-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Overage amount</p>
            <p className="text-xl font-bold text-gray-900">${(summary?.totalOverageAmount ?? 0).toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
            <Building2 size={18} className="text-purple-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Enterprise projects</p>
            <p className="text-xl font-bold text-gray-900">{summary?.entProjects ?? '—'}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
            <Users size={18} className="text-teal-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500">SMB projects</p>
            <p className="text-xl font-bold text-gray-900">{summary?.smbProjects ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Week-on-week trend — ENT vs SMB, so the story over time is visible at a glance */}
      <TrendCharts trend={trend} isLoading={trendLoading} />

      {leaderboardLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {(['ENT', 'SMB'] as const).map((seg) => {
            const segPmRows: LeaderboardRow[] = board?.projectManagers?.[seg] || [];
            const segAmRows: LeaderboardRow[] = board?.accountManagers?.[seg] || [];
            const segLabel = seg === 'ENT' ? 'Enterprise' : 'SMB';
            return (
              <div key={seg} className="space-y-3">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${seg === 'ENT' ? 'bg-purple-500' : 'bg-teal-500'}`} />
                  {segLabel}
                </h2>

                {/* Plain-language summary — read this instead of the tables during a call */}
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <Sparkles size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
                    {buildInsights(segPmRows, segAmRows, summary, segLabel).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>

                <ManagerBoard title="Project Managers" rows={segPmRows} />
                <ManagerBoard title="Account Managers" rows={segAmRows} />
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {showPresentation && (
        <PresentationView
          weekStart={weekStart}
          weekEnd={weekEnd}
          board={board}
          onClose={() => setShowPresentation(false)}
        />
      )}
    </div>
  );
}
