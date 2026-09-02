'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useProjects, useDeleteProject } from '@/hooks/useProjects';
import { authApi, dashboardApi } from '@/services/api';
import { ProjectsTable } from '@/components/projects/ProjectsTable';
import { MultiScopeProjectModal } from '@/components/projects/MultiScopeProjectModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MultiSelectDropdown } from '@/components/ui/MultiSelectDropdown';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import {
  Loader2,
  Plus,
  Filter,
  X,
  Search,
  RefreshCw,
  Download,
  SlidersHorizontal,
  User,
  CheckCircle,
} from 'lucide-react';
import Link from 'next/link';
import { projectSegment, type Segment } from '@/lib/segments';
import { formatCurrency } from '@/lib/utils';
import { mergeAccountManagers } from '@/lib/accountManagers';

interface FilterState {
  status: string;
  phase: string;
  delayStatus: string;
  planType: string;
  projectManager: string;
  accountManager: string;
  search: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { settings } = useSettings();
  const isManager = false; // PROJECT_MANAGERs see all projects — no self-filter
  const isViewer = user?.role === 'VIEWER';
  
  // Initialize filters from URL params
  const [filters, setFilters] = useState<FilterState>({
    status: searchParams.get('status') || '',
    phase: searchParams.get('phase') || '',
    delayStatus: searchParams.get('delayStatus') || '',
    planType: searchParams.get('planType') || '',
    projectManager: searchParams.get('projectManager') || '',
    accountManager: searchParams.get('accountManager') || '',
    search: searchParams.get('search') || '',
  });

  // When hideCompleted=true is in URL, exclude COMPLETED and CANCELLED from results
  const [hideCompleted, setHideCompleted] = useState(searchParams.get('hideCompleted') === 'true');

  const [searchInput, setSearchInput] = useState(filters.search);
  const [showFilters, setShowFilters] = useState(true);
  const [segmentTab, setSegmentTab] = useState<Segment | 'ALL'>('ALL');
  const [showMultiModal, setShowMultiModal] = useState(false);

  // Update URL when filters change (preserve hideCompleted)
  useEffect(() => {
    const params = new URLSearchParams();
    if (hideCompleted) params.set('hideCompleted', 'true');
    if (filters.status) params.set('status', filters.status);
    if (filters.phase) params.set('phase', filters.phase);
    if (filters.delayStatus) params.set('delayStatus', filters.delayStatus);
    if (filters.planType) params.set('planType', filters.planType);
    if (filters.projectManager) params.set('projectManager', filters.projectManager);
    if (filters.accountManager) params.set('accountManager', filters.accountManager);
    if (filters.search) params.set('search', filters.search);

    const queryString = params.toString();
    router.replace(`/projects${queryString ? `?${queryString}` : ''}`, { scroll: false });
  }, [filters, hideCompleted, router]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, error, refetch } = useProjects({
    status: filters.status || undefined,
    phase: filters.phase || undefined,
    delayStatus: filters.delayStatus || undefined,
    planType: filters.planType || undefined,
    search: filters.search || undefined,
    // MANAGER role is always restricted to their own projects by the backend;
    // for ADMIN/VIEWER we pass the dropdown selection.
    projectManager: isManager ? (user?.name ?? undefined) : (filters.projectManager || undefined),
    accountManager: filters.accountManager || undefined,
    excludeStatus: hideCompleted && !filters.status ? 'COMPLETED,CANCELLED' : undefined,
    limit: 10000,
  });

  // Fetch all users with MANAGER role to populate PM dropdown
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => authApi.getUsers(),
    staleTime: 60_000,
  });

  const deleteProject = useDeleteProject();

  const handleDelete = async (id: string) => {
    try {
      await deleteProject.mutateAsync(id);
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  // POC projects are excluded — they have their own dedicated page
  const allProjects = data?.data || [];
  const displayProjects = allProjects.filter((p: any) => !p.projectType || p.projectType !== 'POC');

  const entCount = displayProjects.filter((p: any) => projectSegment(p) === 'ENT').length;
  const smbCount = displayProjects.filter((p: any) => projectSegment(p) === 'SMB').length;
  const unsegmentedCount = displayProjects.length - entCount - smbCount;
  const segmentProjects = segmentTab === 'ALL'
    ? displayProjects
    : displayProjects.filter((p: any) => projectSegment(p) === segmentTab);

  const clientGroups = useMemo(() => {
    const grouped = new Map<string, any[]>();
    for (const p of displayProjects) {
      const key = p.clientName?.trim() || p.name?.trim() || 'Unnamed';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(p);
    }
    return { grouped, ungrouped: [] as any[] };
  }, [displayProjects]);

  function getMigrationScopes(migrationTypes: string | null | undefined): string[] {
    if (!migrationTypes) return [];
    const MESSAGING = ['slack', 'teams', 'chat', 'meta', 'viva', 'cisco', 'zoom', 'skype', 'webex', 'ringcentral'];
    const EMAIL = ['gmail', 'outlook', 'exchange', 'gsuite', 'google workspace', 'lotus', 'notes', 'imap', 'zimbra', 'kerio'];
    const scopes = new Set<string>();
    for (const t of migrationTypes.split(',')) {
      const lower = t.trim().toLowerCase();
      if (!lower) continue;
      if (MESSAGING.some((k) => lower.includes(k))) scopes.add('Messaging');
      else if (EMAIL.some((k) => lower.includes(k))) scopes.add('Email');
      else scopes.add('Content');
    }
    return [...scopes];
  }

  const SCOPE_STYLE: Record<string, string> = {
    'Content':   'bg-blue-100 text-blue-700',
    'Email':     'bg-green-100 text-green-700',
    'Messaging': 'bg-purple-100 text-purple-700',
  };

  const exportToCSV = async () => {
    if (!segmentProjects.length) return;

    // Fetch delay happened notes for all projects (stored in escalation_daily_notes table)
    let delayNotes: Record<string, string> = {};
    try { delayNotes = await dashboardApi.getDelayHappenedNotes(); } catch { /* skip if unavailable */ }

    const fmt = (d: string | null | undefined) =>
      d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '';

    const MS_PER_DAY = 1000 * 60 * 60 * 24;

    const getDurationMonths = (p: any): string => {
      if (!p.plannedStart || !p.plannedEnd) return '';
      const days = (new Date(p.plannedEnd).getTime() - new Date(p.plannedStart).getTime()) / MS_PER_DAY;
      return (days / 30.44).toFixed(1);
    };

    const toDay = (d: Date | string): Date => {
      const dt = typeof d === 'string' ? new Date(d) : d;
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    };

    const getSowDateEnded = (p: any): string => {
      const effectiveEnd = (p.isOveraged && p.extendedEndDate) ? p.extendedEndDate : p.plannedEnd;
      if (!effectiveEnd) return '';
      return toDay(effectiveEnd) < toDay(new Date()) ? 'Yes' : 'No';
    };

    const csatLabel = (score: number | null | undefined): string => {
      if (score == null) return 'Not set';
      if (score >= 4.0) return 'Good';
      if (score >= 2.5) return 'Average';
      return 'Bad';
    };

    const delayHappenedLabel = (v: string | null | undefined): string => {
      if (!v) return '';
      if (v === 'CUSTOMER_DELAY') return 'Customer Delay';
      if (v === 'INTERNAL_DELAY') return 'Internal Delay';
      if (v === 'BOTH') return 'Both';
      return v;
    };

    const headers = [
      'Project Name', 'Client / Account', 'Customer Name', 'Project Manager', 'Account Manager',
      'Migration Types', 'Plan Type', 'Status', 'Phase',
      'CSAT Score', 'CSAT Health', 'Delay Happened', 'Delay Happened Notes',
      'Duration (Months)', 'Expected Project End', 'Extended End Date (Overage)',
      'Delay Status', 'Delay Days', 'SOW Date Ended',
      'Estimated Budget', 'Is Overaged', 'Overage Amount',
      'SOW Start', 'SOW End', 'Kickoff Start',
      'Cloud Adding Start', 'Cloud Adding End',
      'Pilot Migration Start', 'Pilot Migration End',
      'Onetime Migration Start', 'Onetime Migration End',
      'Delta Migration Start', 'Delta Migration End',
      'Final Validation Start', 'Final Validation End',
      'Project End',
      'Project Notes',
      'Cloud Adding Notes', 'Pilot Migration Notes',
      'Onetime Migration Notes', 'Delta Migration Notes',
      'Final Validation Notes',
    ];

    const rows = segmentProjects.map((p: any) => [
      p.name ?? '',
      p.clientName ?? '',
      p.customerName ?? '',
      p.projectManager ?? '',
      p.accountManager ?? '',
      p.migrationTypes ?? '',
      p.planType ?? '',
      p.status ?? '',
      p.phase ?? '',
      p.csatScore != null ? p.csatScore.toFixed(1) : '',
      csatLabel(p.csatScore),
      delayHappenedLabel(p.delayHappened),
      delayNotes[p.id] ?? '',
      getDurationMonths(p),
      fmt(p.expectedEnd ?? p.plannedEnd),
      p.isOveraged && p.extendedEndDate ? fmt(p.extendedEndDate) : '',
      p.delayStatus ?? '',
      p.delayDays != null ? String(p.delayDays) : '0',
      getSowDateEnded(p),
      p.estimatedCost != null ? String(p.estimatedCost) : '',
      p.isOveraged ? 'Yes' : 'No',
      p.overageAmount != null ? String(p.overageAmount) : '',
      fmt(p.plannedStart),
      fmt(p.plannedEnd),
      fmt(p.actualStart),
      fmt(p.cloudAddingStart),
      fmt(p.cloudAddingEnd),
      fmt(p.pilotMigrationStart),
      fmt(p.pilotMigrationEnd),
      fmt(p.onetimeMigrationStart),
      fmt(p.onetimeMigrationEnd),
      fmt(p.deltaMigrationStart),
      fmt(p.deltaMigrationEnd),
      fmt(p.finalValidationStart),
      fmt(p.finalValidationEnd),
      fmt(p.actualEnd),
      p.notes ?? '',
      p.cloudAddingNotes ?? '',
      p.pilotMigrationNotes ?? '',
      p.onetimeMigrationNotes ?? '',
      p.deltaMigrationNotes ?? '',
      p.finalValidationNotes ?? '',
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const segLabel = segmentTab === 'ALL' ? 'all' : segmentTab.toLowerCase();
    a.download = `projects-${segLabel}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearAllFilters = () => {
    setFilters({
      status: '',
      phase: '',
      delayStatus: '',
      planType: '',
      projectManager: '',
      accountManager: '',
      search: '',
    });
    setSearchInput('');
    setHideCompleted(false);
  };

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length + (hideCompleted ? 1 : 0);

  const statusOptions = [
    { value: '', label: 'All Statuses', color: 'gray' },
    { value: 'ACTIVE', label: 'Active', color: 'green' },
    { value: 'INACTIVE', label: 'Inactive', color: 'gray' },
    { value: 'ON_HOLD', label: 'On Hold', color: 'yellow' },
    { value: 'CANCELLED', label: 'Cancelled', color: 'red' },
  ];

  const phaseOptions = useMemo(() => [
    { value: '', label: 'All Phases', color: 'gray' },
    ...[...settings.phases]
      .sort((a, b) => a.order - b.order)
      .map(p => ({ value: (p.code || p.name).toUpperCase(), label: p.name, color: p.color || 'gray' })),
  ], [settings.phases]);

  const delayOptions = [
    { value: '', label: 'All Delay Status', color: 'gray' },
    { value: 'NOT_DELAYED', label: 'On Track', color: 'green' },
    { value: 'AT_RISK', label: 'At Risk', color: 'yellow' },
    { value: 'DELAYED', label: 'Delayed', color: 'red' },
    { value: 'EXTENDED', label: 'Extended', color: 'purple' },
  ];

  const planOptions = [
    { value: '', label: 'All Plans', color: 'gray' },
    { value: 'BRONZE', label: 'Bronze', color: 'amber' },
    { value: 'SILVER', label: 'Silver', color: 'slate' },
    { value: 'GOLD', label: 'Gold', color: 'yellow' },
    { value: 'PLATINUM', label: 'Platinum', color: 'indigo' },
  ];

  const projectManagerOptions = useMemo(() => {
    const managers = (usersData?.data || [])
      .filter((u: any) => u.role === 'PROJECT_MANAGER' && u.isActive !== false)
      .map((u: any) => u.name)
      .filter(Boolean)
      .sort() as string[];
    return [
      { value: '', label: 'All Project Managers', color: 'gray' },
      ...managers.map((n: string) => ({ value: n, label: n, color: 'indigo' })),
    ];
  }, [usersData?.data]);

  const accountManagerOptions = useMemo(() => {
    return [
      { value: '', label: 'All Account Managers', color: 'gray' },
      ...mergeAccountManagers(usersData?.data).map(n => ({ value: n, label: n, color: 'teal' })),
    ];
  }, [usersData?.data]);

  return (
    // h-full fills the <main> content area; flex-col stacks sections vertically.
    // The table section gets flex-1 so it takes whatever space remains after
    // the header and filters, keeping all scrollbars inside the viewport.
    <div className="flex flex-col h-full gap-3 animate-fadeIn overflow-hidden">
      {/* Page Header */}
      <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-500 mt-0.5 text-sm">
            {isManager ? `Your projects as ${user?.name}` : 'Manage and track all migration projects'}
            {data?.pagination?.total !== undefined && (
              <span className="ml-2 text-primary-600 font-medium">
                ({data.pagination.total} total)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            disabled={!segmentProjects.length}
            className="hidden sm:flex"
          >
            <Download size={16} className="mr-1" />
            Export CSV ({segmentProjects.length})
          </Button>
          {!isViewer && (
            <Link href="/projects/new">
              <Button>
                <Plus size={20} className="mr-2" />
                New Project
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Manager View Banner */}
      {isManager && (
        <div className="flex-shrink-0 flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
          <User size={14} className="flex-shrink-0" />
          <span>
            <strong>Manager View</strong> — Showing only projects where you ({user?.name}) are the Project Manager.
            Projects you create will automatically be assigned to you.
          </span>
        </div>
      )}

      {/* Filters Section */}
      <Card padding="sm" className="flex-shrink-0 bg-white border border-gray-200">
        {/* Filter Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-gray-700 hover:text-primary-600 transition-colors"
            >
              <SlidersHorizontal size={18} />
              <span className="font-medium">Filters</span>
              {activeFilterCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-semibold bg-primary-100 text-primary-700 rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
          
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 transition-colors"
            >
              <X size={14} />
              Clear all
            </button>
          )}
        </div>

        {/* Filter Controls */}
        {showFilters && (
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name, customer, PM, AM..."
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
              />
              {searchInput && (
                <button
                  onClick={() => {
                    setSearchInput('');
                    setFilters(prev => ({ ...prev, search: '' }));
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <MultiSelectDropdown
                label="Status"
                value={filters.status}
                options={statusOptions.filter(o => o.value)}
                placeholder="All Statuses"
                onChange={(value) => handleFilterChange('status', value)}
              />
              <MultiSelectDropdown
                label="Phase"
                value={filters.phase}
                options={phaseOptions.filter(o => o.value)}
                placeholder="All Phases"
                onChange={(value) => handleFilterChange('phase', value)}
              />
              <MultiSelectDropdown
                label="Delay Status"
                value={filters.delayStatus}
                options={delayOptions.filter(o => o.value)}
                placeholder="All Delay Status"
                onChange={(value) => handleFilterChange('delayStatus', value)}
              />
              <MultiSelectDropdown
                label="Plan Type"
                value={filters.planType}
                options={planOptions.filter(o => o.value)}
                placeholder="All Plans"
                onChange={(value) => handleFilterChange('planType', value)}
              />
              <MultiSelectDropdown
                label="Project Manager"
                value={filters.projectManager}
                options={projectManagerOptions.filter(o => o.value)}
                placeholder="All Project Managers"
                searchable
                onChange={(value) => handleFilterChange('projectManager', value)}
              />
              <MultiSelectDropdown
                label="Account Manager"
                value={filters.accountManager}
                options={accountManagerOptions.filter(o => o.value)}
                placeholder="All Account Managers"
                searchable
                onChange={(value) => handleFilterChange('accountManager', value)}
              />
            </div>

            {/* Active Filters Tags */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200">
                <span className="text-xs text-gray-500">Active filters:</span>
                {hideCompleted && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                    Excl. Completed &amp; Cancelled
                    <button onClick={() => setHideCompleted(false)} className="hover:text-blue-900">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.status && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                    Status: {filters.status.split(',').map(v => statusOptions.find(o => o.value === v)?.label || v).join(', ')}
                    <button onClick={() => handleFilterChange('status', '')} className="hover:text-green-900">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.phase && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                    Phase: {filters.phase.split(',').map(v => phaseOptions.find(o => o.value === v)?.label || v).join(', ')}
                    <button onClick={() => handleFilterChange('phase', '')} className="hover:text-blue-900">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.delayStatus && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
                    Delay: {filters.delayStatus.split(',').map(v => delayOptions.find(o => o.value === v)?.label || v).join(', ')}
                    <button onClick={() => handleFilterChange('delayStatus', '')} className="hover:text-orange-900">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.planType && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
                    Plan: {filters.planType.split(',').map(v => planOptions.find(o => o.value === v)?.label || v).join(', ')}
                    <button onClick={() => handleFilterChange('planType', '')} className="hover:text-purple-900">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.projectManager && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-full">
                    PM: {filters.projectManager.split(',').join(', ')}
                    <button onClick={() => handleFilterChange('projectManager', '')} className="hover:text-indigo-900">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.accountManager && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-teal-100 text-teal-700 rounded-full">
                    AM: {filters.accountManager.split(',').join(', ')}
                    <button onClick={() => handleFilterChange('accountManager', '')} className="hover:text-teal-900">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.search && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
                    Search: "{filters.search}"
                    <button onClick={() => { setSearchInput(''); handleFilterChange('search', ''); }} className="hover:text-gray-900">
                      <X size={12} />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Projects Table — flex-1 min-h-0 so this section fills exactly the remaining
          viewport height. The table's own overflow handles scrolling, keeping both
          the vertical and horizontal scroll bars always visible inside the viewport. */}
      {isLoading ? (
        <Card className="flex-1 min-h-0">
          <div className="flex flex-col items-center justify-center h-full">
            <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
            <p className="mt-4 text-gray-500">Loading projects...</p>
          </div>
        </Card>
      ) : error ? (
        <Card className="flex-1 min-h-0">
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <X size={32} className="text-red-600" />
            </div>
            <p className="text-red-600 font-medium">Failed to load projects</p>
            <p className="text-sm text-gray-500 mt-2">Please check if the backend server is running</p>
            <Button variant="outline" onClick={() => refetch()} className="mt-4">
              <RefreshCw size={16} className="mr-2" />
              Try Again
            </Button>
          </div>
        </Card>
      ) : data?.data?.length === 0 ? (
        <Card className="flex-1 min-h-0">
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <Filter size={32} className="text-gray-400" />
            </div>
            <p className="text-gray-600 font-medium">No projects found</p>
            <p className="text-sm text-gray-500 mt-2">
              {activeFilterCount > 0
                ? 'Try adjusting your filters or search criteria'
                : 'Get started by creating your first project'
              }
            </p>
            {activeFilterCount > 0 ? (
              <Button variant="outline" onClick={clearAllFilters} className="mt-4">
                Clear Filters
              </Button>
            ) : (
              <Link href="/projects/new">
                <Button className="mt-4">
                  <Plus size={16} className="mr-2" />
                  Create Project
                </Button>
              </Link>
            )}
          </div>
        </Card>
      ) : (() => {
        return (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {/* Segment tabs — All / ENT / SMB */}
            <div className="flex-shrink-0 flex items-end border-b border-gray-200 bg-gray-50 px-4 pt-3">
              {([
                { key: 'ALL' as const, label: 'All', count: displayProjects.length },
                { key: 'ENT' as const, label: 'Enterprise', count: entCount },
                { key: 'SMB' as const, label: 'SMB', count: smbCount },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setSegmentTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    segmentTab === tab.key
                      ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    segmentTab === tab.key ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
              {unsegmentedCount > 0 && (
                <span className="text-xs text-amber-600 ml-2 mb-2 self-end">
                  {unsegmentedCount} not mapped to ENT/SMB
                </span>
              )}
            </div>

            {/* Table content */}
            <div className="flex-1 min-h-0 overflow-auto flex flex-col">
              {segmentProjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-16">
                  <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                    <Filter size={32} className="text-gray-400" />
                  </div>
                  <p className="text-gray-600 font-medium">
                    {segmentTab === 'ALL' ? 'No projects found' : `No ${segmentTab} projects found`}
                  </p>
                </div>
              ) : segmentTab === 'ALL' && clientGroups.grouped.size > 0 ? (
                <>
                  {/* ── Client / Account grouped table ── */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-blue-50/60 text-left sticky top-0 z-10">
                          <th className="py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap sticky left-0 z-20 bg-blue-50/60 border-r border-gray-200 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">Client / Account</th>
                          <th className="py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">Project Manager</th>
                          <th className="py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">Account Manager</th>
                          <th className="py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">Migration Scope</th>
                          <th className="py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">Budget</th>
                          <th className="py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">Plan</th>
                          <th className="py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">Status</th>
                          <th className="py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">SOW Start</th>
                          <th className="py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">SOW End</th>
                          <th className="py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">Duration (months)</th>
                          <th className="py-3 px-4" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {Array.from(clientGroups.grouped.entries()).map(([cName, projs]) => {
                          // Aggregations across all client projects
                          const pms = [...new Set(projs.map((p: any) => p.projectManager).filter(Boolean))].join(', ');
                          const ams = [...new Set(projs.map((p: any) => p.accountManager).filter(Boolean))].join(', ');

                          // Budget — sum of estimatedCost
                          const totalBudget = projs.reduce((sum: number, p: any) =>
                            sum + (p.estimatedCost != null ? Number(p.estimatedCost) : 0), 0);

                          // Plans — distinct
                          const plans = [...new Set(projs.map((p: any) => p.planType).filter(Boolean))] as string[];

                          // Status summary
                          const activeCount    = projs.filter((p: any) => p.status === 'ACTIVE').length;
                          const completedCount = projs.filter((p: any) => p.status === 'COMPLETED').length;
                          const onHoldCount    = projs.filter((p: any) => p.status === 'ON_HOLD').length;

                          // SOW dates — earliest start, latest end
                          const starts = projs.map((p: any) => p.plannedStart).filter(Boolean).map((d: string) => new Date(d).getTime());
                          const ends   = projs.map((p: any) => p.plannedEnd).filter(Boolean).map((d: string) => new Date(d).getTime());
                          const sowStart = starts.length ? new Date(Math.min(...starts)) : null;
                          const sowEnd   = ends.length   ? new Date(Math.max(...ends))   : null;

                          // Duration in months between earliest start and latest end
                          let durationMonths = '—';
                          if (sowStart && sowEnd) {
                            const months = (sowEnd.getFullYear() - sowStart.getFullYear()) * 12
                              + (sowEnd.getMonth() - sowStart.getMonth());
                            durationMonths = String(Math.max(months, 0));
                          }

                          const fmtDate = (d: Date | null) => d
                            ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—';

                          return (
                            <tr
                              key={cName}
                              onClick={() => router.push(`/clients/${encodeURIComponent(cName)}`)}
                              className="hover:bg-indigo-50/40 cursor-pointer transition-colors group"
                            >
                              {/* Client / Account — sticky */}
                              <td className="py-3.5 px-4 sticky left-0 z-10 bg-white group-hover:bg-indigo-50/40 transition-colors border-r border-gray-200 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.04)]">
                                <div className="font-semibold text-indigo-700 group-hover:text-indigo-900">{cName}</div>
                                <div className="text-xs text-gray-400 mt-0.5">{projs.length} project{projs.length !== 1 ? 's' : ''}</div>
                              </td>

                              {/* Project Manager */}
                              <td className="py-3.5 px-4 text-xs text-gray-700 whitespace-nowrap">{pms || '—'}</td>

                              {/* Account Manager */}
                              <td className="py-3.5 px-4 text-xs text-gray-700 whitespace-nowrap">{ams || '—'}</td>

                              {/* Migration Scope */}
                              <td className="py-3.5 px-4">
                                <div className="flex flex-wrap gap-1 min-w-[100px]">
                                  {(() => {
                                    const allMigTypes = projs.map((p: any) => p.migrationTypes).join(',');
                                    const scopes = getMigrationScopes(allMigTypes);
                                    return scopes.length > 0
                                      ? scopes.map((s) => (
                                          <span key={s} className={`text-xs px-2 py-0.5 rounded-full font-medium ${SCOPE_STYLE[s] || 'bg-gray-100 text-gray-600'}`}>{s}</span>
                                        ))
                                      : <span className="text-xs text-gray-400">—</span>;
                                  })()}
                                </div>
                              </td>

                              {/* Budget */}
                              <td className="py-3.5 px-4 text-xs font-medium text-gray-800 whitespace-nowrap">
                                {totalBudget > 0 ? formatCurrency(totalBudget) : '—'}
                              </td>

                              {/* Plan */}
                              <td className="py-3.5 px-4">
                                <div className="flex flex-wrap gap-1">
                                  {plans.length > 0
                                    ? plans.map(pl => (
                                        <span key={pl} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium capitalize">
                                          {pl.replace('_', ' ').toLowerCase()}
                                        </span>
                                      ))
                                    : <span className="text-xs text-gray-400">—</span>
                                  }
                                </div>
                              </td>

                              {/* Status */}
                              <td className="py-3.5 px-4">
                                <div className="flex flex-wrap gap-1">
                                  {activeCount > 0    && <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">Active {activeCount}</span>}
                                  {completedCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">Done {completedCount}</span>}
                                  {onHoldCount > 0    && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 font-medium">On Hold {onHoldCount}</span>}
                                </div>
                              </td>

                              {/* SOW Start */}
                              <td className="py-3.5 px-4 text-xs text-gray-700 whitespace-nowrap">{fmtDate(sowStart)}</td>

                              {/* SOW End */}
                              <td className="py-3.5 px-4 text-xs text-gray-700 whitespace-nowrap">{fmtDate(sowEnd)}</td>

                              {/* Duration */}
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                {durationMonths !== '—'
                                  ? <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{durationMonths} mo</span>
                                  : <span className="text-xs text-gray-400">—</span>
                                }
                              </td>

                              <td className="py-3.5 px-4 text-gray-300 group-hover:text-indigo-500 font-bold text-lg transition-colors">›</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </>
              ) : (
                <ProjectsTable projects={segmentProjects} onDelete={handleDelete} />
              )}
            </div>
          </div>
        );
      })()}

      {showMultiModal && <MultiScopeProjectModal onClose={() => setShowMultiModal(false)} />}
    </div>
  );
}
