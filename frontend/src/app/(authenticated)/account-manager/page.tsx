'use client';

import { useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import { useAccountManagerView } from '@/hooks/useProjects';
import type { AccountView } from '@/types';
import {
  Building2, ChevronDown, ChevronUp, Loader2, AlertTriangle,
  ArrowRight, FlaskConical, FolderKanban, Clock, CheckCircle2,
  XCircle, Circle, Minus, User, CalendarDays, X, RefreshCw, Calendar, Search,
} from 'lucide-react';

const POC_PHASES = ['pocQualificationStatus','pocEnvSetupStatus','pocTrialStatus','pocValidationStatus','pocOutcomeStatus'] as const;
const POC_LABELS = ['Qual','Env','Trial','Valid','Outcome'];

const STATUS_COLORS: Record<string, string> = {
  not_started: 'text-gray-400',
  in_progress:  'text-blue-500',
  blocked:      'text-red-500',
  completed:    'text-green-500',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  not_started: <Circle      className="w-3 h-3" />,
  in_progress:  <Clock       className="w-3 h-3" />,
  blocked:      <XCircle     className="w-3 h-3" />,
  completed:    <CheckCircle2 className="w-3 h-3" />,
};

const DELAY_COLORS: Record<string, string> = {
  DELAYED:     'bg-red-100 text-red-700',
  AT_RISK:     'bg-yellow-100 text-yellow-700',
  NOT_DELAYED: 'bg-green-100 text-green-700',
};

function scrollTo(ref: React.RefObject<HTMLDivElement>) {
  ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function AccountManagerPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'ACCOUNT_MANAGER';

  const [activeTab, setActiveTab]       = useState<'accounts' | 'poc'>('accounts');
  const [search, setSearch]             = useState('');
  const [workloadFilter, setWorkloadFilter] = useState('');
  const [attentionFilter, setAttentionFilter] = useState('');
  const [amFilter, setAmFilter]         = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const escalationRef = useRef<HTMLDivElement>(null);
  const renewalRef    = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useAccountManagerView();
  const accounts: AccountView[] = data?.data || [];

  const today = new Date();

  // ── Derived summary data ──────────────────────────────────────────────────
  const escalatedAccounts = accounts.filter(a =>
    (a.migrationTracks || []).some((t: any) => t.isEscalated)
  );

  const renewalDueAccounts = accounts.filter(a =>
    (a.migrationTracks || []).some(t =>
      t.plannedEnd && new Date(t.plannedEnd) < today && t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
    )
  );

  const pocAccounts       = accounts.filter(a => a.pocTrack);
  const migrationAccounts = accounts.filter(a => (a.migrationTracks || []).length > 0);

  // ── Attention accounts (auto-expand) ──────────────────────────────────────
  const attentionKeys = accounts.filter(a => a.needsAttention).map(a => a.customerName.toLowerCase());

  function toggle(key: string) {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function isExpanded(key: string) {
    return expandedKeys.has(key) || attentionKeys.includes(key);
  }

  const allAMs = Array.from(new Set(accounts.map(a => a.accountManager).filter(Boolean)));

  // ── Tab + filter ──────────────────────────────────────────────────────────
  const tabAccounts = activeTab === 'poc' ? pocAccounts : migrationAccounts;

  const filtered = tabAccounts.filter(a => {
    if (attentionFilter === 'attention' && !a.needsAttention) return false;
    if (attentionFilter === 'ok' && a.needsAttention) return false;
    if (amFilter && a.accountManager !== amFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const tracks = [...(a.migrationTracks || []), ...(a.pocTrack ? [a.pocTrack] : [])];
      const matchesCustomer = a.customerName.toLowerCase().includes(q);
      const matchesAM       = (a.accountManager || '').toLowerCase().includes(q);
      const matchesProject  = tracks.some(t => (t.name || '').toLowerCase().includes(q));
      const matchesPM       = tracks.some(t => (t.projectManager || '').toLowerCase().includes(q));
      if (!matchesCustomer && !matchesAM && !matchesProject && !matchesPM) return false;
    }
    if (workloadFilter) {
      const tracks = [...(a.migrationTracks || []), ...(a.pocTrack ? [a.pocTrack] : [])];
      const hasMatch = tracks.some(t => (t.migrationTypes || '').toLowerCase().includes(workloadFilter.toLowerCase()));
      if (!hasMatch) return false;
    }
    return true;
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  );

  if (error) return <div className="p-6 text-red-500">Failed to load account manager view</div>;

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Building2 className="w-7 h-7 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Manager View</h1>
          <p className="text-sm text-gray-500">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            icon: <Building2 className="w-4 h-4" />,
            label: 'Total Accounts',
            value: accounts.length,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            scrollRef: null,
          },
          {
            icon: <AlertTriangle className="w-4 h-4" />,
            label: 'Escalations',
            value: escalatedAccounts.length,
            color: 'text-red-600',
            bg: 'bg-red-50',
            scrollRef: escalationRef,
          },
          {
            icon: <RefreshCw className="w-4 h-4" />,
            label: 'Renewal Due',
            value: renewalDueAccounts.length,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            scrollRef: renewalRef,
          },
        ].map(s => (
          <div
            key={s.label}
            onClick={() => s.scrollRef && scrollTo(s.scrollRef)}
            className={`${s.bg} rounded-xl p-3 flex items-center gap-3 ${s.scrollRef ? 'cursor-pointer hover:brightness-95 transition' : ''}`}
          >
            <div className={s.color}>{s.icon}</div>
            <div>
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'accounts', label: 'All Accounts',  icon: <FolderKanban className="w-4 h-4" />, count: migrationAccounts.length },
          { key: 'poc',      label: 'POC Projects',  icon: <FlaskConical  className="w-4 h-4" />, count: pocAccounts.length },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSearch(''); setWorkloadFilter(''); setAttentionFilter(''); setAmFilter(''); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.icon}
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === tab.key ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search customer, project, PM..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white w-56"
          />
        </div>
        <select
          value={attentionFilter}
          onChange={e => setAttentionFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="">All Accounts</option>
          <option value="attention">Needs Attention</option>
          <option value="ok">No Issues</option>
        </select>
        <select
          value={amFilter}
          onChange={e => setAmFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="">All Account Managers</option>
          {allAMs.map(am => <option key={am} value={am}>{am}</option>)}
        </select>
        <input
          type="text"
          placeholder="Filter by workload..."
          value={workloadFilter}
          onChange={e => setWorkloadFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white w-44"
        />
        {(search || attentionFilter || amFilter || workloadFilter) && (
          <button
            onClick={() => { setSearch(''); setAttentionFilter(''); setAmFilter(''); setWorkloadFilter(''); }}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Account panels */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-gray-400">
          {activeTab === 'poc'
            ? <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-30" />
            : <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />}
          <p className="text-lg font-medium">
            {activeTab === 'poc' ? 'No POC projects found' : 'No accounts found'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(account => {
            const key            = account.customerName.toLowerCase();
            const expanded       = isExpanded(key);
            const poc            = account.pocTrack;
            const migrations     = account.migrationTracks || [];
            const migration      = migrations[0] ?? null;
            const workloads = Array.from(new Set([
              ...(poc?.migrationTypes || '').split(','),
              ...migrations.flatMap(m => (m.migrationTypes || '').split(',')),
            ].map(w => w.trim()).filter(Boolean)));

            const primaryProjectName = migration?.name || poc?.name;

            return (
              <Card key={key} className="overflow-hidden">
                {/* Panel header */}
                <div
                  className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition ${account.needsAttention ? 'border-l-4 border-orange-400' : ''}`}
                  onClick={() => toggle(key)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="font-semibold text-gray-900 truncate">
                          {primaryProjectName || account.customerName}
                        </span>
                        {account.needsAttention && (
                          <span className="flex items-center gap-1 text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                            <AlertTriangle className="w-3 h-3" /> Needs Attention
                          </span>
                        )}
                      </div>
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full font-medium flex-shrink-0">
                        {account.customerName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {account.accountManager && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <User className="w-3 h-3" /> {account.accountManager}
                        </span>
                      )}
                      {workloads.map(w => (
                        <span key={w} className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full">{w}</span>
                      ))}
                      {poc && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${poc.pocOutcome === 'won' ? 'bg-green-100 text-green-700' : poc.pocOutcome === 'lost' ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-600'}`}>
                          POC: {poc.pocOutcome ? poc.pocOutcome.replace('_', ' ') : 'In Progress'}
                        </span>
                      )}
                      {migrations.length > 0 && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DELAY_COLORS[(migration as any)?.delayStatus || 'NOT_DELAYED'] || 'bg-gray-100 text-gray-600'}`}>
                          {migrations.length > 1 ? `${migrations.length} Migrations` : `Migration: ${(migration as any)?.delayStatus?.replace('_', ' ') || migration?.status}`}
                        </span>
                      )}
                    </div>
                    {account.needsAttention && account.attentionReasons.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {account.attentionReasons.map((r, i) => (
                          <span key={i} className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded">{r}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </div>

                {/* Expanded journey view */}
                {expanded && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4">
                    <div className="flex gap-4 items-start">
                      {/* POC Track */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <FlaskConical className="w-4 h-4 text-blue-500" />
                          <span className="text-sm font-semibold text-gray-700">POC Track</span>
                        </div>
                        {poc ? (
                          <div className="space-y-2">
                            <p className="text-xs text-gray-500 capitalize">{poc.name}</p>
                            <div className="flex flex-wrap gap-1">
                              {POC_PHASES.map((k, i) => {
                                const status = (poc as any)[k] || 'not_started';
                                return (
                                  <div key={k} className={`flex items-center gap-0.5 text-xs ${STATUS_COLORS[status]}`} title={`${POC_LABELS[i]}: ${status}`}>
                                    {STATUS_ICONS[status]}
                                    <span className="text-[10px]">{POC_LABELS[i]}</span>
                                    {i < POC_PHASES.length - 1 && <Minus className="w-2 h-2 text-gray-300" />}
                                  </div>
                                );
                              })}
                            </div>
                            {poc.projectManager && (
                              <p className="text-xs text-gray-500 flex items-center gap-1"><User className="w-3 h-3" /> {poc.projectManager}</p>
                            )}
                            {(poc as any).pocDeadline && (
                              <p className="text-xs text-gray-500 flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Deadline: {new Date((poc as any).pocDeadline).toLocaleDateString()}</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">No internal POC — direct migration</p>
                        )}
                      </div>

                      {/* Journey connector */}
                      <div className="flex flex-col items-center justify-center px-2 pt-6">
                        <ArrowRight className="w-5 h-5 text-green-500" />
                        {account.handoffDate && (
                          <span className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">
                            {new Date(account.handoffDate).toLocaleDateString()}
                          </span>
                        )}
                        {account.handoffBy && (
                          <span className="text-[10px] text-gray-400 whitespace-nowrap">{account.handoffBy}</span>
                        )}
                      </div>

                      {/* Migration Track(s) */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <FolderKanban className="w-4 h-4 text-indigo-500" />
                          <span className="text-sm font-semibold text-gray-700">
                            Migration Track{migrations.length > 1 ? `s (${migrations.length})` : ''}
                          </span>
                        </div>
                        {migrations.length > 0 ? (
                          <div className="space-y-3">
                            {migrations.map((m, idx) => (
                              <div key={m.id || idx} className={`space-y-1 ${idx > 0 ? 'pt-2 border-t border-gray-200' : ''}`}>
                                <p className="text-xs font-medium text-gray-700 capitalize">{m.name}</p>
                                <div className="flex flex-wrap gap-1">
                                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">{m.phase}</span>
                                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{m.status}</span>
                                  {(m as any).delayStatus && (m as any).delayStatus !== 'NOT_DELAYED' && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DELAY_COLORS[(m as any).delayStatus]}`}>
                                      {(m as any).delayDays}d delayed
                                    </span>
                                  )}
                                </div>
                                {m.projectManager && (
                                  <p className="text-xs text-gray-500 flex items-center gap-1"><User className="w-3 h-3" /> {m.projectManager}</p>
                                )}
                                {m.plannedEnd && (
                                  <p className="text-xs text-gray-500 flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Due: {new Date(m.plannedEnd).toLocaleDateString()}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">No migration project yet</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Escalations section ─────────────────────────────────────────────── */}
      <div ref={escalationRef} className="scroll-mt-6">
        {escalatedAccounts.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" /> Active Escalations
            </h2>
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Account Manager</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Project</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Phase</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {escalatedAccounts.flatMap(a =>
                    (a.migrationTracks || []).filter((t: any) => t.isEscalated).map((t: any) => (
                      <tr key={`${a.customerName}-${t.id}`} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 font-medium text-gray-900">{a.customerName}</td>
                        <td className="px-4 py-3 text-gray-600">{a.accountManager || '—'}</td>
                        <td className="px-4 py-3 text-gray-700">{t.name}</td>
                        <td className="px-4 py-3">
                          {t.escalationPriority ? (
                            <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full border border-red-100 font-medium">
                              {t.escalationPriority}
                            </span>
                          ) : (
                            <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Escalated
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full">{t.phase}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </div>

      {/* ── Renewal Due section ─────────────────────────────────────────────── */}
      <div ref={renewalRef} className="scroll-mt-6">
        {renewalDueAccounts.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-amber-500" /> Renewal Due
              <span className="text-sm font-normal text-gray-400">— active projects past planned end date</span>
            </h2>
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Project</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Account Manager</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">PM</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Planned End</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Overdue</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Phase</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {renewalDueAccounts.flatMap(a =>
                    (a.migrationTracks || [])
                      .filter(t => t.plannedEnd && new Date(t.plannedEnd) < today && t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
                      .map(t => {
                        const daysOverdue = Math.floor((today.getTime() - new Date(t.plannedEnd!).getTime()) / 86400000);
                        return (
                          <tr key={`${a.customerName}-${t.id}`} className="hover:bg-gray-50 transition">
                            <td className="px-4 py-3 font-medium text-gray-900 capitalize">{t.name}</td>
                            <td className="px-4 py-3 text-gray-700">{a.customerName}</td>
                            <td className="px-4 py-3 text-gray-600">{a.accountManager || '—'}</td>
                            <td className="px-4 py-3 text-gray-600">{t.projectManager || '—'}</td>
                            <td className="px-4 py-3 text-gray-600">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(t.plannedEnd!).toLocaleDateString()}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`font-semibold ${daysOverdue > 30 ? 'text-red-600' : daysOverdue > 7 ? 'text-amber-600' : 'text-gray-700'}`}>
                                {daysOverdue}d
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full">{t.phase}</span>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </div>

    </div>
  );
}
