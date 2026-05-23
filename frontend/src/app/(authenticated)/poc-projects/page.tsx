'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import { usePocProjects, useCreatePocProject, useUpdatePocProject } from '@/hooks/useProjects';
import type { Project, PocPhaseStatus, PocOutcome } from '@/types';
import {
  FlaskConical, Plus, ChevronDown, ChevronUp, Loader2,
  Clock, CheckCircle2, XCircle, Circle, Minus,
  CalendarDays, User, ArrowRight, X, Save, Search,
} from 'lucide-react';

type PhaseKey = 'pocQualificationStatus' | 'pocEnvSetupStatus' | 'pocTrialStatus' | 'pocValidationStatus' | 'pocOutcomeStatus';
type NoteKey = 'pocQualificationNotes' | 'pocEnvSetupNotes' | 'pocTrialNotes' | 'pocValidationNotes' | 'pocOutcomeNotes';

const POC_PHASES: { label: string; statusKey: PhaseKey; noteKey: NoteKey }[] = [
  { label: 'Qualification', statusKey: 'pocQualificationStatus', noteKey: 'pocQualificationNotes' },
  { label: 'Env Setup',     statusKey: 'pocEnvSetupStatus',      noteKey: 'pocEnvSetupNotes' },
  { label: 'Trial Run',     statusKey: 'pocTrialStatus',         noteKey: 'pocTrialNotes' },
  { label: 'Validation',    statusKey: 'pocValidationStatus',    noteKey: 'pocValidationNotes' },
  { label: 'Outcome',       statusKey: 'pocOutcomeStatus',       noteKey: 'pocOutcomeNotes' },
];

const PHASE_COLORS: Record<PocPhaseStatus, string> = {
  not_started: 'text-gray-400',
  in_progress:  'text-blue-500',
  blocked:      'text-red-500',
  completed:    'text-green-500',
};

const PHASE_ICONS: Record<PocPhaseStatus, React.ReactNode> = {
  not_started: <Circle className="w-4 h-4" />,
  in_progress:  <Clock className="w-4 h-4" />,
  blocked:      <XCircle className="w-4 h-4" />,
  completed:    <CheckCircle2 className="w-4 h-4" />,
};

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  won:         { label: 'Won',         color: 'bg-green-100 text-green-700' },
  lost:        { label: 'Lost',        color: 'bg-red-100 text-red-700' },
  no_decision: { label: 'No Decision', color: 'bg-yellow-100 text-yellow-700' },
};

function deadlineColor(deadline: string | null | undefined): string {
  if (!deadline) return '';
  const h = (new Date(deadline).getTime() - Date.now()) / 3_600_000;
  if (h < 0) return 'text-red-600 font-semibold';
  if (h < 48) return 'text-red-500 font-semibold';
  if (h < 168) return 'text-orange-500';
  return 'text-gray-600';
}

function formatDeadline(deadline: string | null | undefined): string {
  if (!deadline) return '—';
  const d = new Date(deadline);
  const h = (d.getTime() - Date.now()) / 3_600_000;
  if (h < 0) return `Overdue (${d.toLocaleDateString()})`;
  if (h < 24) return `${Math.round(h)}h left`;
  return `${Math.floor(h / 24)}d left (${d.toLocaleDateString()})`;
}

const EMPTY_FORM = {
  name: '', customerName: '', accountManager: '', projectManager: '',
  planType: 'SILVER', plannedStart: '', plannedEnd: '', pocDeadline: '',
  customerContact: '', description: '',
  pocQualificationStatus: 'not_started' as PocPhaseStatus,
  pocEnvSetupStatus: 'not_started' as PocPhaseStatus,
  pocTrialStatus: 'not_started' as PocPhaseStatus,
  pocValidationStatus: 'not_started' as PocPhaseStatus,
  pocOutcomeStatus: 'not_started' as PocPhaseStatus,
  pocOutcome: '' as PocOutcome | '',
  pocMigrationSpeed: '', pocErrorRate: '', pocHandoffTo: '', pocHandoffDate: '',
};

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white';

// ── Migration types multi-select dropdown ────────────────────────────────────
function MigrationTypePicker({
  selected,
  onChange,
  allTypes,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
  allTypes: { id: string; name: string; enabled: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const enabled = allTypes.filter(t => t.enabled);
  const visible = enabled.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  }

  const selectedNames = selected
    .map(id => enabled.find(t => t.id === id)?.name || id)
    .filter(Boolean);

  return (
    <div className="relative" ref={ref}>
      <div
        onClick={() => setOpen(o => !o)}
        className="min-h-[44px] border border-gray-300 rounded-lg px-3 py-2 cursor-pointer bg-white flex items-start justify-between gap-2 hover:border-blue-400 transition focus:ring-2 focus:ring-blue-500"
      >
        <div className="flex flex-wrap gap-1 flex-1">
          {selectedNames.length === 0 ? (
            <span className="text-gray-400 text-sm self-center">Select workload type(s)...</span>
          ) : (
            selectedNames.map(name => (
              <span key={name} className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                {name}
              </span>
            ))
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
      </div>

      {open && (
        <div className="absolute z-[200] w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 bg-gray-50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search types..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No types found</p>
            ) : (
              visible.map(type => (
                <label
                  key={type.id}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-50 last:border-0"
                  onClick={e => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(type.id)}
                    onChange={() => toggle(type.id)}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300"
                  />
                  <span className="text-gray-800">{type.name}</span>
                </label>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <div className="p-2 border-t border-gray-100 bg-gray-50">
              <button
                onClick={e => { e.stopPropagation(); onChange([]); }}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Clear all selections
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Form section label ───────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2 mb-4">
      {children}
    </p>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function PocProjectsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'PRE_SALES';

  const allMigrationTypes = settings.migrationTypes || [];

  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [workloadFilter, setWorkloadFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({ ...EMPTY_FORM });
  const [selectedMigrationTypes, setSelectedMigrationTypes] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const { data, isLoading, error } = usePocProjects();
  const createPoc = useCreatePocProject();
  const updatePoc = useUpdatePocProject();

  const projects: Project[] = data?.data || [];

  const filtered = projects.filter(p => {
    if (outcomeFilter && p.pocOutcome !== outcomeFilter) return false;
    if (workloadFilter && !(p.migrationTypes || '').toLowerCase().includes(workloadFilter.toLowerCase())) return false;
    return true;
  });

  function openModal() { setShowNewModal(true); setNewForm({ ...EMPTY_FORM }); setSelectedMigrationTypes([]); }
  function closeModal() { setShowNewModal(false); setNewForm({ ...EMPTY_FORM }); setSelectedMigrationTypes([]); }

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id);
    setEditingId(null);
  }

  function startEdit(p: Project) {
    setEditingId(p.id);
    setEditForm({
      pocQualificationStatus: p.pocQualificationStatus || 'not_started',
      pocEnvSetupStatus: p.pocEnvSetupStatus || 'not_started',
      pocTrialStatus: p.pocTrialStatus || 'not_started',
      pocValidationStatus: p.pocValidationStatus || 'not_started',
      pocOutcomeStatus: p.pocOutcomeStatus || 'not_started',
      pocQualificationNotes: (p as any).pocQualificationNotes || '',
      pocEnvSetupNotes: (p as any).pocEnvSetupNotes || '',
      pocTrialNotes: (p as any).pocTrialNotes || '',
      pocValidationNotes: (p as any).pocValidationNotes || '',
      pocOutcomeNotes: (p as any).pocOutcomeNotes || '',
      pocDeadline: p.pocDeadline ? p.pocDeadline.substring(0, 10) : '',
      pocOutcome: p.pocOutcome || '',
      pocHandoffTo: p.pocHandoffTo || '',
      pocHandoffDate: p.pocHandoffDate ? p.pocHandoffDate.substring(0, 10) : '',
      pocMigrationSpeed: p.pocMigrationSpeed != null ? String(p.pocMigrationSpeed) : '',
      pocErrorRate: p.pocErrorRate != null ? String(p.pocErrorRate) : '',
      customerContact: p.customerContact || '',
    });
  }

  async function saveEdit(id: string) {
    try {
      await updatePoc.mutateAsync({
        id,
        data: {
          ...editForm,
          pocMigrationSpeed: editForm.pocMigrationSpeed ? Number(editForm.pocMigrationSpeed) : null,
          pocErrorRate: editForm.pocErrorRate ? Number(editForm.pocErrorRate) : null,
          pocOutcome: editForm.pocOutcome || null,
        },
      });
      showToast('success', 'POC updated');
      setEditingId(null);
    } catch {
      showToast('error', 'Failed to update POC');
    }
  }

  async function handleCreate() {
    if (!newForm.name || !newForm.customerName || !newForm.plannedStart || !newForm.plannedEnd) {
      showToast('error', 'Please fill in all required fields');
      return;
    }
    const migrationTypesStr = selectedMigrationTypes
      .map(id => allMigrationTypes.find((t: any) => t.id === id)?.name || id)
      .join(', ');
    try {
      await createPoc.mutateAsync({
        ...newForm,
        migrationTypes: migrationTypesStr,
        pocMigrationSpeed: newForm.pocMigrationSpeed ? Number(newForm.pocMigrationSpeed) : null,
        pocErrorRate: newForm.pocErrorRate ? Number(newForm.pocErrorRate) : null,
        pocOutcome: newForm.pocOutcome || null,
        pocDeadline: newForm.pocDeadline || null,
        pocHandoffDate: newForm.pocHandoffDate || null,
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

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  );

  if (error) return <div className="p-6 text-red-500">Failed to load POC projects</div>;

  // ── Modal JSX (rendered via portal) ───────────────────────────────────────
  const modal = showNewModal && mounted ? createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={closeModal}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col"
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-blue-600 text-white rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-5 h-5" />
            <div>
              <h2 className="text-lg font-bold leading-tight">New POC Project</h2>
              <p className="text-xs text-blue-100">Fill in the details to create a new Proof of Concept</p>
            </div>
          </div>
          <button onClick={closeModal} className="p-1.5 hover:bg-blue-500 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {/* Section: Basic Information */}
          <div>
            <SectionLabel>Basic Information</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Project Name" required>
                <input type="text" placeholder="e.g. Acme Corp POC" value={newForm.name}
                  onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Customer Name" required>
                <input type="text" placeholder="e.g. Acme Corporation" value={newForm.customerName}
                  onChange={e => setNewForm(f => ({ ...f, customerName: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Project Manager">
                <input type="text" placeholder="Who is running this POC?" value={newForm.projectManager}
                  onChange={e => setNewForm(f => ({ ...f, projectManager: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Account Manager">
                <input type="text" placeholder="Account Manager name" value={newForm.accountManager}
                  onChange={e => setNewForm(f => ({ ...f, accountManager: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Customer Contact">
                <input type="text" placeholder="Customer point of contact" value={newForm.customerContact}
                  onChange={e => setNewForm(f => ({ ...f, customerContact: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Plan Type">
                <select value={newForm.planType} onChange={e => setNewForm(f => ({ ...f, planType: e.target.value }))} className={inputCls}>
                  <option value="BRONZE">BRONZE</option>
                  <option value="SILVER">SILVER</option>
                  <option value="GOLD">GOLD</option>
                  <option value="PLATINUM">PLATINUM</option>
                </select>
              </Field>
            </div>
            {/* Migration Types — full width */}
            <div className="mt-4">
              <Field label="Workload / Migration Types">
                <MigrationTypePicker
                  selected={selectedMigrationTypes}
                  onChange={setSelectedMigrationTypes}
                  allTypes={allMigrationTypes as any}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Description">
                <textarea placeholder="Brief description of this POC..." value={newForm.description}
                  onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
                  rows={3} className={`${inputCls} resize-none`} />
              </Field>
            </div>
          </div>

          {/* Section: Dates & Timeline */}
          <div>
            <SectionLabel>Dates &amp; Timeline</SectionLabel>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Planned Start" required>
                <input type="date" value={newForm.plannedStart}
                  onChange={e => setNewForm(f => ({ ...f, plannedStart: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Planned End" required>
                <input type="date" value={newForm.plannedEnd}
                  onChange={e => setNewForm(f => ({ ...f, plannedEnd: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="POC Deadline">
                <input type="date" value={newForm.pocDeadline}
                  onChange={e => setNewForm(f => ({ ...f, pocDeadline: e.target.value }))} className={inputCls} />
              </Field>
            </div>
          </div>

          {/* Section: POC Metrics */}
          <div>
            <SectionLabel>POC Metrics <span className="text-gray-400 normal-case font-normal">(optional)</span></SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Migration Speed (GB/h)">
                <input type="number" placeholder="e.g. 50" min="0" value={newForm.pocMigrationSpeed}
                  onChange={e => setNewForm(f => ({ ...f, pocMigrationSpeed: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Error Rate (%)">
                <input type="number" placeholder="e.g. 2.5" min="0" max="100" step="0.1" value={newForm.pocErrorRate}
                  onChange={e => setNewForm(f => ({ ...f, pocErrorRate: e.target.value }))} className={inputCls} />
              </Field>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex-shrink-0">
          <p className="text-xs text-gray-400">Fields marked <span className="text-red-500">*</span> are required</p>
          <div className="flex gap-3">
            <button onClick={closeModal}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition">
              Cancel
            </button>
            <button onClick={handleCreate} disabled={createPoc.isPending}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
              {createPoc.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                : <><Plus className="w-4 h-4" /> Create POC Project</>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  // ── Page ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">POC Projects</h1>
            <p className="text-sm text-gray-500">{filtered.length} POC{filtered.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={openModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
            <Plus className="w-4 h-4" /> New POC
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">All Outcomes</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
          <option value="no_decision">No Decision</option>
        </select>
        <input type="text" placeholder="Filter by workload type..." value={workloadFilter}
          onChange={e => setWorkloadFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white w-52" />
        {(outcomeFilter || workloadFilter) && (
          <button onClick={() => { setOutcomeFilter(''); setWorkloadFilter(''); }}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-gray-400">
          <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No POC projects yet</p>
          {canEdit && <p className="text-sm mt-1">Click "New POC" to create the first one</p>}
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(p => {
            const isExpanded = expandedId === p.id;
            const isEditing = editingId === p.id;
            const outcome = p.pocOutcome ? OUTCOME_LABELS[p.pocOutcome] : null;
            const workloads = (p.migrationTypes || '').split(',').map(w => w.trim()).filter(Boolean);

            return (
              <Card key={p.id} className="overflow-hidden">
                <div className="p-4 cursor-pointer hover:bg-gray-50 transition" onClick={() => toggleExpand(p.id)}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate capitalize">{p.customerName}</h3>
                      <p className="text-xs text-gray-400 truncate capitalize">{p.name}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      {outcome
                        ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${outcome.color}`}>{outcome.label}</span>
                        : <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">In Progress</span>}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {workloads.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {workloads.map(w => <span key={w} className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full">{w}</span>)}
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" /> {p.projectManager || '—'}</span>
                    {p.accountManager && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {p.accountManager}</span>}
                  </div>

                  {p.pocDeadline && (
                    <div className={`flex items-center gap-1 text-xs mb-3 ${deadlineColor(p.pocDeadline)}`}>
                      <CalendarDays className="w-3 h-3" />
                      {formatDeadline(p.pocDeadline)}
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    {POC_PHASES.map((phase, i) => {
                      const status: PocPhaseStatus = (p as any)[phase.statusKey] || 'not_started';
                      return (
                        <div key={phase.label} className="flex items-center gap-1">
                          <div className={`flex flex-col items-center ${PHASE_COLORS[status]}`} title={`${phase.label}: ${status}`}>
                            {PHASE_ICONS[status]}
                            <span className="text-[10px] mt-0.5 whitespace-nowrap">{phase.label}</span>
                          </div>
                          {i < POC_PHASES.length - 1 && <Minus className="w-3 h-3 text-gray-300 flex-shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50">
                    {canEdit && !isEditing && (
                      <button onClick={() => startEdit(p)} className="text-sm text-blue-600 hover:underline font-medium">
                        Edit POC Details
                      </button>
                    )}

                    {isEditing ? (
                      <div className="space-y-3">
                        {POC_PHASES.map(phase => (
                          <div key={phase.statusKey} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-700 w-24">{phase.label}</span>
                              <select
                                value={editForm[phase.statusKey] || 'not_started'}
                                onChange={e => setEditForm(f => ({ ...f, [phase.statusKey]: e.target.value }))}
                                className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                              >
                                <option value="not_started">Not Started</option>
                                <option value="in_progress">In Progress</option>
                                <option value="blocked">Blocked</option>
                                <option value="completed">Completed</option>
                              </select>
                            </div>
                            <textarea value={editForm[phase.noteKey] || ''} onChange={e => setEditForm(f => ({ ...f, [phase.noteKey]: e.target.value }))}
                              placeholder={`${phase.label} notes...`} rows={2}
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white resize-none" />
                          </div>
                        ))}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-600">Outcome</label>
                            <select value={editForm.pocOutcome || ''} onChange={e => setEditForm(f => ({ ...f, pocOutcome: e.target.value }))}
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white mt-1">
                              <option value="">In Progress</option>
                              <option value="won">Won</option>
                              <option value="lost">Lost</option>
                              <option value="no_decision">No Decision</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">Deadline</label>
                            <input type="date" value={editForm.pocDeadline || ''} onChange={e => setEditForm(f => ({ ...f, pocDeadline: e.target.value }))}
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white mt-1" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">Speed (GB/h)</label>
                            <input type="number" value={editForm.pocMigrationSpeed || ''} onChange={e => setEditForm(f => ({ ...f, pocMigrationSpeed: e.target.value }))}
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white mt-1" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">Error Rate (%)</label>
                            <input type="number" value={editForm.pocErrorRate || ''} onChange={e => setEditForm(f => ({ ...f, pocErrorRate: e.target.value }))}
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white mt-1" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">Handoff To</label>
                            <input type="text" value={editForm.pocHandoffTo || ''} onChange={e => setEditForm(f => ({ ...f, pocHandoffTo: e.target.value }))}
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white mt-1" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">Handoff Date</label>
                            <input type="date" value={editForm.pocHandoffDate || ''} onChange={e => setEditForm(f => ({ ...f, pocHandoffDate: e.target.value }))}
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white mt-1" />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => saveEdit(p.id)} disabled={updatePoc.isPending}
                            className="flex items-center gap-1 text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                            {updatePoc.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-sm px-3 py-1.5 border border-gray-200 rounded hover:bg-gray-100">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {POC_PHASES.map(phase => {
                          const status: PocPhaseStatus = (p as any)[phase.statusKey] || 'not_started';
                          const note: string = (p as any)[phase.noteKey] || '';
                          return (
                            <div key={phase.statusKey} className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`flex items-center gap-1 text-xs font-medium ${PHASE_COLORS[status]}`}>
                                  {PHASE_ICONS[status]} {phase.label}
                                </span>
                                {canEdit && (
                                  <select value={status} onChange={e => quickUpdatePhase(p.id, phase.statusKey, e.target.value as PocPhaseStatus)}
                                    className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white ml-auto">
                                    <option value="not_started">Not Started</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="blocked">Blocked</option>
                                    <option value="completed">Completed</option>
                                  </select>
                                )}
                              </div>
                              {note && <p className="text-xs text-gray-500 pl-5">{note}</p>}
                            </div>
                          );
                        })}
                        {(p.pocMigrationSpeed != null || p.pocErrorRate != null) && (
                          <div className="flex gap-4 text-xs text-gray-600 pt-1 border-t border-gray-100">
                            {p.pocMigrationSpeed != null && <span>Speed: <strong>{p.pocMigrationSpeed} GB/h</strong></span>}
                            {p.pocErrorRate != null && <span>Error Rate: <strong>{p.pocErrorRate}%</strong></span>}
                          </div>
                        )}
                        {(p.pocHandoffTo || p.pocHandoffDate) && (
                          <div className="flex items-center gap-2 text-xs text-gray-500 pt-1 border-t border-gray-100">
                            <ArrowRight className="w-3 h-3 text-green-500" />
                            Handoff to <strong>{p.pocHandoffTo || '—'}</strong>
                            {p.pocHandoffDate && <> on {new Date(p.pocHandoffDate).toLocaleDateString()}</>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {modal}
    </div>
  );
}
