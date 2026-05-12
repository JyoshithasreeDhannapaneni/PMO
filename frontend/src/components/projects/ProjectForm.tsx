'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ChevronDown, ChevronUp, X, CheckCircle, Circle } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { templatesApi, authApi } from '@/services/api';
import type { Project, CreateProjectInput } from '@/types';

const baseSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  customerName: z.string().min(1, 'Customer name is required'),
  projectManager: z.string().min(1, 'Project manager is required'),
  accountManager: z.string().min(1, 'Account manager is required'),
  planType: z.string().min(1, 'Plan type is required'),
  plannedStart: z.string().min(1, 'SOW start date is required'),
  plannedEnd: z.string().min(1, 'SOW end date is required'),
  actualStart: z.string().optional(),
  actualEnd: z.string().optional(),
  phase: z.string().min(1, 'Phase is required'),
  status: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  estimatedCost: z.union([z.string(), z.number()]).optional(),
  actualCost: z.union([z.string(), z.number()]).optional(),
  numberOfServers: z.union([z.string(), z.number()]).optional(),
  projectMemory: z.string().optional(),
  isOveraged: z.union([z.string(), z.boolean()]).optional(),
  isEscalated: z.union([z.string(), z.boolean()]).optional(),
  overageAmount: z.union([z.string(), z.number()]).optional(),
});

type ProjectFormData = z.infer<typeof baseSchema>;

type Step = 'basics' | 'scope' | 'timeline' | 'details';
const STEPS: { id: Step; label: string }[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'scope', label: 'Scope' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'details', label: 'Details' },
];

interface ProjectFormProps {
  project?: Project;
  onSubmit: (data: CreateProjectInput) => void;
  isLoading?: boolean;
  defaultManagerName?: string;
}

export function ProjectForm({ project, onSubmit, isLoading, defaultManagerName }: ProjectFormProps) {
  const { settings } = useSettings();
  const { showToast } = useToast();

  const enabledMigrationTypes = settings.migrationTypes.filter((t) => t.enabled);
  const sourcePlatforms = settings.sourcePlatforms;
  const targetPlatforms = settings.targetPlatforms;
  const planTypes = settings.planTypes;
  const phases = settings.phases;

  const [step, setStep] = useState<Step>('basics');
  const [accountManagers, setAccountManagers] = useState<string[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [users, setUsers] = useState<{ name: string; role: string }[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pmoSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        const members: { name: string; role: string }[] = parsed.teamMembers || [];
        setAccountManagers(members.filter((m) => m.role === 'Account Manager').map((m) => m.name));
      }
    } catch {}
    templatesApi.getAll().then((res) => { if (res.success) setTemplates(res.data || []); }).catch(() => {});
    authApi.getUsers().then((res) => { if (res.success) setUsers(res.data || []); }).catch(() => {});
  }, []);

  const [selectedMigrationTypes, setSelectedMigrationTypes] = useState<string[]>([]);
  const [selectedSourcePlatforms, setSelectedSourcePlatforms] = useState<string[]>([]);
  const [selectedTargetPlatforms, setSelectedTargetPlatforms] = useState<string[]>([]);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showTargetDropdown, setShowTargetDropdown] = useState(false);
  const [migrationTypeError, setMigrationTypeError] = useState('');
  const [sourcePlatformError, setSourcePlatformError] = useState('');
  const [targetPlatformError, setTargetPlatformError] = useState('');

  const sourceDropdownRef = useRef<HTMLDivElement>(null);
  const targetDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sourceDropdownRef.current && !sourceDropdownRef.current.contains(e.target as Node)) setShowSourceDropdown(false);
      if (targetDropdownRef.current && !targetDropdownRef.current.contains(e.target as Node)) setShowTargetDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (project?.migrationTypes) {
      const stored = project.migrationTypes.split(',').map((t: string) => t.trim());
      const ids = stored.map((storedName: string) => {
        const lower = storedName.toLowerCase();
        const match = enabledMigrationTypes.find(
          (t) => t.name.toLowerCase() === lower || lower === t.id.toLowerCase() || lower.includes(t.id.toLowerCase())
        );
        return match ? match.id : storedName.toLowerCase();
      });
      setSelectedMigrationTypes(ids);
    }
    if (project?.sourcePlatform) setSelectedSourcePlatforms(project.sourcePlatform.split(',').map((p: string) => p.trim()));
    if (project?.targetPlatform) setSelectedTargetPlatforms(project.targetPlatform.split(',').map((p: string) => p.trim()));
  }, [project, enabledMigrationTypes.length]);

  const defaultPlanType = planTypes[0]?.code || 'SILVER';
  const defaultPhase = [...phases].sort((a, b) => a.order - b.order)[0]?.code || 'KICKOFF';

  const { register, handleSubmit, formState: { errors }, setValue, getValues, trigger } = useForm<ProjectFormData>({
    resolver: zodResolver(baseSchema),
    defaultValues: project ? {
      name: project.name,
      customerName: project.customerName,
      projectManager: project.projectManager,
      accountManager: project.accountManager,
      planType: project.planType,
      plannedStart: project.plannedStart.split('T')[0],
      plannedEnd: project.plannedEnd.split('T')[0],
      actualStart: project.actualStart?.split('T')[0] || '',
      actualEnd: project.actualEnd?.split('T')[0] || '',
      estimatedCost: project.estimatedCost || '',
      actualCost: project.actualCost || '',
      numberOfServers: (project as any).numberOfServers ?? '',
      projectMemory: (project as any).projectMemory || '',
      description: project.description || '',
      notes: project.notes || '',
      phase: project.phase,
      status: project.status,
      isOveraged: (project as any).isOveraged ? 'YES' : '',
      isEscalated: (project as any).isEscalated ? 'YES' : '',
      overageAmount: (project as any).overageAmount || '',
    } : {
      planType: defaultPlanType,
      phase: defaultPhase,
      status: 'ACTIVE',
      projectManager: defaultManagerName || '',
    },
  });

  useEffect(() => {
    if (project) return;
    const validPlanCodes = planTypes.filter((p) => p.code).map((p) => p.code);
    const validPhaseCodes = phases.filter((p) => p.code).map((p) => p.code);
    const cp = getValues('planType');
    const ch = getValues('phase');
    if (cp && !validPlanCodes.includes(cp)) setValue('planType', validPlanCodes[0] || 'SILVER');
    else if (!cp && validPlanCodes.length) setValue('planType', validPlanCodes[0]);
    if (ch && !validPhaseCodes.includes(ch)) setValue('phase', validPhaseCodes[0] || 'KICKOFF');
    else if (!ch && validPhaseCodes.length) setValue('phase', validPhaseCodes[0]);
  }, [planTypes, phases]); // eslint-disable-line

  const toggleMigrationType = (id: string) => { setSelectedMigrationTypes((p) => p.includes(id) ? p.filter((t) => t !== id) : [...p, id]); setMigrationTypeError(''); };
  const toggleSourcePlatform = (name: string) => { setSelectedSourcePlatforms((p) => p.includes(name) ? p.filter((x) => x !== name) : [...p, name]); setSourcePlatformError(''); };
  const toggleTargetPlatform = (name: string) => { setSelectedTargetPlatforms((p) => p.includes(name) ? p.filter((x) => x !== name) : [...p, name]); setTargetPlatformError(''); };

  const sourceCategories = [...new Set(sourcePlatforms.map((p) => p.category))];
  const targetCategories = [...new Set(targetPlatforms.map((p) => p.category))];

  const planOptions = planTypes.filter((p) => p.code).map((p) => ({ value: p.code, label: p.name }));
  const phaseOptions = [...phases].sort((a, b) => a.order - b.order).filter((p) => p.code).map((p) => ({ value: p.code, label: p.name }));
  const statusOptions = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'ON_HOLD', label: 'On Hold' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'COMPLETED', label: 'Completed' },
  ];

  const STEP_FIELDS: Record<Step, (keyof ProjectFormData)[]> = {
    basics: ['name', 'customerName', 'projectManager', 'accountManager', 'planType', 'status', 'phase'],
    scope: [],
    timeline: ['plannedStart', 'plannedEnd'],
    details: [],
  };

  const goToStep = async (target: Step) => {
    const currentIdx = STEPS.findIndex((s) => s.id === step);
    const targetIdx = STEPS.findIndex((s) => s.id === target);
    if (targetIdx > currentIdx) {
      const valid = await trigger(STEP_FIELDS[step]);
      if (!valid) { showToast('error', 'Please fix errors', 'Complete all required fields on this step first.'); return; }
      if (step === 'scope') {
        let err = false;
        if (selectedMigrationTypes.length === 0) { setMigrationTypeError('Select at least one migration type'); err = true; }
        if (selectedSourcePlatforms.length === 0) { setSourcePlatformError('Select at least one source platform'); err = true; }
        if (selectedTargetPlatforms.length === 0) { setTargetPlatformError('Select at least one target platform'); err = true; }
        if (err) { showToast('error', 'Missing selections', 'Select migration type, source and target platforms.'); return; }
      }
    }
    setStep(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFormSubmit = (data: ProjectFormData) => {
    let hasError = false;
    if (selectedMigrationTypes.length === 0) { setMigrationTypeError('Select at least one migration type'); hasError = true; }
    if (selectedSourcePlatforms.length === 0) { setSourcePlatformError('Select at least one source platform'); hasError = true; }
    if (selectedTargetPlatforms.length === 0) { setTargetPlatformError('Select at least one target platform'); hasError = true; }
    if (hasError) { showToast('error', 'Missing selections', 'Select migration type, source and target platforms.'); setStep('scope'); return; }

    const migrationTypes = selectedMigrationTypes.map((id) => {
      const type = enabledMigrationTypes.find((t) => t.id === id);
      return type ? type.name : id;
    }).join(', ');

    onSubmit({
      name: data.name,
      customerName: data.customerName,
      projectManager: data.projectManager,
      accountManager: data.accountManager,
      planType: data.planType as any,
      plannedStart: data.plannedStart,
      plannedEnd: data.plannedEnd,
      actualStart: data.actualStart || undefined,
      actualEnd: data.actualEnd || undefined,
      numberOfServers: data.numberOfServers != null && data.numberOfServers !== '' ? Number(data.numberOfServers) : undefined,
      projectMemory: data.projectMemory || undefined,
      estimatedCost: data.estimatedCost != null && data.estimatedCost !== '' ? Number(data.estimatedCost) : undefined,
      actualCost: data.actualCost != null && data.actualCost !== '' ? Number(data.actualCost) : undefined,
      description: data.description || '',
      notes: data.notes || '',
      phase: data.phase as any,
      status: data.status as any,
      sourcePlatform: selectedSourcePlatforms.join(', '),
      targetPlatform: selectedTargetPlatforms.join(', '),
      migrationTypes,
      isOveraged: (data.isOveraged as any) === 'YES' || data.isOveraged === true ? true : ((data.isOveraged as any) === 'NO' ? false : undefined),
      isEscalated: (data.isEscalated as any) === 'YES' || data.isEscalated === true ? true : ((data.isEscalated as any) === 'NO' ? false : undefined),
      overageAmount: data.overageAmount != null && data.overageAmount !== '' ? Number(data.overageAmount) : undefined,
    });
  };

  const currentStepIdx = STEPS.findIndex((s) => s.id === step);

  // Find matching template for first migration type
  const templatePreview = (() => {
    if (!templates.length || !selectedMigrationTypes.length) return null;
    const typeId = selectedMigrationTypes[0];
    const migrationType = enabledMigrationTypes.find((t) => t.id === typeId);
    if (!migrationType) return null;
    return templates.find((t) => t.code === migrationType.code.toUpperCase() || t.name.toUpperCase().includes(migrationType.code.toUpperCase())) || null;
  })();

  return (
    <form onSubmit={handleSubmit(handleFormSubmit, () => { showToast('error', 'Please fix errors', 'Check all required fields.'); })}
      className="flex flex-col h-full">

      {/* ── Step tabs ───────────────────────────────────────────── */}
      <div className="flex items-center gap-0 mb-6 bg-white border border-blue-100 rounded-xl overflow-hidden shadow-sm">
        {STEPS.map((s, i) => {
          const isActive = s.id === step;
          const isDone = i < currentStepIdx;
          return (
            <button key={s.id} type="button" onClick={() => goToStep(s.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 text-sm font-medium transition-all border-r border-blue-50 last:border-r-0
                ${isActive ? 'bg-blue-600 text-white' : isDone ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
              {isDone ? <CheckCircle size={14} /> : <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${isActive ? 'bg-white/20' : 'bg-slate-200 text-slate-500'}`}>{i + 1}</span>}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Step content ────────────────────────────────────────── */}
      <div className="flex-1">

        {/* STEP 1: Basics */}
        {step === 'basics' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Project Name *" {...register('name')} error={errors.name?.message} />
              <Input label="Customer Name *" {...register('customerName')} error={errors.customerName?.message} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project Manager <span className="text-red-500">*</span></label>
                <input list="pm-list" {...register('projectManager')} disabled={!!defaultManagerName}
                  placeholder="Type or select..."
                  className={`w-full px-3 py-2 border border-blue-200 rounded-lg bg-white text-slate-900 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none ${defaultManagerName ? 'opacity-60 cursor-not-allowed' : ''}`} />
                <datalist id="pm-list">
                  {users.filter((u) => u.role === 'MANAGER' || u.role === 'ADMIN').map((u) => <option key={u.name} value={u.name} />)}
                </datalist>
                {errors.projectManager && <p className="mt-1 text-xs text-red-600">{errors.projectManager.message}</p>}
                {defaultManagerName && <p className="mt-1 text-xs text-blue-600">Auto-assigned to you</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Account Manager <span className="text-red-500">*</span></label>
                <input list="am-list" {...register('accountManager')} placeholder="Type or select..."
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg bg-white text-slate-900 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none" />
                <datalist id="am-list">
                  {accountManagers.map((name) => <option key={name} value={name} />)}
                </datalist>
                {errors.accountManager && <p className="mt-1 text-xs text-red-600">{errors.accountManager.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Select label="Plan Type *" options={planOptions} {...register('planType')} error={errors.planType?.message} />
              <Select label="Status *" options={statusOptions} {...register('status')} error={errors.status?.message} />
              <Select label="Current Phase *" options={phaseOptions} {...register('phase')} error={errors.phase?.message} />
            </div>
            <Textarea label="Description" rows={2} placeholder="Describe the project scope and objectives..."
              {...register('description')} error={errors.description?.message} />
          </div>
        )}

        {/* STEP 2: Scope */}
        {step === 'scope' && (
          <div className="space-y-4">
            {/* Migration Types */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Migration Type(s) <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {enabledMigrationTypes.map((type) => (
                  <button key={type.id} type="button" onClick={() => toggleMigrationType(type.id)}
                    className={`p-3 border-2 rounded-lg text-left transition-all flex items-center gap-2 ${
                      selectedMigrationTypes.includes(type.id)
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-slate-200 hover:border-blue-300 text-slate-700'}`}>
                    <span className="text-lg">{type.icon}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{type.name}</p>
                      {selectedMigrationTypes.includes(type.id) && <p className="text-xs text-blue-600">✓ Selected</p>}
                    </div>
                  </button>
                ))}
              </div>
              {migrationTypeError && <p className="mt-1 text-xs text-red-600">{migrationTypeError}</p>}
            </div>

            {/* Template preview */}
            {templatePreview?.phases?.length > 0 && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs font-semibold text-green-700 mb-1">
                  📋 Template will auto-create {templatePreview.phases.reduce((s: number, ph: any) => s + (ph.tasks?.length || 0), 0)} tasks across {templatePreview.phases.length} phases
                </p>
                <div className="flex flex-wrap gap-1">
                  {templatePreview.phases.map((ph: any) => (
                    <span key={ph.id} className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                      {ph.name} ({ph.tasks?.length || 0})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Platform pickers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Source Platform */}
              <div className="relative" ref={sourceDropdownRef}>
                <label className="block text-sm font-medium text-slate-700 mb-1">Source Platform(s) <span className="text-red-500">*</span></label>
                <div onClick={() => setShowSourceDropdown(!showSourceDropdown)}
                  className={`min-h-[42px] px-3 py-2 border rounded-lg cursor-pointer bg-white flex items-start justify-between gap-2 ${sourcePlatformError ? 'border-red-400' : 'border-blue-200 hover:border-blue-400'}`}>
                  <div className="flex flex-wrap gap-1 flex-1">
                    {selectedSourcePlatforms.length === 0
                      ? <span className="text-slate-400 text-sm">Select source platform(s)</span>
                      : selectedSourcePlatforms.map((p) => (
                        <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                          {p}
                          <button type="button" onClick={(e) => { e.stopPropagation(); toggleSourcePlatform(p); }}><X size={10} /></button>
                        </span>
                      ))}
                  </div>
                  {showSourceDropdown ? <ChevronUp size={16} className="text-slate-400 flex-shrink-0 mt-1" /> : <ChevronDown size={16} className="text-slate-400 flex-shrink-0 mt-1" />}
                </div>
                {sourcePlatformError && <p className="text-xs text-red-600 mt-1">{sourcePlatformError}</p>}
                {showSourceDropdown && (
                  <div className="absolute z-30 w-full mt-1 bg-white border border-blue-100 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {sourceCategories.map((cat) => {
                      const items = sourcePlatforms.filter((p) => p.category === cat);
                      return items.length ? (
                        <div key={cat}>
                          <div className="px-3 py-1.5 bg-blue-50 text-xs font-semibold text-blue-600 uppercase tracking-wide">{cat}</div>
                          {items.map((p) => (
                            <label key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm">
                              <input type="checkbox" checked={selectedSourcePlatforms.includes(p.name)} onChange={() => toggleSourcePlatform(p.name)}
                                className="w-4 h-4 text-blue-600 rounded" />
                              {p.name}
                            </label>
                          ))}
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
              </div>

              {/* Target Platform */}
              <div className="relative" ref={targetDropdownRef}>
                <label className="block text-sm font-medium text-slate-700 mb-1">Target Platform(s) <span className="text-red-500">*</span></label>
                <div onClick={() => setShowTargetDropdown(!showTargetDropdown)}
                  className={`min-h-[42px] px-3 py-2 border rounded-lg cursor-pointer bg-white flex items-start justify-between gap-2 ${targetPlatformError ? 'border-red-400' : 'border-blue-200 hover:border-blue-400'}`}>
                  <div className="flex flex-wrap gap-1 flex-1">
                    {selectedTargetPlatforms.length === 0
                      ? <span className="text-slate-400 text-sm">Select target platform(s)</span>
                      : selectedTargetPlatforms.map((p) => (
                        <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">
                          {p}
                          <button type="button" onClick={(e) => { e.stopPropagation(); toggleTargetPlatform(p); }}><X size={10} /></button>
                        </span>
                      ))}
                  </div>
                  {showTargetDropdown ? <ChevronUp size={16} className="text-slate-400 flex-shrink-0 mt-1" /> : <ChevronDown size={16} className="text-slate-400 flex-shrink-0 mt-1" />}
                </div>
                {targetPlatformError && <p className="text-xs text-red-600 mt-1">{targetPlatformError}</p>}
                {showTargetDropdown && (
                  <div className="absolute z-30 w-full mt-1 bg-white border border-blue-100 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {targetCategories.map((cat) => {
                      const items = targetPlatforms.filter((p) => p.category === cat);
                      return items.length ? (
                        <div key={cat}>
                          <div className="px-3 py-1.5 bg-green-50 text-xs font-semibold text-green-600 uppercase tracking-wide">{cat}</div>
                          {items.map((p) => (
                            <label key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-green-50 cursor-pointer text-sm">
                              <input type="checkbox" checked={selectedTargetPlatforms.includes(p.name)} onChange={() => toggleTargetPlatform(p.name)}
                                className="w-4 h-4 text-green-600 rounded" />
                              {p.name}
                            </label>
                          ))}
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Migration path summary */}
            {(selectedSourcePlatforms.length > 0 || selectedTargetPlatforms.length > 0) && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <strong>Migration Path:</strong>{' '}
                {selectedSourcePlatforms.length > 0 ? selectedSourcePlatforms.join(', ') : '—'}
                {' → '}
                {selectedTargetPlatforms.length > 0 ? selectedTargetPlatforms.join(', ') : '—'}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Timeline */}
        {step === 'timeline' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="SOW Start Date *" type="date" {...register('plannedStart')} error={errors.plannedStart?.message} />
              <Input label="SOW End Date *" type="date" {...register('plannedEnd')} error={errors.plannedEnd?.message} />
              <Input label="Kick-off Start Date" type="date" {...register('actualStart')} error={errors.actualStart?.message} />
              <Input label="Project End Date" type="date" {...register('actualEnd')} error={errors.actualEnd?.message} />
            </div>
          </div>
        )}

        {/* STEP 4: Details */}
        {step === 'details' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Budget ($)" type="number" placeholder="0" {...register('estimatedCost')} error={errors.estimatedCost?.message} />
              <Input label="Number of Servers" type="number" placeholder="0" min="0" step="1" {...register('numberOfServers')} error={errors.numberOfServers?.message} />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project Memory</label>
                <input type="text" placeholder="e.g. 512 GB, 2 TB" {...register('projectMemory')}
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg bg-white text-slate-900 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Overage</label>
                <select {...register('isOveraged')}
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg bg-white text-slate-900 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none">
                  <option value="">— Not specified —</option>
                  <option value="NO">No</option>
                  <option value="YES">Yes</option>
                </select>
              </div>
              <Input label="Overage Amount ($)" type="number" min="0" step="0.01" placeholder="0.00" {...register('overageAmount')} error={errors.overageAmount?.message} />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Escalation</label>
                <select {...register('isEscalated')}
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg bg-white text-slate-900 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none">
                  <option value="">— Not specified —</option>
                  <option value="NO">No</option>
                  <option value="YES">Yes</option>
                </select>
              </div>
            </div>
            <Textarea label="Notes" rows={3} placeholder="Add project notes, kickoff summary, or current status..."
              {...register('notes')} error={errors.notes?.message} />
          </div>
        )}
      </div>

      {/* ── Navigation buttons ───────────────────────────────── */}
      <div className="flex items-center justify-between pt-6 mt-6 border-t border-blue-50">
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => window.history.back()}>Cancel</Button>
          {currentStepIdx > 0 && (
            <Button type="button" variant="outline" onClick={() => goToStep(STEPS[currentStepIdx - 1].id)}>← Back</Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">Step {currentStepIdx + 1} of {STEPS.length}</span>
          {currentStepIdx < STEPS.length - 1 ? (
            <Button type="button" onClick={() => goToStep(STEPS[currentStepIdx + 1].id)}>
              Next →
            </Button>
          ) : (
            <Button type="submit" isLoading={isLoading}>
              {project ? 'Update Project' : 'Create Project'}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
