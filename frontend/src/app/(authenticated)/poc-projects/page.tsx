'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import {
  usePocProjects, useCreatePocProject, useUpdatePocProject, useDeletePocProject, useAllUsers,
} from '@/hooks/useProjects';
import type { Project, PocPhaseStatus } from '@/types';
import {
  FlaskConical, Plus, ChevronDown, Loader2, Clock, CheckCircle2, XCircle, Circle,
  CalendarDays, User, X, Save, Search, AlertTriangle, Flag, Trash2, Archive,
  Pencil, Check, FileText, Upload, Download, StickyNote, FolderOpen,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
type PhaseKey = 'pocQualificationStatus' | 'pocEnvSetupStatus' | 'pocTrialStatus' | 'pocValidationStatus' | 'pocOutcomeStatus';

const POC_PHASES: { num: number; label: string; shortLabel: string; statusKey: PhaseKey; checklistKey: string; checklistCount: number }[] = [
  { num: 1, label: 'Qualification & Scoping', shortLabel: 'Qualification', statusKey: 'pocQualificationStatus', checklistKey: 'pocPhase1Checklist', checklistCount: 4 },
  { num: 2, label: 'Environment Setup',       shortLabel: 'Env Setup',     statusKey: 'pocEnvSetupStatus',      checklistKey: 'pocPhase2Checklist', checklistCount: 4 },
  { num: 3, label: 'Trial Migration Run',      shortLabel: 'Trial Run',     statusKey: 'pocTrialStatus',         checklistKey: 'pocPhase3Checklist', checklistCount: 5 },
  { num: 4, label: 'Customer Validation',      shortLabel: 'Validation',    statusKey: 'pocValidationStatus',    checklistKey: 'pocPhase4Checklist', checklistCount: 4 },
  { num: 5, label: 'Outcome & Handoff',        shortLabel: 'Handoff',       statusKey: 'pocOutcomeStatus',       checklistKey: 'pocPhase5Checklist', checklistCount: 4 },
];

const PHASE1_CHECKLIST = [
  'Discovery call completed with customer',
  'Migration scope document shared & acknowledged',
  'Success criteria defined and agreed',
  'POC objectives documented (speed, permissions, metadata, etc.)',
];
const PHASE2_CHECKLIST = [
  'Source connector configured & tested',
  'Destination connector configured & tested',
  'Pilot user list identified (5–10 users typical)',
  'NDA / data handling agreement in place',
];
const PHASE3_CHECKLIST = [
  'Pre-migration scan completed',
  'Delta / incremental migration tested',
  'Permissions migration validated',
  'Metadata & timestamps preserved — verified',
  'Error log reviewed and explained to customer',
];
const PHASE4_CHECKLIST = [
  'POC review call held with stakeholders',
  'Success criteria review — each item pass/fail documented',
  'Concerns / objections logged and addressed',
  'POC report shared with customer',
];
const PHASE5_CHECKLIST = [
  'POC findings archived in PMO system',
  'Lessons learned documented',
  'Full project brief handed off to migration manager',
  'CRM opportunity updated with outcome',
];
const ALL_CHECKLISTS = [PHASE1_CHECKLIST, PHASE2_CHECKLIST, PHASE3_CHECKLIST, PHASE4_CHECKLIST, PHASE5_CHECKLIST];

// ── Style constants ───────────────────────────────────────────────────────────
const PHASE_RING: Record<PocPhaseStatus, string> = {
  not_started: 'border-gray-200 bg-white text-gray-400',
  in_progress:  'border-blue-400 bg-blue-50 text-blue-600',
  blocked:      'border-red-400 bg-red-50 text-red-600',
  completed:    'border-green-400 bg-green-100 text-green-700',
};
const PHASE_LINE: Record<PocPhaseStatus, string> = {
  not_started: 'bg-gray-200', in_progress: 'bg-blue-300', blocked: 'bg-red-300', completed: 'bg-green-400',
};
const PHASE_COL_HEADER: Record<PocPhaseStatus, string> = {
  not_started: 'bg-gray-50 border-gray-200',
  in_progress:  'bg-blue-50 border-blue-200',
  blocked:      'bg-red-50 border-red-200',
  completed:    'bg-green-50 border-green-200',
};
const STATUS_LABEL: Record<PocPhaseStatus, string> = {
  not_started: 'Not started', in_progress: 'In progress', blocked: 'Blocked', completed: 'Completed',
};
const STATUS_ICONS: Record<PocPhaseStatus, ReactNode> = {
  not_started: <Circle className="w-3.5 h-3.5" />,
  in_progress:  <Clock className="w-3.5 h-3.5" />,
  blocked:      <XCircle className="w-3.5 h-3.5" />,
  completed:    <CheckCircle2 className="w-3.5 h-3.5" />,
};
const OUTCOME_CFG: Record<string, { label: string; cls: string }> = {
  won:         { label: 'Won',         cls: 'bg-green-100 text-green-700 border-green-200' },
  lost:        { label: 'Lost',        cls: 'bg-red-100 text-red-700 border-red-200' },
  no_decision: { label: 'No Decision', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  extended:    { label: 'Extended',    cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  on_hold:     { label: 'On Hold',     cls: 'bg-gray-100 text-gray-600 border-gray-200' },
};
const SATISFACTION_CFG: Record<string, { label: string; cls: string }> = {
  go:          { label: '🟢 Go',          cls: 'bg-green-50 text-green-700 border-green-200' },
  conditional: { label: '🟡 Conditional', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  no_go:       { label: '🔴 No-go',       cls: 'bg-red-50 text-red-700 border-red-200' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function pocDuration(p: Project): number | null {
  if (!p.plannedStart || !p.plannedEnd) return null;
  return Math.round((new Date(p.plannedEnd).getTime() - new Date(p.plannedStart).getTime()) / 86_400_000);
}
function durationCls(d: number | null): string {
  if (d === null) return 'text-gray-400';
  if (d > 30) return 'text-red-600 font-semibold';
  if (d > 14) return 'text-orange-500';
  return 'text-green-600';
}
function isArchived(p: Project): boolean {
  return p.pocOutcome === 'won' || p.pocOutcome === 'lost' || p.pocOutcome === 'no_decision';
}
function dash(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function parseChecklist(json: string | null | undefined, count: number): boolean[] {
  if (!json) return Array(count).fill(false);
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.slice(0, count).concat(Array(Math.max(0, count - parsed.length)).fill(false)) : Array(count).fill(false);
  } catch { return Array(count).fill(false); }
}

// ── Shared input styles ───────────────────────────────────────────────────────
const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-800 placeholder-gray-400';
const mainInp = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white';

// ── Small reusable components ─────────────────────────────────────────────────
function FL({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5 leading-none">{label}</p>
      <div className="text-xs text-gray-700 leading-snug">{children}</div>
    </div>
  );
}
function FV({ v }: { v: string | number | null | undefined }) {
  return <span className="text-xs text-gray-700">{dash(v)}</span>;
}

function StatusBadge({ status }: { status: PocPhaseStatus }) {
  const cls = {
    not_started: 'bg-gray-100 text-gray-600 border-gray-200',
    in_progress:  'bg-blue-50 text-blue-700 border-blue-200',
    blocked:      'bg-red-50 text-red-700 border-red-200',
    completed:    'bg-green-50 text-green-700 border-green-200',
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {STATUS_ICONS[status]}{STATUS_LABEL[status]}
    </span>
  );
}

function ChecklistView({ items, checklist }: { items: string[]; checklist: boolean[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className={`flex items-start gap-2 text-xs leading-snug ${checklist[i] ? 'text-green-700' : 'text-gray-500'}`}>
          <div className={`mt-0.5 w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 ${checklist[i] ? 'bg-green-500 border border-green-500' : 'border border-gray-300 bg-white'}`}>
            {checklist[i] && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
          </div>
          <span className={checklist[i] ? 'line-through opacity-60' : ''}>{item}</span>
        </div>
      ))}
    </div>
  );
}
function ChecklistEdit({ items, checklist, onChange }: { items: string[]; checklist: boolean[]; onChange: (v: boolean[]) => void }) {
  function toggle(i: number) {
    const next = [...checklist];
    next[i] = !next[i];
    onChange(next);
  }
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <label key={i} className="flex items-start gap-2 cursor-pointer group text-xs leading-snug">
          <input type="checkbox" checked={!!checklist[i]} onChange={() => toggle(i)}
            className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400 shrink-0 cursor-pointer" />
          <span className={`${checklist[i] ? 'line-through text-gray-400' : 'text-gray-700'} group-hover:text-gray-900 transition-colors`}>{item}</span>
        </label>
      ))}
    </div>
  );
}

// ── Migration type picker ─────────────────────────────────────────────────────
function MigrationTypePicker({ selected, onChange, allTypes }: {
  selected: string[]; onChange: (v: string[]) => void;
  allTypes: { id: string; name: string; enabled: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const enabled = allTypes.filter(t => t.enabled);
  const visible = enabled.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()));
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  function toggle(id: string) { onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]); }
  const selectedNames = selected.map(id => enabled.find(t => t.id === id)?.name || id).filter(Boolean);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen(o => !o)}
        className="min-h-[44px] border border-gray-300 rounded-lg px-3 py-2 cursor-pointer bg-white flex items-start justify-between gap-2 hover:border-blue-400 transition">
        <div className="flex flex-wrap gap-1 flex-1">
          {selectedNames.length === 0
            ? <span className="text-gray-400 text-sm self-center">Select workload type(s)...</span>
            : selectedNames.map(n => <span key={n} className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">{n}</span>)}
        </div>
        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
      </div>
      {open && (
        <div className="absolute z-[200] w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 bg-gray-50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {visible.length === 0
              ? <p className="text-sm text-gray-400 text-center py-4">No types found</p>
              : visible.map(type => (
                <label key={type.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-50 last:border-0" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(type.id)} onChange={() => toggle(type.id)} className="w-4 h-4 text-blue-600 rounded border-gray-300" />
                  <span className="text-gray-800">{type.name}</span>
                </label>
              ))}
          </div>
          {selected.length > 0 && (
            <div className="p-2 border-t border-gray-100 bg-gray-50">
              <button onClick={e => { e.stopPropagation(); onChange([]); }} className="text-xs text-red-500 hover:text-red-700 font-medium">Clear all</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Phase column component ────────────────────────────────────────────────────
function PhaseColumn({ phase, project: p, canEdit, isEditing, onEdit, onSave, onCancel, isSaving }: {
  phase: typeof POC_PHASES[0]; project: Project;
  canEdit: boolean; isEditing: boolean;
  onEdit: () => void; onSave: (data: Record<string, any>) => void;
  onCancel: () => void; isSaving: boolean;
}) {
  const status: PocPhaseStatus = ((p as any)[phase.statusKey] as PocPhaseStatus) || 'not_started';
  const checklistItems = ALL_CHECKLISTS[phase.num - 1];
  const [form, setForm] = useState<Record<string, any>>({});
  const [checklist, setChecklist] = useState<boolean[]>([]);

  // Tracks the display checklist independently so saves reflect immediately
  // without waiting for the React Query refetch to complete.
  const [viewedChecklist, setViewedChecklist] = useState<boolean[]>(() =>
    parseChecklist((p as any)[phase.checklistKey], phase.checklistCount)
  );
  const checklistJson = (p as any)[phase.checklistKey] as string | null | undefined;
  // Sync only when p's data changes (refetch). Do NOT include isEditing —
  // adding it would overwrite the optimistic update the moment editing closes,
  // because checklistJson is still the old value at that instant.
  useEffect(() => {
    setViewedChecklist(parseChecklist(checklistJson, phase.checklistCount));
  }, [checklistJson]);

  useEffect(() => {
    if (!isEditing) return;
    // Use viewedChecklist (not p's raw prop) so the edit mode reflects the
    // optimistically-updated state even if the React Query refetch hasn't
    // completed yet when the user clicks Edit again.
    setChecklist([...viewedChecklist]);

    if (phase.num === 1) {
      setForm({
        pocQualificationStatus: (p as any).pocQualificationStatus || 'not_started',
        pocNumUsers:            (p as any).pocNumUsers || '',
        pocEstimatedData:       (p as any).pocEstimatedData || '',
        pocQualificationNotes:  (p as any).pocQualificationNotes || '',
      });
    } else if (phase.num === 2) {
      setForm({
        pocEnvSetupStatus:  (p as any).pocEnvSetupStatus || 'not_started',
        pocTenantAccess:    (p as any).pocTenantAccess || '',
        pocToolVersion:     (p as any).pocToolVersion || '',
        pocTestAccounts:    (p as any).pocTestAccounts || '',
        pocFirewallIssues:  (p as any).pocFirewallIssues || '',
        pocEnvSetupNotes:   (p as any).pocEnvSetupNotes || '',
      });
    } else if (phase.num === 3) {
      setForm({
        pocTrialStatus:      (p as any).pocTrialStatus || 'not_started',
        pocFilesMigrated:    (p as any).pocFilesMigrated || '',
        pocDataMigratedGb:   (p as any).pocDataMigratedGb != null ? String((p as any).pocDataMigratedGb) : '',
        pocMigrationSpeed:   p.pocMigrationSpeed != null ? String(p.pocMigrationSpeed) : '',
        pocErrorsFailed:     (p as any).pocErrorsFailed || '',
        pocTrialNotes:       (p as any).pocTrialNotes || '',
      });
    } else if (phase.num === 4) {
      setForm({
        pocValidationStatus:     (p as any).pocValidationStatus || 'not_started',
        customerContact:         p.customerContact || '',
        pocValidationDate:       (p as any).pocValidationDate ? String((p as any).pocValidationDate).substring(0, 10) : '',
        pocIssuesRaised:         (p as any).pocIssuesRaised || '',
        pocCustomerSatisfaction: (p as any).pocCustomerSatisfaction || '',
        pocValidationNotes:      (p as any).pocValidationNotes || '',
      });
    } else {
      setForm({
        pocOutcomeStatus: (p as any).pocOutcomeStatus || 'not_started',
        pocOutcome:       p.pocOutcome || '',
        pocNextStep:      (p as any).pocNextStep || '',
        pocDealValue:     (p as any).pocDealValue != null ? String((p as any).pocDealValue) : '',
        pocHandoffTo:     p.pocHandoffTo || '',
        pocHandoffDate:   p.pocHandoffDate ? String(p.pocHandoffDate).substring(0, 10) : '',
        pocOutcomeNotes:  (p as any).pocOutcomeNotes || '',
      });
    }
  }, [isEditing]);

  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }
  function handleSave() {
    const payload: Record<string, any> = { ...form };
    const savedChecklist = [...checklist];
    payload[phase.checklistKey] = JSON.stringify(savedChecklist);
    setViewedChecklist(savedChecklist);
    if (phase.num === 3) {
      payload.pocDataMigratedGb = form.pocDataMigratedGb ? Number(form.pocDataMigratedGb) : null;
      payload.pocMigrationSpeed = form.pocMigrationSpeed ? Number(form.pocMigrationSpeed) : null;
    }
    if (phase.num === 5) {
      payload.pocOutcome   = form.pocOutcome   || null;
      payload.pocDealValue = form.pocDealValue ? Number(form.pocDealValue) : null;
      payload.pocHandoffDate = form.pocHandoffDate || null;
    }
    if (phase.num === 4) {
      payload.pocValidationDate = form.pocValidationDate || null;
    }
    onSave(payload);
  }

  const editStatus: PocPhaseStatus = ((form[phase.statusKey] || 'not_started') as PocPhaseStatus);
  const doneCount = viewedChecklist.filter(Boolean).length;
  const headerBg = isEditing ? PHASE_COL_HEADER[editStatus] : PHASE_COL_HEADER[status];

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Column header */}
      <div className={`px-3 pt-3 pb-2 border-b ${headerBg}`}>
        <div className="flex items-start justify-between gap-1 mb-2">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Phase {phase.num}</span>
            <p className="text-xs font-semibold text-gray-800 leading-snug mt-0.5">{phase.label}</p>
          </div>
          {canEdit && !isEditing && (
            <button onClick={onEdit}
              className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 bg-white border border-blue-200 rounded px-1.5 py-0.5 transition shrink-0">
              <Pencil className="w-2.5 h-2.5" /> Edit
            </button>
          )}
        </div>
        {isEditing ? (
          <select value={editStatus} onChange={e => set(phase.statusKey, e.target.value)} className={inp}>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="blocked">Blocked</option>
            <option value="completed">Completed</option>
          </select>
        ) : (
          <StatusBadge status={status} />
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-3 flex-1 space-y-3">

        {/* ── PHASE 1 ── */}
        {phase.num === 1 && (isEditing ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">No. of users</label>
                <input type="text" value={form.pocNumUsers || ''} onChange={e => set('pocNumUsers', e.target.value)} placeholder="e.g. 250" className={inp} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Estimated data</label>
                <input type="text" value={form.pocEstimatedData || ''} onChange={e => set('pocEstimatedData', e.target.value)} placeholder="e.g. 2 TB" className={inp} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
              <textarea value={form.pocQualificationNotes || ''} onChange={e => set('pocQualificationNotes', e.target.value)}
                placeholder="Scope, stakeholders, agreements..." rows={2} className={`${inp} resize-none`} />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Checklist</p>
              <ChecklistEdit items={checklistItems} checklist={checklist} onChange={setChecklist} />
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <FL label="No. of users"><FV v={(p as any).pocNumUsers} /></FL>
              <FL label="Estimated data"><FV v={(p as any).pocEstimatedData} /></FL>
            </div>
            <FL label="Notes"><FV v={(p as any).pocQualificationNotes} /></FL>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Checklist</p>
                <span className="text-[10px] text-gray-400">{doneCount}/{phase.checklistCount}</span>
              </div>
              <ChecklistView items={checklistItems} checklist={viewedChecklist} />
            </div>
          </>
        ))}

        {/* ── PHASE 2 ── */}
        {phase.num === 2 && (isEditing ? (
          <>
            {form.pocEnvSetupStatus === 'blocked' && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Blocked — document below.
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Tenant/admin access granted</label>
              <select value={form.pocTenantAccess || ''} onChange={e => set('pocTenantAccess', e.target.value)} className={inp}>
                <option value="">—</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Tool version deployed</label>
              <input type="text" value={form.pocToolVersion || ''} onChange={e => set('pocToolVersion', e.target.value)} placeholder="e.g. v4.2.1" className={inp} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Test user accounts created</label>
              <input type="text" value={form.pocTestAccounts || ''} onChange={e => set('pocTestAccounts', e.target.value)} placeholder="e.g. 8 accounts" className={inp} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Firewall / proxy issues</label>
              <select value={form.pocFirewallIssues || ''} onChange={e => set('pocFirewallIssues', e.target.value)} className={inp}>
                <option value="">—</option>
                <option value="None">None</option>
                <option value="Flagged">Flagged</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
              <textarea value={form.pocEnvSetupNotes || ''} onChange={e => set('pocEnvSetupNotes', e.target.value)}
                placeholder="Admin access, connector config, firewall details..." rows={2} className={`${inp} resize-none`} />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Checklist</p>
              <ChecklistEdit items={checklistItems} checklist={checklist} onChange={setChecklist} />
            </div>
          </>
        ) : (
          <>
            {status === 'blocked' && (p as any).pocEnvSetupNotes && (
              <div className="flex items-start gap-1.5 bg-red-50 border border-red-200 rounded-lg p-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{(p as any).pocEnvSetupNotes}</p>
              </div>
            )}
            <FL label="Tenant/admin access granted"><FV v={(p as any).pocTenantAccess} /></FL>
            <FL label="Tool version deployed"><FV v={(p as any).pocToolVersion} /></FL>
            <FL label="Test user accounts created"><FV v={(p as any).pocTestAccounts} /></FL>
            <FL label="Firewall / proxy issues"><FV v={(p as any).pocFirewallIssues} /></FL>
            <FL label="Notes"><FV v={(p as any).pocEnvSetupNotes} /></FL>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Checklist</p>
                <span className="text-[10px] text-gray-400">{doneCount}/{phase.checklistCount}</span>
              </div>
              <ChecklistView items={checklistItems} checklist={viewedChecklist} />
            </div>
          </>
        ))}

        {/* ── PHASE 3 ── */}
        {phase.num === 3 && (isEditing ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Files migrated</label>
                <input type="text" value={form.pocFilesMigrated || ''} onChange={e => set('pocFilesMigrated', e.target.value)} placeholder="e.g. 14,250" className={inp} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Data migrated (GB)</label>
                <input type="number" value={form.pocDataMigratedGb || ''} onChange={e => set('pocDataMigratedGb', e.target.value)} placeholder="e.g. 42.5" min="0" step="0.1" className={inp} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Speed (GB/hr)</label>
                <input type="number" value={form.pocMigrationSpeed || ''} onChange={e => set('pocMigrationSpeed', e.target.value)} placeholder="e.g. 47" min="0" className={inp} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Errors / failed items</label>
                <input type="text" value={form.pocErrorsFailed || ''} onChange={e => set('pocErrorsFailed', e.target.value)} placeholder="e.g. 3" className={inp} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
              <textarea value={form.pocTrialNotes || ''} onChange={e => set('pocTrialNotes', e.target.value)}
                placeholder="Run observations, error details..." rows={2} className={`${inp} resize-none`} />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Checklist</p>
              <ChecklistEdit items={checklistItems} checklist={checklist} onChange={setChecklist} />
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <FL label="Files migrated"><FV v={(p as any).pocFilesMigrated} /></FL>
              <FL label="Data migrated (GB)"><FV v={(p as any).pocDataMigratedGb} /></FL>
              <FL label="Speed (GB/hr)">
                <span className={`text-xs font-semibold ${p.pocMigrationSpeed != null ? 'text-blue-700' : 'text-gray-400'}`}>
                  {p.pocMigrationSpeed != null ? `${p.pocMigrationSpeed}` : '—'}
                </span>
              </FL>
              <FL label="Errors / failed">
                <span className={`text-xs font-semibold ${(p as any).pocErrorsFailed ? 'text-orange-600' : 'text-gray-400'}`}>
                  {dash((p as any).pocErrorsFailed)}
                </span>
              </FL>
            </div>
            <FL label="Notes"><FV v={(p as any).pocTrialNotes} /></FL>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Checklist</p>
                <span className="text-[10px] text-gray-400">{doneCount}/{phase.checklistCount}</span>
              </div>
              <ChecklistView items={checklistItems} checklist={viewedChecklist} />
            </div>
          </>
        ))}

        {/* ── PHASE 4 ── */}
        {phase.num === 4 && (isEditing ? (
          <>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Customer sign-off contact</label>
              <input type="text" value={form.customerContact || ''} onChange={e => set('customerContact', e.target.value)} placeholder="Contact name / email" className={inp} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Validation date</label>
              <input type="date" value={form.pocValidationDate || ''} onChange={e => set('pocValidationDate', e.target.value)} className={inp} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Issues raised</label>
              <select value={form.pocIssuesRaised || ''} onChange={e => set('pocIssuesRaised', e.target.value)} className={inp}>
                <option value="">—</option>
                <option value="None">None</option>
                <option value="See notes">See notes</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Customer satisfaction</label>
              <select value={form.pocCustomerSatisfaction || ''} onChange={e => set('pocCustomerSatisfaction', e.target.value)} className={inp}>
                <option value="">—</option>
                <option value="go">🟢 Go</option>
                <option value="conditional">🟡 Conditional</option>
                <option value="no_go">🔴 No-go</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
              <textarea value={form.pocValidationNotes || ''} onChange={e => set('pocValidationNotes', e.target.value)}
                placeholder="Pass/fail per criterion, customer concerns..." rows={2} className={`${inp} resize-none`} />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Checklist</p>
              <ChecklistEdit items={checklistItems} checklist={checklist} onChange={setChecklist} />
            </div>
          </>
        ) : (
          <>
            <FL label="Customer sign-off contact"><FV v={p.customerContact} /></FL>
            <FL label="Validation date">{fmtDate((p as any).pocValidationDate)}</FL>
            <FL label="Issues raised"><FV v={(p as any).pocIssuesRaised} /></FL>
            <FL label="Customer satisfaction">
              {(p as any).pocCustomerSatisfaction && SATISFACTION_CFG[(p as any).pocCustomerSatisfaction]
                ? <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border font-medium ${SATISFACTION_CFG[(p as any).pocCustomerSatisfaction].cls}`}>
                    {SATISFACTION_CFG[(p as any).pocCustomerSatisfaction].label}
                  </span>
                : <span className="text-xs text-gray-400">—</span>}
            </FL>
            <FL label="Notes"><FV v={(p as any).pocValidationNotes} /></FL>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Checklist</p>
                <span className="text-[10px] text-gray-400">{doneCount}/{phase.checklistCount}</span>
              </div>
              <ChecklistView items={checklistItems} checklist={viewedChecklist} />
            </div>
          </>
        ))}

        {/* ── PHASE 5 ── */}
        {phase.num === 5 && (isEditing ? (
          <>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">POC outcome</label>
              <select value={form.pocOutcome || ''} onChange={e => set('pocOutcome', e.target.value)} className={inp}>
                <option value="">In Progress</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
                <option value="extended">Extended</option>
                <option value="on_hold">On hold</option>
                <option value="no_decision">No decision</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Next step</label>
              <select value={form.pocNextStep || ''} onChange={e => set('pocNextStep', e.target.value)} className={inp}>
                <option value="">—</option>
                <option value="Full migration">Full migration</option>
                <option value="Re-scope">Re-scope</option>
                <option value="Extended trial">Extended trial</option>
                <option value="No further action">No further action</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Projected deal value</label>
              <input type="number" value={form.pocDealValue || ''} onChange={e => set('pocDealValue', e.target.value)} placeholder="e.g. 45000" min="0" className={inp} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Handoff to</label>
                <input type="text" value={form.pocHandoffTo || ''} onChange={e => set('pocHandoffTo', e.target.value)} placeholder="Migration manager" className={inp} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Handoff date</label>
                <input type="date" value={form.pocHandoffDate || ''} onChange={e => set('pocHandoffDate', e.target.value)} className={inp} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
              <textarea value={form.pocOutcomeNotes || ''} onChange={e => set('pocOutcomeNotes', e.target.value)}
                placeholder="Why won/lost, next steps, lessons..." rows={2} className={`${inp} resize-none`} />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Checklist</p>
              <ChecklistEdit items={checklistItems} checklist={checklist} onChange={setChecklist} />
            </div>
          </>
        ) : (
          <>
            <FL label="POC outcome">
              {p.pocOutcome && OUTCOME_CFG[p.pocOutcome]
                ? <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border font-medium ${OUTCOME_CFG[p.pocOutcome].cls}`}>{OUTCOME_CFG[p.pocOutcome].label}</span>
                : <span className="text-xs text-gray-400">In Progress</span>}
            </FL>
            <FL label="Next step"><FV v={(p as any).pocNextStep} /></FL>
            <FL label="Projected deal value">
              {(p as any).pocDealValue != null
                ? <span className="text-xs font-semibold text-green-700">${Number((p as any).pocDealValue).toLocaleString()}</span>
                : <span className="text-xs text-gray-400">—</span>}
            </FL>
            <FL label="Handoff to migration manager">
              {p.pocHandoffTo
                ? <span className="text-xs text-gray-700">{p.pocHandoffTo}{p.pocHandoffDate ? ` · ${fmtDate(p.pocHandoffDate)}` : ''}</span>
                : <span className="text-xs text-gray-400">—</span>}
            </FL>
            <FL label="Notes"><FV v={(p as any).pocOutcomeNotes} /></FL>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Checklist</p>
                <span className="text-[10px] text-gray-400">{doneCount}/{phase.checklistCount}</span>
              </div>
              <ChecklistView items={checklistItems} checklist={viewedChecklist} />
            </div>
          </>
        ))}
      </div>

      {/* Save / Cancel */}
      {isEditing && (
        <div className="flex gap-2 px-3 pb-3 pt-2 border-t border-gray-100">
          <button onClick={handleSave} disabled={isSaving}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
          </button>
          <button onClick={onCancel} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition text-gray-600">Cancel</button>
        </div>
      )}
    </div>
  );
}

// ── Expanded stepper view ─────────────────────────────────────────────────────
function PhaseStepperView({ project: p, canEdit }: { project: Project; canEdit: boolean }) {
  const [editingPhaseNum, setEditingPhaseNum] = useState<number | null>(null);
  const [editingOverview, setEditingOverview] = useState(false);
  const [overviewForm, setOverviewForm] = useState({
    projectManager:   p.projectManager || '',
    pocPreSalesOwner: (p as any).pocPreSalesOwner || '',
    accountManager:   p.accountManager || '',
    plannedStart:     p.plannedStart   ? String(p.plannedStart).substring(0, 10) : '',
    plannedEnd:       p.plannedEnd     ? String(p.plannedEnd).substring(0, 10)   : '',
    pocDataVolume:    (p as any).pocDataVolume || '',
  });
  const updatePoc = useUpdatePocProject();
  const { showToast } = useToast();
  const { data: usersData } = useAllUsers();
  const userNames: string[] = Array.isArray(usersData?.data)
    ? usersData.data.map((u: any) => u.name).filter(Boolean).sort()
    : [];

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'details' | 'moms' | 'scope' | 'notes'>('details');
  const [docs, setDocs] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [criticalNotes, setCriticalNotes] = useState((p as any).pocCriticalNotes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<'MOM' | 'SCOPE'>('MOM');
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  async function loadDocs() {
    setDocsLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      const res = await fetch(`${API_BASE}/api/poc-documents/${p.id}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      const json = await res.json();
      if (json.success) setDocs(json.data);
    } catch {} finally { setDocsLoading(false); }
  }

  useEffect(() => {
    if (activeTab === 'moms' || activeTab === 'scope') loadDocs();
  }, [activeTab]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
        await fetch(`${API_BASE}/api/poc-documents/${p.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            fileName: file.name,
            category: uploadCategory,
            fileData: base64,
            mimeType: file.type,
            fileSize: file.size,
            uploadedBy: '',
          }),
        });
        await loadDocs();
        showToast('success', 'Document uploaded');
      };
      reader.readAsDataURL(file);
    } catch { showToast('error', 'Upload failed'); } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeleteDoc(docId: string) {
    if (!confirm('Delete this document?')) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
    await fetch(`${API_BASE}/api/poc-documents/${p.id}/${docId}`, {
      method: 'DELETE',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    });
    await loadDocs();
    showToast('success', 'Document deleted');
  }

  async function saveCriticalNotes() {
    setSavingNotes(true);
    try {
      await updatePoc.mutateAsync({ id: p.id, data: { pocCriticalNotes: criticalNotes } as any });
      showToast('success', 'Critical notes saved');
    } catch { showToast('error', 'Failed to save notes'); } finally { setSavingNotes(false); }
  }

  function formatFileSize(bytes: number) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function openOverviewEdit() {
    setOverviewForm({
      projectManager:   p.projectManager || '',
      pocPreSalesOwner: (p as any).pocPreSalesOwner || '',
      accountManager:   p.accountManager || '',
      plannedStart:     p.plannedStart   ? String(p.plannedStart).substring(0, 10) : '',
      plannedEnd:       p.plannedEnd     ? String(p.plannedEnd).substring(0, 10)   : '',
      pocDataVolume:    (p as any).pocDataVolume || '',
    });
    setEditingOverview(true);
  }

  async function saveOverview() {
    try {
      await updatePoc.mutateAsync({
        id: p.id,
        data: {
          projectManager:   overviewForm.projectManager   || undefined,
          pocPreSalesOwner: overviewForm.pocPreSalesOwner || null,
          accountManager:   overviewForm.accountManager   || undefined,
          plannedStart:     overviewForm.plannedStart     || undefined,
          plannedEnd:       overviewForm.plannedEnd       || undefined,
          pocDataVolume:    overviewForm.pocDataVolume    || null,
        } as any,
      });
      showToast('success', 'Overview saved');
      setEditingOverview(false);
    } catch {
      showToast('error', 'Failed to save');
    }
  }

  async function savePhase(phaseNum: number, data: Record<string, any>) {
    try {
      await updatePoc.mutateAsync({ id: p.id, data });
      showToast('success', `Phase ${phaseNum} saved`);
      setEditingPhaseNum(null);
    } catch {
      showToast('error', 'Failed to save');
    }
  }

  const days = pocDuration(p);
  function setOF(k: string, v: string) { setOverviewForm(f => ({ ...f, [k]: v })); }

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: 'details', label: 'Project Details',        icon: <FlaskConical className="w-3.5 h-3.5" /> },
          { id: 'moms',    label: 'MOMs',                   icon: <FileText className="w-3.5 h-3.5" /> },
          { id: 'scope',   label: 'Scope & Customization',  icon: <FolderOpen className="w-3.5 h-3.5" /> },
          { id: 'notes',   label: 'Critical Notes',         icon: <StickyNote className="w-3.5 h-3.5" /> },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Project Details */}
      {activeTab === 'details' && (
      <div className="space-y-4">
      {/* Overview strip */}
      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs">
        {editingOverview ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Project Manager</p>
                <select value={overviewForm.projectManager} onChange={e => setOF('projectManager', e.target.value)} className={inp}>
                  <option value="">— Select —</option>
                  {userNames.map(name => <option key={name} value={name}>{name}</option>)}
                  {overviewForm.projectManager && !userNames.includes(overviewForm.projectManager) && (
                    <option value={overviewForm.projectManager}>{overviewForm.projectManager}</option>
                  )}
                </select>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Pre-Sales</p>
                <select value={overviewForm.pocPreSalesOwner} onChange={e => setOF('pocPreSalesOwner', e.target.value)} className={inp}>
                  <option value="">— Select —</option>
                  <option value="Nivas">Nivas</option>
                  <option value="Vimlesh">Vimlesh</option>
                  <option value="Vignesh">Vignesh</option>
                  {overviewForm.pocPreSalesOwner && !['Nivas','Vimlesh','Vignesh'].includes(overviewForm.pocPreSalesOwner) && (
                    <option value={overviewForm.pocPreSalesOwner}>{overviewForm.pocPreSalesOwner}</option>
                  )}
                </select>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Account Manager</p>
                <select value={overviewForm.accountManager} onChange={e => setOF('accountManager', e.target.value)} className={inp}>
                  <option value="">Select...</option>
                  <option value="Joy Prakash">Joy Prakash</option>
                  <option value="Arundhati Sen">Arundhati Sen</option>
                  <option value="Deepak R J">Deepak R J</option>
                </select>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">POC Start</p>
                <input type="date" value={overviewForm.plannedStart} onChange={e => setOF('plannedStart', e.target.value)} className={inp} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">POC End</p>
                <input type="date" value={overviewForm.plannedEnd} onChange={e => setOF('plannedEnd', e.target.value)} className={inp} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Data size</p>
                <input type="text" value={overviewForm.pocDataVolume} onChange={e => setOF('pocDataVolume', e.target.value)} placeholder="e.g. 500 GB" className={inp} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveOverview} disabled={updatePoc.isPending}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                {updatePoc.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
              </button>
              <button onClick={() => setEditingOverview(false)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition text-gray-600">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 flex-1">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Project Manager</p>
                <p className="text-gray-700">{dash(p.projectManager)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Pre-Sales</p>
                <p className="text-gray-700">{dash((p as any).pocPreSalesOwner)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Account Manager</p>
                <p className="text-gray-700">{dash(p.accountManager)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">POC Start</p>
                <p className="text-gray-700">{fmtDate(p.plannedStart)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">POC End</p>
                <p className={`font-medium ${days !== null && days > 30 ? 'text-red-600' : days !== null && days > 14 ? 'text-orange-500' : 'text-gray-700'}`}>
                  {fmtDate(p.plannedEnd)}
                  {days !== null && <span className="ml-1 font-normal text-gray-400">({days}d)</span>}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Data size</p>
                <p className="text-gray-700">{dash((p as any).pocDataVolume)}</p>
              </div>
            </div>
            {canEdit && (
              <button onClick={openOverviewEdit}
                className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 bg-white border border-blue-200 rounded px-1.5 py-0.5 shrink-0 transition">
                <Pencil className="w-2.5 h-2.5" /> Edit
              </button>
            )}
          </div>
        )}
      </div>

      {/* Progress circles */}
      <div className="overflow-x-auto">
        <div className="min-w-[720px] flex items-center">
          {POC_PHASES.map((phase, i) => {
            const st: PocPhaseStatus = ((p as any)[phase.statusKey] as PocPhaseStatus) || 'not_started';
            return (
              <div key={phase.num} className="flex items-center flex-1">
                <div className="flex flex-col items-center shrink-0">
                  <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center font-bold text-sm ${PHASE_RING[st]}`}>
                    {st === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : <span>{phase.num}</span>}
                  </div>
                  <span className="text-[10px] mt-1 font-medium text-gray-500 text-center leading-tight">{phase.shortLabel}</span>
                </div>
                {i < POC_PHASES.length - 1 && <div className={`flex-1 h-0.5 mx-1 mt-[-18px] ${PHASE_LINE[st]}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* 5 phase columns */}
      <div className="overflow-x-auto">
        <div className="min-w-[960px] grid grid-cols-5 gap-3">
          {POC_PHASES.map(phase => (
            <PhaseColumn
              key={phase.num} phase={phase} project={p} canEdit={canEdit}
              isEditing={editingPhaseNum === phase.num}
              onEdit={() => setEditingPhaseNum(phase.num)}
              onSave={data => savePhase(phase.num, data)}
              onCancel={() => setEditingPhaseNum(null)}
              isSaving={updatePoc.isPending}
            />
          ))}
        </div>
      </div>
      </div>
      )} {/* end activeTab === 'details' */}

      {/* Tab 2 & 3: MOMs / Scope & Customization */}
      {(activeTab === 'moms' || activeTab === 'scope') && (
        <div className="space-y-4">
          {/* Upload bar */}
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100 flex-wrap">
            {canEdit && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg"
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => { setUploadCategory(activeTab === 'moms' ? 'MOM' : 'SCOPE'); fileInputRef.current?.click(); }}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? 'Uploading…' : `Upload ${activeTab === 'moms' ? 'MOM' : 'Scope'} Document`}
                </button>
              </>
            )}
            {activeTab === 'scope' && (
              <a
                href="/templates/CloudFuze_POC_Scope_Register_Template.xls"
                download="CloudFuze_POC_Scope_Register_Template.xls"
                className="flex items-center gap-2 px-4 py-2 text-sm bg-white text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition font-medium"
              >
                <Download className="w-4 h-4" />
                Download Template
              </a>
            )}
            <p className="text-xs text-blue-600">
              {activeTab === 'scope'
                ? 'Download the template, fill it out, then upload the completed file above'
                : 'PDF, Word, Excel, PPT, images supported'}
            </p>
          </div>

          {/* Document list */}
          {docsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : (() => {
            const category = activeTab === 'moms' ? 'MOM' : 'SCOPE';
            const filteredDocs = docs.filter(d => d.category === category);
            if (filteredDocs.length === 0) return (
              <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
                <FileText className="w-10 h-10 opacity-30" />
                <p className="text-sm">No {activeTab === 'moms' ? 'MOM' : 'Scope'} documents yet</p>
                {canEdit && <p className="text-xs">Use the upload button above to add documents</p>}
              </div>
            );
            return (
              <div className="space-y-2">
                {filteredDocs.map((doc: any) => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-200 transition group">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{doc.fileName}</p>
                      <p className="text-xs text-gray-400">
                        {formatFileSize(doc.fileSize)}{doc.uploadedBy ? ` · ${doc.uploadedBy}` : ''} · {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <a
                      href={`${API_BASE}${doc.filePath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={doc.fileName}
                      className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-blue-500 hover:bg-blue-100 transition"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    {canEdit && (
                      <button
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-red-500 hover:bg-red-100 transition"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Tab 4: Critical Notes */}
      {activeTab === 'notes' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Critical Notes</p>
            <p className="text-xs text-gray-400">Visible to all team members</p>
          </div>
          <textarea
            value={criticalNotes}
            onChange={e => setCriticalNotes(e.target.value)}
            placeholder="Add critical notes, blockers, key decisions, or important context for this POC…"
            rows={10}
            readOnly={!canEdit}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
          {canEdit && (
            <div className="flex justify-end">
              <button
                onClick={saveCriticalNotes}
                disabled={savingNotes}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {savingNotes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Notes
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ── POC row ───────────────────────────────────────────────────────────────────
function PocRow({ project: p, canEdit, expandedId, setExpandedId, isDeleteConfirm, setDeleteConfirm, onDelete }: {
  project: Project; canEdit: boolean;
  expandedId: string | null; setExpandedId: (id: string | null) => void;
  isDeleteConfirm: boolean; setDeleteConfirm: (v: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const isExpanded = expandedId === p.id;
  const outcome    = p.pocOutcome ? OUTCOME_CFG[p.pocOutcome] : null;
  const workloads  = (p.migrationTypes || '').split(',').map(w => w.trim()).filter(Boolean);
  const days       = pocDuration(p);
  const isFlagged  = days !== null && days > 30 && p.pocOutcomeStatus !== 'completed';
  const allStatuses = POC_PHASES.map(ph => ((p as any)[ph.statusKey] as PocPhaseStatus) || 'not_started');
  const completedCount = allStatuses.filter(s => s === 'completed').length;

  return (
    <div className={`bg-white rounded-xl border transition-all ${isFlagged ? 'border-red-200 shadow-sm shadow-red-50' : 'border-gray-200'} ${isExpanded ? 'shadow-md' : 'hover:shadow-sm'}`}>
      {/* Row header */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpandedId(isExpanded ? null : p.id)}>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 capitalize">{p.customerName}</span>
            {isFlagged && <AlertTriangle className="w-3.5 h-3.5 text-red-500" title="POC exceeds 30 days" />}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {workloads.map(w => <span key={w} className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded-full">{w}</span>)}
          </div>
        </div>

        <div className="hidden md:flex flex-col text-xs text-gray-500 shrink-0">
          <span className="flex items-center gap-1"><FlaskConical className="w-3 h-3 text-blue-400" />{p.projectManager || '—'}</span>
          {p.accountManager && <span className="flex items-center gap-1"><User className="w-3 h-3 text-gray-400" />{p.accountManager}</span>}
        </div>

        {/* Phase progress dots */}
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {POC_PHASES.map((phase, i) => {
            const st: PocPhaseStatus = ((p as any)[phase.statusKey] as PocPhaseStatus) || 'not_started';
            return (
              <div key={phase.num} className="flex items-center gap-1" title={`${phase.shortLabel}: ${STATUS_LABEL[st]}`}>
                <div className={`w-2.5 h-2.5 rounded-full ${PHASE_LINE[st]}`} />
                {i < POC_PHASES.length - 1 && <div className="w-3 h-px bg-gray-200" />}
              </div>
            );
          })}
          <span className="ml-1 text-[10px] text-gray-400">{completedCount}/5</span>
        </div>

        {days !== null && (
          <span className={`hidden lg:flex items-center gap-1 text-xs shrink-0 ${durationCls(days)}`}>
            <CalendarDays className="w-3 h-3" />{days}d
          </span>
        )}

        <div className="shrink-0">
          {outcome
            ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${outcome.cls}`}>{outcome.label}</span>
            : <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-medium">In Progress</span>}
        </div>

        {canEdit && (
          <div className="shrink-0" onClick={e => e.stopPropagation()}>
            {isDeleteConfirm ? (
              <div className="flex items-center gap-1">
                <button onClick={() => onDelete(p.id)} className="text-xs px-2 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition">Delete</button>
                <button onClick={() => setDeleteConfirm(false)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-100 transition">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setDeleteConfirm(true)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete POC">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </div>

      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50/30">
          <PhaseStepperView project={p} canEdit={canEdit} />
        </div>
      )}
    </div>
  );
}

// ── Create modal helpers ──────────────────────────────────────────────────────
const EMPTY = {
  name: '', customerName: '', accountManager: '', projectManager: '',
  planType: 'SILVER', plannedStart: '', plannedEnd: '',
  customerContact: '', description: '', pocDataVolume: '',
};
function MField({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
function SLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2 mb-4">{children}</p>;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PocProjectsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'PRE_SALES';
  const allMigrationTypes = settings.migrationTypes || [];

  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [workloadFilter, setWorkloadFilter] = useState('');
  const [flagFilter, setFlagFilter] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({ ...EMPTY });
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const { data, isLoading, error } = usePocProjects();
  const createPoc = useCreatePocProject();
  const deletePoc = useDeletePocProject();

  const all: Project[] = data?.data || [];
  const active   = all.filter(p => !isArchived(p));
  const archived = all.filter(p =>  isArchived(p));

  function applyFilters(list: Project[]) {
    return list.filter(p => {
      if (outcomeFilter && p.pocOutcome !== outcomeFilter) return false;
      if (workloadFilter && !(p.migrationTypes || '').toLowerCase().includes(workloadFilter.toLowerCase())) return false;
      if (flagFilter) { const d = pocDuration(p); if (!d || d <= 30 || p.pocOutcomeStatus === 'completed') return false; }
      return true;
    });
  }

  const filteredActive   = applyFilters(active);
  const filteredArchived = applyFilters(archived);

  function openModal()  { setShowNewModal(true);  setNewForm({ ...EMPTY }); setSelectedTypes([]); }
  function closeModal() { setShowNewModal(false); setNewForm({ ...EMPTY }); setSelectedTypes([]); }

  async function handleDelete(id: string) {
    try {
      await deletePoc.mutateAsync(id);
      showToast('success', 'POC deleted');
      setDeleteConfirmId(null);
      if (expandedId === id) setExpandedId(null);
    } catch {
      showToast('error', 'Failed to delete POC');
    }
  }

  async function handleCreate() {
    if (!newForm.name || !newForm.customerName || !newForm.plannedStart || !newForm.plannedEnd) {
      showToast('error', 'Please fill in all required fields');
      return;
    }
    const migrationTypesStr = selectedTypes
      .map(id => allMigrationTypes.find((t: any) => t.id === id)?.name || id).join(', ');
    try {
      await createPoc.mutateAsync({
        ...newForm,
        migrationTypes: migrationTypesStr,
        pocDataVolume:  newForm.pocDataVolume || null,
      } as any);
      showToast('success', 'POC created');
      closeModal();
    } catch {
      showToast('error', 'Failed to create POC');
    }
  }

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  if (error)     return <div className="p-6 text-red-500">Failed to load POC projects</div>;

  const modal = showNewModal && mounted ? createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onClick={closeModal}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: 'calc(100vh - 2rem)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 bg-blue-600 text-white rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-5 h-5" />
            <div>
              <h2 className="text-lg font-bold">New POC Project</h2>
              <p className="text-xs text-blue-100">7–14 day deadline recommended. Flag anything over 30 days.</p>
            </div>
          </div>
          <button onClick={closeModal} className="p-1.5 hover:bg-blue-500 rounded-lg transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          <div>
            <SLabel>Basic Information</SLabel>
            <div className="grid grid-cols-2 gap-4">
              <MField label="Project Name" required><input type="text" placeholder="e.g. Acme Corp POC" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} className={mainInp} /></MField>
              <MField label="Customer / Account Name" required><input type="text" placeholder="e.g. Acme Corporation" value={newForm.customerName} onChange={e => setNewForm(f => ({ ...f, customerName: e.target.value }))} className={mainInp} /></MField>
              <MField label="Pre-Sales Owner"><input type="text" placeholder="Who is running this POC?" value={newForm.projectManager} onChange={e => setNewForm(f => ({ ...f, projectManager: e.target.value }))} className={mainInp} /></MField>
              <MField label="Account Manager"><input type="text" placeholder="Account Manager name" value={newForm.accountManager} onChange={e => setNewForm(f => ({ ...f, accountManager: e.target.value }))} className={mainInp} /></MField>
              <MField label="Customer Contact"><input type="text" placeholder="Customer point of contact" value={newForm.customerContact} onChange={e => setNewForm(f => ({ ...f, customerContact: e.target.value }))} className={mainInp} /></MField>
              <MField label="Plan Type">
                <select value={newForm.planType} onChange={e => setNewForm(f => ({ ...f, planType: e.target.value }))} className={mainInp}>
                  <option value="BRONZE">BRONZE</option><option value="SILVER">SILVER</option>
                  <option value="GOLD">GOLD</option><option value="PLATINUM">PLATINUM</option>
                </select>
              </MField>
            </div>
            <div className="mt-4"><MField label="Workload / Migration Types"><MigrationTypePicker selected={selectedTypes} onChange={setSelectedTypes} allTypes={allMigrationTypes as any} /></MField></div>
            <div className="mt-4"><MField label="Data size (approx.)" hint="e.g. ~50 GB, 200 mailboxes, 2 TB"><input type="text" placeholder="Approx. data size and scope" value={newForm.pocDataVolume} onChange={e => setNewForm(f => ({ ...f, pocDataVolume: e.target.value }))} className={mainInp} /></MField></div>
            <div className="mt-4"><MField label="Description"><textarea placeholder="Brief description..." value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} rows={2} className={`${mainInp} resize-none`} /></MField></div>
          </div>

          <div>
            <SLabel>Dates &amp; Timeline</SLabel>
            <div className="grid grid-cols-2 gap-4">
              <MField label="POC Start Date" required><input type="date" value={newForm.plannedStart} onChange={e => setNewForm(f => ({ ...f, plannedStart: e.target.value }))} className={mainInp} /></MField>
              <MField label="POC End Date" required hint="7–14 days recommended"><input type="date" value={newForm.plannedEnd} onChange={e => setNewForm(f => ({ ...f, plannedEnd: e.target.value }))} className={mainInp} /></MField>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl shrink-0">
          <p className="text-xs text-gray-400">Fill phase details inline after creating the POC</p>
          <div className="flex gap-3">
            <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition">Cancel</button>
            <button onClick={handleCreate} disabled={createPoc.isPending}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
              {createPoc.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : <><Plus className="w-4 h-4" /> Create POC</>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const rowProps = (p: Project) => ({
    project: p, canEdit,
    expandedId, setExpandedId,
    isDeleteConfirm: deleteConfirmId === p.id,
    setDeleteConfirm: (v: boolean) => setDeleteConfirmId(v ? p.id : null),
    onDelete: handleDelete,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pre-sales</h1>
            <p className="text-sm text-gray-500">{filteredActive.length} active · {filteredArchived.length} archived</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={openModal} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
            <Plus className="w-4 h-4" /> New POC
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">All Outcomes</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
          <option value="extended">Extended</option>
          <option value="on_hold">On Hold</option>
          <option value="no_decision">No Decision</option>
        </select>
        <input type="text" placeholder="Filter by workload..." value={workloadFilter} onChange={e => setWorkloadFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white w-48" />
        <button onClick={() => setFlagFilter(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition ${flagFilter ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
          <Flag className="w-3.5 h-3.5" /> {flagFilter ? 'Flagged only' : 'Flag >30 days'}
        </button>
        {(outcomeFilter || workloadFilter || flagFilter) && (
          <button onClick={() => { setOutcomeFilter(''); setWorkloadFilter(''); setFlagFilter(false); }}
            className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Active POCs */}
      {filteredActive.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No active POC projects</p>
          {canEdit && <p className="text-sm mt-1">Click "New POC" to create the first one</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredActive.map(p => <PocRow key={p.id} {...rowProps(p)} />)}
        </div>
      )}

      {/* Archive */}
      {all.filter(p => isArchived(p)).length > 0 && (
        <div className="space-y-2">
          <button onClick={() => setArchiveExpanded(e => !e)}
            className="flex items-center gap-2.5 w-full px-4 py-3 bg-gray-100 hover:bg-gray-200/60 rounded-xl border border-gray-200 transition text-left">
            <Archive className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Archived POCs</span>
            <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full font-medium">{filteredArchived.length}</span>
            <span className="ml-auto text-xs text-gray-400">Won, Lost, or No Decision</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${archiveExpanded ? 'rotate-180' : ''}`} />
          </button>
          {archiveExpanded && (
            <div className="space-y-2">
              {filteredArchived.length === 0
                ? <div className="text-center text-sm text-gray-400 py-6">No archived POCs match the current filters</div>
                : filteredArchived.map(p => <div key={p.id} className="opacity-80"><PocRow {...rowProps(p)} /></div>)}
            </div>
          )}
        </div>
      )}

      {modal}
    </div>
  );
}
