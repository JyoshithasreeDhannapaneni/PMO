'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ChevronDown, ChevronUp, X, CheckCircle } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { templatesApi, authApi } from '@/services/api';
import { mergeAccountManagers } from '@/lib/accountManagers';
import type { Project, CreateProjectInput } from '@/types';

const baseSchema = z.object({
  name: z.string().optional(),
  clientName: z.string().optional(),
  customerName: z.string().min(1, 'Customer name is required'),
  projectManager: z.string().min(1, 'Project manager is required'),
  accountManager: z.string().min(1, 'Account manager is required'),
  planType: z.string().min(1, 'Plan type is required'),
  segment: z.string().optional(),
  plannedStart: z.string().optional(),
  plannedEnd: z.string().optional(),
  actualStart: z.string().optional(),
  actualEnd: z.string().optional(),
  customerContact: z.string().optional(),
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

interface CategoryTimeline {
  plannedStart: string;
  plannedEnd: string;
  actualStart: string;
  actualEnd: string;
}

const SCOPE_DEFS = [
  { key: 'Content Migration', label: 'Content',   icon: '📁', ringColor: 'ring-blue-400',   headerBg: 'bg-blue-50',    textColor: 'text-blue-700',   chipBg: 'bg-blue-100',    chipText: 'text-blue-800'   },
  { key: 'Messaging',         label: 'Messaging',  icon: '💬', ringColor: 'ring-purple-400', headerBg: 'bg-purple-50',  textColor: 'text-purple-700', chipBg: 'bg-purple-100',  chipText: 'text-purple-800' },
  { key: 'Email',             label: 'Email',      icon: '📧', ringColor: 'ring-green-400',  headerBg: 'bg-green-50',   textColor: 'text-green-700',  chipBg: 'bg-green-100',   chipText: 'text-green-800'  },
];

interface ProjectFormProps {
  project?: Project;
  onSubmit: (data: CreateProjectInput[]) => void;
  isLoading?: boolean;
  defaultManagerName?: string;
}

export function ProjectForm({ project, onSubmit, isLoading, defaultManagerName }: ProjectFormProps) {
  const { settings } = useSettings();
  const { showToast } = useToast();
  const isEditing = !!project;

  const enabledMigrationTypes = settings.migrationTypes.filter((t) => t.enabled);
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

  // ── Multi-scope state (create mode) ─────────────────────────────
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categoryTypes, setCategoryTypes] = useState<Record<string, string[]>>({});
  const [openCategoryDropdown, setOpenCategoryDropdown] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState<Record<string, string>>({});
  const [categoryTimelines, setCategoryTimelines] = useState<Record<string, CategoryTimeline>>({});
  const [sharedSowStart, setSharedSowStart] = useState('');
  const [sharedSowEnd, setSharedSowEnd] = useState('');
  const [combinationDetails, setCombinationDetails] = useState<Record<string, { budget: string; size: string; servers: string }>>({});

  // ── Single-scope state (edit mode only) ─────────────────────────
  const [selectedMigrationCategory, setSelectedMigrationCategory] = useState<string | null>(null);
  const [selectedMigrationTypes, setSelectedMigrationTypes] = useState<string[]>([]);
  const [showMigrationTypeDropdown, setShowMigrationTypeDropdown] = useState(false);
  const [migrationTypeSearch, setMigrationTypeSearch] = useState('');

  const [migrationTypeError, setMigrationTypeError] = useState('');

  const migrationTypeDropdownRef = useRef<HTMLDivElement>(null);

  // Close edit-mode dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (migrationTypeDropdownRef.current && !migrationTypeDropdownRef.current.contains(e.target as Node)) setShowMigrationTypeDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openCategoryRef = useRef<HTMLDivElement | null>(null);

  // Close create-mode category dropdowns on outside click
  useEffect(() => {
    if (!openCategoryDropdown) return;
    const handler = (e: MouseEvent) => {
      if (openCategoryRef.current && !openCategoryRef.current.contains(e.target as Node)) {
        setOpenCategoryDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openCategoryDropdown]);

  // Initialize migration types from project (edit mode)
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
      const firstMatch = enabledMigrationTypes.find((t) => ids.includes(t.id));
      if (firstMatch) setSelectedMigrationCategory((firstMatch as any).category || null);
    }
  }, [project, enabledMigrationTypes.length]);

  const defaultPlanType = planTypes[0]?.code || 'SILVER';
  const defaultPhase = [...phases].sort((a, b) => a.order - b.order)[0]?.code || 'KICKOFF';

  const { register, handleSubmit, formState: { errors }, setValue, getValues, trigger, watch } = useForm<ProjectFormData>({
    resolver: zodResolver(baseSchema),
    defaultValues: project ? {
      name: project.name,
      clientName: project.clientName ?? '',
      customerName: project.customerName,
      projectManager: project.projectManager,
      accountManager: project.accountManager,
      planType: project.planType,
      segment: project.segment || '',
      plannedStart: project.plannedStart.split('T')[0],
      plannedEnd: project.plannedEnd.split('T')[0],
      actualStart: project.actualStart?.split('T')[0] || '',
      actualEnd: project.actualEnd?.split('T')[0] || '',
      customerContact: (project as any).customerContact || '',
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
      segment: '',
      phase: defaultPhase,
      status: 'ACTIVE',
      projectManager: defaultManagerName || '',
    },
  });

  useEffect(() => {
    const validPlanCodes = planTypes.map((p) => p.code || p.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')).filter(Boolean);
    const validPhaseCodes = phases.map((p) => p.code || p.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')).filter(Boolean);
    const cp = getValues('planType');
    const ch = getValues('phase');
    if (cp && !validPlanCodes.includes(cp)) setValue('planType', validPlanCodes[0] || 'SILVER');
    else if (!cp && validPlanCodes.length) setValue('planType', validPlanCodes[0]);
    if (ch && !validPhaseCodes.includes(ch)) setValue('phase', validPhaseCodes[0] || 'KICKOFF');
    else if (!ch && validPhaseCodes.length) setValue('phase', validPhaseCodes[0]);
  }, [planTypes, phases]); // eslint-disable-line

  // Auto-calculate Project End Date = Kickoff Date + SOW duration (single-scope / edit mode)
  const parseLocal = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const watchedActualStart = watch('actualStart');
  const watchedPlannedStart = watch('plannedStart');
  const watchedPlannedEnd = watch('plannedEnd');
  useEffect(() => {
    if (!isEditing && selectedCategories.length > 1) return; // multi-scope handles its own calc
    const kickoff = watchedActualStart;
    const sowStart = watchedPlannedStart;
    const sowEnd = watchedPlannedEnd;
    if (!kickoff || !sowStart || !sowEnd) return;
    const kickoffDate = parseLocal(kickoff);
    const sowStartDate = parseLocal(sowStart);
    const sowEndDate = parseLocal(sowEnd);
    if (isNaN(kickoffDate.getTime()) || isNaN(sowStartDate.getTime()) || isNaN(sowEndDate.getTime())) return;
    const sowDurationMs = sowEndDate.getTime() - sowStartDate.getTime();
    const projectEndDate = new Date(kickoffDate.getTime() + sowDurationMs);
    setValue('actualEnd', toInputDate(projectEndDate), { shouldValidate: false, shouldDirty: true, shouldTouch: false });
  }, [watchedActualStart, watchedPlannedStart, watchedPlannedEnd]); // eslint-disable-line

  // ── Category helpers (create mode) ──────────────────────────────
  function toggleCategory(cat: string) {
    setSelectedCategories(prev => {
      if (prev.includes(cat)) {
        setCategoryTypes(t => { const next = { ...t }; delete next[cat]; return next; });
        setCategoryTimelines(t => { const next = { ...t }; delete next[cat]; return next; });
        return prev.filter(c => c !== cat);
      }
      setCategoryTypes(t => ({ ...t, [cat]: t[cat] || [] }));
      setCategoryTimelines(t => ({ ...t, [cat]: t[cat] || { plannedStart: '', plannedEnd: '', actualStart: '', actualEnd: '' } }));
      return [...prev, cat];
    });
    setMigrationTypeError('');
  }

  function toggleCategoryType(cat: string, id: string) {
    const isRemoving = (categoryTypes[cat] || []).includes(id);
    setCategoryTypes(prev => {
      const current = prev[cat] || [];
      return { ...prev, [cat]: current.includes(id) ? current.filter(t => t !== id) : [...current, id] };
    });
    if (isRemoving) {
      setCombinationDetails(prev => { const next = { ...prev }; delete next[id]; return next; });
    }
    setMigrationTypeError('');
  }

  function updateCombinationDetail(id: string, field: 'budget' | 'size' | 'servers', value: string) {
    setCombinationDetails(prev => ({
      ...prev,
      [id]: { ...(prev[id] || { budget: '', size: '', servers: '' }), [field]: value },
    }));
  }

  function updateCategoryTimeline(cat: string, field: 'plannedStart' | 'plannedEnd' | 'actualStart', value: string) {
    setCategoryTimelines(prev => {
      const tl = prev[cat] || { plannedStart: '', plannedEnd: '', actualStart: '', actualEnd: '' };
      const next = { ...tl, [field]: value };
      const kickoff = field === 'actualStart' ? value : next.actualStart;
      const sowStart = field === 'plannedStart' ? value : next.plannedStart;
      const sowEnd = field === 'plannedEnd' ? value : next.plannedEnd;
      if (kickoff && sowStart && sowEnd) {
        try {
          const sowDuration = parseLocal(sowEnd).getTime() - parseLocal(sowStart).getTime();
          next.actualEnd = toInputDate(new Date(parseLocal(kickoff).getTime() + sowDuration));
        } catch {}
      }
      return { ...prev, [cat]: next };
    });
  }

  function updateSharedSow(field: 'start' | 'end', value: string) {
    const newStart = field === 'start' ? value : sharedSowStart;
    const newEnd = field === 'end' ? value : sharedSowEnd;
    if (field === 'start') setSharedSowStart(value);
    else setSharedSowEnd(value);
    setCategoryTimelines(prev => {
      const updated: Record<string, CategoryTimeline> = {};
      for (const cat of Object.keys(prev)) {
        const tl = prev[cat];
        const next = { ...tl, plannedStart: newStart, plannedEnd: newEnd };
        if (tl.actualStart && newStart && newEnd) {
          try {
            const dur = parseLocal(newEnd).getTime() - parseLocal(newStart).getTime();
            next.actualEnd = toInputDate(new Date(parseLocal(tl.actualStart).getTime() + dur));
          } catch {}
        }
        updated[cat] = next;
      }
      return updated;
    });
  }

  // Single-scope type toggle (edit mode)
  const toggleMigrationType = (id: string) => { setSelectedMigrationTypes((p) => p.includes(id) ? p.filter((t) => t !== id) : [...p, id]); setMigrationTypeError(''); };

  const planOptions = planTypes.filter((p) => p.code).map((p) => ({ value: p.code, label: p.name }));
  const segmentOptions = [
    { value: '', label: 'Not set' },
    { value: 'ENT', label: 'Enterprise (ENT)' },
    { value: 'SMB', label: 'SMB' },
  ];
  const toPhaseCode = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  const phaseOptions = [...phases]
    .sort((a, b) => a.order - b.order)
    .map((p) => ({ value: p.code || toPhaseCode(p.name), label: p.name }))
    .filter((p) => p.value);
  const statusOptions = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'ON_HOLD', label: 'On Hold' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'COMPLETED', label: 'Completed' },
  ];

  const STEP_FIELDS: Record<Step, (keyof ProjectFormData)[]> = {
    basics: ['customerName', 'projectManager', 'accountManager', 'planType', 'status', 'phase'],
    scope: [],
    timeline: isEditing ? ['plannedStart', 'plannedEnd'] : [],
    details: [],
  };

  const goToStep = async (target: Step) => {
    const currentIdx = STEPS.findIndex((s) => s.id === step);
    const targetIdx = STEPS.findIndex((s) => s.id === target);
    if (targetIdx > currentIdx) {
      const valid = await trigger(STEP_FIELDS[step]);
      if (!valid) { showToast('error', 'Please fix errors', 'Complete all required fields on this step first.'); return; }

      if (step === 'scope') {
        if (isEditing) {
          if (!selectedMigrationCategory) { setMigrationTypeError('Select a migration type'); showToast('error', 'Missing selection', 'Select a migration type.'); return; }
          if (selectedMigrationTypes.length === 0) { setMigrationTypeError('Select at least one combination'); showToast('error', 'Missing selection', 'Select at least one migration combination.'); return; }
        } else {
          if (selectedCategories.length === 0) { setMigrationTypeError('Select at least one scope'); showToast('error', 'Missing selection', 'Select at least one migration scope.'); return; }
          const catWithNoTypes = selectedCategories.find(c => (categoryTypes[c] || []).length === 0);
          if (catWithNoTypes) { setMigrationTypeError(`Select at least one combination for ${catWithNoTypes}`); showToast('error', 'Missing combination', `Select at least one combination for ${catWithNoTypes}.`); return; }
        }
      }

      if (step === 'timeline' && !isEditing && selectedCategories.length > 1) {
        if (!sharedSowStart || !sharedSowEnd) { showToast('error', 'Missing dates', 'SOW start and end dates are required.'); return; }
      }
      if (step === 'timeline' && isEditing) {
        const ps = getValues('plannedStart');
        const pe = getValues('plannedEnd');
        if (!ps || !pe) { showToast('error', 'Missing dates', 'SOW start and end dates are required.'); return; }
      }
      if (step === 'timeline' && !isEditing && selectedCategories.length === 1) {
        const ps = getValues('plannedStart');
        const pe = getValues('plannedEnd');
        if (!ps || !pe) { showToast('error', 'Missing dates', 'SOW start and end dates are required.'); return; }
      }
    }
    setStep(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Auto-name from scope ─────────────────────────────────────────
  const SCOPE_LABELS: Record<string, string> = {
    'Content Migration': 'Content',
    'Messaging': 'Messaging',
    'Email': 'Email',
  };
  function autoName(cat: string): string {
    const client = (getValues('clientName') || '').trim();
    const label = SCOPE_LABELS[cat] || cat;
    return client ? `${client} — ${label}` : label;
  }

  const handleFormSubmit = (data: ProjectFormData) => {
    // ── Edit mode: single project ───────────────────────────────
    if (isEditing) {
      if (!selectedMigrationCategory || selectedMigrationTypes.length === 0) {
        setMigrationTypeError('Select a migration type and at least one combination');
        showToast('error', 'Missing selections', 'Select a migration type and combination.');
        setStep('scope');
        return;
      }
      const migrationTypes = selectedMigrationTypes.map((id) => {
        const type = enabledMigrationTypes.find((t) => t.id === id);
        return type ? type.name : id;
      }).join(', ');
      onSubmit([{
        name: data.name || project!.name,
        clientName: (data as any).clientName || null,
        customerName: data.customerName,
        projectManager: data.projectManager,
        accountManager: data.accountManager,
        planType: data.planType as any,
        segment: (data.segment || null) as any,
        plannedStart: data.plannedStart!,
        plannedEnd: data.plannedEnd!,
        actualStart: data.actualStart || undefined,
        actualEnd: data.actualEnd || undefined,
        customerContact: data.customerContact || undefined,
        numberOfServers: data.numberOfServers != null && data.numberOfServers !== '' ? Number(data.numberOfServers) : undefined,
        projectMemory: data.projectMemory || undefined,
        estimatedCost: data.estimatedCost != null && data.estimatedCost !== '' ? Number(data.estimatedCost) : undefined,
        actualCost: data.actualCost != null && data.actualCost !== '' ? Number(data.actualCost) : undefined,
        description: data.description || '',
        notes: data.notes || '',
        phase: data.phase as any,
        status: data.status as any,
        sourcePlatform: '',
        targetPlatform: '',
        migrationTypes,
        isOveraged: (data.isOveraged as any) === 'YES' || data.isOveraged === true ? true : ((data.isOveraged as any) === 'NO' ? false : undefined),
        isEscalated: (data.isEscalated as any) === 'YES' || data.isEscalated === true ? true : ((data.isEscalated as any) === 'NO' ? false : undefined),
        overageAmount: data.overageAmount != null && data.overageAmount !== '' ? Number(data.overageAmount) : undefined,
      }]);
      return;
    }

    // ── Create mode: one project per selected scope ─────────────
    if (selectedCategories.length === 0) {
      setMigrationTypeError('Select at least one scope');
      showToast('error', 'Missing selections', 'Select at least one migration scope.');
      setStep('scope');
      return;
    }

    const shared = {
      clientName: (data as any).clientName || null,
      customerName: data.customerName,
      projectManager: data.projectManager,
      accountManager: data.accountManager,
      planType: data.planType as any,
      segment: (data.segment || null) as any,
      customerContact: data.customerContact || undefined,
      numberOfServers: data.numberOfServers != null && data.numberOfServers !== '' ? Number(data.numberOfServers) : undefined,
      projectMemory: data.projectMemory || undefined,
      estimatedCost: data.estimatedCost != null && data.estimatedCost !== '' ? Number(data.estimatedCost) : undefined,
      actualCost: data.actualCost != null && data.actualCost !== '' ? Number(data.actualCost) : undefined,
      description: data.description || '',
      notes: data.notes || '',
      phase: data.phase as any,
      status: data.status as any,
      sourcePlatform: '',
      targetPlatform: '',
      isOveraged: (data.isOveraged as any) === 'YES' || data.isOveraged === true ? true : ((data.isOveraged as any) === 'NO' ? false : undefined),
      isEscalated: (data.isEscalated as any) === 'YES' || data.isEscalated === true ? true : ((data.isEscalated as any) === 'NO' ? false : undefined),
      overageAmount: data.overageAmount != null && data.overageAmount !== '' ? Number(data.overageAmount) : undefined,
    };

    const isMulti = selectedCategories.length > 1;

    const results: CreateProjectInput[] = selectedCategories.map(cat => {
      const typeIds = categoryTypes[cat] || [];
      const migrationTypes = typeIds.map(id => {
        const type = enabledMigrationTypes.find(t => t.id === id);
        return type ? type.name : id;
      }).join(', ');

      const catTl: Partial<CategoryTimeline> = isMulti
        ? (categoryTimelines[cat] || {})
        : { plannedStart: data.plannedStart, plannedEnd: data.plannedEnd, actualStart: data.actualStart, actualEnd: data.actualEnd };

      // Roll up per-combination values into the scope project
      const combinationBudgets = typeIds.map(id => combinationDetails[id]?.budget).filter(Boolean).map(Number);
      const combinationSizes = typeIds.map(id => combinationDetails[id]?.size).filter(Boolean);
      const combinationServers = typeIds.map(id => combinationDetails[id]?.servers).filter(Boolean).map(Number);
      const scopeBudget = combinationBudgets.length > 0 ? combinationBudgets.reduce((a, b) => a + b, 0) : null;
      const scopeSize = combinationSizes.length > 0 ? combinationSizes.join(', ') : null;
      const scopeServers = combinationServers.length > 0 ? combinationServers.reduce((a, b) => a + b, 0) : null;

      return {
        ...shared,
        name: autoName(cat),
        migrationTypes,
        plannedStart: isMulti ? sharedSowStart : (catTl.plannedStart || ''),
        plannedEnd: isMulti ? sharedSowEnd : (catTl.plannedEnd || ''),
        actualStart: catTl.actualStart || undefined,
        actualEnd: catTl.actualEnd || undefined,
        estimatedCost: scopeBudget !== null ? scopeBudget : shared.estimatedCost,
        projectMemory: scopeSize || shared.projectMemory,
        numberOfServers: scopeServers !== null ? scopeServers : shared.numberOfServers,
      };
    });

    onSubmit(results);
  };

  const currentStepIdx = STEPS.findIndex((s) => s.id === step);

  // Template preview — first selected scope / first type
  const templatePreview = (() => {
    if (!templates.length) return null;
    const allTypeIds = isEditing ? selectedMigrationTypes : Object.values(categoryTypes).flat();
    if (!allTypeIds.length) return null;
    const typeId = allTypeIds[0];
    const migrationType = enabledMigrationTypes.find((t) => t.id === typeId);
    if (!migrationType) return null;
    return templates.find((t) => t.code === migrationType.code.toUpperCase() || t.name.toUpperCase().includes(migrationType.code.toUpperCase())) || null;
  })();

  const handleCreateClick = async () => {
    const valid = await trigger(STEP_FIELDS[step]);
    if (!valid) { showToast('error', 'Please fix errors', 'Check all required fields on this step first.'); return; }
    handleSubmit(handleFormSubmit, () => { showToast('error', 'Please fix errors', 'Check all required fields.'); })();
  };

  // Determine primary category for Details step (email migration check)
  const primaryCategory = isEditing ? selectedMigrationCategory : (selectedCategories[0] || null);

  const INPUT_CLS = 'w-full px-3 py-2 border border-blue-200 rounded-lg bg-white text-slate-900 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none';

  return (
    <form onSubmit={(e) => e.preventDefault()}
      className="flex flex-col h-full" onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}>

      {/* ── Step tabs ───────────────────────────────────────────── */}
      <div className="flex items-center gap-0 mb-6 bg-white border border-blue-100 rounded-xl overflow-hidden shadow-sm">
        {STEPS.map((s, i) => {
          const isActive = s.id === step;
          const isDone = i < currentStepIdx;
          return (
            <button key={s.id} type="button" onClick={() => i <= currentStepIdx ? goToStep(s.id) : null}
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
            {/* Show project name field only in edit mode */}
            {isEditing && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Project Name *" {...register('name')} error={errors.name?.message} />
                <Input label="Client / Account" placeholder="e.g. Peak Mining" {...register('clientName' as any)} />
              </div>
            )}
            {!isEditing && (
              <Input label="Client / Account" placeholder="e.g. Peak Mining" {...register('clientName' as any)} />
            )}
            <Input label="Customer Name *" {...register('customerName')} error={errors.customerName?.message} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project Manager <span className="text-red-500">*</span></label>
                <input list="pm-list" {...register('projectManager')} disabled={!!defaultManagerName}
                  placeholder="Type or select..."
                  className={`${INPUT_CLS} ${defaultManagerName ? 'opacity-60 cursor-not-allowed' : ''}`} />
                <datalist id="pm-list">
                  {users.filter((u) => u.role === 'PROJECT_MANAGER' || u.role === 'ADMIN').map((u) => <option key={u.name} value={u.name} />)}
                </datalist>
                {errors.projectManager && <p className="mt-1 text-xs text-red-600">{errors.projectManager.message}</p>}
                {defaultManagerName && <p className="mt-1 text-xs text-blue-600">Auto-assigned to you</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Account Manager <span className="text-red-500">*</span></label>
                <select {...register('accountManager')} className={INPUT_CLS}>
                  <option value="">Select account manager</option>
                  {mergeAccountManagers(users).map((am) => <option key={am} value={am}>{am}</option>)}
                </select>
                {errors.accountManager && <p className="mt-1 text-xs text-red-600">{errors.accountManager.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Select label="Plan Type *" options={planOptions} {...register('planType')} error={errors.planType?.message} />
              <Select label="Segment" options={segmentOptions} {...register('segment')} error={errors.segment?.message} />
              <Select label="Status *" options={statusOptions} {...register('status')} error={errors.status?.message} />
              <Select label="Current Phase *" options={phaseOptions} {...register('phase')} error={errors.phase?.message} />
            </div>
            <Textarea label="Description" rows={2} placeholder="Describe the project scope and objectives..."
              {...register('description')} error={errors.description?.message} />
          </div>
        )}

        {/* STEP 2: Scope */}
        {step === 'scope' && (
          <div className="space-y-5">

            {/* ── Edit mode: single scope (unchanged behaviour) ── */}
            {isEditing && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Migration Type <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {SCOPE_DEFS.map((cat) => (
                      <button key={cat.key} type="button"
                        onClick={() => { setSelectedMigrationCategory(cat.key); setSelectedMigrationTypes([]); setMigrationTypeError(''); setShowMigrationTypeDropdown(false); setMigrationTypeSearch(''); }}
                        className={`p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all font-medium ${selectedMigrationCategory === cat.key ? `ring-2 ${cat.ringColor} border-transparent ${cat.headerBg} ${cat.textColor}` : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}>
                        <span className="text-2xl">{cat.icon}</span>
                        <span className="text-sm">{cat.label}</span>
                      </button>
                    ))}
                  </div>
                  {migrationTypeError && !selectedMigrationCategory && <p className="mt-1 text-xs text-red-600">{migrationTypeError}</p>}
                </div>
                {selectedMigrationCategory && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Migration Combination(s) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative" ref={migrationTypeDropdownRef}>
                      <div onClick={() => setShowMigrationTypeDropdown(!showMigrationTypeDropdown)}
                        className={`min-h-[42px] px-3 py-2 border rounded-lg cursor-pointer bg-white flex items-start justify-between gap-2 ${migrationTypeError && selectedMigrationTypes.length === 0 ? 'border-red-400' : 'border-blue-200 hover:border-blue-400'}`}>
                        <div className="flex flex-wrap gap-1 flex-1">
                          {selectedMigrationTypes.length === 0
                            ? <span className="text-slate-400 text-sm">Select combination(s)...</span>
                            : selectedMigrationTypes.map((id) => {
                                const type = enabledMigrationTypes.find((t) => t.id === id);
                                return type ? (
                                  <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                                    {type.name}
                                    <button type="button" onClick={(e) => { e.stopPropagation(); toggleMigrationType(id); }}><X size={10} /></button>
                                  </span>
                                ) : null;
                              })}
                        </div>
                        {showMigrationTypeDropdown ? <ChevronUp size={16} className="text-slate-400 flex-shrink-0 mt-1" /> : <ChevronDown size={16} className="text-slate-400 flex-shrink-0 mt-1" />}
                      </div>
                      {migrationTypeError && selectedMigrationTypes.length === 0 && <p className="text-xs text-red-600 mt-1">{migrationTypeError}</p>}
                      {showMigrationTypeDropdown && (
                        <div className="absolute z-30 w-full mt-1 bg-white border border-blue-100 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          <div className="sticky top-0 bg-white p-2 border-b border-slate-100">
                            <input type="text" placeholder="Search combinations..."
                              value={migrationTypeSearch}
                              onChange={(e) => setMigrationTypeSearch(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full px-3 py-1.5 border border-blue-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                          </div>
                          {enabledMigrationTypes
                            .filter((t) => (t as any).category === selectedMigrationCategory || (t as any).category === 'Other')
                            .filter((t) => !migrationTypeSearch || t.name.toLowerCase().includes(migrationTypeSearch.toLowerCase()))
                            .map((type) => (
                              <label key={type.id} className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm">
                                <input type="checkbox" checked={selectedMigrationTypes.includes(type.id)} onChange={() => toggleMigrationType(type.id)}
                                  className="w-4 h-4 text-blue-600 rounded" />
                                {type.name}
                              </label>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Create mode: multi-scope ── */}
            {!isEditing && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Migration Scope(s) <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-slate-400 mb-3">Select all scopes for this client — each scope becomes a separate project.</p>
                  <div className="grid grid-cols-3 gap-3">
                    {SCOPE_DEFS.map((cat) => {
                      const selected = selectedCategories.includes(cat.key);
                      return (
                        <button key={cat.key} type="button"
                          onClick={() => toggleCategory(cat.key)}
                          className={`relative p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all font-medium ${selected ? `ring-2 ${cat.ringColor} border-transparent ${cat.headerBg} ${cat.textColor}` : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}>
                          <span className="text-2xl">{cat.icon}</span>
                          <span className="text-sm">{cat.label}</span>
                          <div className={`absolute top-2.5 right-2.5 w-4 h-4 rounded border-2 flex items-center justify-center text-[10px] font-bold ${selected ? `${cat.chipBg} ${cat.chipText} border-transparent` : 'border-slate-300 bg-white text-transparent'}`}>
                            {selected ? '✓' : ''}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {migrationTypeError && selectedCategories.length === 0 && <p className="mt-1 text-xs text-red-600">{migrationTypeError}</p>}
                </div>

                {/* Per-category combination pickers */}
                {selectedCategories.map(cat => {
                  const scopeInfo = SCOPE_DEFS.find(s => s.key === cat)!;
                  const selected = categoryTypes[cat] || [];
                  const isOpen = openCategoryDropdown === cat;
                  const search = categorySearch[cat] || '';
                  const types = enabledMigrationTypes.filter(t => (t as any).category === cat || (t as any).category === 'Other');
                  const filtered = search ? types.filter(t => t.name.toLowerCase().includes(search.toLowerCase())) : types;

                  return (
                    <div key={cat}>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        {scopeInfo.label} — Migration Combination(s) <span className="text-red-500">*</span>
                      </label>
                      <div className="relative" ref={isOpen ? openCategoryRef : null}>
                        <div
                          onClick={() => setOpenCategoryDropdown(isOpen ? null : cat)}
                          className={`min-h-[42px] px-3 py-2 border rounded-lg cursor-pointer bg-white flex items-start justify-between gap-2 ${migrationTypeError && selected.length === 0 ? 'border-red-400' : 'border-blue-200 hover:border-blue-400'}`}
                        >
                          <div className="flex flex-wrap gap-1 flex-1">
                            {selected.length === 0
                              ? <span className="text-slate-400 text-sm">Select combination(s)...</span>
                              : selected.map((id) => {
                                  const type = enabledMigrationTypes.find(t => t.id === id);
                                  return type ? (
                                    <span key={id} className={`inline-flex items-center gap-1 px-2 py-0.5 ${scopeInfo.chipBg} ${scopeInfo.chipText} text-xs rounded-full`}>
                                      {type.name}
                                      <button type="button" onClick={(e) => { e.stopPropagation(); toggleCategoryType(cat, id); }}><X size={10} /></button>
                                    </span>
                                  ) : null;
                                })}
                          </div>
                          {isOpen ? <ChevronUp size={16} className="text-slate-400 flex-shrink-0 mt-1" /> : <ChevronDown size={16} className="text-slate-400 flex-shrink-0 mt-1" />}
                        </div>
                        {isOpen && (
                          <div className="absolute z-[200] w-full mt-1 bg-white border border-blue-100 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            <div className="sticky top-0 bg-white p-2 border-b border-slate-100">
                              <input type="text" placeholder="Search combinations..."
                                value={search}
                                onChange={(e) => setCategorySearch(prev => ({ ...prev, [cat]: e.target.value }))}
                                className="w-full px-3 py-1.5 border border-blue-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                            </div>
                            {filtered.map((type) => (
                              <label key={type.id} className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm">
                                <input type="checkbox" checked={selected.includes(type.id)} onChange={() => toggleCategoryType(cat, type.id)}
                                  className="w-4 h-4 text-blue-600 rounded" />
                                {type.name}
                              </label>
                            ))}
                            {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No combinations found</p>}
                          </div>
                        )}
                      </div>

                      {/* Per-combination budget, project size, and servers */}
                      {selected.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {selected.map(id => {
                            const ctype = enabledMigrationTypes.find(t => t.id === id);
                            if (!ctype) return null;
                            const det = combinationDetails[id] || { budget: '', size: '', servers: '' };
                            return (
                              <div key={id} className={`rounded-lg border p-3 ${scopeInfo.headerBg} border-opacity-60`}>
                                <p className={`text-xs font-semibold mb-2 ${scopeInfo.textColor}`}>{ctype.name}</p>
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <label className="block text-xs text-slate-500 mb-1">Budget ($)</label>
                                    <input type="number" placeholder="0" min="0" value={det.budget}
                                      onChange={e => updateCombinationDetail(id, 'budget', e.target.value)}
                                      className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white" />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-slate-500 mb-1">Project Size</label>
                                    <input type="text" placeholder="e.g. 512 GB" value={det.size}
                                      onChange={e => updateCombinationDetail(id, 'size', e.target.value)}
                                      className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white" />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-slate-500 mb-1">No. of Servers</label>
                                    <input type="number" placeholder="0" min="0" step="1" value={det.servers}
                                      onChange={e => updateCombinationDetail(id, 'servers', e.target.value)}
                                      className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white" />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

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
          </div>
        )}

        {/* STEP 3: Timeline */}
        {step === 'timeline' && (
          <div className="space-y-4">
            {/* Multi-scope (create mode, 2+ categories): shared SOW + per-scope kickoff */}
            {!isEditing && selectedCategories.length > 1 ? (
              <div className="space-y-5">
                {/* Customer Email at top */}
                <Input label="Customer Email (for server alerts)" type="email" placeholder="customer@example.com"
                  {...register('customerContact')} error={errors.customerContact?.message} />

                {/* Shared SOW dates */}
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">SOW Dates (shared across all scopes)</span>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">SOW Start Date *</label>
                      <input type="date" value={sharedSowStart}
                        onChange={e => updateSharedSow('start', e.target.value)}
                        className={INPUT_CLS} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">SOW End Date *</label>
                      <input type="date" value={sharedSowEnd}
                        onChange={e => updateSharedSow('end', e.target.value)}
                        className={INPUT_CLS} />
                    </div>
                  </div>
                </div>

                {/* Per-scope kickoff dates */}
                {selectedCategories.map(cat => {
                  const tl = categoryTimelines[cat] || { plannedStart: '', plannedEnd: '', actualStart: '', actualEnd: '' };
                  const scopeInfo = SCOPE_DEFS.find(s => s.key === cat)!;
                  return (
                    <div key={cat} className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className={`px-4 py-2.5 ${scopeInfo.headerBg}`}>
                        <span className={`text-xs font-bold uppercase tracking-wider ${scopeInfo.textColor}`}>{scopeInfo.label} Timeline</span>
                      </div>
                      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Kick-off Start Date</label>
                          <input type="date" value={tl.actualStart}
                            onChange={e => updateCategoryTimeline(cat, 'actualStart', e.target.value)}
                            className={INPUT_CLS} />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Project End Date (auto)</label>
                          <input type="date" value={tl.actualEnd} readOnly
                            className={`${INPUT_CLS} bg-blue-50 text-slate-500 cursor-not-allowed`} />
                          <p className="text-xs text-slate-400 mt-1">Auto-filled from kickoff + SOW duration</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Single scope or edit mode: use form fields
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="SOW Start Date *" type="date" {...register('plannedStart')} error={errors.plannedStart?.message} />
                  <Input label="SOW End Date *" type="date" {...register('plannedEnd')} error={errors.plannedEnd?.message} />
                  <Input label="Kick-off Start Date" type="date" {...register('actualStart')} error={errors.actualStart?.message} />
                  <Input label="Project End Date (auto from kickoff)" type="date" {...register('actualEnd')} error={errors.actualEnd?.message} className="bg-blue-50" helperText="Auto-filled based on kickoff date + SOW duration" />
                </div>
                <Input label="Customer Email (for server alerts)" type="email" placeholder="customer@example.com"
                  {...register('customerContact')} error={errors.customerContact?.message} />
              </>
            )}
          </div>
        )}

        {/* STEP 4: Details */}
        {step === 'details' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Overage</label>
                <select {...register('isOveraged')} className={INPUT_CLS}>
                  <option value="">— Not specified —</option>
                  <option value="NO">No</option>
                  <option value="YES">Yes</option>
                </select>
              </div>
              <Input label="Overage Amount ($)" type="number" min="0" step="0.01" placeholder="0.00" {...register('overageAmount')} error={errors.overageAmount?.message} />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Escalation</label>
                <select {...register('isEscalated')} className={INPUT_CLS}>
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
            <Button type="button" onClick={handleCreateClick} isLoading={isLoading}>
              {isEditing ? 'Update Project' : selectedCategories.length > 1 ? `Create ${selectedCategories.length} Projects` : 'Create Project'}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
