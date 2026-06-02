'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import { useAccountManagerView } from '@/hooks/useProjects';
import type { AccountView } from '@/types';
import {
  Building2, ChevronDown, ChevronRight, Loader2, AlertTriangle,
  FlaskConical, FolderKanban, Clock, CheckCircle2,
  XCircle, Circle, RefreshCw, Calendar, Search,
  SlidersHorizontal, X, ChevronsUpDown, ArrowUp, ArrowDown,
  CalendarDays,
} from 'lucide-react';

const DELAY_COLORS: Record<string, string> = {
  DELAYED:     'bg-red-100 text-red-700',
  AT_RISK:     'bg-yellow-100 text-yellow-700',
  NOT_DELAYED: 'bg-green-100 text-green-700',
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:    'bg-green-100 text-green-700',
  INACTIVE:  'bg-gray-100 text-gray-600',
  ON_HOLD:   'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-red-100 text-red-600',
  COMPLETED: 'bg-blue-100 text-blue-700',
};

const PLAN_BADGE: Record<string, string> = {
  BRONZE:   'bg-orange-50 text-orange-700 border border-orange-200',
  SILVER:   'bg-gray-100 text-gray-700 border border-gray-300',
  GOLD:     'bg-yellow-50 text-yellow-700 border border-yellow-200',
  PLATINUM: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
};

type SortKey = 'name' | 'accountManager' | 'projectManager' | 'status' | 'phase' | 'delayStatus' | 'planType' | 'actualStart' | 'plannedEnd' | 'migrationTypes' | 'pocOutcome';
type SortDir = 'asc' | 'desc';

function scrollTo(ref: React.RefObject<HTMLDivElement>) {
  ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function FilterDropdown({
  value, onChange, placeholder, options,
}: { value: string; onChange: (v: string) => void; placeholder: string; options: string[] }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none pl-3 pr-7 py-1.5 border border-gray-200 rounded-lg text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
      </select>
      {value ? (
        <button onClick={() => onChange('')} className="absolute right-1.5 top-1/2 -translate-y-1/2">
          <X className="w-3 h-3 text-gray-400 hover:text-gray-600" />
        </button>
      ) : (
        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
      )}
    </div>
  );
}

function SortTh({
  label, sortKey: key, current, dir, onSort,
}: { label: string; sortKey: SortKey; current: SortKey | null; dir: SortDir; onSort: (k: SortKey) => void }) {
  const active = current === key;
  return (
    <th
      className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap cursor-pointer select-none hover:text-indigo-600 group"
      onClick={() => onSort(key)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          dir === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-500" /> : <ArrowDown className="w-3 h-3 text-indigo-500" />
        ) : (
          <ChevronsUpDown className="w-3 h-3 text-gray-300 group-hover:text-gray-400" />
        )}
      </span>
    </th>
  );
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString(); } catch { return '—'; }
}

type ProjectRow = {
  id: string | number;
  name: string;
  customerName: string;
  accountManager: string;
  needsAttention: boolean;
  projectManager: string;
  status: string;
  phase: string;
  delayStatus: string;
  delayDays?: number;
  planType: string;
  actualStart: string | null;
  plannedEnd: string | null;
  migrationTypes: string;
  trackType: 'migration' | 'poc';
  pocOutcome?: string | null;
  [key: string]: any;
};

type CustomerGroup = {
  customerName: string;
  accountManager: string;
  needsAttention: boolean;
  attentionReasons: string[];
  projects: ProjectRow[];
};

export default function AccountManagerPage() {
  const { user } = useAuth();

  const [activeTab, setActiveTab]         = useState<'accounts' | 'poc'>('accounts');
  const [search, setSearch]               = useState('');
  const [showFilters, setShowFilters]     = useState(true);
  const [statusFilter, setStatusFilter]   = useState('');
  const [phaseFilter, setPhaseFilter]     = useState('');
  const [delayFilter, setDelayFilter]     = useState('');
  const [planFilter, setPlanFilter]       = useState('');
  const [pmFilter, setPmFilter]           = useState('');
  const [amFilter, setAmFilter]           = useState('');
  const [attentionFilter, setAttentionFilter] = useState('');
  const [sortKey, setSortKey]             = useState<SortKey | null>(null);
  const [sortDir, setSortDir]             = useState<SortDir>('asc');
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  const escalationRef = useRef<HTMLDivElement>(null);
  const renewalRef    = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useAccountManagerView();
  const accounts: AccountView[] = data?.data || [];

  const today = new Date();

  // Auto-expand customers that need attention on first data load
  useEffect(() => {
    if (accounts.length > 0) {
      setExpandedCustomers(prev => {
        if (prev.size > 0) return prev;
        const attentionSet = new Set(
          accounts.filter(a => a.needsAttention).map(a => a.customerName)
        );
        return attentionSet;
      });
    }
  }, [accounts]);

  function toggleCustomer(customerName: string) {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(customerName)) next.delete(customerName);
      else next.add(customerName);
      return next;
    });
  }

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

  function clearFilters() {
    setSearch(''); setStatusFilter(''); setPhaseFilter('');
    setDelayFilter(''); setPlanFilter(''); setPmFilter('');
    setAmFilter(''); setAttentionFilter('');
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const tabAccounts = activeTab === 'poc' ? pocAccounts : migrationAccounts;

  const allPMs = Array.from(new Set(
    tabAccounts.flatMap(a =>
      activeTab === 'poc'
        ? [(a.pocTrack as any)?.projectManager].filter(Boolean)
        : (a.migrationTracks || []).map((m: any) => m.projectManager).filter(Boolean)
    )
  )).sort() as string[];

  const allAMs = Array.from(new Set(
    tabAccounts.map(a => a.accountManager).filter(Boolean)
  )).sort() as string[];

  function sortProjects(projects: ProjectRow[]): ProjectRow[] {
    if (!sortKey) return projects;
    return [...projects].sort((a, b) => {
      const aVal = a[sortKey] ?? '';
      const bVal = b[sortKey] ?? '';
      if (sortKey === 'actualStart' || sortKey === 'plannedEnd') {
        const aT = aVal ? new Date(aVal as string).getTime() : 0;
        const bT = bVal ? new Date(bVal as string).getTime() : 0;
        return sortDir === 'asc' ? aT - bT : bT - aT;
      }
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  // Build grouped data with filters applied at project level
  const customerGroups: CustomerGroup[] = tabAccounts.map(account => {
    const rawProjects: ProjectRow[] =
      activeTab === 'poc' && account.pocTrack
        ? [{
            id: (account.pocTrack as any).id,
            name: (account.pocTrack as any).name || account.customerName,
            customerName: account.customerName,
            accountManager: account.accountManager,
            needsAttention: account.needsAttention,
            projectManager: (account.pocTrack as any).projectManager || '',
            status: (account.pocTrack as any).status || '',
            phase: (account.pocTrack as any).phase || '',
            delayStatus: (account.pocTrack as any).delayStatus || '',
            delayDays: (account.pocTrack as any).delayDays,
            planType: (account.pocTrack as any).planType || '',
            actualStart: (account.pocTrack as any).actualStart || null,
            plannedEnd: (account.pocTrack as any).pocDeadline || (account.pocTrack as any).plannedEnd || null,
            migrationTypes: (account.pocTrack as any).migrationTypes || '',
            trackType: 'poc' as const,
            pocOutcome: (account.pocTrack as any).pocOutcome,
            ...(account.pocTrack as any),
          }]
        : (account.migrationTracks || []).map((m: any) => ({
            id: m.id,
            name: m.name,
            customerName: account.customerName,
            accountManager: account.accountManager,
            needsAttention: account.needsAttention,
            projectManager: m.projectManager || '',
            status: m.status || '',
            phase: m.phase || '',
            delayStatus: m.delayStatus || '',
            delayDays: m.delayDays,
            planType: m.planType || '',
            actualStart: m.actualStart || null,
            plannedEnd: m.plannedEnd || null,
            migrationTypes: m.migrationTypes || '',
            trackType: 'migration' as const,
            pocOutcome: undefined,
            ...m,
          }));

    const filteredProjects = rawProjects.filter(row => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (phaseFilter && row.phase !== phaseFilter) return false;
      if (delayFilter && row.delayStatus !== delayFilter) return false;
      if (planFilter && row.planType !== planFilter) return false;
      if (pmFilter && row.projectManager !== pmFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !row.name?.toLowerCase().includes(q) &&
          !row.customerName?.toLowerCase().includes(q) &&
          !(row.accountManager || '').toLowerCase().includes(q) &&
          !(row.projectManager || '').toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });

    return {
      customerName: account.customerName,
      accountManager: account.accountManager,
      needsAttention: account.needsAttention,
      attentionReasons: (account as any).attentionReasons || [],
      projects: sortProjects(filteredProjects),
    };
  }).filter(group => {
    if (attentionFilter === 'attention' && !group.needsAttention) return false;
    if (attentionFilter === 'ok' && group.needsAttention) return false;
    if (amFilter && group.accountManager !== amFilter) return false;
    return group.projects.length > 0;
  }).sort((a, b) => {
    // Attention customers always float to top
    if (a.needsAttention && !b.needsAttention) return -1;
    if (!a.needsAttention && b.needsAttention) return 1;
    return a.customerName.localeCompare(b.customerName);
  });

  const totalProjects = customerGroups.reduce((sum, g) => sum + g.projects.length, 0);
  const activeFilterCount = [search, statusFilter, phaseFilter, delayFilter, planFilter, pmFilter, amFilter, attentionFilter].filter(Boolean).length;

  // Number of detail columns (excluding the group-header colSpan row)
  const colCount = activeTab === 'poc' ? 9 : 8;

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
          { icon: <Building2 className="w-4 h-4" />, label: 'Total Accounts', value: accounts.length, color: 'text-indigo-600', bg: 'bg-indigo-50', scrollRef: null },
          { icon: <AlertTriangle className="w-4 h-4" />, label: 'Escalations', value: escalatedAccounts.length, color: 'text-red-600', bg: 'bg-red-50', scrollRef: escalationRef },
          { icon: <RefreshCw className="w-4 h-4" />, label: 'Renewal Due', value: renewalDueAccounts.length, color: 'text-amber-600', bg: 'bg-amber-50', scrollRef: renewalRef },
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
          { key: 'accounts', label: 'All Accounts', icon: <FolderKanban className="w-4 h-4" />, count: migrationAccounts.length },
          { key: 'poc',      label: 'POC Projects', icon: <FlaskConical  className="w-4 h-4" />, count: pocAccounts.length },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); clearFilters(); setSortKey(null); }}
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

      {/* Filter bar */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search project, customer, PM..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-3 h-3 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
              showFilters ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 bg-blue-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <X className="w-3 h-3" /> Clear all
            </button>
          )}

          <span className="ml-auto text-xs text-gray-400">
            {customerGroups.length} customer{customerGroups.length !== 1 ? 's' : ''},&nbsp;
            {totalProjects} project{totalProjects !== 1 ? 's' : ''}
          </span>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <FilterDropdown value={statusFilter} onChange={setStatusFilter} placeholder="Status" options={['ACTIVE','INACTIVE','ON_HOLD','CANCELLED','COMPLETED']} />
            <FilterDropdown value={phaseFilter} onChange={setPhaseFilter} placeholder="Phase" options={['KICKOFF','MIGRATION','VALIDATION','CLOSURE','COMPLETED']} />
            <FilterDropdown value={delayFilter} onChange={setDelayFilter} placeholder="Delay Status" options={['NOT_DELAYED','AT_RISK','DELAYED']} />
            <FilterDropdown value={planFilter} onChange={setPlanFilter} placeholder="Plan Type" options={['BRONZE','SILVER','GOLD','PLATINUM']} />
            <FilterDropdown value={pmFilter} onChange={setPmFilter} placeholder="Project Manager" options={allPMs} />
            <FilterDropdown value={amFilter} onChange={setAmFilter} placeholder="Account Manager" options={allAMs} />
            <FilterDropdown value={attentionFilter} onChange={setAttentionFilter} placeholder="Attention" options={['attention','ok']} />
          </div>
        )}

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: search,          clear: () => setSearch(''),          prefix: 'Search' },
              { label: statusFilter,    clear: () => setStatusFilter(''),    prefix: 'Status' },
              { label: phaseFilter,     clear: () => setPhaseFilter(''),     prefix: 'Phase' },
              { label: delayFilter,     clear: () => setDelayFilter(''),     prefix: 'Delay' },
              { label: planFilter,      clear: () => setPlanFilter(''),      prefix: 'Plan' },
              { label: pmFilter,        clear: () => setPmFilter(''),        prefix: 'PM' },
              { label: amFilter,        clear: () => setAmFilter(''),        prefix: 'AM' },
              { label: attentionFilter, clear: () => setAttentionFilter(''), prefix: 'Attention' },
            ].filter(f => f.label).map(f => (
              <span key={f.prefix} className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-full text-xs font-medium">
                {f.prefix}: {f.label.replace(/_/g, ' ')}
                <button onClick={f.clear}><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Grouped projects table */}
      {customerGroups.length === 0 ? (
        <Card className="p-12 text-center text-gray-400">
          {activeTab === 'poc'
            ? <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-30" />
            : <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />}
          <p className="text-lg font-medium">
            {activeTab === 'poc' ? 'No POC projects found' : 'No projects found'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <SortTh label="Project"         sortKey="name"          current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Migration Types" sortKey="migrationTypes" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Project Manager" sortKey="projectManager" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Status"          sortKey="status"        current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Phase"           sortKey="phase"         current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Delay"           sortKey="delayStatus"   current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Plan"            sortKey="planType"      current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Kickoff Date"    sortKey="actualStart"   current={sortKey} dir={sortDir} onSort={handleSort} />
                  {activeTab === 'poc'
                    ? <SortTh label="POC Outcome" sortKey="pocOutcome" current={sortKey} dir={sortDir} onSort={handleSort} />
                    : <SortTh label="Planned End" sortKey="plannedEnd" current={sortKey} dir={sortDir} onSort={handleSort} />
                  }
                </tr>
              </thead>
              <tbody>
                {customerGroups.map(group => {
                  // Shared detail cells (columns 2 → last) reused by both single-row and sub-rows
                  const DetailCells = ({ row }: { row: ProjectRow }) => (
                    <>
                      <td className="px-4 py-3">
                        {row.migrationTypes ? (
                          <div className="flex flex-wrap gap-1">
                            {row.migrationTypes.split(',').map((w: string) => w.trim()).filter(Boolean).map((w: string) => (
                              <span key={w} className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full">{w}</span>
                            ))}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-sm">{row.projectManager || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.status ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[row.status] || 'bg-gray-100 text-gray-600'}`}>
                            {row.status.replace(/_/g, ' ')}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.phase ? (
                          <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full">{row.phase}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.delayStatus ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DELAY_COLORS[row.delayStatus] || 'bg-gray-100 text-gray-600'}`}>
                            {row.delayStatus.replace(/_/g, ' ')}
                            {row.delayDays && row.delayStatus === 'DELAYED' ? ` (${row.delayDays}d)` : ''}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.planType ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_BADGE[row.planType] || 'bg-gray-100 text-gray-600'}`}>
                            {row.planType}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-gray-400" />
                          {fmtDate(row.actualStart)}
                        </span>
                      </td>
                      {activeTab === 'poc' ? (
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.pocOutcome ? (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              row.pocOutcome === 'won'  ? 'bg-green-100 text-green-700' :
                              row.pocOutcome === 'lost' ? 'bg-red-100 text-red-700' :
                              'bg-blue-50 text-blue-600'
                            }`}>
                              {row.pocOutcome.replace('_', ' ')}
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">In Progress</span>
                          )}
                        </td>
                      ) : (
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="w-3 h-3 text-gray-400" />
                            {fmtDate(row.plannedEnd)}
                          </span>
                        </td>
                      )}
                    </>
                  );

                  // ── Single project: flat row, no expand/collapse ──────────
                  if (group.projects.length === 1) {
                    const row = group.projects[0];
                    return (
                      <tr key={group.customerName} className="hover:bg-gray-50 transition border-b border-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-gray-900">{group.customerName}</span>
                              {group.needsAttention && (
                                <span title={group.attentionReasons.join(' · ') || 'Needs Attention'}>
                                  <AlertTriangle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 capitalize mt-0.5">{row.name}</div>
                          </div>
                        </td>
                        <DetailCells row={row} />
                      </tr>
                    );
                  }

                  // ── Multiple projects: collapsible group ─────────────────
                  const isExpanded = expandedCustomers.has(group.customerName);
                  const uniqueStatuses = Array.from(new Set(group.projects.map(p => p.status).filter(Boolean)));
                  const hasDelayed = group.projects.some(p => p.delayStatus === 'DELAYED');
                  const hasAtRisk  = group.projects.some(p => p.delayStatus === 'AT_RISK');

                  return (
                    <Fragment key={group.customerName}>
                      {/* Group header row */}
                      <tr
                        className="bg-indigo-50/50 cursor-pointer hover:bg-indigo-100/60 transition border-t-2 border-indigo-100 select-none"
                        onClick={() => toggleCustomer(group.customerName)}
                      >
                        <td colSpan={colCount} className="px-4 py-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <ChevronRight
                              className={`w-4 h-4 text-indigo-400 flex-shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                            />
                            <span className="font-semibold text-gray-900 text-sm">{group.customerName}</span>
                            {group.needsAttention && (
                              <span title={group.attentionReasons.join(' · ') || 'Needs Attention'}>
                                <AlertTriangle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                              </span>
                            )}
                            <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">
                              {group.projects.length} projects
                            </span>
                            <span className="text-xs text-gray-500 font-medium">{group.accountManager || '—'}</span>
                            <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                              {uniqueStatuses.map(s => (
                                <span key={s} className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[s] || 'bg-gray-100 text-gray-600'}`}>
                                  {s.replace(/_/g, ' ')}
                                </span>
                              ))}
                              {hasDelayed && (
                                <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">Delayed</span>
                              )}
                              {!hasDelayed && hasAtRisk && (
                                <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">At Risk</span>
                              )}
                              {group.needsAttention && group.attentionReasons.length > 0 && (
                                <span className="text-xs text-orange-600 font-medium truncate max-w-xs" title={group.attentionReasons.join(' · ')}>
                                  {group.attentionReasons[0]}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded sub-rows */}
                      {isExpanded && group.projects.map(row => (
                        <tr key={row.id} className="hover:bg-blue-50/30 transition border-b border-gray-50">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2 pl-7">
                              <span className="font-medium text-gray-800 capitalize text-sm">{row.name}</span>
                            </div>
                          </td>
                          <DetailCells row={row} />
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
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
                            <td className="px-4 py-3 text-xs text-gray-600">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {fmtDate(t.plannedEnd)}
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
