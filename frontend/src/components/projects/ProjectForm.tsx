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
import type { Project, CreateProjectInput } from '@/types';

const projectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  customerName: z.string().min(1, 'Customer name is required'),
  projectManager: z.string().min(1, 'Project manager is required'),
  accountManager: z.string().min(1, 'Account manager is required'),
  planType: z.enum(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']),
  plannedStart: z.string().min(1, 'Planned start date is required'),
  plannedEnd: z.string().min(1, 'Planned end date is required'),
  actualStart: z.string().optional(),
  actualEnd: z.string().optional(),
  sourcePlatform: z.string().optional(),
  targetPlatform: z.string().optional(),
  estimatedCost: z.coerce.number().positive().optional().or(z.literal('')),
  actualCost: z.coerce.number().positive().optional().or(z.literal('')),
  description: z.string().optional(),
  notes: z.string().optional(),
  phase: z.enum(['KICKOFF', 'MIGRATION', 'VALIDATION', 'CLOSURE', 'COMPLETED']).optional(),
  status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
});

// Default source platforms
const defaultSourcePlatforms = [
  { id: '1', name: 'On-Premise Exchange', category: 'Email' },
  { id: '2', name: 'Google Workspace', category: 'Email' },
  { id: '3', name: 'Lotus Notes', category: 'Email' },
  { id: '4', name: 'On-Premise SharePoint', category: 'Content' },
  { id: '5', name: 'File Servers', category: 'Content' },
  { id: '6', name: 'Box', category: 'Content' },
  { id: '7', name: 'Dropbox', category: 'Content' },
  { id: '8', name: 'Google Drive', category: 'Content' },
  { id: '9', name: 'Slack', category: 'Messaging' },
  { id: '10', name: 'Skype for Business', category: 'Messaging' },
  { id: '11', name: 'Cisco Webex', category: 'Messaging' },
  { id: '12', name: 'Zoom', category: 'Messaging' },
];

// Default target platforms
const defaultTargetPlatforms = [
  { id: '1', name: 'Microsoft 365', category: 'Suite' },
  { id: '2', name: 'Exchange Online', category: 'Email' },
  { id: '3', name: 'SharePoint Online', category: 'Content' },
  { id: '4', name: 'OneDrive for Business', category: 'Content' },
  { id: '5', name: 'Microsoft Teams', category: 'Messaging' },
  { id: '6', name: 'Azure', category: 'Cloud' },
  { id: '7', name: 'AWS', category: 'Cloud' },
  { id: '8', name: 'Google Cloud', category: 'Cloud' },
];

// Migration types for the form
const defaultMigrationTypes = [
  { id: 'content', name: 'Content Migration', icon: '📁', color: '#3B82F6' },
  { id: 'email', name: 'Email Migration', icon: '📧', color: '#10B981' },
  { id: 'messaging', name: 'Messaging Migration', icon: '💬', color: '#8B5CF6' },
];

type ProjectFormData = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  project?: Project;
  onSubmit: (data: CreateProjectInput) => void;
  isLoading?: boolean;
}

export function ProjectForm({ project, onSubmit, isLoading }: ProjectFormProps) {
  const [selectedMigrationTypes, setSelectedMigrationTypes] = useState<string[]>([]);
  const [migrationTypes, setMigrationTypes] = useState(defaultMigrationTypes);
  const [selectedSourcePlatforms, setSelectedSourcePlatforms] = useState<string[]>([]);
  const [selectedTargetPlatforms, setSelectedTargetPlatforms] = useState<string[]>([]);
  const [sourcePlatforms, setSourcePlatforms] = useState(defaultSourcePlatforms);
  const [targetPlatforms, setTargetPlatforms] = useState(defaultTargetPlatforms);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showTargetDropdown, setShowTargetDropdown] = useState(false);
  const sourceDropdownRef = useRef<HTMLDivElement>(null);
  const targetDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
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

  // Load migration types and platforms from settings and existing project
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pmoSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.migrationTypes) {
          const enabledTypes = parsed.migrationTypes
            .filter((t: any) => t.enabled)
            .map((t: any) => ({ id: t.code.toLowerCase(), name: t.name, icon: t.icon, color: t.color }));
          if (enabledTypes.length > 0) {
            setMigrationTypes(enabledTypes);
          }
        }
        if (parsed.sourcePlatforms && parsed.sourcePlatforms.length > 0) {
          setSourcePlatforms(parsed.sourcePlatforms);
        }
        if (parsed.targetPlatforms && parsed.targetPlatforms.length > 0) {
          setTargetPlatforms(parsed.targetPlatforms);
        }
      }
    } catch (e) {
      console.error('Failed to load settings');
    }

    // Load existing migration types from project
    if (project?.migrationTypes) {
      const types = project.migrationTypes.split(',').map((t: string) => t.trim().toLowerCase());
      setSelectedMigrationTypes(types);
    }

    // Load existing platforms from project
    if (project?.sourcePlatform) {
      const platforms = project.sourcePlatform.split(',').map((p: string) => p.trim());
      setSelectedSourcePlatforms(platforms);
    }
    if (project?.targetPlatform) {
      const platforms = project.targetPlatform.split(',').map((p: string) => p.trim());
      setSelectedTargetPlatforms(platforms);
    }
  }, [project]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
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
          sourcePlatform: project.sourcePlatform || '',
          targetPlatform: project.targetPlatform || '',
          estimatedCost: project.estimatedCost || '',
          actualCost: project.actualCost || '',
          description: project.description || '',
          notes: project.notes || '',
          phase: project.phase,
          status: project.status,
        }
      : {
          planType: 'SILVER',
          phase: 'KICKOFF',
          status: 'ACTIVE',
        },
  });

  const toggleMigrationType = (id: string) => {
    setSelectedMigrationTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const toggleSourcePlatform = (name: string) => {
    setSelectedSourcePlatforms((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  const toggleTargetPlatform = (name: string) => {
    setSelectedTargetPlatforms((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  const removeSourcePlatform = (name: string) => {
    setSelectedSourcePlatforms((prev) => prev.filter((p) => p !== name));
  };

  const removeTargetPlatform = (name: string) => {
    setSelectedTargetPlatforms((prev) => prev.filter((p) => p !== name));
  };

  const handleFormSubmit = (data: ProjectFormData) => {
    const submitData: CreateProjectInput = {
      ...data,
      estimatedCost: data.estimatedCost ? Number(data.estimatedCost) : undefined,
      actualCost: data.actualCost ? Number(data.actualCost) : undefined,
      actualStart: data.actualStart || undefined,
      actualEnd: data.actualEnd || undefined,
      // Save migration types to dedicated field (uppercase for consistency)
      migrationTypes: selectedMigrationTypes.length > 0 
        ? selectedMigrationTypes.map(t => t.toUpperCase()).join(',')
        : undefined,
      // Save multiple platforms as comma-separated values
      sourcePlatform: selectedSourcePlatforms.length > 0
        ? selectedSourcePlatforms.join(', ')
        : undefined,
      targetPlatform: selectedTargetPlatforms.length > 0
        ? selectedTargetPlatforms.join(', ')
        : undefined,
    };
    onSubmit(submitData);
  };

  const planOptions = [
    { value: 'BRONZE', label: 'Bronze' },
    { value: 'SILVER', label: 'Silver' },
    { value: 'GOLD', label: 'Gold' },
    { value: 'PLATINUM', label: 'Platinum' },
  ];

  const phaseOptions = [
    { value: 'KICKOFF', label: 'Kickoff' },
    { value: 'MIGRATION', label: 'Migration' },
    { value: 'VALIDATION', label: 'Validation' },
    { value: 'CLOSURE', label: 'Closure' },
    { value: 'COMPLETED', label: 'Completed' },
  ];

  const statusOptions = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'ON_HOLD', label: 'On Hold' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Customer Information */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Customer Name"
            {...register('customerName')}
            error={errors.customerName?.message}
          />
          <Input
            label="Account Manager"
            {...register('accountManager')}
            error={errors.accountManager?.message}
          />
        </div>
      </Card>

      {/* Project Information */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Project Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Project Name"
            {...register('name')}
            error={errors.name?.message}
          />
          <Input
            label="Project Manager"
            {...register('projectManager')}
            error={errors.projectManager?.message}
          />
          <Select
            label="Plan Type"
            options={planOptions}
            {...register('planType')}
            error={errors.planType?.message}
          />
          <Select
            label="Status"
            options={statusOptions}
            {...register('status')}
            error={errors.status?.message}
          />
          <Select
            label="Current Phase"
            options={phaseOptions}
            {...register('phase')}
            error={errors.phase?.message}
          />
        </div>
        <div className="mt-4">
          <Textarea
            label="Description"
            rows={3}
            {...register('description')}
            error={errors.description?.message}
          />
        </div>
      </Card>

      {/* Migration Scope */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Migration Scope</h3>
        <p className="text-sm text-gray-500 mb-4">Select the types of migration included in this project</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {migrationTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => toggleMigrationType(type.id)}
              className={`p-4 border-2 rounded-lg text-left transition-all ${
                selectedMigrationTypes.includes(type.id)
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{type.icon}</span>
                <div>
                  <p className="font-medium text-gray-900">{type.name}</p>
                  {selectedMigrationTypes.includes(type.id) && (
                    <span className="text-xs text-primary-600">Selected</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {selectedMigrationTypes.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>Selected:</strong> {selectedMigrationTypes.map((id) => {
                const type = migrationTypes.find((t) => t.id === id);
                return type ? `${type.icon} ${type.name}` : id;
              }).join(' + ')}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Source Platform Multi-Select */}
          <div className="relative" ref={sourceDropdownRef}
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source Platform(s)
            </label>
            <div
              className="min-h-[42px] px-3 py-2 border border-gray-300 rounded-lg cursor-pointer bg-white hover:border-gray-400 transition-colors"
              onClick={() => setShowSourceDropdown(!showSourceDropdown)}
            >
              {selectedSourcePlatforms.length === 0 ? (
                <span className="text-gray-400">Select source platform(s)</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {selectedSourcePlatforms.map((platform) => (
                    <span
                      key={platform}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 text-sm rounded-full"
                    >
                      {platform}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSourcePlatform(platform);
                        }}
                        className="hover:text-blue-600"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 mt-3">
                {showSourceDropdown ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </div>
            
            {showSourceDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {['Email', 'Content', 'Messaging'].map((category) => {
                  const platformsInCategory = sourcePlatforms.filter((p) => p.category === category);
                  if (platformsInCategory.length === 0) return null;
                  return (
                    <div key={category}>
                      <div className="px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {category}
                      </div>
                      {platformsInCategory.map((platform) => (
                        <label
                          key={platform.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedSourcePlatforms.includes(platform.name)}
                            onChange={() => toggleSourcePlatform(platform.name)}
                            className="w-4 h-4 text-primary-600 rounded"
                          />
                          <span className="text-sm text-gray-700">{platform.name}</span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Target Platform Multi-Select */}
          <div className="relative" ref={targetDropdownRef}
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Platform(s)
            </label>
            <div
              className="min-h-[42px] px-3 py-2 border border-gray-300 rounded-lg cursor-pointer bg-white hover:border-gray-400 transition-colors"
              onClick={() => setShowTargetDropdown(!showTargetDropdown)}
            >
              {selectedTargetPlatforms.length === 0 ? (
                <span className="text-gray-400">Select target platform(s)</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {selectedTargetPlatforms.map((platform) => (
                    <span
                      key={platform}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 text-sm rounded-full"
                    >
                      {platform}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTargetPlatform(platform);
                        }}
                        className="hover:text-green-600"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 mt-3">
                {showTargetDropdown ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </div>
            
            {showTargetDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {['Suite', 'Email', 'Content', 'Messaging', 'Cloud'].map((category) => {
                  const platformsInCategory = targetPlatforms.filter((p) => p.category === category);
                  if (platformsInCategory.length === 0) return null;
                  return (
                    <div key={category}>
                      <div className="px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {category}
                      </div>
                      {platformsInCategory.map((platform) => (
                        <label
                          key={platform.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTargetPlatforms.includes(platform.name)}
                            onChange={() => toggleTargetPlatform(platform.name)}
                            className="w-4 h-4 text-primary-600 rounded"
                          />
                          <span className="text-sm text-gray-700">{platform.name}</span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Selected Platforms Summary */}
        {(selectedSourcePlatforms.length > 0 || selectedTargetPlatforms.length > 0) && (
          <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-sm text-gray-600">
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
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Planned Start Date"
            type="date"
            {...register('plannedStart')}
            error={errors.plannedStart?.message}
          />
          <Input
            label="Planned End Date"
            type="date"
            {...register('plannedEnd')}
            error={errors.plannedEnd?.message}
          />
          <Input
            label="Actual Start Date"
            type="date"
            {...register('actualStart')}
          />
          <Input
            label="Actual End Date"
            type="date"
            {...register('actualEnd')}
          />
        </div>
      </Card>

      {/* Cost Summary */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Estimated Cost ($)"
            type="number"
            placeholder="0"
            {...register('estimatedCost')}
          />
          <Input
            label="Actual Cost ($)"
            type="number"
            placeholder="0"
            {...register('actualCost')}
          />
        </div>
      </Card>

      {/* Notes */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Notes & Updates</h3>
        <Textarea
          label="Notes"
          rows={4}
          placeholder="Add any additional notes or updates..."
          {...register('notes')}
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
