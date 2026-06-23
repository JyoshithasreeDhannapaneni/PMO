'use client';

import { useState, useEffect, useCallback } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DelayIndicator } from '@/components/ui/DelayIndicator';
import { Button } from '@/components/ui/Button';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Project, ProjectPhaseRecord } from '@/types';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import {
  Calendar, User, Building2, DollarSign, Settings,
  AlertTriangle, Users, FileText, Server, Database,
  Layers, Siren, TrendingUp, Shield, GitPullRequest,
  Activity, History, Loader2, ExternalLink, CheckCircle,
  Clock, Circle, BarChart2, Package, ChevronRight,
  AlertCircle, RefreshCw, Eye, Edit, Pencil,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type TabId = 'overview' | 'timeline' | 'reports' | 'escalations' | 'overages' | 'resources' | 'documents' | 'activity' | 'audit';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'reports', label: 'Reports' },
  { id: 'escalations', label: 'Escalations' },
  { id: 'overages', label: 'Overages' },
  { id: 'resources', label: 'Resources' },
  { id: 'documents', label: 'Documents' },
  { id: 'activity', label: 'Activity Logs' },
  { id: 'audit', label: 'Audit History' },
];

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function apiFetch(path: string) {
  const res = await fetch(`${API_URL}${path}`, { headers: getAuthHeaders() });
  const json = await res.json();
  return json.success ? json.data : null;
}

// ─── Health calculation ────────────────────────────────────────────────────────
function calcProjectHealth(project: Project): { score: number; label: string; color: string; breakdown: { label: string; value: number; color: string }[] } {
  const scheduleScore = project.delayStatus === 'NOT_DELAYED' ? 100 : project.delayStatus === 'AT_RISK' ? 60 : 20;
  const budget = project.estimatedCost && project.actualCost
    ? Math.max(0, 100 - Math.round(((project.actualCost - project.estimatedCost) / project.estimatedCost) * 100))
    : 90;
  const budgetScore = Math.min(100, Math.max(0, budget));

  const phases = project.phases || [];
  const phaseScore = phases.length
    ? Math.round(phases.reduce((acc, p) => acc + (p.status === 'COMPLETED' ? 100 : p.status === 'IN_PROGRESS' ? 50 : p.status === 'SKIPPED' ? 100 : 0), 0) / phases.length)
    : 70;

  const resourceScore = 85;
  const ticketScore = 80;

  const score = Math.round((scheduleScore * 0.3 + budgetScore * 0.25 + phaseScore * 0.2 + resourceScore * 0.15 + ticketScore * 0.1));
  const label = score >= 75 ? 'Good' : score >= 50 ? 'Fair' : 'Poor';
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';

  return {
    score,
    label,
    color,
    breakdown: [
      { label: 'Schedule', value: scheduleScore, color: scheduleScore >= 75 ? '#22c55e' : scheduleScore >= 50 ? '#f59e0b' : '#ef4444' },
      { label: 'Budget', value: budgetScore, color: budgetScore >= 75 ? '#22c55e' : budgetScore >= 50 ? '#f59e0b' : '#ef4444' },
      { label: 'Phases', value: phaseScore, color: phaseScore >= 75 ? '#22c55e' : phaseScore >= 50 ? '#f59e0b' : '#ef4444' },
      { label: 'Resources', value: resourceScore, color: '#22c55e' },
      { label: 'Tickets', value: ticketScore, color: '#22c55e' },
    ],
  };
}

function calcDaysRemaining(project: Project): number {
  if (!project.plannedEnd) return 0;
  const end = new Date(project.plannedEnd);
  const today = new Date();
  return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function phaseActualProgress(status: string): number {
  if (status === 'COMPLETED' || status === 'SKIPPED') return 100;
  if (status === 'IN_PROGRESS') return 50;
  return 0;
}

function phasePlannedProgress(phase: ProjectPhaseRecord, projectStart: string | null, projectEnd: string | null): number {
  if (!phase.plannedDate) return 0;
  const now = new Date();
  const planned = new Date(phase.plannedDate);
  if (now >= planned) return 100;
  if (!projectStart) return 50;
  const start = new Date(projectStart);
  const total = planned.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, children, color = 'blue', extra }: {
  icon: any; label: string; children: React.ReactNode; color?: string; extra?: React.ReactNode;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600', orange: 'bg-orange-50 text-orange-600',
    gray: 'bg-gray-100 text-gray-600',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color] || colors.blue}`}>
          <Icon size={16} />
        </span>
      </div>
      <div className="text-xl font-bold text-gray-900 leading-tight">{children}</div>
      {extra && <div className="text-xs text-gray-500">{extra}</div>}
    </div>
  );
}

function ProgressBar({ value, color = '#3b82f6', bg = '#e5e7eb' }: { value: number; color?: string; bg?: string }) {
  return (
    <div className="w-full rounded-full h-1.5" style={{ backgroundColor: bg }}>
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }} />
    </div>
  );
}

function CircleGauge({ value, color, size = 80 }: { value: number; color: string; size?: number }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      <circle cx="40" cy="40" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
      <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 40 40)" />
      <text x="40" y="40" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="bold" fill={color}>
        {value}%
      </text>
    </svg>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-gray-700 mb-3">{children}</h3>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="text-center py-10 text-gray-400 text-sm">{message}</div>;
}

function TabLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
    </div>
  );
}

// ─── Tab: Overview ─────────────────────────────────────────────────────────────
function OverviewTab({ project }: { project: Project }) {
  const [risks, setRisks] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [latestReport, setLatestReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { settings } = useSettings();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [r, t, cr, lr] = await Promise.all([
        apiFetch(`/api/risks/project/${project.id}`),
        apiFetch(`/api/team/project/${project.id}`),
        apiFetch(`/api/change-requests/project/${project.id}`),
        apiFetch(`/api/reports/project/${project.id}/latest`),
      ]);
      setRisks(Array.isArray(r) ? r : []);
      setTeam(Array.isArray(t) ? t : []);
      setChangeRequests(Array.isArray(cr) ? cr : []);
      setLatestReport(lr || null);
      setLoading(false);
    };
    load();
  }, [project.id]);

  const health = calcProjectHealth(project);
  const daysRemaining = calcDaysRemaining(project);
  const budgetPct = project.estimatedCost && project.actualCost
    ? Math.round((project.actualCost / project.estimatedCost) * 100) : 0;
  const activeRisks = risks.filter(r => r.status !== 'CLOSED' && r.status !== 'RESOLVED');
  const riskLevel = activeRisks.length === 0 ? 'Low' : activeRisks.some(r => r.impact === 'HIGH' || r.impact === 'CRITICAL') ? 'High' : activeRisks.some(r => r.impact === 'MEDIUM') ? 'Medium' : 'Low';
  const openCRs = changeRequests.filter(cr => cr.status === 'PENDING' || cr.status === 'UNDER_REVIEW');
  const phases = project.phases || [];

  const migrationTypesList: { code: string; name: string; icon: string; color: string }[] = (() => {
    if (!project.migrationTypes) return [];
    const raw = project.migrationTypes.split(',').map((s: string) => s.trim()).filter(Boolean);
    return raw.map((r: string) => {
      const found = settings.migrationTypes.find(mt => mt.code === r.toUpperCase() || mt.name.toLowerCase() === r.toLowerCase());
      return found ?? { code: r, name: r, icon: '📋', color: '#6B7280' };
    });
  })();

  if (loading) return <TabLoader />;

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {/* Project Health */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-center gap-2 shadow-sm col-span-1">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide w-full">Project Health</span>
          <CircleGauge value={health.score} color={health.color} size={72} />
          <span className="text-xs font-semibold" style={{ color: health.color }}>{health.label}</span>
        </div>

        {/* Budget */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm col-span-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Budget (USD)</span>
            <DollarSign size={14} className="text-green-500" />
          </div>
          <div className="text-lg font-bold text-gray-900">{formatCurrency(project.estimatedCost)}</div>
          <div className="text-xs text-gray-500 mt-1">Total Budget</div>
          <ProgressBar value={budgetPct} color={budgetPct > 100 ? '#ef4444' : '#22c55e'} />
          <div className="text-xs text-gray-400 mt-1">{budgetPct}% Used</div>
        </div>

        {/* Change Requests */}
        <KpiCard icon={GitPullRequest} label="Change Requests" color="blue"
          extra={`Total: ${changeRequests.length}`}>
          <span className="text-blue-600">{openCRs.length}</span>
          <span className="text-sm font-normal text-gray-500 ml-1">Open</span>
        </KpiCard>

        {/* Risks */}
        <KpiCard icon={AlertTriangle} label="Risks" color={riskLevel === 'High' ? 'red' : riskLevel === 'Medium' ? 'amber' : 'green'}
          extra={`${activeRisks.length} Active Risk${activeRisks.length !== 1 ? 's' : ''}`}>
          <span className={riskLevel === 'High' ? 'text-red-600' : riskLevel === 'Medium' ? 'text-amber-600' : 'text-green-600'}>
            {riskLevel}
          </span>
        </KpiCard>

        {/* Escalations */}
        <KpiCard icon={Siren} label="Escalations" color={project.isEscalated ? 'red' : 'gray'}
          extra={project.escalationPriority || 'None'}>
          {project.isEscalated ? (
            <span className="text-red-600">{project.escalationPriority || 'Active'}</span>
          ) : (
            <span className="text-gray-400">None</span>
          )}
        </KpiCard>

        {/* Overage */}
        <KpiCard icon={DollarSign} label="Overage (USD)" color={project.isOveraged ? 'orange' : 'gray'}
          extra={project.isOveraged ? 'Additional Cost' : 'No overage'}>
          {project.isOveraged && project.overageAmount
            ? <span className="text-orange-600">{formatCurrency(project.overageAmount)}</span>
            : <span className="text-gray-400">—</span>}
        </KpiCard>

        {/* Days Remaining */}
        <KpiCard icon={Calendar} label="Days Remaining"
          color={daysRemaining < 0 ? 'red' : daysRemaining <= 7 ? 'amber' : 'blue'}
          extra={project.plannedEnd ? `Was: ${formatDate(project.plannedEnd)}` : ''}>
          <span className={daysRemaining < 0 ? 'text-red-600' : daysRemaining <= 7 ? 'text-amber-600' : 'text-blue-600'}>
            {daysRemaining < 0 ? `-${Math.abs(daysRemaining)}` : daysRemaining} Days
          </span>
          {daysRemaining < 0 && <span className="text-xs font-normal text-red-500 ml-1">Past Planned End</span>}
        </KpiCard>
      </div>

      {/* Migration Progress + Weekly Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Migration Progress */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <SectionTitle>Migration Progress</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left pb-2 font-medium">Phase</th>
                  <th className="text-left pb-2 font-medium">Actual Progress</th>
                  <th className="text-left pb-2 font-medium">Planned Progress</th>
                  <th className="text-right pb-2 font-medium">Variance</th>
                  <th className="text-right pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {phases.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-6 text-gray-400 text-xs">No phase data available</td></tr>
                ) : phases.map(phase => {
                  const actual = phaseActualProgress(phase.status);
                  const planned = phasePlannedProgress(phase, project.plannedStart, project.plannedEnd);
                  const variance = actual - planned;
                  return (
                    <tr key={phase.id} className="hover:bg-gray-50">
                      <td className="py-3 font-medium text-gray-800 capitalize">{phase.phaseName.charAt(0) + phase.phaseName.slice(1).toLowerCase()}</td>
                      <td className="py-3 w-28">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={actual} color="#3b82f6" />
                          <span className="text-xs text-gray-600 w-8 shrink-0">{actual}%</span>
                        </div>
                      </td>
                      <td className="py-3 w-28">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={planned} color="#93c5fd" />
                          <span className="text-xs text-gray-600 w-8 shrink-0">{planned}%</span>
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <span className={`text-xs font-medium ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {variance >= 0 ? '+' : ''}{variance}%
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          phase.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                          phase.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                          phase.status === 'SKIPPED' ? 'bg-gray-100 text-gray-500' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {phase.status === 'IN_PROGRESS' ? 'In Progress' : phase.status === 'COMPLETED' ? 'Completed' : phase.status === 'SKIPPED' ? 'Skipped' : 'Not Started'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-blue-500 inline-block" /><span className="text-xs text-gray-500">Actual Progress</span></div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-blue-200 inline-block" /><span className="text-xs text-gray-500">Planned Progress</span></div>
            </div>
          </div>
        </div>

        {/* Weekly Summary */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>
              Weekly Summary
              {latestReport?.weekStart && latestReport?.weekEnd && (
                <span className="text-xs font-normal text-gray-400 ml-2">
                  ({formatDate(latestReport.weekStart)} – {formatDate(latestReport.weekEnd)})
                </span>
              )}
            </SectionTitle>
            {latestReport && (
              <Link href={`/projects/${project.id}/manage`} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                View Full Report <ExternalLink size={10} />
              </Link>
            )}
          </div>
          {!latestReport ? (
            <div className="text-center py-8">
              <p className="text-xs text-gray-400">No weekly report available.</p>
              <Link href={`/projects/${project.id}/manage`} className="text-xs text-primary-600 hover:underline mt-2 inline-block">Generate in Reports tab →</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { key: 'completedItems', label: 'Completed', color: 'text-green-600', dot: 'bg-green-500' },
                { key: 'pendingItems', label: 'Pending', color: 'text-amber-600', dot: 'bg-amber-400' },
                { key: 'risks', label: 'Risks', color: 'text-red-600', dot: 'bg-red-500' },
                { key: 'blockers', label: 'Blockers', color: 'text-red-700', dot: 'bg-red-600' },
                { key: 'escalations', label: 'Escalations', color: 'text-orange-600', dot: 'bg-orange-500' },
              ].map(({ key, label, color, dot }) => {
                const items: string[] = Array.isArray(latestReport[key]) ? latestReport[key] : (typeof latestReport[key] === 'string' && latestReport[key] ? [latestReport[key]] : []);
                if (items.length === 0) return null;
                return (
                  <div key={key}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`w-2 h-2 rounded-full ${dot} inline-block`} />
                      <span className={`text-xs font-semibold ${color}`}>{label}</span>
                    </div>
                    <ul className="space-y-0.5 ml-3.5">
                      {items.slice(0, 2).map((item: string, i: number) => (
                        <li key={i} className="text-xs text-gray-600 flex items-center gap-1">
                          <CheckCircle size={10} className="text-gray-300 shrink-0" />
                          {item}
                        </li>
                      ))}
                      {items.length > 2 && <li className="text-xs text-gray-400">+{items.length - 2} more</li>}
                    </ul>
                  </div>
                );
              })}
              {latestReport.notes && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 italic">{latestReport.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom 4-card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Change Requests Overview */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <SectionTitle>Change Requests Overview</SectionTitle>
          <div className="flex items-center gap-4">
            <div className="relative flex items-center justify-center w-20 h-20 shrink-0">
              <CircleGauge value={changeRequests.length ? Math.round((openCRs.length / changeRequests.length) * 100) : 0} color="#3b82f6" size={80} />
            </div>
            <div className="space-y-1 text-xs">
              {[
                { label: 'Open', value: openCRs.length, color: 'text-blue-600' },
                { label: 'Approved', value: changeRequests.filter(c => c.status === 'APPROVED').length, color: 'text-green-600' },
                { label: 'Rejected', value: changeRequests.filter(c => c.status === 'REJECTED').length, color: 'text-red-600' },
                { label: 'Implemented', value: changeRequests.filter(c => c.status === 'IMPLEMENTED').length, color: 'text-gray-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-gray-500">{label}</span>
                  <span className={`font-semibold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-400 text-center">Total: {changeRequests.length}</div>
        </div>

        {/* Cost Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <SectionTitle>Cost Summary (USD)</SectionTitle>
          <div className="flex items-center gap-4">
            <div className="shrink-0">
              <CircleGauge value={budgetPct > 100 ? 100 : budgetPct} color={budgetPct > 100 ? '#ef4444' : '#22c55e'} size={80} />
            </div>
            <div className="space-y-1.5 text-xs w-full">
              {[
                { label: 'Total Budget', value: formatCurrency(project.estimatedCost), color: 'text-gray-800' },
                { label: 'Consumed', value: formatCurrency(project.actualCost), color: 'text-blue-600' },
                { label: 'Overage', value: project.isOveraged ? formatCurrency(project.overageAmount) : '—', color: 'text-orange-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span className={`font-semibold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2">
            <ProgressBar value={budgetPct} color={budgetPct > 100 ? '#ef4444' : '#22c55e'} />
            <div className="text-xs text-center text-gray-400 mt-1">{budgetPct}% Used</div>
          </div>
        </div>

        {/* Project Health Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>Project Health Breakdown</SectionTitle>
            <Link href={`/projects/${project.id}/manage`} className="text-xs text-primary-600 hover:underline">View Details</Link>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <CircleGauge value={health.score} color={health.color} size={72} />
            <span className="text-lg font-bold" style={{ color: health.color }}>{health.label}</span>
          </div>
          <div className="space-y-2">
            {health.breakdown.map(({ label, value, color }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-16 shrink-0">{label}</span>
                <ProgressBar value={value} color={color} />
                <span className="text-xs text-gray-600 w-8 text-right shrink-0">{value}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Compliance */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <SectionTitle>Risk Overview</SectionTitle>
          <div className="flex items-center gap-3 mb-3">
            <CircleGauge
              value={risks.length ? Math.round(((risks.length - activeRisks.length) / risks.length) * 100) : 100}
              color="#22c55e" size={72}
            />
            <div className="text-xs space-y-1">
              <div className="font-semibold text-gray-700">Risk Compliance</div>
              <div className="text-gray-400">{risks.length - activeRisks.length} of {risks.length} resolved</div>
            </div>
          </div>
          <div className="space-y-1.5 text-xs">
            {[
              { label: 'High', value: activeRisks.filter(r => r.impact === 'HIGH' || r.impact === 'CRITICAL').length, color: 'text-red-600 bg-red-50' },
              { label: 'Medium', value: activeRisks.filter(r => r.impact === 'MEDIUM').length, color: 'text-amber-600 bg-amber-50' },
              { label: 'Low', value: activeRisks.filter(r => r.impact === 'LOW').length, color: 'text-green-600 bg-green-50' },
              { label: 'Closed', value: risks.filter(r => r.status === 'CLOSED' || r.status === 'RESOLVED').length, color: 'text-gray-500 bg-gray-100' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-gray-500">{label}</span>
                <span className={`px-2 py-0.5 rounded-full font-semibold text-xs ${color}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom 3-section grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Escalations */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>Escalations</SectionTitle>
            <Link href={`/projects/${project.id}`} onClick={() => {}} className="text-xs text-primary-600 hover:underline">View All</Link>
          </div>
          {!project.isEscalated ? (
            <div className="text-center py-4 text-xs text-gray-400">No active escalations</div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Priority</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  project.escalationPriority === 'HIGH' ? 'bg-red-100 text-red-700' :
                  project.escalationPriority === 'MEDIUM' ? 'bg-orange-100 text-orange-700' :
                  'bg-yellow-100 text-yellow-700'}`}>
                  {project.escalationPriority}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Escalated On</span>
                <span className="text-gray-700 text-xs">{formatDate(project.escalatedAt)}</span>
              </div>
              {project.escalationNotes && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-600">{project.escalationNotes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Overage Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>Overage Details</SectionTitle>
            <Link href={`/projects/${project.id}`} className="text-xs text-primary-600 hover:underline">View All</Link>
          </div>
          {!project.isOveraged ? (
            <div className="text-center py-4 text-xs text-gray-400">No overage recorded</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                  <DollarSign size={20} className="text-orange-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500">Additional Cost</div>
                  <div className="text-lg font-bold text-orange-600">{formatCurrency(project.overageAmount)}</div>
                </div>
              </div>
              {project.notes && (
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">Notes</div>
                  <p className="text-xs text-gray-700 line-clamp-2">{project.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Team Allocation */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>Team Allocation</SectionTitle>
            <Link href={`/projects/${project.id}/manage`} className="text-xs text-primary-600 hover:underline">View All</Link>
          </div>
          {team.length === 0 ? (
            <div className="text-center py-4 text-xs text-gray-400">No team members assigned</div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-4 text-xs text-gray-400 pb-1 border-b border-gray-100">
                <span className="col-span-2">Resource</span>
                <span className="text-center">Allocation</span>
                <span className="text-right">Utilization</span>
              </div>
              {team.slice(0, 4).map((member: any) => (
                <div key={member.id} className="grid grid-cols-4 items-center">
                  <div className="col-span-2 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold shrink-0">
                      {(member.name || member.memberName || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-800 leading-tight truncate max-w-[80px]">{member.name || member.memberName}</div>
                      <div className="text-xs text-gray-400 leading-tight truncate max-w-[80px]">{member.role}</div>
                    </div>
                  </div>
                  <div className="text-center text-xs text-gray-700 font-medium">{member.allocation ?? 100}%</div>
                  <div className="flex items-center gap-1 justify-end">
                    <div className="w-12">
                      <ProgressBar value={member.utilization ?? member.allocation ?? 85} color="#3b82f6" />
                    </div>
                    <span className="text-xs text-gray-500">{member.utilization ?? member.allocation ?? 85}%</span>
                  </div>
                </div>
              ))}
              {team.length > 4 && <div className="text-xs text-gray-400 text-center pt-1">+{team.length - 4} more members</div>}
            </div>
          )}
        </div>
      </div>

      {/* Project Info row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <SectionTitle>Project Information</SectionTitle>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Project Manager</span><span className="font-medium text-gray-800">{project.projectManager || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Account Manager</span><span className="font-medium text-gray-800">{project.accountManager || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-medium text-gray-800">{project.customerName || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Plan Type</span><StatusBadge status={project.planType} variant="plan" /></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <SectionTitle>Timeline</SectionTitle>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">SOW Start</span><span className="font-medium text-gray-800">{formatDate(project.plannedStart)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">SOW End</span><span className="font-medium text-gray-800">{formatDate(project.plannedEnd)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Kickoff Date</span><span className="font-medium text-gray-800">{formatDate(project.actualStart)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Completion Date</span><span className="font-medium text-gray-800">{formatDate(project.actualEnd) || '—'}</span></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <SectionTitle>Infrastructure</SectionTitle>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Migration Types</span>
              <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                {migrationTypesList.length > 0 ? migrationTypesList.map(mt => (
                  <span key={mt.code} className="text-xs px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: mt.color }}>{mt.icon} {mt.name}</span>
                )) : <span className="text-gray-400">—</span>}
              </div>
            </div>
            <div className="flex justify-between"><span className="text-gray-500">Source</span><span className="font-medium text-gray-800">{project.sourcePlatform || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Target</span><span className="font-medium text-gray-800">{project.targetPlatform || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Servers</span><span className="font-medium text-gray-800">{project.numberOfServers ?? '—'}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Timeline ─────────────────────────────────────────────────────────────
function TimelineTab({ project }: { project: Project }) {
  const phases = project.phases || [];
  const phaseOrder = ['KICKOFF', 'MIGRATION', 'VALIDATION', 'CLOSURE'];
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-800">Phase Timeline</h3>
          <Link href={`/projects/${project.id}/tasks`}>
            <Button variant="primary" className="text-sm">View Tasks & Gantt <ExternalLink size={14} className="ml-1.5" /></Button>
          </Link>
        </div>
        <div className="relative">
          <div className="absolute left-5 top-6 bottom-6 w-0.5 bg-gray-200" />
          <div className="space-y-6">
            {phaseOrder.map((phaseName, idx) => {
              const phase = phases.find(p => p.phaseName === phaseName);
              const isCurrent = project.phase === phaseName;
              const isCompleted = phase?.status === 'COMPLETED' || (phaseOrder.indexOf(project.phase) > idx);
              return (
                <div key={phaseName} className="flex gap-4 relative">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 ${
                    isCompleted ? 'bg-green-500 text-white' : isCurrent ? 'bg-primary-500 text-white ring-4 ring-primary-100' : 'bg-gray-200 text-gray-400'
                  }`}>
                    {isCompleted ? <CheckCircle size={18} /> : isCurrent ? <Clock size={18} /> : <Circle size={18} />}
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold text-sm ${isCompleted ? 'text-green-700' : isCurrent ? 'text-primary-700' : 'text-gray-500'}`}>
                        {phaseName.charAt(0) + phaseName.slice(1).toLowerCase()}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isCompleted ? 'bg-green-100 text-green-700' : isCurrent ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {isCompleted ? 'Completed' : isCurrent ? 'In Progress' : 'Pending'}
                      </span>
                    </div>
                    {phase && (
                      <div className="mt-2 flex gap-4 text-xs text-gray-500">
                        {phase.plannedDate && <span>Planned: {formatDate(phase.plannedDate)}</span>}
                        {phase.actualDate && <span className="text-green-600">Actual: {formatDate(phase.actualDate)}</span>}
                        {phase.notes && <span className="italic text-gray-400">— {phase.notes}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-5 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center"><div className="text-xs text-gray-400">SOW Start</div><div className="font-semibold text-sm">{formatDate(project.plannedStart)}</div></div>
          <div className="text-center"><div className="text-xs text-gray-400">SOW End</div><div className="font-semibold text-sm">{formatDate(project.plannedEnd)}</div></div>
          <div className="text-center"><div className="text-xs text-gray-400">Kickoff Date</div><div className="font-semibold text-sm">{formatDate(project.actualStart) || '—'}</div></div>
          <div className="text-center"><div className="text-xs text-gray-400">Completion</div><div className="font-semibold text-sm">{formatDate(project.actualEnd) || '—'}</div></div>
        </div>
      </div>
    </div>
  );
}

// ─── Generic data tab ──────────────────────────────────────────────────────────
function DataTab({ endpoint, renderItem, emptyMessage, title }: {
  endpoint: string; renderItem: (item: any, idx: number) => React.ReactNode;
  emptyMessage: string; title?: string;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(endpoint).then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false); });
  }, [endpoint]);

  if (loading) return <TabLoader />;
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {title && <div className="px-5 py-4 border-b border-gray-100 font-semibold text-gray-800 text-sm">{title}</div>}
      {items.length === 0 ? <EmptyState message={emptyMessage} /> : (
        <div className="divide-y divide-gray-100">{items.map(renderItem)}</div>
      )}
    </div>
  );
}

// ─── Tab: Reports ──────────────────────────────────────────────────────────────
function ReportsTab({ project }: { project: Project }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href={`/projects/${project.id}/manage`}>
          <Button variant="primary" className="text-sm">Manage Reports <ExternalLink size={14} className="ml-1.5" /></Button>
        </Link>
      </div>
      <DataTab
        endpoint={`/api/reports/project/${project.id}`}
        emptyMessage="No status reports yet."
        title="Status Reports"
        renderItem={(report, idx) => (
          <div key={report.id || idx} className="px-5 py-4 hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-800">
                  Week of {formatDate(report.weekStart)} – {formatDate(report.weekEnd)}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">Generated: {formatDate(report.createdAt)}</div>
              </div>
              <div className="flex gap-2">
                {[
                  { label: 'Overall', val: report.overallStatus },
                  { label: 'Schedule', val: report.scheduleStatus },
                  { label: 'Budget', val: report.budgetStatus },
                ].map(({ label, val }) => val && (
                  <span key={label} className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    val === 'GREEN' ? 'bg-green-100 text-green-700' :
                    val === 'AMBER' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'}`}>
                    {label}: {val}
                  </span>
                ))}
              </div>
            </div>
            {report.notes && <p className="text-xs text-gray-500 mt-1.5 italic">{report.notes}</p>}
          </div>
        )}
      />
    </div>
  );
}

// ─── Tab: Escalations ─────────────────────────────────────────────────────────
function EscalationsTab({ project }: { project: Project }) {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch(`/api/dashboard/escalation-daily-notes/${project.id}`)
      .then(d => { setNotes(Array.isArray(d) ? d : []); setLoading(false); });
  }, [project.id]);

  return (
    <div className="space-y-4">
      {!project.isEscalated ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center shadow-sm">
          <Siren size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">This project has no active escalations.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-red-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Siren size={18} className="text-red-600" />
            <h3 className="font-semibold text-gray-800">Active Escalation</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><div className="text-xs text-gray-400">Priority</div>
              <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                project.escalationPriority === 'HIGH' ? 'bg-red-100 text-red-700' :
                project.escalationPriority === 'MEDIUM' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {project.escalationPriority}
              </span>
            </div>
            <div><div className="text-xs text-gray-400">Escalated On</div><div className="font-medium">{formatDate(project.escalatedAt)}</div></div>
            <div className="col-span-2"><div className="text-xs text-gray-400">Notes</div><div className="text-gray-700">{project.escalationNotes || '—'}</div></div>
          </div>
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-800 text-sm mb-3">Daily Escalation Log</h3>
        {loading ? <TabLoader /> : notes.length === 0 ? <EmptyState message="No daily notes recorded." /> : (
          <div className="space-y-3">
            {notes.map((note: any) => (
              <div key={note.id} className="flex gap-3 text-sm">
                <div className="text-xs text-gray-400 w-24 shrink-0 pt-0.5">{formatDate(note.date || note.createdAt)}</div>
                <div className="flex-1 text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{note.note || note.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Overages ─────────────────────────────────────────────────────────────
function OveragesTab({ project }: { project: Project }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      {!project.isOveraged ? (
        <div className="text-center py-8">
          <DollarSign size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">No overage recorded for this project.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <h3 className="font-semibold text-gray-800">Overage Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-orange-50 rounded-xl p-4 text-center">
              <DollarSign size={24} className="text-orange-500 mx-auto mb-1" />
              <div className="text-2xl font-bold text-orange-600">{formatCurrency(project.overageAmount)}</div>
              <div className="text-xs text-orange-500 mt-1">Additional Cost</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-400 mb-1">Original Budget</div>
              <div className="text-lg font-bold text-gray-800">{formatCurrency(project.estimatedCost)}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-400 mb-1">Total (Budget + Overage)</div>
              <div className="text-lg font-bold text-gray-800">
                {formatCurrency((project.estimatedCost ?? 0) + (project.overageAmount ?? 0))}
              </div>
            </div>
          </div>
          {project.notes && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Project Notes</div>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{project.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Resources ────────────────────────────────────────────────────────────
function ResourcesTab({ project }: { project: Project }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href={`/projects/${project.id}/manage`}>
          <Button variant="primary" className="text-sm">Manage Team <ExternalLink size={14} className="ml-1.5" /></Button>
        </Link>
      </div>
      <DataTab
        endpoint={`/api/team/project/${project.id}`}
        emptyMessage="No team members assigned yet."
        title="Team Members"
        renderItem={(member: any, idx) => (
          <div key={member.id || idx} className="px-5 py-4 hover:bg-gray-50 flex items-center gap-4">
            <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-bold shrink-0">
              {(member.name || member.memberName || '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-800">{member.name || member.memberName}</div>
              <div className="text-xs text-gray-400">{member.role || member.memberRole}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-gray-700">{member.allocation ?? 100}% allocated</div>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-24"><ProgressBar value={member.allocation ?? 100} color="#3b82f6" /></div>
              </div>
            </div>
          </div>
        )}
      />
    </div>
  );
}

// ─── Tab: Documents ────────────────────────────────────────────────────────────
function DocumentsTab({ project }: { project: Project }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href={`/projects/${project.id}/manage`}>
          <Button variant="primary" className="text-sm">Manage Documents <ExternalLink size={14} className="ml-1.5" /></Button>
        </Link>
      </div>
      <DataTab
        endpoint={`/api/documents/project/${project.id}`}
        emptyMessage="No documents uploaded yet."
        title="Documents"
        renderItem={(doc: any, idx) => (
          <div key={doc.id || idx} className="px-5 py-4 hover:bg-gray-50 flex items-center gap-4">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <FileText size={16} className="text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-800">{doc.title || doc.name || doc.fileName}</div>
              <div className="text-xs text-gray-400">{doc.category} · {formatDate(doc.createdAt)}</div>
            </div>
            {doc.url && (
              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline text-xs flex items-center gap-1">
                Open <ExternalLink size={10} />
              </a>
            )}
          </div>
        )}
      />
    </div>
  );
}

// ─── Tab: Activity Logs ────────────────────────────────────────────────────────
function ActivityTab({ project }: { project: Project }) {
  return (
    <DataTab
      endpoint={`/api/activity/entity/project/${project.id}`}
      emptyMessage="No activity recorded yet."
      title="Activity Log"
      renderItem={(item: any, idx) => (
        <div key={item.id || idx} className="px-5 py-4 hover:bg-gray-50 flex gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
            <Activity size={14} className="text-gray-500" />
          </div>
          <div className="flex-1">
            <div className="text-sm text-gray-800">{item.description || item.action || item.message}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {item.userName || item.user || 'System'} · {formatDate(item.createdAt || item.timestamp)}
            </div>
          </div>
        </div>
      )}
    />
  );
}

// ─── Tab: Audit History ────────────────────────────────────────────────────────
function AuditHistoryTab({ project }: { project: Project }) {
  return (
    <DataTab
      endpoint={`/api/audit/activity-summary`}
      emptyMessage="No audit history available."
      title="Audit History"
      renderItem={(item: any, idx) => (
        <div key={item.id || idx} className="px-5 py-4 hover:bg-gray-50 flex gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
            <History size={14} className="text-indigo-500" />
          </div>
          <div className="flex-1">
            <div className="text-sm text-gray-800">{item.action || item.description || item.event}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {item.userName || item.user || 'System'} · {formatDate(item.createdAt || item.timestamp)}
            </div>
          </div>
          {item.field && <div className="text-xs text-gray-400 shrink-0">{item.field}: <span className="text-gray-600">{item.newValue}</span></div>}
        </div>
      )}
    />
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
interface ProjectDetailProps {
  project: Project;
}

export function ProjectDetail({ project }: ProjectDetailProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const { settings } = useSettings();
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER';

  const migrationTypesList: { code: string; name: string; icon: string; color: string }[] = (() => {
    if (!project.migrationTypes) return [];
    const raw = project.migrationTypes.split(',').map((s: string) => s.trim()).filter(Boolean);
    return raw.map((r: string) => {
      const found = settings.migrationTypes.find(mt => mt.code === r.toUpperCase() || mt.name.toLowerCase() === r.toLowerCase());
      return found ?? { code: r, name: r, icon: '📋', color: '#6B7280' };
    });
  })();

  return (
    <div className="space-y-0">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-5 rounded-t-xl">
        {/* Top row */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">{project.name}</h1>
              <StatusBadge status={project.status} variant="status" />
              {project.delayStatus !== 'NOT_DELAYED' && (
                <span className={`text-sm font-semibold flex items-center gap-1 ${project.delayStatus === 'DELAYED' ? 'text-red-600' : 'text-amber-600'}`}>
                  <AlertTriangle size={15} />
                  {project.delayStatus === 'DELAYED' ? `Delayed by ${project.delayDays} Days` : 'At Risk'}
                </span>
              )}
            </div>
            {/* Meta info row */}
            <div className="flex items-center gap-4 mt-2 flex-wrap text-sm text-gray-500">
              {migrationTypesList.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <Package size={13} className="text-gray-400" />
                  <span className="text-gray-600">Migration Type:</span>
                  {migrationTypesList.map(mt => (
                    <span key={mt.code} className="text-xs px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: mt.color }}>{mt.icon} {mt.name}</span>
                  ))}
                </span>
              )}
              {project.projectManager && (
                <span className="flex items-center gap-1"><User size={13} className="text-gray-400" /><span className="text-gray-400">Project Manager:</span><span className="font-medium text-gray-700">{project.projectManager}</span></span>
              )}
              {project.accountManager && (
                <span className="flex items-center gap-1"><Users size={13} className="text-gray-400" /><span className="text-gray-400">Account Manager:</span><span className="font-medium text-gray-700">{project.accountManager}</span></span>
              )}
              {project.customerName && (
                <span className="flex items-center gap-1"><Building2 size={13} className="text-gray-400" /><span className="text-gray-400">Customer:</span><span className="font-medium text-gray-700">{project.customerName}</span></span>
              )}
            </div>
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <Link href={`/projects/${project.id}/tasks`}>
              <Button variant="outline" className="text-sm flex items-center gap-1.5">
                <BarChart2 size={14} /> View Tasks & Gantt
              </Button>
            </Link>
            <Link href={`/projects/${project.id}/manage`}>
              <Button variant="secondary" className="text-sm flex items-center gap-1.5">
                <Settings size={14} /> Manage
              </Button>
            </Link>
            {canEdit && (
              <Link href={`/projects/${project.id}/edit`}>
                <Button variant="primary" className="text-sm flex items-center gap-1.5">
                  <Pencil size={14} /> Edit Project
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-0 border-b-0 overflow-x-auto scrollbar-hide">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="bg-gray-50 min-h-screen p-5 rounded-b-xl">
        {activeTab === 'overview' && <OverviewTab project={project} />}
        {activeTab === 'timeline' && <TimelineTab project={project} />}
        {activeTab === 'reports' && <ReportsTab project={project} />}
        {activeTab === 'escalations' && <EscalationsTab project={project} />}
        {activeTab === 'overages' && <OveragesTab project={project} />}
        {activeTab === 'resources' && <ResourcesTab project={project} />}
        {activeTab === 'documents' && <DocumentsTab project={project} />}
        {activeTab === 'activity' && <ActivityTab project={project} />}
        {activeTab === 'audit' && <AuditHistoryTab project={project} />}
      </div>
    </div>
  );
}
