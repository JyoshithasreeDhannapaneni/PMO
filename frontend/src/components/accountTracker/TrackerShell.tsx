'use client';

import { createContext, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle, BarChart3, Briefcase, Building2, ChevronDown, Database, Link2, Loader2, RefreshCw, Sparkles, Target, Trophy, Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useInvalidateTracker, useTrackerMe, useTrackerStatus, useTrackerSync } from '@/hooks/useProjects';
import { cn } from '@/lib/utils';
import { TRACKER_BASE, errorInfo, relativeTime } from '@/lib/accountTracker';
import type { TrackerAiStatus, TrackerMe, TrackerStatus } from '@/types/accountTracker';
import { EmptyState, ErrorNote, Spinner, btn } from './ui';
import { SyncProgress } from './SyncProgress';
import { ViewSwitcher } from './ViewSwitcher';

// Customer Success → Account Tracker: module frame (header, "whose book", sync, section menu) and shared state.

export interface TrackerWorkspace {
  me: TrackerMe;
  admin: boolean;
  /** AI coverage of the book being viewed (undefined until the status has loaded). */
  ai: TrackerAiStatus | undefined;
  /** Owner id sent to the API (null = your own book). */
  owner: string | null;
  changeView: (id: string) => void;
  status: TrackerStatus | undefined;
  sync: () => void;
  running: boolean;
}

export const TrackerContext = createContext<TrackerWorkspace | null>(null);

interface SectionDef { href: string; label: string; icon: LucideIcon; adminOnly?: boolean; match: (p: string) => boolean }

const SECTIONS: SectionDef[] = [
  { href: TRACKER_BASE, label: 'Companies', icon: Building2, match: (p) => p === TRACKER_BASE || p.startsWith(`${TRACKER_BASE}/companies`) },
  { href: `${TRACKER_BASE}/deals`, label: 'Deals', icon: Briefcase, match: (p) => p.startsWith(`${TRACKER_BASE}/deals`) },
  { href: `${TRACKER_BASE}/contacts`, label: 'Contacts', icon: Users, match: (p) => p.startsWith(`${TRACKER_BASE}/contacts`) },
  { href: `${TRACKER_BASE}/priority`, label: 'Priority outreach', icon: Target, match: (p) => p.startsWith(`${TRACKER_BASE}/priority`) },
  { href: `${TRACKER_BASE}/top-20`, label: 'Top 20', icon: Trophy, match: (p) => p.startsWith(`${TRACKER_BASE}/top-20`) },
  { href: `${TRACKER_BASE}/insights`, label: 'Data & methodology', icon: BarChart3, match: (p) => p.startsWith(`${TRACKER_BASE}/insights`) },
  { href: `${TRACKER_BASE}/links`, label: 'HubSpot links', icon: Link2, adminOnly: true, match: (p) => p.startsWith(`${TRACKER_BASE}/links`) },
];

const VIEW_KEY = 'csTracker.adminView';

const NO_AI: TrackerAiStatus = { configured: false, pausedReason: null, running: false, total: 0, done: 0, analysed: 0 };

/** Header chip: what the AI is doing for this book right now. */
function AiChip({ ai, companies }: { ai: TrackerAiStatus | undefined; companies: number }) {
  if (!ai) return null;
  if (!ai.configured) return null;
  if (ai.pausedReason) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700" title={ai.pausedReason}>
        <AlertTriangle className="h-3.5 w-3.5" /> AI paused
      </span>
    );
  }
  if (ai.running) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        AI analysing{ai.total ? ` ${Math.min(ai.done + 1, ai.total)} of ${ai.total}` : '…'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700"
      title="Companies with an AI analysis">
      <Sparkles className="h-3.5 w-3.5" /> AI {ai.analysed.toLocaleString()} of {companies.toLocaleString()}
    </span>
  );
}

function savedView(): string | null {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v && /^\d+$/.test(v) ? v : null; // HubSpot owner ids only
  } catch {
    return null;
  }
}

/** Dropdown that moves between the module's pages. */
function SectionMenu({ admin }: { admin: boolean }) {
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const sections = SECTIONS.filter((s) => admin || !s.adminOnly);
  const current = sections.find((s) => s.match(pathname)) ?? sections[0];

  useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  const Icon = current.icon;
  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-blue-50">
        <Icon className="h-4 w-4 text-blue-600" />
        {current.label}
        <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-2 w-60 rounded-xl border border-gray-100 bg-white p-1.5 shadow-xl" role="menu">
          {sections.map((s) => {
            const I = s.icon;
            const on = s === current;
            return (
              <Link key={s.href} href={s.href} role="menuitem"
                className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                  on ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700')}>
                <I className={cn('h-4 w-4', on ? 'text-blue-600' : 'text-gray-400')} />
                {s.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** What a data page shows before there is data to show. */
function Gate({ ws, statusError, statusLoading, syncError, children }: {
  ws: TrackerWorkspace; statusError: unknown; statusLoading: boolean; syncError: unknown; children: ReactNode;
}) {
  const s = ws.status;
  const err = errorInfo(statusError);
  if (statusLoading && !s) return <Spinner />;
  if (err?.status === 403) {
    return ws.admin ? (
      <div className="mx-auto max-w-xl rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Users className="h-5 w-5" /></span>
          <h2 className="text-lg font-semibold text-slate-800">Whose accounts do you want to see?</h2>
        </div>
        <ViewSwitcher large view={ws.owner} onChange={ws.changeView} />
      </div>
    ) : (
      <EmptyState icon={<Users className="h-10 w-10" />} title="Your account isn't linked to HubSpot yet"
        text={`We couldn't find a HubSpot user with the email ${ws.me.email}. Ask an admin to link your account.`} />
    );
  }
  if (statusError) return <ErrorNote error={statusError} />;
  if (!s) return <Spinner />;
  if (s.loaded) return <>{children}</>;

  if (!s.hubspotConfigured) {
    return (
      <EmptyState icon={<Database className="h-10 w-10" />} title="HubSpot isn't connected"
        text={ws.admin ? 'Add HUBSPOT_ACCESS_TOKEN to backend/.env and restart the backend.' : 'Ask an admin to connect HubSpot.'} />
    );
  }
  const canSync = ws.me.role !== 'VIEWER';
  if (s.lastSyncedAt && !s.lastError && !ws.running) {
    return (
      <EmptyState icon={<Building2 className="h-10 w-10" />} title={`${s.ownerName ?? 'This person'} has no companies in HubSpot`}>
        {canSync && <button type="button" className={btn.secondary} onClick={ws.sync}><RefreshCw className="h-4 w-4" /> Check again</button>}
      </EmptyState>
    );
  }
  return (
    <EmptyState icon={<RefreshCw className={cn('h-10 w-10', ws.running && 'animate-spin text-blue-400')} />}
      title={ws.running ? 'Loading accounts' : s.ownerName ? `Load ${s.ownerName}'s accounts` : 'Load your accounts'}
      text={ws.running ? undefined : 'Companies, contacts, activity and deals are read from HubSpot once, then kept up to date with Sync.'}>
      {ws.running ? <SyncProgress progress={s.progress} /> : canSync ? (
        <button type="button" className={btn.primary} onClick={ws.sync}><RefreshCw className="h-4 w-4" /> Load accounts</button>
      ) : <p className="text-sm text-gray-500">Viewer accounts can&apos;t load data — ask an admin.</p>}
      <div className="w-full max-w-lg">
        <ErrorNote error={syncError ?? (s.lastError ? { response: { data: { error: { message: 'Last sync failed', detail: s.lastError } } } } : null)} />
      </div>
    </EmptyState>
  );
}

export function TrackerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const meQuery = useTrackerMe();
  const me = meQuery.data;
  const admin = !!me?.admin;
  const [view, setView] = useState<string | null>(null);
  const [viewReady, setViewReady] = useState(false);

  useEffect(() => {
    if (!me) return;
    setView(me.admin ? savedView() ?? me.hubspotOwnerId ?? null : null);
    setViewReady(true);
  }, [me]);

  const owner = admin ? view : null;
  const [kicked, setKicked] = useState(false);
  const statusQuery = useTrackerStatus(owner, !!me && viewReady, kicked);
  const status = statusQuery.data;
  const syncMutation = useTrackerSync();
  const invalidate = useInvalidateTracker();
  const running = kicked || syncMutation.isPending || !!status?.syncing;

  // when a sync finishes, every page of this book reloads
  const wasSyncing = useRef(false);
  useEffect(() => {
    if (status?.syncing) {
      wasSyncing.current = true;
      setKicked(false);
    } else if (wasSyncing.current && status) {
      wasSyncing.current = false;
      invalidate(owner);
    }
  }, [status, owner, invalidate]);

  // while the AI works through the book, pages pick up each new result as it is stored
  const aiDone = status?.ai?.analysed ?? 0;
  const lastAiDone = useRef(aiDone);
  useEffect(() => {
    if (aiDone !== lastAiDone.current) {
      lastAiDone.current = aiDone;
      invalidate(owner);
    }
  }, [aiDone, owner, invalidate]);

  const changeView = useCallback((id: string) => {
    try {
      localStorage.setItem(VIEW_KEY, id);
    } catch {
      // per-browser convenience only
    }
    syncMutation.reset();
    setView(id);
  }, [syncMutation]);

  const sync = useCallback(() => {
    setKicked(true);
    syncMutation.mutate(owner, {
      onSuccess: (s) => { if (!s.syncing) setKicked(false); },
      onError: () => setKicked(false),
    });
  }, [owner, syncMutation]);

  const ws = useMemo<TrackerWorkspace | null>(() => (me ? {
    me, admin, ai: status?.ai ?? (me.aiConfigured ? undefined : NO_AI), owner, changeView, status, sync, running,
  } : null), [me, admin, owner, changeView, status, sync, running]);

  // admin pages, and company pages opened by an admin from a link, don't depend on the selected person
  const free = pathname.startsWith(`${TRACKER_BASE}/links`) || (admin && /\/companies\/\d+/.test(pathname));

  if (meQuery.isLoading) return <Spinner />;
  if (meQuery.error || !ws) return <ErrorNote error={meQuery.error ?? new Error('Not signed in')} />;

  const canSync = me!.role !== 'VIEWER';

  return (
    <TrackerContext.Provider value={ws}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Building2 className="h-7 w-7 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Account Tracker</h1>
              <p className="text-sm text-gray-500">
                Customer Success · HubSpot companies, deals and outreach
                {status?.loaded && <span className="ml-2 font-medium text-blue-600">· {status.counts.companies.toLocaleString()} companies</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-col items-end">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{admin ? 'Viewing' : 'Your accounts'}</span>
              {admin
                ? <ViewSwitcher view={owner ?? status?.view ?? null} viewName={status?.ownerName} onChange={changeView} />
                : <span className="text-sm font-medium text-gray-800">{status?.ownerName ?? me!.hubspotOwnerName ?? me!.name ?? me!.email}</span>}
            </div>
            {status?.loaded && (
              <div className="flex items-center gap-2 self-end">
                <AiChip ai={status.ai} companies={status.counts.companies} />
                <span className="text-xs text-gray-400" title={status.lastSyncSummary ?? ''}>Synced {relativeTime(status.lastSyncedAt)}</span>
                {canSync && (
                  <button type="button" className={btn.primary} onClick={sync} disabled={running}>
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {running ? 'Syncing…' : 'Sync'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <SectionMenu admin={admin} />

        {running && status?.loaded && <SyncProgress compact progress={status.progress} />}
        {status?.loaded && <ErrorNote error={syncMutation.error ?? (!running && status.lastError ? { response: { data: { error: { message: 'Last sync failed', detail: status.lastError } } } } : null)} />}

        {free ? children : (
          <Gate ws={ws} statusError={statusQuery.error} statusLoading={statusQuery.isLoading || !viewReady} syncError={syncMutation.error}>
            {children}
          </Gate>
        )}
      </div>
    </TrackerContext.Provider>
  );
}
