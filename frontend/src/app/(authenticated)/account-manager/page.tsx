'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import { useAccountManagerView } from '@/hooks/useProjects';
import type { AccountView, Project } from '@/types';
import {
  Building2, ChevronDown, ChevronUp, Loader2, AlertTriangle,
  ArrowRight, FlaskConical, FolderKanban, Clock, CheckCircle2,
  XCircle, Circle, Minus, User, CalendarDays, X,
} from 'lucide-react';

const POC_PHASES = ['pocQualificationStatus','pocEnvSetupStatus','pocTrialStatus','pocValidationStatus','pocOutcomeStatus'] as const;
const POC_LABELS = ['Qual','Env','Trial','Valid','Outcome'];

const STATUS_COLORS: Record<string, string> = {
  not_started: 'text-gray-400',
  in_progress: 'text-blue-500',
  blocked: 'text-red-500',
  completed: 'text-green-500',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  not_started: <Circle className="w-3 h-3" />,
  in_progress: <Clock className="w-3 h-3" />,
  blocked: <XCircle className="w-3 h-3" />,
  completed: <CheckCircle2 className="w-3 h-3" />,
};

const DELAY_COLORS: Record<string, string> = {
  DELAYED: 'bg-red-100 text-red-700',
  AT_RISK: 'bg-yellow-100 text-yellow-700',
  NOT_DELAYED: 'bg-green-100 text-green-700',
};

export default function AccountManagerPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'ACCOUNT_MANAGER';

  const [workloadFilter, setWorkloadFilter] = useState('');
  const [attentionFilter, setAttentionFilter] = useState('');
  const [amFilter, setAmFilter] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useAccountManagerView();
  const accounts: AccountView[] = data?.data || [];

  // Auto-expand attention accounts on first load
  const attentionAccounts = accounts.filter(a => a.needsAttention).map(a => a.customerName.toLowerCase());

  function toggle(key: string) {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function isExpanded(key: string) {
    return expandedKeys.has(key) || attentionAccounts.includes(key);
  }

  const allAMs = Array.from(new Set(accounts.map(a => a.accountManager).filter(Boolean)));

  const filtered = accounts.filter(a => {
    if (attentionFilter === 'attention' && !a.needsAttention) return false;
    if (attentionFilter === 'ok' && a.needsAttention) return false;
    if (amFilter && a.accountManager !== amFilter) return false;
    if (workloadFilter) {
      const track = a.pocTrack || a.migrationTrack;
      if (!track) return false;
      if (!(track.migrationTypes || '').toLowerCase().includes(workloadFilter.toLowerCase())) return false;
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
          <p className="text-sm text-gray-500">{filtered.length} account{filtered.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
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
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white w-48"
        />
        {(attentionFilter || amFilter || workloadFilter) && (
          <button onClick={() => { setAttentionFilter(''); setAmFilter(''); setWorkloadFilter(''); }} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Account panels */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-gray-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No accounts found</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(account => {
            const key = account.customerName.toLowerCase();
            const expanded = isExpanded(key);
            const poc = account.pocTrack;
            const migration = account.migrationTrack;
            const workloads = Array.from(new Set([
              ...(poc?.migrationTypes || '').split(','),
              ...(migration?.migrationTypes || '').split(','),
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
                      {migration && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DELAY_COLORS[migration.delayStatus || 'NOT_DELAYED'] || 'bg-gray-100 text-gray-600'}`}>
                          Migration: {migration.delayStatus?.replace('_', ' ') || migration.status}
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
                            {poc.pocDeadline && (
                              <p className="text-xs text-gray-500 flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Deadline: {new Date(poc.pocDeadline).toLocaleDateString()}</p>
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

                      {/* Migration Track */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <FolderKanban className="w-4 h-4 text-indigo-500" />
                          <span className="text-sm font-semibold text-gray-700">Migration Track</span>
                        </div>
                        {migration ? (
                          <div className="space-y-2">
                            <p className="text-xs text-gray-500 capitalize">{migration.name}</p>
                            <div className="flex flex-wrap gap-1">
                              <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">{migration.phase}</span>
                              {migration.delayStatus && migration.delayStatus !== 'NOT_DELAYED' && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DELAY_COLORS[migration.delayStatus]}`}>
                                  {migration.delayDays}d delayed
                                </span>
                              )}
                            </div>
                            {migration.projectManager && (
                              <p className="text-xs text-gray-500 flex items-center gap-1"><User className="w-3 h-3" /> {migration.projectManager}</p>
                            )}
                            {migration.plannedEnd && (
                              <p className="text-xs text-gray-500 flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Due: {new Date(migration.plannedEnd).toLocaleDateString()}</p>
                            )}
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
    </div>
  );
}
