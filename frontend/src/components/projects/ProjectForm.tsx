'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Card } from '@/components/ui/Card';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { templatesApi } from '@/services/api';
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
  numberOfServers: z.coerce.number({ invalid_type_error: 'Must be a number' }).int('Must be a whole number').nonnegative('Must be 0 or more').or(z.literal('')),
  projectMemory: z.string().optional(),
  estimatedCost: z.coerce.number({ invalid_type_error: 'Estimated cost must be a number' }).nonnegative('Must be 0 or more').or(z.literal('')),
  actualCost: z.coerce.number().nonnegative().optional().or(z.literal('')).optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  phase: z.string().min(1, 'Phase is required'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'], { required_error: 'Status is required' }),
  isOveraged: z.string().optional(),
  isEscalated: z.string().optional(),
  overageAmount: z.coerce.number().nonnegative().optional().or(z.literal('')),
});

type ProjectFormData = z.infer<typeof baseSchema>;

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

  const [accountManagers, setAccountManagers] = useState<string[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    // Load account managers from settings (Team Management tab in Settings)
    try {
      const saved = localStorage.getItem('pmoSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        const members: { name: string; role: string }[] = parsed.teamMembers || [];
        setAccountManagers(members.filter((m) => m.role === 'Account Manager').map((m) => m.name));
      }
    } catch {}
    templatesApi.getAll().then((res) => {
      if (res.success) setTemplates(res.data || []);
    }).catch(() => {});
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
    const handleClickOutside = (event: MouseEvent) => {
      if (sourceDropdownRef.current && !sourceDropdownRef.current.contains(event.target as Node)) {
        setShowSourceDropdown(false);
      }
      if (targetDropdownRef.current && !targetDropdownRef.current.contains(event.target as Node)) {
        setShowTargetDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Pre-fill from existing project
  useEffect(() => {
    if (project?.migrationTypes) {
      setSelectedMigrationTypes(
        project.migrationTypes.split(',').map((t: string) => t.trim().toLowerCase())
      );
    }
    if (project?.sourcePlatform) {
      setSelectedSourcePlatforms(project.sourcePlatform.split(',').map((p: string) => p.trim()));
    }
    if (project?.targetPlatform) {
      setSelectedTargetPlatforms(project.targetPlatform.split(',').map((p: string) => p.trim()));
    }
  }, [project]);

  const defaultPlanType = planTypes[0]?.code || 'SILVER';
  const defaultPhase = [...phases].sort((a, b) => a.order - b.order)[0]?.code || 'KICKOFF';

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    getValues,
  } = useForm<ProjectFormData>({
    resolver: zodResolver(baseSchema),
    defaultValues: project
      ? {
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
        }
      : {
          planType: defaultPlanType,
          phase: defaultPhase,
          status: 'ACTIVE',
          projectManager: defaultManagerName || '',
        },
  });

  // When settings change (e.g. after navigating from Settings page), fix stale select values.
  // Only applies to new projects — editing an existing project keeps the saved values.
  useEffect(() => {
    if (project) return;
    const validPlanCodes = planTypes.filter((p) => p.code).map((p) => p.code);
    const validPhaseCodes = phases.filter((p) => p.code).map((p) => p.code);
    const currentPlan = getValues('planType');
    const currentPhase = getValues('phase');
    if (currentPlan && !validPlanCodes.includes(currentPlan)) {
      setValue('planType', validPlanCodes[0] || 'SILVER');
    } else if (!currentPlan && validPlanCodes.length) {
      setValue('planType', validPlanCodes[0]);
    }
    if (currentPhase && !validPhaseCodes.includes(currentPhase)) {
      setValue('phase', validPhaseCodes[0] || 'KICKOFF');
    } else if (!currentPhase && validPhaseCodes.length) {
      setValue('phase', validPhaseCodes[0]);
    }
  }, [planTypes, phases]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMigrationType = (id: string) => {
    setSelectedMigrationTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
    setMigrationTypeError('');
  };

  const toggleSourcePlatform = (name: string) => {
    setSelectedSourcePlatforms((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
    setSourcePlatformError('');
  };

  const toggleTargetPlatform = (name: string) => {
    setSelectedTargetPlatforms((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
    setTargetPlatformError('');
  };

  const handleInvalid = () => {
    // Scroll to first visible error and notify user
    const firstError = document.querySelector('[data-error="true"], .text-red-600');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('error', 'Please fix the errors', 'Check all required fields before submitting.');
  };

  const handleFormSubmit = (data: ProjectFormData) => {
    let hasError = false;
    if (selectedMigrationTypes.length === 0) {
      setMigrationTypeError('Please select at least one migration type');
      hasError = true;
    }
    if (selectedSourcePlatforms.length === 0) {
      setSourcePlatformError('Please select at least one source platform');
      hasError = true;
    }
    if (selectedTargetPlatforms.length === 0) {
      setTargetPlatformError('Please select at least one target platform');
      hasError = true;
    }
    if (hasError) {
      showToast('error', 'Missing required selections', 'Please select migration type, source platform, and target platform.');
      // Scroll to the first visible error
      setTimeout(() => {
        const el = document.querySelector('.text-red-600');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }

    const submitData: CreateProjectInput = {
      name: data.name,
      customerName: data.customerName,
      projectManager: data.projectManager,
      accountManager: data.accountManager,
      planType: data.planType as any,
      plannedStart: data.plannedStart,
      plannedEnd: data.plannedEnd,
      actualStart: data.actualStart || undefined,
      actualEnd: data.actualEnd || undefined,
      numberOfServers: data.numberOfServers !== '' && data.numberOfServers !== undefined ? Number(data.numberOfServers) : undefined,
      projectMemory: data.projectMemory || undefined,
      estimatedCost: data.estimatedCost ? Number(data.estimatedCost) : undefined,
      actualCost: data.actualCost ? Number(data.actualCost) : undefined,
      description: data.description || '',
      notes: data.notes || '',
      phase: data.phase as any,
      status: data.status,
      migrationTypes: selectedMigrationTypes.map((id) => {
        const type = enabledMigrationTypes.find((t) => t.id === id);
        return type ? `${type.name} Migration` : id;
      }).join(', '),
      sourcePlatform: selectedSourcePlatforms.join(', '),
      targetPlatform: selectedTargetPlatforms.join(', '),
      isOveraged: data.isOveraged === 'YES' ? true : (data.isOveraged === 'NO' ? false : undefined),
      isEscalated: data.isEscalated === 'YES' ? true : (data.isEscalated === 'NO' ? false : undefined),
      overageAmount: data.overageAmount !== '' && data.overageAmount !== undefined ? Number(data.overageAmount) : undefined,
    };
    onSubmit(submitData);
  };

  const planOptions = planTypes
    .filter((p) => p.code)
    .map((p) => ({ value: p.code, label: p.name }));
  const phaseOptions = [...phases]
    .sort((a, b) => a.order - b.order)
    .filter((p) => p.code)
    .map((p) => ({ value: p.code, label: p.name }));
  const statusOptions = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'ON_HOLD', label: 'On Hold' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'COMPLETED', label: 'Completed' },
  ];

  // Get unique categories from platforms
  const sourceCategories = [...new Set(sourcePlatforms.map((p) => p.category))];
  const targetCategories = [...new Set(targetPlatforms.map((p) => p.category))];

  return (
    <form onSubmit={handleSubmit(handleFormSubmit, handleInvalid)} className="space-y-6">
      {/* Customer Information */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Customer Information <span className="text-red-500 text-sm font-normal ml-1">* All fields required</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Customer Name *"
            {...register('customerName')}
            error={errors.customerName?.message}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Account Manager <span className="text-red-500">*</span>
            </label>
            <input
              list="account-managers-list"
              {...register('accountManager')}
              placeholder="Type or select account manager"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <datalist id="account-managers-list">
              {accountManagers.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {errors.accountManager && (
              <p className="mt-1 text-sm text-red-600">{errors.accountManager.message}</p>
            )}
          </div>
        </div>
      </Card>

      {/* Project Information */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Project Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Project Name *"
            {...register('name')}
            error={errors.name?.message}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project Manager <span className="text-red-500">*</span>
            </label>
            <input
              list="project-managers-list"
              {...register('projectManager')}
              placeholder="Type or select project manager"
              disabled={!!defaultManagerName}
              className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent ${defaultManagerName ? 'bg-gray-50 dark:bg-gray-700/50 cursor-not-allowed opacity-70' : ''}`}
            />
            <datalist id="project-managers-list">
              {users.filter((u) => u.role === 'MANAGER' || u.role === 'ADMIN').map((u) => (
                <option key={u.name} value={u.name} />
              ))}
            </datalist>
            {errors.projectManager && (
              <p className="mt-1 text-sm text-red-600">{errors.projectManager.message}</p>
            )}
            {defaultManagerName && (
              <p className="mt-1 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588ZM8 5.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/></svg>
                Auto-assigned to you as the project manager
              </p>
            )}
          </div>
          <Select
            label="Plan Type *"
            options={planOptions}
            {...register('planType')}
            error={errors.planType?.message}
          />
          <Select
            label="Status *"
            options={statusOptions}
            {...register('status')}
            error={errors.status?.message}
          />
          <Select
            label="Current Phase *"
            options={phaseOptions}
            {...register('phase')}
            error={errors.phase?.message}
          />
        </div>
        <div className="mt-4">
          <Textarea
            label="Description"
            rows={3}
            placeholder="Describe the project scope and objectives..."
            {...register('description')}
            error={errors.description?.message}
          />
        </div>
      </Card>

      {/* Migration Scope */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Migration Scope</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Select the types of migration included in this project <span className="text-red-500">*</span>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
          {enabledMigrationTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => toggleMigrationType(type.id)}
              className={`p-4 border-2 rounded-lg text-left transition-all ${
                selectedMigrationTypes.includes(type.id)
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{type.icon}</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{type.name}</p>
                  {selectedMigrationTypes.includes(type.id) && (
                    <span className="text-xs text-primary-600 dark:text-primary-400">Selected ✓</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
        {migrationTypeError && (
          <p className="text-sm text-red-600 mb-3">{migrationTypeError}</p>
        )}

        {selectedMigrationTypes.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Selected:</strong>{' '}
                {selectedMigrationTypes.map((id) => {
                  const type = enabledMigrationTypes.find((t) => t.id === id);
                  return type ? `${type.icon} ${type.name}` : id;
                }).join(' + ')}
              </p>
            </div>
            {/* Template preview */}
            {templates.length > 0 && selectedMigrationTypes.slice(0, 1).map((typeId) => {
              const migrationType = enabledMigrationTypes.find((t) => t.id === typeId);
              if (!migrationType) return null;
              const tpl = templates.find((t) =>
                t.code === migrationType.code.toUpperCase() ||
                t.name.toUpperCase().includes(migrationType.code.toUpperCase())
              );
              if (!tpl?.phases?.length) return null;
              return (
                <div key={typeId} className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-2">
                    📋 Template: <span className="font-bold">{tpl.name}</span> — will auto-create {tpl.phases.reduce((s: number, ph: any) => s + (ph.tasks?.length || 0), 0)} tasks across {tpl.phases.length} phases
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {tpl.phases.map((ph: any) => (
                      <span key={ph.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 rounded-full">
                        {ph.name} ({ph.tasks?.length || 0} tasks)
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Source Platform Multi-Select */}
          <div className="relative" ref={sourceDropdownRef}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Source Platform(s) <span className="text-red-500">*</span>
            </label>
            <div
              className={`min-h-[42px] px-3 py-2 border rounded-lg cursor-pointer bg-white dark:bg-gray-700 hover:border-gray-400 transition-colors ${
                sourcePlatformError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
              }`}
              onClick={() => setShowSourceDropdown(!showSourceDropdown)}
            >
              {selectedSourcePlatforms.length === 0 ? (
                <span className="text-gray-400">Select source platform(s)</span>
              ) : (
                <div className="flex flex-wrap gap-1 pr-6">
                  {selectedSourcePlatforms.map((platform) => (
                    <span
                      key={platform}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-xs rounded-full"
                    >
                      {platform}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleSourcePlatform(platform); }}
                        className="hover:text-blue-600"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="absolute right-3 top-3">
                {showSourceDropdown ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </div>
            </div>
            {sourcePlatformError && <p className="text-sm text-red-600 mt-1">{sourcePlatformError}</p>}

            {showSourceDropdown && (
              <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {sourceCategories.map((category) => {
                  const items = sourcePlatforms.filter((p) => p.category === category);
                  if (!items.length) return null;
                  return (
                    <div key={category}>
                      <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        {category}
                      </div>
                      {items.map((platform) => (
                        <label key={platform.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedSourcePlatforms.includes(platform.name)}
                            onChange={() => toggleSourcePlatform(platform.name)}
                            className="w-4 h-4 text-primary-600 rounded"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{platform.name}</span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Target Platform Multi-Select */}
          <div className="relative" ref={targetDropdownRef}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Target Platform(s) <span className="text-red-500">*</span>
            </label>
            <div
              className={`min-h-[42px] px-3 py-2 border rounded-lg cursor-pointer bg-white dark:bg-gray-700 hover:border-gray-400 transition-colors ${
                targetPlatformError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
              }`}
              onClick={() => setShowTargetDropdown(!showTargetDropdown)}
            >
              {selectedTargetPlatforms.length === 0 ? (
                <span className="text-gray-400">Select target platform(s)</span>
              ) : (
                <div className="flex flex-wrap gap-1 pr-6">
                  {selectedTargetPlatforms.map((platform) => (
                    <span
                      key={platform}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 text-xs rounded-full"
                    >
                      {platform}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleTargetPlatform(platform); }}
                        className="hover:text-green-600"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="absolute right-3 top-3">
                {showTargetDropdown ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </div>
            </div>
            {targetPlatformError && <p className="text-sm text-red-600 mt-1">{targetPlatformError}</p>}

            {showTargetDropdown && (
              <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {targetCategories.map((category) => {
                  const items = targetPlatforms.filter((p) => p.category === category);
                  if (!items.length) return null;
                  return (
                    <div key={category}>
                      <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        {category}
                      </div>
                      {items.map((platform) => (
                        <label key={platform.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedTargetPlatforms.includes(platform.name)}
                            onChange={() => toggleTargetPlatform(platform.name)}
                            className="w-4 h-4 text-primary-600 rounded"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{platform.name}</span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {(selectedSourcePlatforms.length > 0 || selectedTargetPlatforms.length > 0) && (
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <strong>Migration Path:</strong>{' '}
              {selectedSourcePlatforms.length > 0 ? selectedSourcePlatforms.join(', ') : 'Not selected'}
              {' → '}
              {selectedTargetPlatforms.length > 0 ? selectedTargetPlatforms.join(', ') : 'Not selected'}
            </p>
          </div>
        )}
      </Card>

      {/* Timeline */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Timeline</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="SOW Start Date *"
            type="date"
            {...register('plannedStart')}
            error={errors.plannedStart?.message}
          />
          <Input
            label="SOW End Date *"
            type="date"
            {...register('plannedEnd')}
            error={errors.plannedEnd?.message}
          />
          <Input
            label="Kick-off Start Date"
            type="date"
            {...register('actualStart')}
            error={errors.actualStart?.message}
          />
          <Input
            label="Project End Date"
            type="date"
            {...register('actualEnd')}
            error={errors.actualEnd?.message}
          />
        </div>
      </Card>

      {/* Cost Summary */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Cost Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Budget ($)"
            type="number"
            placeholder="0"
            {...register('estimatedCost')}
            error={errors.estimatedCost?.message}
          />
          <Input
            label="Number of Servers"
            type="number"
            placeholder="0"
            min="0"
            step="1"
            {...register('numberOfServers')}
            error={errors.numberOfServers?.message}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project Memory
            </label>
            <input
              type="text"
              placeholder="e.g. 512 GB, 2 TB"
              {...register('projectMemory')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            />
            {errors.projectMemory && (
              <p className="mt-1 text-sm text-red-600">{errors.projectMemory.message}</p>
            )}
          </div>
        </div>
      </Card>

      {/* Project Flags */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Project Flags <span className="text-xs text-gray-400 font-normal ml-1">(All optional)</span></h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Overage</label>
            <select
              {...register('isOveraged')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            >
              <option value="">— Not specified —</option>
              <option value="NO">No</option>
              <option value="YES">Yes</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">Is this project overaged?</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Overage Amount ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              {...register('overageAmount')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Overage amount in dollars</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Escalation</label>
            <select
              {...register('isEscalated')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            >
              <option value="">— Not specified —</option>
              <option value="NO">No</option>
              <option value="YES">Yes</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">Requires immediate attention?</p>
          </div>
        </div>
      </Card>

      {/* Notes */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Notes & Updates</h3>
        <Textarea
          label="Notes"
          rows={4}
          placeholder="Add project notes, kickoff summary, or current status..."
          {...register('notes')}
          error={errors.notes?.message}
        />
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => window.history.back()}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {project ? 'Update Project' : 'Create Project'}
        </Button>
      </div>
    </form>
  );
}
