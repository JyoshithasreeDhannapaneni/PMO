'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import {
  usePocProjects, useCreatePocProject, useUpdatePocProject, useDeletePocProject,
} from '@/hooks/useProjects';
import type { Project, PocPhaseStatus, PocOutcome } from '@/types';
import {
  FlaskConical, Plus, ChevronDown, ChevronUp, Loader2, Clock,
  CheckCircle2, XCircle, Circle, CalendarDays, User, ArrowRight,
  X, Save, Search, AlertTriangle, Gauge, Database, Flag,
  Target, Server, ClipboardList, Handshake, Trash2, Archive,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
type PhaseKey = 'pocQualificationStatus' | 'pocEnvSetupStatus' | 'pocTrialStatus' | 'pocValidationStatus' | 'pocOutcomeStatus';
type NoteKey  = 'pocQualificationNotes'  | 'pocEnvSetupNotes'  | 'pocTrialNotes'  | 'pocValidationNotes'  | 'pocOutcomeNotes';

// ── Phase config ──────────────────────────────────────────────────────────────
const POC_PHASES: {
  num: number; label: string; shortLabel: string;
  statusKey: PhaseKey; noteKey: NoteKey; description: string; icon: ReactNode;
}[] = [
  { num: 1, label: 'Qualification & Scoping', shortLabel: 'Qualification',
    statusKey: 'pocQualificationStatus', noteKey: 'pocQualificationNotes',
    description: 'Lock down platforms, data volume, and agreed success criteria.',
    icon: <Target className="w-4 h-4" /> },
  { num: 2, label: 'Environment Setup', shortLabel: 'Env Setup',
    statusKey: 'pocEnvSetupStatus', noteKey: 'pocEnvSetupNotes',
    description: 'Admin access, connector config, firewall clearance.',
    icon: <Server className="w-4 h-4" /> },
  { num: 3, label: 'Trial Migration Run', shortLabel: 'Trial Run',
    statusKey: 'pocTrialStatus', noteKey: 'pocTrialNotes',
    description: 'Execute migration, capture speed, error rate, permissions & metadata.',
    icon: <Gauge className="w-4 h-4" /> },
  { num: 4, label: 'Customer Validation', shortLabel: 'Validation',
    statusKey: 'pocValidationStatus', noteKey: 'pocValidationNotes',
    description: 'Formal review against success criteria. Every item gets pass/fail.',
    icon: <ClipboardList className="w-4 h-4" /> },
  { num: 5, label: 'Outcome & Handoff', shortLabel: 'Handoff',
    statusKey: 'pocOutcomeStatus', noteKey: 'pocOutcomeNotes',
    description: 'Record outcome and hand off to migration team with full brief.',
    icon: <Handshake className="w-4 h-4" /> },
];

// ── Style maps ────────────────────────────────────────────────────────────────
const PHASE_STATUS_CLS: Record<PocPhaseStatus, string> = {
  not_started: 'bg-gray-100 text-gray-500 border-gray-200',
  in_progress:  'bg-blue-50 text-blue-700 border-blue-200',
  blocked:      'bg-red-50 text-red-700 border-red-200',
  completed:    'bg-green-50 text-green-700 border-green-200',
};
const PHASE_RING_CLS: Record<PocPhaseStatus, string> = {
  not_started: 'border-gray-200 bg-white text-gray-400',
  in_progress:  'border-blue-400 bg-blue-50 text-blue-600',
  blocked:      'border-red-400 bg-red-50 text-red-600',
  completed:    'border-green-400 bg-green-100 text-green-700',
};
const PHASE_LINE_CLS: Record<PocPhaseStatus, string> = {
  not_started: 'bg-gray-200',
  in_progress:  'bg-blue-300',
  blocked:      'bg-red-300',
  completed:    'bg-green-400',
};
const STATUS_ICONS: Record<PocPhaseStatus, ReactNode> = {
  not_started: <Circle className="w-4 h-4" />,
  in_progress:  <Clock className="w-4 h-4" />,
  blocked:      <XCircle className="w-4 h-4" />,
  completed:    <CheckCircle2 className="w-4 h-4" />,
};
const STATUS_LABEL: Record<PocPhaseStatus, string> = {
  not_started: 'Not Started', in_progress: 'In Progress', blocked: 'Blocked', completed: 'Completed',
};
const OUTCOME_CFG: Record<string, { label: string; cls: string }> = {
  won:         { label: 'Won',         cls: 'bg-green-100 text-green-700 border-green-200' },
  lost:        { label: 'Lost',        cls: 'bg-red-100 text-red-700 border-red-200' },
  no_decision: { label: 'No Decision', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function pocDuration(p: Project): number | null {
  if (!p.plannedStart || !p.pocDeadline) return null;
  return Math.round((new Date(p.pocDeadline).getTime() - new Date(p.plannedStart).getTime()) / 86_400_000);
}
function durationCls(days: number | null): string {
  if (days === null) return 'text-gray-400';
  if (days > 30) return 'text-red-600 font-semibold';
  if (days > 14) return 'text-orange-500';
  return 'text-green-600';
}
function deadlineCls(d: string | null | undefined): string {
  if (!d) return '';
  const h = (new Date(d).getTime() - Date.now()) / 3_600_000;
  if (h < 0) return 'text-red-600 font-semibold';
  if (h < 48) return 'text-red-500 font-semibold';
  if (h < 168) return 'text-orange-500';
  return 'text-gray-500';
}
function formatDeadline(d: string | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  const h = (dt.getTime() - Date.now()) / 3_600_000;
  if (h < 0) return `Overdue since ${dt.toLocaleDateString()}`;
  if (h < 24) return `${Math.round(h)}h left`;
  return `${Math.floor(h / 24)}d left (${dt.toLocaleDateString()})`;
}
function isArchived(p: Project): boolean {
  return !!(p.pocOutcome) || p.pocOutcomeStatus === 'completed';
}

// ── Form defaults ─────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  name: '', customerName: '', accountManager: '', projectManager: '',
  planType: 'SILVER', plannedStart: '', plannedEnd: '', pocDeadline: '',
  customerContact: '', description: '', sourcePlatform: '', targetPlatform: '',
  pocSuccessCriteria: '', pocDataVolume: '',
  pocQualificationStatus: 'not_started' as PocPhaseStatus,
  pocEnvSetupStatus:      'not_started' as PocPhaseStatus,
  pocTrialStatus:         'not_started' as PocPhaseStatus,
  pocValidationStatus:    'not_started' as PocPhaseStatus,
  pocOutcomeStatus:       'not_started' as PocPhaseStatus,
  pocOutcome: '' as PocOutcome | '',
  pocMigrationSpeed: '', pocErrorRate: '',
  pocHandoffTo: '', pocHandoffDate: '', pocHandoffNotes: '',
};

const inputCls   = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white';
const smallInput = 'w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-800 placeholder-gray-400';

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2 mb-4">{children}</p>;
}
function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function IntactBadge({ value, label }: { value: boolean | null | undefined; label: string }) {
  if (value === true)  return <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" />{label} OK</span>;
  if (value === false) return <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />{label} Failed</span>;
  return null;
}
function IntactSelect({ value, onChange, label }: { value: boolean | null | undefined; onChange: (v: boolean | null) => void; label: string }) {
  const v = value === true ? 'yes' : value === false ? 'no' : 'unknown';
  return (
    <div className="space-y-1">
      <label className="text-xs text-gray-600">{label}</label>
      <select value={v} onChange={e => onChange(e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null)} className={smallInput}>
        <option value="unknown">Unknown</option>
        <option value="yes">Yes — intact</option>
        <option value="no">No — issues found</option>
      </select>
    </div>
  );
}

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
      <div onClick={() => setOpen(o => !o)} className="min-h-[44px] border border-gray-300 rounded-lg px-3 py-2 cursor-pointer bg-white flex items-start justify-between gap-2 hover:border-blue-400 transition">
        <div className="flex flex-wrap gap-1 flex-1">
          {selectedNames.length === 0
            ? <span className="text-gray-400 text-sm self-center">Select workload type(s)...</span>
            : selectedNames.map(n => <span key={n} className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">{n}</span>)}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
      </div>
      {open && (
        <div className="absolute z-[200] w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 bg-gray-50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input type="text" placeholder="Search types..." value={search} onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()}
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

// ── Horizontal phase stepper (inside expanded row) ────────────────────────────
function PhaseStepperView({ project: p, onQuickUpdate }: {
  project: Project;
  onQuickUpdate?: (id: string, key: PhaseKey, value: PocPhaseStatus) => void;
}) {
  const successCriteria = ((p as any).pocSuccessCriteria || '').split('\n').map((s: string) => s.trim()).filter(Boolean);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="min-w-[900px]">
        {/* Progress line + step circles */}
        <div className="flex items-center mb-6">
          {POC_PHASES.map((phase, i) => {
            const status: PocPhaseStatus = (p as any)[phase.statusKey] || 'not_started';
            return (
              <div key={phase.num} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center font-bold text-sm transition-all ${PHASE_RING_CLS[status]}`}>
                    {status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : <span>{phase.num}</span>}
                  </div>
                  <span className="text-xs mt-1.5 font-medium text-gray-600 text-center leading-tight whitespace-nowrap">{phase.shortLabel}</span>
                  <span className={`text-[10px] mt-0.5 font-medium ${PHASE_STATUS_CLS[status].split(' ')[1]}`}>{STATUS_LABEL[status]}</span>
                </div>
                {i < POC_PHASES.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mt-[-22px] ${PHASE_LINE_CLS[status]}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* 5 content columns */}
        <div className="grid grid-cols-5 gap-3">
          {POC_PHASES.map(phase => {
            const status: PocPhaseStatus = (p as any)[phase.statusKey] || 'not_started';
            const note: string = (p as any)[phase.noteKey] || '';
            return (
              <div key={phase.num} className={`rounded-xl border p-3 flex flex-col gap-2 ${status === 'blocked' ? 'border-red-200 bg-red-50/40' : 'border-gray-100 bg-gray-50'}`}>
                {/* Column header */}
                <div className="flex items-start justify-between gap-1">
                  <p className="text-xs font-semibold text-gray-700 leading-snug">{phase.label}</p>
                  {onQuickUpdate && (
                    <select value={status} onChange={e => onQuickUpdate(p.id, phase.statusKey, e.target.value as PocPhaseStatus)}
                      onClick={e => e.stopPropagation()}
                      className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white focus:outline-none shrink-0">
                      <option value="not_started">Not Started</option>
                      <option value="in_progress">In Progress</option>
                      <option value="blocked">Blocked</option>
                      <option value="completed">Completed</option>
                    </select>
                  )}
                </div>

                {/* Phase 1: platforms + data volume + success criteria */}
                {phase.num === 1 && (
                  <div className="space-y-1.5 text-xs text-gray-600">
                    {(p.sourcePlatform || p.targetPlatform) && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-medium text-gray-500">{p.sourcePlatform || '—'}</span>
                        <ArrowRight className="w-3 h-3 text-gray-400" />
                        <span className="font-medium text-gray-500">{p.targetPlatform || '—'}</span>
                      </div>
                    )}
                    {(p as any).pocDataVolume && (
                      <div className="flex items-center gap-1">
                        <Database className="w-3 h-3 text-gray-400 shrink-0" />
                        <span>{(p as any).pocDataVolume}</span>
                      </div>
                    )}
                    {successCriteria.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Success Criteria</p>
                        <ul className="space-y-0.5">
                          {successCriteria.map((c: string, i: number) => (
                            <li key={i} className="flex items-start gap-1 text-[11px] text-gray-600"><span className="text-blue-400 mt-0.5 shrink-0">•</span>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Phase 2: blocked banner */}
                {phase.num === 2 && status === 'blocked' && (
                  <div className="flex items-start gap-1.5 bg-red-100 border border-red-200 rounded-lg p-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-700 leading-snug">{note || 'Blocked — add details in notes.'}</p>
                  </div>
                )}

                {/* Phase 3: metrics */}
                {phase.num === 3 && (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      {p.pocMigrationSpeed != null && (
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 text-center">
                          <p className="text-xs font-bold text-blue-700">{p.pocMigrationSpeed}</p>
                          <p className="text-[10px] text-blue-400">GB/h</p>
                        </div>
                      )}
                      {p.pocErrorRate != null && (
                        <div className="bg-orange-50 border border-orange-100 rounded-lg p-2 text-center">
                          <p className="text-xs font-bold text-orange-700">{p.pocErrorRate}%</p>
                          <p className="text-[10px] text-orange-400">Errors</p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <IntactBadge value={(p as any).pocPermissionsIntact} label="Permissions" />
                      <IntactBadge value={(p as any).pocMetadataIntact}    label="Metadata" />
                    </div>
                  </div>
                )}

                {/* Phase 4: validation notes with criteria reference */}
                {phase.num === 4 && !note && successCriteria.length > 0 && (
                  <p className="text-[11px] text-gray-400 italic">Validate {successCriteria.length} criteria from Phase 1.</p>
                )}

                {/* Phase 5: handoff info */}
                {phase.num === 5 && (p.pocHandoffTo || p.pocHandoffDate || (p as any).pocHandoffNotes) && (
                  <div className="space-y-1.5">
                    {(p.pocHandoffTo || p.pocHandoffDate) && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-2">
                        <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-0.5">Handoff</p>
                        {p.pocHandoffTo && <p className="text-xs text-green-700 font-medium">{p.pocHandoffTo}</p>}
                        {p.pocHandoffDate && <p className="text-[11px] text-green-500">{new Date(p.pocHandoffDate).toLocaleDateString()}</p>}
                      </div>
                    )}
                    {(p as any).pocHandoffNotes && (
                      <p className="text-[11px] text-gray-500 leading-relaxed">{(p as any).pocHandoffNotes}</p>
                    )}
                  </div>
                )}

                {/* Notes (skip blocked phase 2 note — already shown in banner) */}
                {note && !(phase.num === 2 && status === 'blocked') && (
                  <p className="text-[11px] text-gray-500 leading-relaxed">{note}</p>
                )}

                {/* Empty state hint */}
                {!note && phase.num !== 3 && phase.num !== 5 &&
                 !(phase.num === 1 && (p.sourcePlatform || p.targetPlatform || successCriteria.length > 0)) &&
                 !(phase.num === 4 && successCriteria.length > 0) && (
                  <p className="text-[10px] text-gray-300 italic leading-snug">{phase.description}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Customer contact row */}
        {p.customerContact && (
          <div className="flex items-center gap-2 text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
            <User className="w-3 h-3" />Customer contact: <strong className="text-gray-600">{p.customerContact}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Edit form (stacked phases, all fields) ────────────────────────────────────
function EditPocForm({
  form, setForm, onSave, onCancel, isSaving, successCriteriaRef,
}: {
  form: Record<string, any>;
  setForm: (fn: (prev: Record<string, any>) => Record<string, any>) => void;
  onSave: () => void; onCancel: () => void; isSaving: boolean; successCriteriaRef: string;
}) {
  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }
  return (
    <div className="space-y-4">
      {/* Phase 1 */}
      <PhaseEditSection num={1} label="Qualification & Scoping" statusKey="pocQualificationStatus" form={form} set={set}>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Source Platform</label>
            <input type="text" value={form.sourcePlatform || ''} onChange={e => set('sourcePlatform', e.target.value)} placeholder="e.g. Google Workspace" className={smallInput} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Target Platform</label>
            <input type="text" value={form.targetPlatform || ''} onChange={e => set('targetPlatform', e.target.value)} placeholder="e.g. Microsoft 365" className={smallInput} />
          </div>
          <div className="space-y-1 col-span-2">
            <label className="text-xs text-gray-600">Data Volume</label>
            <input type="text" value={form.pocDataVolume || ''} onChange={e => set('pocDataVolume', e.target.value)} placeholder="e.g. ~50 GB, 200 mailboxes" className={smallInput} />
          </div>
        </div>
        <div className="space-y-1 mt-2">
          <label className="text-xs font-medium text-gray-600">Success Criteria <span className="font-normal text-gray-400">(one per line)</span></label>
          <textarea value={form.pocSuccessCriteria || ''} onChange={e => set('pocSuccessCriteria', e.target.value)}
            placeholder={"Email delivery rate > 99.5%\nZero data loss\nMigration completes in < 8 hours"}
            rows={4} className={`${smallInput} resize-none font-mono`} />
        </div>
        <div className="space-y-1 mt-2">
          <label className="text-xs text-gray-600">Qualification Notes</label>
          <textarea value={form.pocQualificationNotes || ''} onChange={e => set('pocQualificationNotes', e.target.value)}
            placeholder="Scope notes, stakeholders, agreed parameters..." rows={2} className={`${smallInput} resize-none`} />
        </div>
      </PhaseEditSection>

      {/* Phase 2 */}
      <PhaseEditSection num={2} label="Environment Setup" statusKey="pocEnvSetupStatus" form={form} set={set}>
        {form.pocEnvSetupStatus === 'blocked' && (
          <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Blocked — document the blocker in the notes below.
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs text-gray-600">Notes</label>
          <textarea value={form.pocEnvSetupNotes || ''} onChange={e => set('pocEnvSetupNotes', e.target.value)}
            placeholder="Admin access, connector config, firewall rules, blocker details..." rows={3} className={`${smallInput} resize-none`} />
        </div>
      </PhaseEditSection>

      {/* Phase 3 */}
      <PhaseEditSection num={3} label="Trial Migration Run" statusKey="pocTrialStatus" form={form} set={set}>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Migration Speed (GB/h)</label>
            <input type="number" value={form.pocMigrationSpeed || ''} onChange={e => set('pocMigrationSpeed', e.target.value)} placeholder="e.g. 47" min="0" className={smallInput} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Error Rate (%)</label>
            <input type="number" value={form.pocErrorRate || ''} onChange={e => set('pocErrorRate', e.target.value)} placeholder="e.g. 0.8" min="0" max="100" step="0.1" className={smallInput} />
          </div>
          <IntactSelect value={form.pocPermissionsIntact} onChange={v => set('pocPermissionsIntact', v)} label="Permissions Intact?" />
          <IntactSelect value={form.pocMetadataIntact}   onChange={v => set('pocMetadataIntact', v)}   label="Metadata Intact?" />
        </div>
        <div className="space-y-1 mt-2">
          <label className="text-xs text-gray-600">Trial Notes</label>
          <textarea value={form.pocTrialNotes || ''} onChange={e => set('pocTrialNotes', e.target.value)}
            placeholder="Run observations, issues, proof points..." rows={2} className={`${smallInput} resize-none`} />
        </div>
      </PhaseEditSection>

      {/* Phase 4 */}
      <PhaseEditSection num={4} label="Customer Validation" statusKey="pocValidationStatus" form={form} set={set}>
        {successCriteriaRef && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-2 mb-2">
            <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide mb-1">Phase 1 Criteria (reference)</p>
            {successCriteriaRef.split('\n').filter(Boolean).map((c: string, i: number) => (
              <p key={i} className="text-xs text-blue-600">• {c}</p>
            ))}
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs text-gray-600">Validation Notes</label>
          <textarea value={form.pocValidationNotes || ''} onChange={e => set('pocValidationNotes', e.target.value)}
            placeholder={"✓ Email delivery rate: Pass (99.8%)\n✓ Zero data loss: Pass\n✗ Speed: Fail (42 vs target 50 GB/h)"}
            rows={4} className={`${smallInput} resize-none font-mono`} />
        </div>
      </PhaseEditSection>

      {/* Phase 5 */}
      <PhaseEditSection num={5} label="Outcome & Handoff" statusKey="pocOutcomeStatus" form={form} set={set}>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Outcome</label>
            <select value={form.pocOutcome || ''} onChange={e => set('pocOutcome', e.target.value)} className={smallInput}>
              <option value="">In Progress</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
              <option value="no_decision">No Decision</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">POC Deadline</label>
            <input type="date" value={form.pocDeadline || ''} onChange={e => set('pocDeadline', e.target.value)} className={smallInput} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Handoff To</label>
            <input type="text" value={form.pocHandoffTo || ''} onChange={e => set('pocHandoffTo', e.target.value)} placeholder="Migration manager name" className={smallInput} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Handoff Date</label>
            <input type="date" value={form.pocHandoffDate || ''} onChange={e => set('pocHandoffDate', e.target.value)} className={smallInput} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Customer Contact</label>
            <input type="text" value={form.customerContact || ''} onChange={e => set('customerContact', e.target.value)} className={smallInput} />
          </div>
        </div>
        <div className="space-y-1 mt-2">
          <label className="text-xs font-medium text-gray-600">Handoff Brief <span className="font-normal text-gray-400">(full context for migration manager)</span></label>
          <textarea value={form.pocHandoffNotes || ''} onChange={e => set('pocHandoffNotes', e.target.value)}
            placeholder="Key findings, agreed scope, stakeholders, gotchas for migration team..."
            rows={4} className={`${smallInput} resize-none`} />
        </div>
        <div className="space-y-1 mt-2">
          <label className="text-xs text-gray-600">Outcome Notes</label>
          <textarea value={form.pocOutcomeNotes || ''} onChange={e => set('pocOutcomeNotes', e.target.value)}
            placeholder="Why won/lost, next steps..." rows={2} className={`${smallInput} resize-none`} />
        </div>
      </PhaseEditSection>

      <div className="flex gap-2 pt-1">
        <button onClick={onSave} disabled={isSaving}
          className="flex items-center gap-1.5 text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Changes
        </button>
        <button onClick={onCancel} className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-100 transition">Cancel</button>
      </div>
    </div>
  );
}

function PhaseEditSection({ num, label, statusKey, form, set, children }: {
  num: number; label: string; statusKey: PhaseKey;
  form: Record<string, any>; set: (k: string, v: any) => void; children: ReactNode;
}) {
  const status: PocPhaseStatus = form[statusKey] || 'not_started';
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-gray-500 bg-white border border-gray-200 rounded-full">{num}</span>
          <span className="text-xs font-semibold text-gray-700">{label}</span>
        </div>
        <select value={status} onChange={e => set(statusKey, e.target.value)}
          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
          <option value="not_started">Not Started</option>
          <option value="in_progress">In Progress</option>
          <option value="blocked">Blocked</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      <div className="px-3 py-3 space-y-2">{children}</div>
    </div>
  );
}

// ── POC row (single item in the list) ─────────────────────────────────────────
function PocRow({
  project: p, canEdit, expandedId, setExpandedId,
  editingId, setEditingId, editForm, setEditForm,
  onSave, onDelete, isSavingId, isDeleteConfirm, setDeleteConfirm,
  onQuickUpdate,
}: {
  project: Project; canEdit: boolean;
  expandedId: string | null; setExpandedId: (id: string | null) => void;
  editingId: string | null; setEditingId: (id: string | null) => void;
  editForm: Record<string, any>; setEditForm: (fn: (p: Record<string, any>) => Record<string, any>) => void;
  onSave: (id: string) => void;
  onDelete: (id: string) => void;
  isSavingId: boolean; isDeleteConfirm: boolean;
  setDeleteConfirm: (v: boolean) => void;
  onQuickUpdate: (id: string, key: PhaseKey, value: PocPhaseStatus) => void;
}) {
  const isExpanded = expandedId === p.id;
  const isEditing  = editingId  === p.id;
  const outcome    = p.pocOutcome ? OUTCOME_CFG[p.pocOutcome] : null;
  const workloads  = (p.migrationTypes || '').split(',').map(w => w.trim()).filter(Boolean);
  const days       = pocDuration(p);
  const isFlagged  = days !== null && days > 30 && p.pocOutcomeStatus !== 'completed';

  function startEdit() {
    setEditingId(p.id);
    setEditForm(() => ({
      pocQualificationStatus: p.pocQualificationStatus || 'not_started',
      pocEnvSetupStatus:      p.pocEnvSetupStatus      || 'not_started',
      pocTrialStatus:         p.pocTrialStatus         || 'not_started',
      pocValidationStatus:    p.pocValidationStatus    || 'not_started',
      pocOutcomeStatus:       p.pocOutcomeStatus       || 'not_started',
      pocQualificationNotes:  (p as any).pocQualificationNotes  || '',
      pocEnvSetupNotes:       (p as any).pocEnvSetupNotes       || '',
      pocTrialNotes:          (p as any).pocTrialNotes          || '',
      pocValidationNotes:     (p as any).pocValidationNotes     || '',
      pocOutcomeNotes:        (p as any).pocOutcomeNotes        || '',
      pocDeadline:      p.pocDeadline    ? p.pocDeadline.substring(0, 10)    : '',
      pocOutcome:       p.pocOutcome     || '',
      pocHandoffTo:     p.pocHandoffTo   || '',
      pocHandoffDate:   p.pocHandoffDate ? p.pocHandoffDate.substring(0, 10) : '',
      pocHandoffNotes:  (p as any).pocHandoffNotes  || '',
      pocMigrationSpeed: p.pocMigrationSpeed != null ? String(p.pocMigrationSpeed) : '',
      pocErrorRate:      p.pocErrorRate      != null ? String(p.pocErrorRate)      : '',
      customerContact:   p.customerContact   || '',
      pocSuccessCriteria:(p as any).pocSuccessCriteria || '',
      pocDataVolume:     (p as any).pocDataVolume     || '',
      pocPermissionsIntact:(p as any).pocPermissionsIntact ?? null,
      pocMetadataIntact:   (p as any).pocMetadataIntact   ?? null,
      sourcePlatform: p.sourcePlatform || '',
      targetPlatform: p.targetPlatform || '',
    }));
  }

  return (
    <div className={`bg-white rounded-xl border transition-all ${isFlagged ? 'border-red-200 shadow-sm shadow-red-50' : 'border-gray-200'} ${isExpanded ? 'shadow-md' : 'hover:shadow-sm'}`}>
      {/* Row header */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={() => { setExpandedId(isExpanded ? null : p.id); setEditingId(null); }}>
        {/* Customer + project name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 capitalize">{p.customerName}</span>
            <span className="text-xs text-gray-400 capitalize truncate max-w-[160px]">{p.name}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {workloads.map(w => <span key={w} className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded-full">{w}</span>)}
          </div>
        </div>

        {/* Owners */}
        <div className="hidden md:flex flex-col text-xs text-gray-500 shrink-0 w-44">
          <span className="flex items-center gap-1"><FlaskConical className="w-3 h-3 text-blue-400" />{p.projectManager || '—'}</span>
          {p.accountManager && <span className="flex items-center gap-1"><User className="w-3 h-3 text-gray-400" />{p.accountManager}</span>}
        </div>

        {/* Duration + deadline */}
        <div className="hidden lg:flex flex-col items-end text-xs shrink-0 w-28">
          {days !== null && <span className={`flex items-center gap-1 ${durationCls(days)}`}><CalendarDays className="w-3 h-3" />{days}-day POC{isFlagged && <AlertTriangle className="w-3 h-3" />}</span>}
          {p.pocDeadline && <span className={`flex items-center gap-1 ${deadlineCls(p.pocDeadline)}`}><Clock className="w-3 h-3" />{formatDeadline(p.pocDeadline)}</span>}
        </div>

        {/* Compact phase strip */}
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {POC_PHASES.map((phase, i) => {
            const status: PocPhaseStatus = (p as any)[phase.statusKey] || 'not_started';
            return (
              <div key={phase.num} className="flex items-center gap-1" title={`${phase.shortLabel}: ${STATUS_LABEL[status]}`}>
                <div className={`w-2.5 h-2.5 rounded-full ${PHASE_LINE_CLS[status]}`} />
                {i < POC_PHASES.length - 1 && <div className="w-3 h-px bg-gray-200" />}
              </div>
            );
          })}
        </div>

        {/* Outcome badge */}
        <div className="shrink-0">
          {outcome
            ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${outcome.cls}`}>{outcome.label}</span>
            : <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-medium">In Progress</span>}
        </div>

        {/* Delete button */}
        {canEdit && (
          <div className="shrink-0" onClick={e => e.stopPropagation()}>
            {isDeleteConfirm ? (
              <div className="flex items-center gap-1">
                <button onClick={() => onDelete(p.id)}
                  className="text-xs px-2 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition">Delete</button>
                <button onClick={() => setDeleteConfirm(false)}
                  className="text-xs px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-100 transition">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setDeleteConfirm(true)}
                className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete POC">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50/50">
          {canEdit && !isEditing && (
            <div className="flex justify-end mb-4">
              <button onClick={startEdit} className="text-sm text-blue-600 hover:underline font-medium">Edit POC Details</button>
            </div>
          )}
          {isEditing ? (
            <EditPocForm
              form={editForm} setForm={setEditForm}
              onSave={() => onSave(p.id)}
              onCancel={() => setEditingId(null)}
              isSaving={isSavingId}
              successCriteriaRef={(p as any).pocSuccessCriteria || ''}
            />
          ) : (
            <PhaseStepperView project={p} onQuickUpdate={canEdit ? onQuickUpdate : undefined} />
          )}
        </div>
      )}
    </div>
  );
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({ ...EMPTY_FORM });
  const [selectedMigrationTypes, setSelectedMigrationTypes] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [archiveExpanded, setArchiveExpanded] = useState(false);

  useEffect(() => setMounted(true), []);

  const { data, isLoading, error } = usePocProjects();
  const createPoc = useCreatePocProject();
  const updatePoc = useUpdatePocProject();
  const deletePoc = useDeletePocProject();

  const allProjects: Project[] = data?.data || [];
  const activeProjects  = allProjects.filter(p => !isArchived(p));
  const archivedProjects = allProjects.filter(p => isArchived(p));

  function applyFilters(list: Project[]) {
    return list.filter(p => {
      if (outcomeFilter && p.pocOutcome !== outcomeFilter) return false;
      if (workloadFilter && !(p.migrationTypes || '').toLowerCase().includes(workloadFilter.toLowerCase())) return false;
      if (flagFilter) { const d = pocDuration(p); if (!d || d <= 30 || p.pocOutcomeStatus === 'completed') return false; }
      return true;
    });
  }
  const filteredActive   = applyFilters(activeProjects);
  const filteredArchived = applyFilters(archivedProjects);

  function openModal() { setShowNewModal(true); setNewForm({ ...EMPTY_FORM }); setSelectedMigrationTypes([]); }
  function closeModal() { setShowNewModal(false); setNewForm({ ...EMPTY_FORM }); setSelectedMigrationTypes([]); }

  async function saveEdit(id: string) {
    try {
      await updatePoc.mutateAsync({
        id,
        data: {
          ...editForm,
          pocMigrationSpeed: editForm.pocMigrationSpeed ? Number(editForm.pocMigrationSpeed) : null,
          pocErrorRate:      editForm.pocErrorRate      ? Number(editForm.pocErrorRate)      : null,
          pocOutcome:        editForm.pocOutcome || null,
        },
      });
      showToast('success', 'POC updated');
      setEditingId(null);
    } catch {
      showToast('error', 'Failed to update POC');
    }
  }

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
    const migrationTypesStr = selectedMigrationTypes
      .map(id => allMigrationTypes.find((t: any) => t.id === id)?.name || id).join(', ');
    try {
      await createPoc.mutateAsync({
        ...newForm,
        migrationTypes: migrationTypesStr,
        pocMigrationSpeed: newForm.pocMigrationSpeed ? Number(newForm.pocMigrationSpeed) : null,
        pocErrorRate:      newForm.pocErrorRate      ? Number(newForm.pocErrorRate)      : null,
        pocOutcome:        newForm.pocOutcome        || null,
        pocDeadline:       newForm.pocDeadline       || null,
        pocHandoffDate:    newForm.pocHandoffDate    || null,
        pocSuccessCriteria: newForm.pocSuccessCriteria || null,
        pocDataVolume:      newForm.pocDataVolume      || null,
        pocHandoffNotes:    newForm.pocHandoffNotes    || null,
      });
      showToast('success', 'POC project created');
      closeModal();
    } catch {
      showToast('error', 'Failed to create POC project');
    }
  }

  async function quickUpdatePhase(id: string, key: PhaseKey, value: PocPhaseStatus) {
    try {
      await updatePoc.mutateAsync({ id, data: { [key]: value } });
      showToast('success', 'Phase updated');
    } catch {
      showToast('error', 'Update failed');
    }
  }

  const rowProps = (p: Project) => ({
    project: p, canEdit,
    expandedId, setExpandedId,
    editingId, setEditingId,
    editForm, setEditForm,
    onSave: saveEdit,
    onDelete: handleDelete,
    isSavingId: updatePoc.isPending,
    isDeleteConfirm: deleteConfirmId === p.id,
    setDeleteConfirm: (v: boolean) => setDeleteConfirmId(v ? p.id : null),
    onQuickUpdate: quickUpdatePhase,
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  if (error)     return <div className="p-6 text-red-500">Failed to load POC projects</div>;

  // ── Modal ──────────────────────────────────────────────────────────────────
  const modal = showNewModal && mounted ? createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onClick={closeModal}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: 'calc(100vh - 2rem)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 bg-blue-600 text-white rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-5 h-5" />
            <div>
              <h2 className="text-lg font-bold leading-tight">New POC Project</h2>
              <p className="text-xs text-blue-100">7–14 day deadline is standard. Flag anything exceeding 30 days.</p>
            </div>
          </div>
          <button onClick={closeModal} className="p-1.5 hover:bg-blue-500 rounded-lg transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          <div>
            <SectionLabel>Basic Information</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Project Name" required><input type="text" placeholder="e.g. Acme Corp POC" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} className={inputCls} /></Field>
              <Field label="Customer Name" required><input type="text" placeholder="e.g. Acme Corporation" value={newForm.customerName} onChange={e => setNewForm(f => ({ ...f, customerName: e.target.value }))} className={inputCls} /></Field>
              <Field label="Pre-Sales Owner"><input type="text" placeholder="Who is running this POC?" value={newForm.projectManager} onChange={e => setNewForm(f => ({ ...f, projectManager: e.target.value }))} className={inputCls} /></Field>
              <Field label="Account Manager"><input type="text" placeholder="Account Manager name" value={newForm.accountManager} onChange={e => setNewForm(f => ({ ...f, accountManager: e.target.value }))} className={inputCls} /></Field>
              <Field label="Customer Contact"><input type="text" placeholder="Customer point of contact" value={newForm.customerContact} onChange={e => setNewForm(f => ({ ...f, customerContact: e.target.value }))} className={inputCls} /></Field>
              <Field label="Plan Type">
                <select value={newForm.planType} onChange={e => setNewForm(f => ({ ...f, planType: e.target.value }))} className={inputCls}>
                  <option value="BRONZE">BRONZE</option><option value="SILVER">SILVER</option>
                  <option value="GOLD">GOLD</option><option value="PLATINUM">PLATINUM</option>
                </select>
              </Field>
            </div>
            <div className="mt-4"><Field label="Workload / Migration Types"><MigrationTypePicker selected={selectedMigrationTypes} onChange={setSelectedMigrationTypes} allTypes={allMigrationTypes as any} /></Field></div>
            <div className="mt-4"><Field label="Description"><textarea placeholder="Brief description..." value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} rows={2} className={`${inputCls} resize-none`} /></Field></div>
          </div>

          <div>
            <SectionLabel>Dates &amp; Timeline</SectionLabel>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Planned Start" required><input type="date" value={newForm.plannedStart} onChange={e => setNewForm(f => ({ ...f, plannedStart: e.target.value }))} className={inputCls} /></Field>
              <Field label="Planned End" required><input type="date" value={newForm.plannedEnd} onChange={e => setNewForm(f => ({ ...f, plannedEnd: e.target.value }))} className={inputCls} /></Field>
              <Field label="POC Deadline" hint="7–14 days recommended"><input type="date" value={newForm.pocDeadline} onChange={e => setNewForm(f => ({ ...f, pocDeadline: e.target.value }))} className={inputCls} /></Field>
            </div>
          </div>

          <div>
            <SectionLabel>Phase 1 — Qualification &amp; Scoping</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Source Platform"><input type="text" placeholder="e.g. Google Workspace" value={newForm.sourcePlatform} onChange={e => setNewForm(f => ({ ...f, sourcePlatform: e.target.value }))} className={inputCls} /></Field>
              <Field label="Target Platform"><input type="text" placeholder="e.g. Microsoft 365" value={newForm.targetPlatform} onChange={e => setNewForm(f => ({ ...f, targetPlatform: e.target.value }))} className={inputCls} /></Field>
              <Field label="Data Volume" hint="e.g. ~50 GB, 200 mailboxes"><input type="text" placeholder="Approx. data size and scope" value={newForm.pocDataVolume} onChange={e => setNewForm(f => ({ ...f, pocDataVolume: e.target.value }))} className={inputCls} /></Field>
            </div>
            <div className="mt-4">
              <Field label="Success Criteria" hint="One per line. Phase 4 validates against these.">
                <textarea placeholder={"Email delivery rate > 99.5%\nZero data loss\nMigration completes in < 8 hours"} value={newForm.pocSuccessCriteria} onChange={e => setNewForm(f => ({ ...f, pocSuccessCriteria: e.target.value }))} rows={4} className={`${inputCls} resize-none font-mono text-xs`} />
              </Field>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex-shrink-0">
          <p className="text-xs text-gray-400">Fields marked <span className="text-red-500">*</span> are required</p>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">POC Projects</h1>
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
        <select value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">All Outcomes</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
          <option value="no_decision">No Decision</option>
        </select>
        <input type="text" placeholder="Filter by workload..." value={workloadFilter}
          onChange={e => setWorkloadFilter(e.target.value)}
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

      {/* Archive section */}
      {(filteredArchived.length > 0 || archivedProjects.length > 0) && (
        <div className="space-y-2">
          <button
            onClick={() => setArchiveExpanded(e => !e)}
            className="flex items-center gap-2.5 w-full px-4 py-3 bg-gray-100 hover:bg-gray-150 rounded-xl border border-gray-200 transition text-left">
            <Archive className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Archived POCs</span>
            <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full font-medium">{filteredArchived.length}</span>
            <span className="ml-auto text-xs text-gray-400">Completed POCs with a defined outcome</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${archiveExpanded ? 'rotate-180' : ''}`} />
          </button>

          {archiveExpanded && (
            <div className="space-y-2">
              {filteredArchived.length === 0 ? (
                <div className="text-center text-sm text-gray-400 py-6">No archived POCs match the current filters</div>
              ) : (
                filteredArchived.map(p => (
                  <div key={p.id} className="opacity-85">
                    <PocRow {...rowProps(p)} />
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {modal}
    </div>
  );
}
