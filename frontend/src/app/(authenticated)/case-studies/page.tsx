'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MultiSelectDropdown } from '@/components/ui/MultiSelectDropdown';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useAllUsers } from '@/hooks/useProjects';
import { mergeAccountManagers } from '@/lib/accountManagers';
import {
  FileText,
  Plus,
  Loader2,
  Search,
  Eye,
  Edit,
  CheckCircle,
  Clock,
  AlertCircle,
  Download,
} from 'lucide-react';

interface CaseStudy {
  id: string;
  projectId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'PUBLISHED';
  title: string | null;
  content: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  project?: {
    id: string;
    name: string;
    customerName: string;
    projectManager: string;
    accountManager?: string;
    planType?: string;
    migrationTypes?: string | null;
    plannedStart?: string | null;
    plannedEnd?: string | null;
    actualStart?: string | null;
    actualEnd?: string | null;
    expectedEnd?: string | null;
    estimatedCost?: number | null;
    actualCost?: number | null;
    isOveraged?: boolean;
    overageAmount?: number | null;
    extendedEndDate?: string | null;
    delayStatus?: string;
    delayDays?: number;
    cloudAddingStart?: string | null;
    cloudAddingEnd?: string | null;
    pilotMigrationStart?: string | null;
    pilotMigrationEnd?: string | null;
    onetimeMigrationStart?: string | null;
    onetimeMigrationEnd?: string | null;
    deltaMigrationStart?: string | null;
    deltaMigrationEnd?: string | null;
    finalValidationStart?: string | null;
    finalValidationEnd?: string | null;
    phase?: string;
    status?: string;
  };
}

// A completed project with no case study yet (GET /api/case-studies/awaiting; archived included).
interface AwaitingProject {
  id: string;
  name: string;
  customerName: string | null;
  clientName: string | null;
  projectManager: string | null;
  accountManager: string | null;
  actualEnd: string | null;
  archivedAt: string | null;
}

type ListItem = { kind: 'awaiting'; p: AwaitingProject } | { kind: 'case'; cs: CaseStudy };

type Category = 'all' | 'not_started' | 'pending' | 'in_progress' | 'completed';

const CATEGORIES: { id: Category; label: string; icon: typeof FileText; bg: string; color: string }[] = [
  { id: 'all', label: 'All', icon: FileText, bg: 'bg-gray-100', color: 'text-gray-600' },
  { id: 'not_started', label: 'Not started', icon: AlertCircle, bg: 'bg-orange-100', color: 'text-orange-600' },
  { id: 'pending', label: 'Pending', icon: Clock, bg: 'bg-yellow-100', color: 'text-yellow-600' },
  { id: 'in_progress', label: 'In Progress', icon: Edit, bg: 'bg-blue-100', color: 'text-blue-600' },
  { id: 'completed', label: 'Completed', icon: CheckCircle, bg: 'bg-green-100', color: 'text-green-600' },
];

const LIST_PAGE = 25;
const CS_STATUS_ORDER: CaseStudy['status'][] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'PUBLISHED'];

const fmtDay = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const statusConfig = {
  PENDING: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-50', label: 'Pending' },
  IN_PROGRESS: { icon: Edit, color: 'text-blue-500', bg: 'bg-blue-50', label: 'In Progress' },
  COMPLETED: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', label: 'Completed' },
  PUBLISHED: { icon: Eye, color: 'text-purple-500', bg: 'bg-purple-50', label: 'Published' },
};

function CaseStudiesContent() {
  const { user } = useAuth();
  const isManager = user?.role === 'PROJECT_MANAGER';
  const isViewer = user?.role === 'VIEWER';
  const searchParams = useSearchParams();
  const highlightProjectId = searchParams.get('projectId');
  const highlightRef = useRef<HTMLDivElement>(null);
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>([]);
  const [completedProjects, setCompletedProjects] = useState<AwaitingProject[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Category>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [pmFilter, setPmFilter] = useState('');
  const [amFilter, setAmFilter] = useState('');
  const { data: allUsersData } = useAllUsers();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      setIsLoading(true);

      // Fetch case studies
      const csResponse = await fetch(`${API_URL}/api/case-studies`, { headers });
      const csData = await csResponse.json();
      if (csData.success) {
        const all: CaseStudy[] = csData.data || [];
        setCaseStudies(all);
      }

      // Fetch phase=COMPLETED projects that don't have a case study yet
      const awaitingParams = new URLSearchParams();
      const awaitingResponse = await fetch(`${API_URL}/api/case-studies/awaiting?${awaitingParams}`, { headers });
      const awaitingData = await awaitingResponse.json();
      if (awaitingData.success) {
        setCompletedProjects(awaitingData.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const exportCSV = () => {
    const fmt = (d: string | null | undefined) =>
      d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '';

    const MS_PER_DAY = 1000 * 60 * 60 * 24;

    const getDurationMonths = (p: CaseStudy['project']): string => {
      if (!p?.plannedStart || !p?.plannedEnd) return '';
      const days = (new Date(p.plannedEnd).getTime() - new Date(p.plannedStart).getTime()) / MS_PER_DAY;
      return (days / 30.44).toFixed(1);
    };

    const toDay = (d: Date | string): Date => {
      const dt = typeof d === 'string' ? new Date(d) : d;
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    };

    const getSowDateEnded = (p: CaseStudy['project']): string => {
      const effectiveEnd = (p?.isOveraged && p?.extendedEndDate) ? p.extendedEndDate : p?.plannedEnd;
      if (!effectiveEnd) return '';
      return toDay(effectiveEnd) < toDay(new Date()) ? 'Yes' : 'No';
    };

    const headers = [
      // Case study columns
      'Case Study Title', 'Case Study Status', 'Published At', 'Created At',
      // Project identification
      'Project Name', 'Customer Name', 'Project Manager', 'Account Manager',
      // Project classification
      'Migration Types', 'Plan Type', 'Project Phase', 'Project Status',
      // Duration & delay
      'Duration ', 'Expected Project End', 'Extended End Date (Overage)',
      'Delay Status', 'Delay Days', 'SOW Date Ended',
      // Budget
      'Estimated Budget', 'Actual Cost', 'Is Overaged', 'Overage Amount',
      // Dates
      'SOW Start', 'SOW End', 'Kickoff Start',
      'Cloud Adding Start', 'Cloud Adding End',
      'Pilot Migration Start', 'Pilot Migration End',
      'Onetime Migration Start', 'Onetime Migration End',
      'Delta Migration Start', 'Delta Migration End',
      'Final Validation Start', 'Final Validation End',
      'Project End',
    ];

    const rows = filteredCaseStudies.map((cs) => {
      const p = cs.project;
      return [
        cs.title || p?.name || 'Untitled',
        cs.status,
        fmt(cs.publishedAt),
        fmt(cs.createdAt),
        p?.name ?? '',
        p?.customerName ?? '',
        p?.projectManager ?? '',
        p?.accountManager ?? '',
        p?.migrationTypes ?? '',
        p?.planType ?? '',
        p?.phase ?? '',
        p?.status ?? '',
        getDurationMonths(p),
        fmt(p?.expectedEnd ?? p?.plannedEnd),
        p?.isOveraged && p?.extendedEndDate ? fmt(p.extendedEndDate) : '',
        p?.delayStatus ?? '',
        p?.delayDays != null ? String(p.delayDays) : '0',
        getSowDateEnded(p),
        p?.estimatedCost != null ? String(p.estimatedCost) : '',
        p?.actualCost != null ? String(p.actualCost) : '',
        p?.isOveraged ? 'Yes' : 'No',
        p?.overageAmount != null ? String(p.overageAmount) : '',
        fmt(p?.plannedStart),
        fmt(p?.plannedEnd),
        fmt(p?.actualStart),
        fmt(p?.cloudAddingStart),
        fmt(p?.cloudAddingEnd),
        fmt(p?.pilotMigrationStart),
        fmt(p?.pilotMigrationEnd),
        fmt(p?.onetimeMigrationStart),
        fmt(p?.onetimeMigrationEnd),
        fmt(p?.deltaMigrationStart),
        fmt(p?.deltaMigrationEnd),
        fmt(p?.finalValidationStart),
        fmt(p?.finalValidationEnd),
        fmt(p?.actualEnd),
      ];
    });

    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `case-studies-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Options for the PM/AM filter dropdowns — deduped from whatever's actually
  // present on the loaded case studies, not a separate lookup fetch.
  const pmOptions = Array.from(new Set(
    [...caseStudies.map((cs) => cs.project?.projectManager), ...completedProjects.map((p) => p.projectManager)].filter(Boolean)
  )).sort() as string[];
  const amOptions = mergeAccountManagers(allUsersData?.data);

  const pmList = pmFilter.split(',').filter(Boolean);
  const amList = amFilter.split(',').filter(Boolean);
  const includes = (value: string | null | undefined, term: string) => (value ?? '').toLowerCase().includes(term.toLowerCase());

  // A project manager sees only their own projects, in the stats as well as the lists.
  const scopedCaseStudies = isManager ? caseStudies.filter((cs) => cs.project?.projectManager === user?.name) : caseStudies;
  const scopedAwaiting = isManager ? completedProjects.filter((p) => p.projectManager === user?.name) : completedProjects;

  const ownerMatches = (pm: string | null | undefined, am: string | null | undefined) =>
    (pmList.length === 0 || pmList.includes(pm ?? '')) && (amList.length === 0 || amList.includes(am ?? ''));

  // Completed projects with no case study yet are part of the list: they show as "Not started"
  // under All and Pending, each with a Create button.
  const awaitingMatches = scopedAwaiting.filter((p) => ownerMatches(p.projectManager, p.accountManager)
    && (!searchTerm || [p.name, p.clientName, p.customerName, p.projectManager, p.accountManager].some((v) => includes(v, searchTerm))));
  const caseMatches = scopedCaseStudies.filter((cs) => ownerMatches(cs.project?.projectManager, cs.project?.accountManager)
    && (!searchTerm || [cs.title, cs.project?.name, cs.project?.customerName, cs.project?.projectManager, cs.project?.accountManager].some((v) => includes(v, searchTerm))));
  // One set of categories drives both the counts on the cards and the list below, so the
  // numbers always agree (All = Not started + Pending + In Progress + Completed).
  const inCategory = (cs: CaseStudy, cat: Category): boolean =>
    cat === 'all' ? true
      : cat === 'pending' ? cs.status === 'PENDING'
      : cat === 'in_progress' ? cs.status === 'IN_PROGRESS'
      : cat === 'completed' ? cs.status === 'COMPLETED' || cs.status === 'PUBLISHED'
      : false;
  const counts: Record<Category, number> = {
    all: awaitingMatches.length + caseMatches.length,
    not_started: awaitingMatches.length,
    pending: caseMatches.filter((cs) => inCategory(cs, 'pending')).length,
    in_progress: caseMatches.filter((cs) => inCategory(cs, 'in_progress')).length,
    completed: caseMatches.filter((cs) => inCategory(cs, 'completed')).length,
  };

  // Case studies in the selected category (also what Export downloads), work still to do first.
  const filteredCaseStudies = caseMatches
    .filter((cs) => inCategory(cs, activeTab))
    .sort((a, b) => CS_STATUS_ORDER.indexOf(a.status) - CS_STATUS_ORDER.indexOf(b.status));

  const listItems: ListItem[] = [
    ...(activeTab === 'all' || activeTab === 'not_started' ? awaitingMatches.map((p) => ({ kind: 'awaiting' as const, p })) : []),
    ...filteredCaseStudies.map((cs) => ({ kind: 'case' as const, cs })),
  ];
  // The project the case study prompt or a link pointed at must be visible, even past the first page.
  const highlightIndex = listItems.findIndex((i) => i.kind === 'awaiting' && i.p.id === highlightProjectId);
  const shownItems = showAll || highlightIndex >= LIST_PAGE ? listItems : listItems.slice(0, LIST_PAGE);

  useEffect(() => {
    if (highlightProjectId && !isLoading && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightProjectId, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Case Studies</h1>
          <p className="text-gray-500">Document and showcase successful project migrations</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            <Download size={14} />
            Export
          </button>
          {!isViewer && (
            <Link
              href="/case-studies/new"
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
            >
              <Plus size={14} />
              Add Case Study
            </Link>
          )}
        </div>
      </div>

      {/* Manager scope banner */}
      {isManager && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span><strong>Manager View</strong> — Showing case studies for your projects (<strong>{user?.name}</strong>).</span>
        </div>
      )}

      {/* Category cards — the counts and the filter for the list below (click to filter) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const active = activeTab === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => { setActiveTab(c.id); setShowAll(false); }}
              aria-pressed={active}
              className={`text-left rounded-xl border bg-white p-4 transition-all ${active ? 'border-primary-400 ring-2 ring-primary-200 shadow-sm' : 'border-gray-200 hover:border-primary-200 hover:shadow-sm'}`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${c.bg}`}>
                  <Icon className={c.color} size={20} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{counts[c.id]}</p>
                  <p className="text-sm text-gray-500">{c.label}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="-mt-3 text-xs text-gray-500">
        All = Not started + Pending + In Progress + Completed. Not started = completed projects with no case study yet; owners get a reminder email every Monday.
        Counts follow the filters and search below.
      </p>

      {/* PM / AM filters — apply to both the projects needing case studies and the case study list */}
      {!isManager && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <MultiSelectDropdown
            label="Project Manager"
            value={pmFilter}
            options={pmOptions.map((pm) => ({ value: pm, label: pm }))}
            placeholder="All Project Managers"
            searchable
            onChange={setPmFilter}
          />
          <MultiSelectDropdown
            label="Account Manager"
            value={amFilter}
            options={amOptions.map((am) => ({ value: am, label: am }))}
            placeholder="All Account Managers"
            searchable
            onChange={setAmFilter}
          />
        </div>
      )}

      {/* Selected category and Search */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">
          {CATEGORIES.find((c) => c.id === activeTab)?.label} <span className="text-sm font-normal text-gray-500">({counts[activeTab]})</span>
        </h3>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search project, account, PM or AM..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setShowAll(false); }}
            className="pl-10 pr-4 py-2 w-80 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>
      {/* Case Studies List — Not started projects first, then case studies by status */}
      <Card>
        {listItems.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="mx-auto text-gray-300" size={48} />
            <p className="text-gray-500 mt-4">No case studies found</p>
            <p className="text-sm text-gray-400">
              {caseStudies.length === 0 && completedProjects.length === 0
                ? 'Complete a project to create your first case study'
                : 'Try adjusting your search or filters'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {shownItems.map((item) => {
              if (item.kind === 'awaiting') {
                const p = item.p;
                const highlighted = p.id === highlightProjectId;
                const completedOn = fmtDay(p.actualEnd ?? p.archivedAt);
                return (
                  <div
                    key={`awaiting-${p.id}`}
                    ref={highlighted ? highlightRef : undefined}
                    className={`p-4 transition-colors ${highlighted ? 'bg-yellow-50 ring-2 ring-inset ring-yellow-400' : 'hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="p-2 rounded-lg bg-orange-50">
                          <AlertCircle className="text-orange-500" size={20} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-medium text-gray-900 truncate">
                            <Link href={`/projects/${p.id}`} className="hover:underline">{p.name}</Link>
                          </h4>
                          <p className="text-sm text-gray-500">
                            {p.clientName || p.name} · {p.projectManager || 'No PM'}
                            {p.accountManager ? ` · AM ${p.accountManager}` : ''}
                            {completedOn ? ` · Completed ${completedOn}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs px-2 py-1 rounded-full bg-orange-50 text-orange-600">Not started</span>
                        {!isViewer && (
                          <Link href={`/case-studies/new?projectId=${p.id}`}>
                            <Button size="sm">
                              <Plus size={14} className="mr-1" />
                              Create
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              const cs = item.cs;
              const config = statusConfig[cs.status] ?? statusConfig.PENDING;
              const StatusIcon = config.icon;

              return (
                <div
                  key={cs.id}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${config.bg}`}>
                        <StatusIcon className={config.color} size={20} />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {cs.title || cs.project?.name || 'Untitled Case Study'}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {[cs.project?.customerName, cs.project?.projectManager].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${config.bg} ${config.color}`}>
                        {config.label}
                      </span>
                      <Link href={`/case-studies/${cs.id}`}>
                        <Button variant="outline" size="sm">
                          {cs.status === 'PENDING' || cs.status === 'IN_PROGRESS' ? 'Edit' : 'View'}
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {listItems.length > shownItems.length && (
          <button onClick={() => setShowAll(true)} className="mt-3 w-full py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 rounded-lg">
            Showing {shownItems.length} of {listItems.length}. Show all
          </button>
        )}
        {showAll && listItems.length > LIST_PAGE && (
          <button onClick={() => setShowAll(false)} className="mt-3 w-full py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
            Show fewer
          </button>
        )}
      </Card>
    </div>
  );
}

export default function CaseStudiesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    }>
      <CaseStudiesContent />
    </Suspense>
  );
}
