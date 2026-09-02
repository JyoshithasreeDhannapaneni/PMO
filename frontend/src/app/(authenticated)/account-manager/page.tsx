'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Card } from '@/components/ui/Card';
import { MultiSelectDropdown } from '@/components/ui/MultiSelectDropdown';
import { useAuth } from '@/context/AuthContext';
import { useAccountManagerView, useHubspotSignals } from '@/hooks/useProjects';
import type { AccountView, HubspotSignalsData, HubspotCustomerDeals, HubspotDealCategory } from '@/types';
import { ACCOUNT_MANAGERS } from '@/lib/accountManagers';
import {
  Building2, Loader2, AlertTriangle,
  FlaskConical, FolderKanban, RefreshCw, Calendar,
  Search, SlidersHorizontal, X, ChevronsUpDown,
  ArrowUp, ArrowDown, CalendarDays, Download,
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

const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function normalizeCustomerKey(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const DEAL_CATEGORY_CFG: Record<HubspotDealCategory, { badge: string; label: string }> = {
  upsell:       { badge: 'bg-blue-100 text-blue-700 border-blue-200',       label: 'Upsell'     },
  cross_sell:   { badge: 'bg-purple-100 text-purple-700 border-purple-200', label: 'Cross-sell' },
  renewal:      { badge: 'bg-amber-100 text-amber-700 border-amber-200',    label: 'Renewal'    },
  new_business: { badge: 'bg-green-100 text-green-700 border-green-200',    label: 'New'        },
  other:        { badge: 'bg-gray-100 text-gray-600 border-gray-200',       label: 'Deal'       },
};

type SortKey =
  | 'name' | 'customerName' | 'accountManager' | 'projectManager'
  | 'status' | 'phase' | 'delayStatus' | 'planType'
  | 'actualStart' | 'plannedStart' | 'plannedEnd' | 'expectedEnd'
  | 'migrationTypes' | 'pocOutcome' | 'csatScore' | 'delayHappened';
type SortDir = 'asc' | 'desc';

function scrollTo(ref: React.RefObject<HTMLDivElement>) {
  ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function SortTh({
  label, sortKey: key, current, dir, onSort, className = '',
}: {
  label: string; sortKey: SortKey; current: SortKey | null;
  dir: SortDir; onSort: (k: SortKey) => void; className?: string;
}) {
  const active = current === key;
  return (
    <th
      className={`text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap cursor-pointer select-none hover:text-indigo-600 group ${className}`}
      onClick={() => onSort(key)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? dir === 'asc'
            ? <ArrowUp className="w-3 h-3 text-indigo-500" />
            : <ArrowDown className="w-3 h-3 text-indigo-500" />
          : <ChevronsUpDown className="w-3 h-3 text-gray-300 group-hover:text-gray-400" />}
      </span>
    </th>
  );
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString(); } catch { return '—'; }
}

function sowDuration(plannedStart: string | null | undefined, plannedEnd: string | null | undefined): string {
  if (!plannedStart || !plannedEnd) return '—';
  try {
    const s = new Date(plannedStart);
    const e = new Date(plannedEnd);
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
    const extraDays = e.getDate() - s.getDate();
    const total = extraDays > 7 ? months + 1 : Math.max(months, 1);
    return `${total} month${total !== 1 ? 's' : ''}`;
  } catch { return '—'; }
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
  plannedStart: string | null;
  plannedEnd: string | null;
  expectedEnd: string | null;
  isOveraged?: boolean;
  migrationTypes: string;
  trackType: 'migration' | 'poc';
  pocOutcome?: string | null;
  csatScore?: number | null;
  delayHappened?: 'CUSTOMER_DELAY' | 'INTERNAL_DELAY' | 'BOTH' | null;
  [key: string]: any;
};

export default function AccountManagerPage() {
  const { user, isLoading: authLoading } = useAuth();

  const [activeTab, setActiveTab]           = useState<'accounts' | 'poc'>('accounts');
  const [search, setSearch]                 = useState('');
  const [showFilters, setShowFilters]       = useState(true);
  const [statusFilter, setStatusFilter]     = useState('');
  const [phaseFilter, setPhaseFilter]       = useState('');
  const [delayFilter, setDelayFilter]       = useState('');
  const [planFilter, setPlanFilter]         = useState('');
  const [pmFilter, setPmFilter]             = useState('');
  const [amFilter, setAmFilter]             = useState('');
  const [attentionFilter, setAttentionFilter] = useState('');
  const [sortKey, setSortKey]               = useState<SortKey | null>('customerName');
  const [sortDir, setSortDir]               = useState<SortDir>('asc');

  const escalationRef = useRef<HTMLDivElement>(null);
  const renewalRef    = useRef<HTMLDivElement>(null);
  const overageRef    = useRef<HTMLDivElement>(null);
  const upsellRef     = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [tableCanScrollRight, setTableCanScrollRight] = useState(true);

  const checkTableScroll = useCallback(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    setTableCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    checkTableScroll();
    el.addEventListener('scroll', checkTableScroll);
    const ro = new ResizeObserver(checkTableScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkTableScroll); ro.disconnect(); };
  }, [checkTableScroll]);

  const { data, isLoading, error } = useAccountManagerView();
  const accounts: AccountView[] = data?.data || [];
  const totalProjects: number = data?.meta?.totalProjects ?? 0;
  const today = new Date();

  const { data: hubspotResponse } = useHubspotSignals();
  const hubspotData = (hubspotResponse?.data ?? null) as HubspotSignalsData | null;

  function hubspotFor(customerName: string): HubspotCustomerDeals | null {
    if (!hubspotData?.configured) return null;
    return hubspotData.customers[normalizeCustomerKey(customerName)] ?? null;
  }

  const escalatedAccounts  = accounts.filter(a => (a.migrationTracks || []).some((t: any) => t.isEscalated));
  const renewalDueAccounts = accounts.filter(a =>
    (a.migrationTracks || []).some(t =>
      t.plannedEnd && new Date(t.plannedEnd) < today && t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
    )
  );
  const overagedAccounts   = accounts.filter(a => (a.migrationTracks || []).some((t: any) => t.isOveraged));
  const upsellAccounts     = accounts.filter(a => {
    const hs = hubspotFor(a.customerName);
    return hs && (hs.upsellCount > 0 || hs.crossSellCount > 0);
  });
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

  // Build ONE consolidated row per customer account
  const tabAccounts = activeTab === 'poc' ? pocAccounts : migrationAccounts;

  const DELAY_RANK: Record<string, number> = { DELAYED: 3, AT_RISK: 2, NOT_DELAYED: 1 };
  const STATUS_RANK: Record<string, number> = { ACTIVE: 5, ON_HOLD: 4, INACTIVE: 3, COMPLETED: 2, CANCELLED: 1 };

  const allRows: ProjectRow[] = tabAccounts.map(account => {
    // ── POC tab: one row from the POC track ──────────────────────────────────
    if (activeTab === 'poc' && account.pocTrack) {
      const poc = account.pocTrack as any;
      return {
        id: poc.id,
        name: poc.name || account.customerName,
        customerName: account.customerName,
        accountManager: account.accountManager,
        needsAttention: account.needsAttention,
        projectManager: poc.projectManager || '',
        status: poc.status || '',
        phase: poc.phase || '',
        delayStatus: poc.delayStatus || '',
        delayDays: poc.delayDays,
        planType: poc.planType || '',
        actualStart: poc.actualStart || null,
        plannedEnd: poc.pocDeadline || poc.plannedEnd || null,
        migrationTypes: poc.migrationTypes || '',
        trackType: 'poc' as const,
        pocOutcome: poc.pocOutcome,
        isEscalated: !!poc.isEscalated,
        csatScore: poc.csatScore ?? null,
        delayHappened: poc.delayHappened ?? null,
        ...poc,
      } as ProjectRow;
    }

    // ── Migration tab: merge ALL tracks for this customer into one row ────────
    const tracks: any[] = account.migrationTracks || [];
    if (tracks.length === 0) return null;

    // Combine all migration types (de-duplicated)
    const allTypes = Array.from(new Set(
      tracks.flatMap((m: any) =>
        (m.migrationTypes || '').split(',').map((t: string) => t.trim()).filter(Boolean)
      )
    ));

    // All distinct project managers
    const allPMNames = Array.from(new Set(tracks.map((m: any) => m.projectManager).filter(Boolean)));

    // Worst delay status
    const worstDelay = tracks.reduce((w: any, m: any) =>
      (DELAY_RANK[m.delayStatus] || 0) > (DELAY_RANK[w.delayStatus] || 0) ? m : w
    , tracks[0]);

    // Most active status
    const worstStatus = tracks.reduce((w: any, m: any) =>
      (STATUS_RANK[m.status] || 0) > (STATUS_RANK[w.status] || 0) ? m : w
    , tracks[0]);

    // Earliest kickoff, earliest SOW start, latest SOW end, latest project end
    const starts       = tracks.map((m: any) => m.actualStart).filter(Boolean).sort();
    const sowStarts    = tracks.map((m: any) => m.plannedStart).filter(Boolean).sort();
    const ends         = tracks.map((m: any) => m.plannedEnd).filter(Boolean).sort();
    // Same rule as the All Projects table: overaged projects show the extension
    // deadline (expectedEnd), everything else shows the raw actualEnd.
    const projectEnds  = tracks
      .map((m: any) => (m.isOveraged && m.expectedEnd) ? m.expectedEnd : m.actualEnd)
      .filter(Boolean)
      .sort();

    // Any escalated project means this row is escalated
    const anyEscalated = tracks.some((m: any) => m.isEscalated);
    const anyOveraged  = tracks.some((m: any) => m.isOveraged);

    const primary = tracks[0];

    return {
      id: primary.id,
      name: primary.name,
      customerName: account.customerName,
      accountManager: account.accountManager,
      needsAttention: account.needsAttention,
      projectManager: allPMNames.join(', '),
      status: worstStatus.status || '',
      phase: worstDelay.phase || primary.phase || '',
      delayStatus: worstDelay.delayStatus || '',
      delayDays: worstDelay.delayDays,
      planType: primary.planType || '',
      actualStart: starts[0] || null,
      plannedStart: sowStarts[0] || null,
      plannedEnd: ends[ends.length - 1] || null,
      expectedEnd: projectEnds[projectEnds.length - 1] || null,
      isOveraged: anyOveraged,
      migrationTypes: allTypes.join(', '),
      trackType: 'migration' as const,
      isEscalated: anyEscalated,
      csatScore: primary.csatScore ?? null,
      delayHappened: worstDelay.delayHappened ?? primary.delayHappened ?? null,
    } as ProjectRow;
  }).filter(Boolean) as ProjectRow[];

  const allPMs = Array.from(new Set(allRows.map(r => r.projectManager).filter(Boolean))).sort() as string[];
  const allAMs = ACCOUNT_MANAGERS;

  // Filter — each *Filter value is a comma-separated list (MultiSelectDropdown's shape); empty means "no filter"
  const filteredRows = allRows.filter(row => {
    const attentionSel = attentionFilter ? attentionFilter.split(',').filter(Boolean) : [];
    if (attentionSel.length) {
      const matchesAttention = attentionSel.some(v => (v === 'attention' ? row.needsAttention : !row.needsAttention));
      if (!matchesAttention) return false;
    }
    const statusSel = statusFilter ? statusFilter.split(',').filter(Boolean) : [];
    if (statusSel.length && !statusSel.includes(row.status)) return false;
    const phaseSel = phaseFilter ? phaseFilter.split(',').filter(Boolean) : [];
    if (phaseSel.length && !phaseSel.includes(row.phase)) return false;
    const delaySel = delayFilter ? delayFilter.split(',').filter(Boolean) : [];
    if (delaySel.length && !delaySel.includes(row.delayStatus)) return false;
    const planSel = planFilter ? planFilter.split(',').filter(Boolean) : [];
    if (planSel.length && !planSel.includes(row.planType)) return false;
    const pmSel = pmFilter ? pmFilter.split(',').filter(Boolean) : [];
    if (pmSel.length && !pmSel.includes(row.projectManager)) return false;
    const amSel = amFilter ? amFilter.split(',').filter(Boolean) : [];
    if (amSel.length && !amSel.includes(row.accountManager)) return false;
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

  // Sort
  const sortedRows = sortKey
    ? [...filteredRows].sort((a, b) => {
        const aVal = a[sortKey] ?? '';
        const bVal = b[sortKey] ?? '';
        if (sortKey === 'actualStart' || sortKey === 'plannedEnd') {
          const aT = aVal ? new Date(aVal as string).getTime() : 0;
          const bT = bVal ? new Date(bVal as string).getTime() : 0;
          return sortDir === 'asc' ? aT - bT : bT - aT;
        }
        const cmp = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' });
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : filteredRows;

  const activeFilterCount = [search, statusFilter, phaseFilter, delayFilter, planFilter, pmFilter, amFilter, attentionFilter].filter(Boolean).length;

  // Exports every section currently on this page — the projects table honors whatever
  // tab/filters/sort are active (so the export matches what's on screen), the rest
  // (escalations, renewal, overage, upsell) are always exported in full since nothing
  // on the page filters them independently.
  function handleExportExcel() {
    const wb = XLSX.utils.book_new();

    const summaryRows = [
      { Metric: 'Customer Accounts', Value: accounts.length },
      { Metric: 'Total Projects', Value: totalProjects },
      { Metric: 'Escalations', Value: escalatedAccounts.length },
      { Metric: 'Renewal Due', Value: renewalDueAccounts.length },
      { Metric: 'Overaged', Value: overagedAccounts.length },
      { Metric: 'Upsell / Cross-sell Accounts', Value: upsellAccounts.length },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');

    const projectRows = sortedRows.map(row => ({
      Project: row.name,
      Customer: row.customerName,
      'Migration Types': row.migrationTypes || '',
      'Account Manager': row.accountManager || '',
      'Project Manager': row.projectManager || '',
      Status: row.status || '',
      Phase: row.phase || '',
      Delay: row.delayStatus ? `${row.delayStatus}${row.delayDays && row.delayStatus === 'DELAYED' ? ` (${row.delayDays}d)` : ''}` : '',
      Plan: row.planType || '',
      'SOW Start': fmtDate(row.plannedStart),
      'SOW End': fmtDate(row.plannedEnd),
      Duration: sowDuration(row.plannedStart, row.plannedEnd),
      'Kickoff Date': fmtDate(row.actualStart),
      ...(activeTab === 'poc'
        ? { 'POC Outcome': row.pocOutcome ? row.pocOutcome.replace('_', ' ') : 'In Progress' }
        : { 'Project End': fmtDate(row.expectedEnd) }),
      'C-SAT': row.csatScore ?? '',
      'Delay Happened': row.delayHappened === 'CUSTOMER_DELAY' ? 'Customer' : row.delayHappened === 'BOTH' ? 'Both' : row.delayHappened === 'INTERNAL_DELAY' ? 'Internal' : '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projectRows), activeTab === 'poc' ? 'POC Projects' : 'All Projects');

    const escalationRows = escalatedAccounts.flatMap(a =>
      (a.migrationTracks || []).filter((t: any) => t.isEscalated).map((t: any) => ({
        Customer: a.customerName,
        'Account Manager': a.accountManager || '',
        Project: t.name,
        Priority: t.escalationPriority || 'Escalated',
        Phase: t.phase || '',
      }))
    );
    if (escalationRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(escalationRows), 'Escalations');

    const renewalRows = renewalDueAccounts.flatMap(a =>
      (a.migrationTracks || [])
        .filter(t => t.plannedEnd && new Date(t.plannedEnd) < today && t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
        .map(t => ({
          Project: t.name,
          Customer: a.customerName,
          'Account Manager': a.accountManager || '',
          'Project Manager': t.projectManager || '',
          'Planned End': fmtDate(t.plannedEnd),
          'Overdue (days)': Math.floor((today.getTime() - new Date(t.plannedEnd!).getTime()) / 86400000),
          Phase: t.phase || '',
        }))
    );
    if (renewalRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(renewalRows), 'Renewal Due');

    const overageRows = overagedAccounts.flatMap(a =>
      (a.migrationTracks || []).filter((t: any) => t.isOveraged).map((t: any) => ({
        Customer: a.customerName,
        Project: t.name,
        'Account Manager': a.accountManager || '',
        'Project Manager': t.projectManager || '',
        Plan: t.planType || '',
        'Overage Amount': t.overageAmount ?? '',
        Phase: t.phase || '',
        Status: (t.status || '').replace(/_/g, ' '),
      }))
    );
    if (overageRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overageRows), 'Overaged Projects');

    const upsellRows = upsellAccounts.flatMap(a => {
      const hs = hubspotFor(a.customerName);
      if (!hs) return [];
      return hs.deals
        .filter(d => d.category === 'upsell' || d.category === 'cross_sell')
        .map(d => ({
          Customer: a.customerName,
          'Account Manager': a.accountManager || '',
          Deal: d.name,
          Category: DEAL_CATEGORY_CFG[d.category].label,
          Stage: d.isClosedWon ? 'Closed won' : d.stage,
          'Close Date': d.closeDate ? fmtDate(d.closeDate) : '',
          Amount: d.amount ?? '',
        }));
    });
    if (upsellRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(upsellRows), 'Upsell & Cross-sell');

    XLSX.writeFile(wb, `account-manager-view-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (authLoading || isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  );

  if (user?.role !== 'ADMIN' && user?.role !== 'ACCOUNT_MANAGER') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertTriangle size={40} className="text-red-400" />
        <p className="text-lg font-semibold text-gray-700">Access Denied</p>
        <p className="text-sm text-gray-400">This page is only accessible to account managers and administrators.</p>
      </div>
    );
  }

  if (error) return <div className="p-6 text-red-500">Failed to load account manager view</div>;

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Building2 className="w-7 h-7 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Account Manager View</h1>
            <p className="text-sm text-gray-500">
              {accounts.length} customer account{accounts.length !== 1 ? 's' : ''}
              {totalProjects > 0 && (
                <span className="ml-2 text-indigo-600 font-medium">· {totalProjects} total project{totalProjects !== 1 ? 's' : ''}</span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={handleExportExcel}
          disabled={accounts.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40"
        >
          <Download size={14} /> Download Excel
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: <Building2 className="w-4 h-4" />,    label: 'Customer Accounts', value: accounts.length,           color: 'text-indigo-600', bg: 'bg-indigo-50', ref: null },
          { icon: <FolderKanban className="w-4 h-4" />, label: 'Total Projects',    value: totalProjects,             color: 'text-blue-600',   bg: 'bg-blue-50',   ref: null },
          { icon: <AlertTriangle className="w-4 h-4" />,label: 'Escalations',       value: escalatedAccounts.length,  color: 'text-red-600',    bg: 'bg-red-50',    ref: escalationRef },
          { icon: <RefreshCw className="w-4 h-4" />,    label: 'Renewal Due',       value: renewalDueAccounts.length, color: 'text-amber-600',  bg: 'bg-amber-50',  ref: renewalRef },
          { icon: <ArrowUp className="w-4 h-4" />,      label: 'Overaged',          value: overagedAccounts.length,   color: 'text-orange-600', bg: 'bg-orange-50', ref: overageRef },
          { icon: <ArrowUp className="w-4 h-4" />,      label: 'Upsell / X-sell',   value: upsellAccounts.length,     color: 'text-teal-600',   bg: 'bg-teal-50',   ref: upsellRef },
        ].map(s => (
          <div
            key={s.label}
            onClick={() => s.ref && scrollTo(s.ref)}
            className={`${s.bg} rounded-xl p-3 flex items-center gap-3 ${s.ref ? 'cursor-pointer hover:brightness-95 transition' : ''}`}
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
            onClick={() => { setActiveTab(tab.key); clearFilters(); setSortKey('customerName'); setSortDir('asc'); }}
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
            {sortedRows.length} project{sortedRows.length !== 1 ? 's' : ''}
          </span>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <div className="w-40">
              <MultiSelectDropdown label="" value={statusFilter} onChange={setStatusFilter} placeholder="Status"
                options={['ACTIVE','INACTIVE','ON_HOLD','CANCELLED','COMPLETED'].map(o => ({ value: o, label: o.replace(/_/g, ' ') }))} />
            </div>
            <div className="w-44">
              <MultiSelectDropdown label="" value={phaseFilter} onChange={setPhaseFilter} placeholder="Phase"
                options={['KICKOFF','CLOUD_ADDING','PILOT_MIGRATION','ONETIME_MIGRATION','DELTA','FINAL_VALIDATION','COMPLETED'].map(o => ({ value: o, label: o.replace(/_/g, ' ') }))} />
            </div>
            <div className="w-40">
              <MultiSelectDropdown label="" value={delayFilter} onChange={setDelayFilter} placeholder="Delay Status"
                options={['NOT_DELAYED','AT_RISK','DELAYED'].map(o => ({ value: o, label: o.replace(/_/g, ' ') }))} />
            </div>
            <div className="w-40">
              <MultiSelectDropdown label="" value={planFilter} onChange={setPlanFilter} placeholder="Plan Type"
                options={['BRONZE','SILVER','GOLD','PLATINUM'].map(o => ({ value: o, label: o }))} />
            </div>
            <div className="w-44">
              <MultiSelectDropdown label="" value={pmFilter} onChange={setPmFilter} placeholder="Project Manager"
                options={allPMs.map(o => ({ value: o, label: o }))} searchable />
            </div>
            <div className="w-44">
              <MultiSelectDropdown label="" value={amFilter} onChange={setAmFilter} placeholder="Account Manager"
                options={allAMs.map(o => ({ value: o, label: o }))} searchable />
            </div>
            <div className="w-36">
              <MultiSelectDropdown label="" value={attentionFilter} onChange={setAttentionFilter} placeholder="Attention"
                options={[{ value: 'attention', label: 'Needs Attention' }, { value: 'ok', label: 'OK' }]} />
            </div>
          </div>
        )}

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {search && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-full text-xs font-medium">
                Search: {search}
                <button onClick={() => setSearch('')}><X className="w-3 h-3" /></button>
              </span>
            )}
            {[
              { values: statusFilter,    set: setStatusFilter,    prefix: 'Status' },
              { values: phaseFilter,     set: setPhaseFilter,     prefix: 'Phase' },
              { values: delayFilter,     set: setDelayFilter,     prefix: 'Delay' },
              { values: planFilter,      set: setPlanFilter,      prefix: 'Plan' },
              { values: pmFilter,        set: setPmFilter,        prefix: 'PM' },
              { values: amFilter,        set: setAmFilter,        prefix: 'AM' },
              { values: attentionFilter, set: setAttentionFilter, prefix: 'Attention' },
            ].flatMap(f => (f.values ? f.values.split(',').filter(Boolean) : []).map(v => ({ ...f, v }))).map((f, i) => (
              <span key={`${f.prefix}-${i}`} className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-full text-xs font-medium">
                {f.prefix}: {f.v.replace(/_/g, ' ')}
                <button onClick={() => f.set(f.values.split(',').filter(x => x !== f.v).join(','))}><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Projects table — flat, every row identical */}
      {sortedRows.length === 0 ? (
        <Card className="p-12 text-center text-gray-400">
          {activeTab === 'poc'
            ? <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-30" />
            : <Building2   className="w-12 h-12 mx-auto mb-3 opacity-30" />}
          <p className="text-lg font-medium">
            {activeTab === 'poc' ? 'No POC projects found' : 'No projects found'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="relative">
          {tableCanScrollRight && (
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 z-40 bg-gradient-to-l from-white/90 to-transparent flex items-center justify-end pr-2">
              <div className="flex flex-col items-center gap-0.5 text-gray-400 animate-pulse">
                <ArrowUp className="w-3.5 h-3.5 rotate-90" />
                <span className="text-[10px] font-medium whitespace-nowrap">scroll</span>
              </div>
            </div>
          )}
          <div ref={tableScrollRef} className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-14rem)]">
            <table className="min-w-max w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-20">
                <tr>
                  <SortTh label="Project"         sortKey="name"           current={sortKey} dir={sortDir} onSort={handleSort} className="sticky left-0 z-30 bg-gray-50 border-r border-gray-200 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]" />
                  <SortTh label="Migration Types" sortKey="migrationTypes"  current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Account Manager" sortKey="accountManager"  current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Project Manager" sortKey="projectManager"  current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Status"          sortKey="status"          current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Phase"           sortKey="phase"           current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Delay"           sortKey="delayStatus"     current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Plan"            sortKey="planType"        current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="SOW Start"       sortKey="plannedStart"    current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="SOW End"         sortKey="plannedEnd"      current={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Duration</th>
                  <SortTh label="Kickoff Date"    sortKey="actualStart"     current={sortKey} dir={sortDir} onSort={handleSort} />
                  {activeTab === 'poc'
                    ? <SortTh label="POC Outcome"  sortKey="pocOutcome"   current={sortKey} dir={sortDir} onSort={handleSort} />
                    : <SortTh label="Project End"  sortKey="expectedEnd"  current={sortKey} dir={sortDir} onSort={handleSort} />
                  }
                  <SortTh label="C-SAT"          sortKey="csatScore"    current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Delay Happened" sortKey="delayHappened" current={sortKey} dir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedRows.map(row => (
                  <tr key={`${row.customerName}-${row.id}`} className="hover:bg-gray-50 transition-colors group">

                    {/* Project name + customer as subtitle — frozen */}
                    <td className="px-4 py-3 sticky left-0 z-10 bg-white group-hover:bg-gray-50 transition-colors border-r border-gray-200 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.04)]">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-gray-900 capitalize">{row.name}</span>
                          {(row.delayStatus === 'DELAYED' || row.isEscalated) && (
                            <span title={row.isEscalated ? 'Escalated' : 'Delayed'}>
                              <AlertTriangle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">{row.customerName}</span>
                      </div>
                    </td>

                    {/* Migration types */}
                    <td className="px-4 py-3">
                      {row.migrationTypes ? (
                        <div className="flex flex-wrap gap-1">
                          {row.migrationTypes.split(',').map((w: string) => w.trim()).filter(Boolean).map((w: string) => (
                            <span key={w} className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full">{w}</span>
                          ))}
                        </div>
                      ) : '—'}
                    </td>

                    {/* Account Manager */}
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{row.accountManager || '—'}</td>

                    {/* Project Manager */}
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{row.projectManager || '—'}</td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.status ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[row.status] || 'bg-gray-100 text-gray-600'}`}>
                          {row.status.replace(/_/g, ' ')}
                        </span>
                      ) : '—'}
                    </td>

                    {/* Phase */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.phase ? (
                        <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full">{row.phase}</span>
                      ) : '—'}
                    </td>

                    {/* Delay */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.delayStatus ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DELAY_COLORS[row.delayStatus] || 'bg-gray-100 text-gray-600'}`}>
                          {row.delayStatus.replace(/_/g, ' ')}
                          {row.delayDays && row.delayStatus === 'DELAYED' ? ` (${row.delayDays}d)` : ''}
                        </span>
                      ) : '—'}
                    </td>

                    {/* Plan */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.planType ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_BADGE[row.planType] || 'bg-gray-100 text-gray-600'}`}>
                          {row.planType}
                        </span>
                      ) : '—'}
                    </td>

                    {/* SOW Start */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3 h-3 text-gray-400" />
                        {fmtDate(row.plannedStart)}
                      </span>
                    </td>

                    {/* SOW End */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3 h-3 text-gray-400" />
                        {fmtDate(row.plannedEnd)}
                      </span>
                    </td>

                    {/* Duration */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700">
                        {sowDuration(row.plannedStart, row.plannedEnd)}
                      </span>
                    </td>

                    {/* Kickoff Date */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        {fmtDate(row.actualStart)}
                      </span>
                    </td>

                    {/* Planned End / POC Outcome */}
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
                          {fmtDate(row.expectedEnd)}
                        </span>
                      </td>
                    )}

                    {/* C-SAT */}
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      {row.csatScore != null ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          row.csatScore >= 4 ? 'bg-green-100 text-green-700' :
                          row.csatScore >= 3 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {row.csatScore}/5
                        </span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>

                    {/* Delay Happened */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.delayHappened ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          row.delayHappened === 'CUSTOMER_DELAY' ? 'bg-amber-100 text-amber-700' :
                          row.delayHappened === 'BOTH' ? 'bg-purple-100 text-purple-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {row.delayHappened === 'CUSTOMER_DELAY' ? 'Customer' : row.delayHappened === 'BOTH' ? 'Both' : 'Internal'}
                        </span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </Card>
      )}

      {/* Escalations */}
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

      {/* Renewal Due */}
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
                                <Calendar className="w-3 h-3" />{fmtDate(t.plannedEnd)}
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

      {/* Overaged Projects */}
      <div ref={overageRef} className="scroll-mt-6">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ArrowUp className="w-5 h-5 text-orange-500" /> Overaged Projects
            <span className="text-sm font-normal text-gray-400">— projects that exceeded their contracted budget</span>
          </h2>
          {overagedAccounts.length === 0 ? (
            <Card className="py-8 text-center text-gray-400 text-sm">No overaged projects</Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-orange-50 border-b border-orange-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Project</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Account Manager</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Project Manager</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Plan</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Overage Amount</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Phase</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {overagedAccounts.flatMap(a =>
                    (a.migrationTracks || []).filter((t: any) => t.isOveraged).map((t: any) => (
                      <tr key={`overage-${a.customerName}-${t.id}`} className="hover:bg-orange-50/40 transition">
                        <td className="px-4 py-3 font-medium text-gray-900">{a.customerName}</td>
                        <td className="px-4 py-3 text-gray-700">{t.name}</td>
                        <td className="px-4 py-3 text-gray-600">{a.accountManager || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{t.projectManager || '—'}</td>
                        <td className="px-4 py-3">
                          {t.planType ? (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_BADGE[t.planType] || 'bg-gray-100 text-gray-600'}`}>
                              {t.planType}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {t.overageAmount != null ? (
                            <span className="font-semibold text-orange-600">
                              {currencyFmt.format(t.overageAmount)}
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">Overaged</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full">{t.phase || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[t.status] || 'bg-gray-100 text-gray-600'}`}>
                            {(t.status || '').replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>

      {/* HubSpot Upsell & Cross-sell */}
      <div ref={upsellRef} className="scroll-mt-6">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ArrowUp className="w-5 h-5 text-teal-500" /> Upsell &amp; Cross-sell Opportunities
            <span className="text-sm font-normal text-gray-400">— live HubSpot pipeline per customer</span>
          </h2>

          {!hubspotData?.configured ? (
            <Card className="py-8 text-center space-y-1">
              <p className="text-sm text-gray-500 font-medium">HubSpot not connected</p>
              <p className="text-xs text-gray-400">Add <code className="font-mono bg-gray-100 px-1 rounded">HUBSPOT_ACCESS_TOKEN</code> to backend/.env and restart the server to see live deal signals here.</p>
            </Card>
          ) : hubspotData.error ? (
            <Card className="py-6 text-center">
              <p className="text-sm text-yellow-600 font-medium flex items-center justify-center gap-2">
                <AlertTriangle className="w-4 h-4" /> HubSpot connected but data fetch failed
              </p>
              <p className="text-xs text-gray-400 mt-1">{hubspotData.error}</p>
            </Card>
          ) : upsellAccounts.length === 0 ? (
            <Card className="py-8 text-center text-gray-400 text-sm">No upsell or cross-sell deals found in HubSpot for current customers</Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {upsellAccounts.map(a => {
                const hs = hubspotFor(a.customerName)!;
                const upsellDeals   = hs.deals.filter(d => d.category === 'upsell' || d.category === 'cross_sell');
                const migTracks     = (a.migrationTracks || []) as any[];
                const anyEscalated  = migTracks.some(t => t.isEscalated);
                const anyOveraged   = migTracks.some(t => t.isOveraged);
                return (
                  <Card key={a.customerName} className="p-4 space-y-3">
                    {/* Account header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{a.customerName}</p>
                        <p className="text-xs text-gray-400">{a.accountManager || 'No AM assigned'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <div className="flex gap-1">
                          {anyEscalated && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100 font-medium">Escalated</span>
                          )}
                          {anyOveraged && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100 font-medium">Overaged</span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                          {hs.upsellCount} upsell · {hs.crossSellCount} cross-sell
                          {hs.openValue > 0 && <span className="ml-1">&nbsp;· {currencyFmt.format(hs.openValue)} open</span>}
                        </p>
                      </div>
                    </div>

                    {/* Active projects context */}
                    {migTracks.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {migTracks.slice(0, 3).map((t: any) => (
                          <span key={t.id} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                            {t.name}
                          </span>
                        ))}
                        {migTracks.length > 3 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-full">+{migTracks.length - 3} more</span>
                        )}
                      </div>
                    )}

                    {/* Deal list */}
                    <div className="space-y-1.5">
                      {upsellDeals.map(d => {
                        const cfg = DEAL_CATEGORY_CFG[d.category];
                        return (
                          <div key={d.id} className="flex items-start justify-between gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">{d.name}</p>
                              <p className="text-[11px] text-gray-400">
                                {d.isClosedWon ? 'Closed won' : d.stage}
                                {d.closeDate ? ` · closes ${new Date(d.closeDate).toLocaleDateString()}` : ''}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${cfg.badge}`}>{cfg.label}</span>
                              {d.amount !== null && <span className="text-xs font-semibold text-gray-700">{currencyFmt.format(d.amount!)}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
