'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUpdateProject, useEscalationDailyNotes, useAddEscalationDailyNote, useDeleteEscalationDailyNote } from '@/hooks/useProjects';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DelayIndicator } from '@/components/ui/DelayIndicator';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Project } from '@/types';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { format } from 'date-fns';
import {
  Eye,
  Edit,
  Trash2,
  ChevronUp,
  ChevronDown,
  Check,
  X,
  Calendar,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  BookOpen,
  Send,
} from 'lucide-react';

interface ProjectsTableProps {
  projects: Project[];
  onDelete?: (id: string) => void;
}

interface EditingCell {
  projectId: string;
  field: string;
}

type SortField = 'name' | 'projectManager' | 'accountManager' | 'planType' | 'status' | 'phase' | 'delayStatus' | 'plannedStart' | 'plannedEnd' | 'estimatedCost' | 'overageAmount';
type SortOrder = 'asc' | 'desc';

export function ProjectsTable({ projects, onDelete }: ProjectsTableProps) {
  const router = useRouter();
  const updateProject = useUpdateProject();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const { user } = useAuth();

  const resolveMigrationTypes = (raw: string | null) => {
    if (!raw) return [];
    return raw.split(',').map(r => r.trim()).filter(Boolean).map(r => {
      const rUp = r.toUpperCase();
      const found = settings.migrationTypes.find(mt =>
        mt.code === rUp ||
        mt.name.toLowerCase() === r.toLowerCase() ||
        rUp.includes(mt.code.toUpperCase()) ||
        rUp.includes(mt.name.toUpperCase())
      );
      return found ?? { code: r, name: r, icon: '📋', color: '#6B7280' };
    });
  };
  
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Daily tracking notes state
  const [dailyNotesProject, setDailyNotesProject] = useState<{ project: Project; columnName: string } | null>(null);
  const [newDailyNote, setNewDailyNote] = useState('');
  const [dailyNoteDate, setDailyNoteDate] = useState(() => new Date().toISOString().split('T')[0]);
  const { data: dailyNotesData, isLoading: loadingNotes } = useEscalationDailyNotes(dailyNotesProject?.project.id ?? null);
  const dailyNotes: any[] = dailyNotesData?.data || [];
  const addDailyNote = useAddEscalationDailyNote();
  const deleteDailyNote = useDeleteEscalationDailyNote();

  async function handleAddDailyNote() {
    if (!dailyNotesProject || !newDailyNote.trim()) return;
    await addDailyNote.mutateAsync({ projectId: dailyNotesProject.project.id, note: newDailyNote.trim(), author: user?.name, noteDate: dailyNoteDate });
    setNewDailyNote('');
  }

  const openColumnNotes = (project: Project, columnName: string) => {
    setDailyNotesProject({ project, columnName });
    setNewDailyNote('');
    setDailyNoteDate(new Date().toISOString().split('T')[0]);
  };
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Reset to page 1 whenever the projects list changes (e.g. after a backend search)
  useEffect(() => {
    setCurrentPage(1);
  }, [projects]);

  // Sort projects
  const filteredAndSortedProjects = useMemo(() => {
    const numericFields: SortField[] = ['estimatedCost', 'overageAmount'];
    const sorted = [...projects].sort((a, b) => {
      if (numericFields.includes(sortField)) {
        const aVal = Number(a[sortField] ?? 0);
        const bVal = Number(b[sortField] ?? 0);
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      let aVal = a[sortField] || '';
      let bVal = b[sortField] || '';
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [projects, sortField, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedProjects.length / itemsPerPage);
  const paginatedProjects = filteredAndSortedProjects.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const startEditing = (projectId: string, field: string, currentValue: string) => {
    setEditingCell({ projectId, field });
    setEditValue(currentValue || '');
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const saveEdit = async (projectId: string, field: string) => {
    try {
      const updateData: any = {};
      updateData[field] = editValue;
      await updateProject.mutateAsync({ id: projectId, data: updateData });
      setEditingCell(null);
      setEditValue('');
      showToast('success', 'Updated');
    } catch (error: any) {
      const msg = error?.response?.data?.error?.message || error?.message || 'Update failed';
      showToast('error', 'Failed to update', msg);
    }
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th 
      className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <div className="flex flex-col">
          <ChevronUp 
            size={12} 
            className={sortField === field && sortOrder === 'asc' ? 'text-primary-600' : 'text-gray-300'} 
          />
          <ChevronDown 
            size={12} 
            className={sortField === field && sortOrder === 'desc' ? 'text-primary-600' : 'text-gray-300'} 
            style={{ marginTop: -4 }}
          />
        </div>
      </div>
    </th>
  );

  const EditableSelect = ({ 
    projectId, 
    field, 
    value, 
    options,
    displayComponent
  }: { 
    projectId: string; 
    field: string; 
    value: string;
    options: { value: string; label: string }[];
    displayComponent: React.ReactNode;
  }) => {
    const isEditing = editingCell?.projectId === projectId && editingCell?.field === field;
    
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="text-xs px-2 py-1 border border-primary-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            autoFocus
          >
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button 
            onClick={() => saveEdit(projectId, field)}
            className="p-1 text-green-600 hover:bg-green-100 rounded"
            disabled={updateProject.isPending}
          >
            {updateProject.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          </button>
          <button 
            onClick={cancelEditing}
            className="p-1 text-red-600 hover:bg-red-100 rounded"
          >
            <X size={14} />
          </button>
        </div>
      );
    }

    return (
      <div 
        className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 -mx-1 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          startEditing(projectId, field, value);
        }}
        title="Click to edit"
      >
        {displayComponent}
      </div>
    );
  };

  const EditableText = ({ 
    projectId, 
    field, 
    value 
  }: { 
    projectId: string; 
    field: string; 
    value: string;
  }) => {
    const isEditing = editingCell?.projectId === projectId && editingCell?.field === field;
    
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="text-sm px-2 py-1 border border-primary-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 w-32 bg-white"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit(projectId, field);
              if (e.key === 'Escape') cancelEditing();
            }}
          />
          <button 
            onClick={() => saveEdit(projectId, field)}
            className="p-1 text-green-600 hover:bg-green-100 rounded"
            disabled={updateProject.isPending}
          >
            {updateProject.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          </button>
          <button 
            onClick={cancelEditing}
            className="p-1 text-red-600 hover:bg-red-100 rounded"
          >
            <X size={14} />
          </button>
        </div>
      );
    }

    return (
      <div 
        className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 -mx-1 transition-colors text-sm text-gray-900"
        onClick={(e) => {
          e.stopPropagation();
          startEditing(projectId, field, value);
        }}
        title="Click to edit"
      >
        {value || <span className="text-gray-400 italic">Not set</span>}
      </div>
    );
  };

  const EditableDate = ({
    projectId,
    field,
    value
  }: {
    projectId: string;
    field: string;
    value: string | null;
  }) => {
    const isEditing = editingCell?.projectId === projectId && editingCell?.field === field;
    const dateValue = value ? value.split('T')[0] : '';
    
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="text-xs px-2 py-1 border border-primary-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            autoFocus
          />
          <button 
            onClick={() => saveEdit(projectId, field)}
            className="p-1 text-green-600 hover:bg-green-100 rounded"
            disabled={updateProject.isPending}
          >
            {updateProject.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          </button>
          <button 
            onClick={cancelEditing}
            className="p-1 text-red-600 hover:bg-red-100 rounded"
          >
            <X size={14} />
          </button>
        </div>
      );
    }

    return (
      <div 
        className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 -mx-1 transition-colors flex items-center gap-1 text-sm"
        onClick={(e) => {
          e.stopPropagation();
          startEditing(projectId, field, dateValue);
        }}
        title="Click to edit"
      >
        <Calendar size={12} className="text-gray-400" />
        {value ? formatDate(value) : <span className="text-gray-400 italic">Not set</span>}
      </div>
    );
  };

  const planOptions = [
    { value: 'BRONZE', label: 'Bronze' },
    { value: 'SILVER', label: 'Silver' },
    { value: 'GOLD', label: 'Gold' },
    { value: 'PLATINUM', label: 'Platinum' },
  ];

  const statusOptions = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'ON_HOLD', label: 'On Hold' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'COMPLETED', label: 'Completed' },
  ];

  const phaseOptions = [
    { value: 'KICKOFF', label: 'Kickoff' },
    { value: 'MIGRATION', label: 'Migration' },
    { value: 'VALIDATION', label: 'Validation' },
    { value: 'CLOSURE', label: 'Closure' },
    { value: 'COMPLETED', label: 'Completed' },
  ];

  const delayStatusOptions = [
    { value: 'NOT_DELAYED', label: 'On Track' },
    { value: 'AT_RISK', label: 'At Risk' },
    { value: 'DELAYED', label: 'Delayed' },
  ];

  return (
    <div>
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-blue-50/60 border-b border-gray-200">
            <tr>
              <SortHeader field="name" label="Project Name" />
              <SortHeader field="projectManager" label="Project Manager" />
              <SortHeader field="accountManager" label="Account Manager" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Migration Types</th>
              <SortHeader field="estimatedCost" label="Budget" />
              <SortHeader field="overageAmount" label="Overage" />
              <SortHeader field="planType" label="Plan" />
              <SortHeader field="delayStatus" label="Delay Status" />
              <SortHeader field="phase" label="Current Phase" />
              <SortHeader field="status" label="Status" />
              <SortHeader field="plannedStart" label="SOW Start" />
              <SortHeader field="plannedEnd" label="SOW End" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Kickoff Start Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[160px]">
                Cloud Adding
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[160px]">
                Pilot Migration
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[160px]">
                Onetime Migration
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[160px]">
                Delta Migration
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[160px]">
                Final Validation
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Project End Date
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {paginatedProjects.map((project) => (
              <tr 
                key={project.id} 
                className="hover:bg-gray-50 transition-colors"
              >
                {/* Project Name */}
                <td className="px-4 py-3">
                  <div 
                    className="cursor-pointer"
                    onClick={() => router.push(`/projects/${project.id}`)}
                  >
                    <div className="font-medium text-gray-900 hover:text-primary-600">
                      {project.name}
                    </div>
                    <div className="text-xs text-gray-500">{project.customerName}</div>
                  </div>
                </td>

                {/* Project Manager - Editable */}
                <td className="px-4 py-3">
                  <EditableText 
                    projectId={project.id} 
                    field="projectManager" 
                    value={project.projectManager} 
                  />
                </td>

                {/* Account Manager - Editable */}
                <td className="px-4 py-3">
                  <EditableText
                    projectId={project.id}
                    field="accountManager"
                    value={project.accountManager}
                  />
                </td>

                {/* Migration Types */}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1 min-w-[100px]">
                    {resolveMigrationTypes(project.migrationTypes).length > 0
                      ? resolveMigrationTypes(project.migrationTypes).map(mt => (
                          <span
                            key={mt.code}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium text-white whitespace-nowrap"
                            style={{ backgroundColor: mt.color }}
                          >
                            <span>{mt.icon}</span>
                            <span>{mt.name}</span>
                          </span>
                        ))
                      : <span className="text-xs text-gray-400 italic">—</span>
                    }
                  </div>
                </td>

                {/* Budget - Editable */}
                <td className="px-4 py-3">
                  <EditableText
                    projectId={project.id}
                    field="estimatedCost"
                    value={project.estimatedCost != null ? String(project.estimatedCost) : ''}
                  />
                </td>

                {/* Overage */}
                <td className="px-4 py-3">
                  {project.isOveraged ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
                        Overaged
                      </span>
                      {project.overageAmount != null && (
                        <span className="text-xs text-orange-600 font-medium">
                          {formatCurrency(project.overageAmount)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>

                {/* Plan - Editable */}
                <td className="px-4 py-3">
                  <EditableSelect
                    projectId={project.id}
                    field="planType"
                    value={project.planType}
                    options={planOptions}
                    displayComponent={<StatusBadge status={project.planType} variant="plan" />}
                  />
                </td>

                {/* Delay Status - Editable */}
                <td className="px-4 py-3">
                  <EditableSelect
                    projectId={project.id}
                    field="delayStatus"
                    value={project.delayStatus}
                    options={delayStatusOptions}
                    displayComponent={
                      <DelayIndicator
                        status={project.delayStatus}
                        days={project.delayDays}
                        size="sm"
                      />
                    }
                  />
                </td>

                {/* Phase - Editable */}
                <td className="px-4 py-3">
                  <EditableSelect
                    projectId={project.id}
                    field="phase"
                    value={project.phase}
                    options={phaseOptions}
                    displayComponent={<StatusBadge status={project.phase} variant="phase" />}
                  />
                </td>

                {/* Status - Editable */}
                <td className="px-4 py-3">
                  <EditableSelect
                    projectId={project.id}
                    field="status"
                    value={project.status}
                    options={statusOptions}
                    displayComponent={<StatusBadge status={project.status} variant="status" />}
                  />
                </td>

                {/* SOW Start - Editable */}
                <td className="px-4 py-3">
                  <EditableDate projectId={project.id} field="plannedStart" value={project.plannedStart} />
                </td>

                {/* SOW End - Editable */}
                <td className="px-4 py-3">
                  <EditableDate projectId={project.id} field="plannedEnd" value={project.plannedEnd} />
                </td>

                {/* Actual Start - Editable */}
                <td className="px-4 py-3">
                  <EditableDate
                    projectId={project.id}
                    field="actualStart"
                    value={project.actualStart}
                  />
                </td>

                {/* Cloud Adding */}
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <div className="text-xs text-gray-400">Start</div>
                    <EditableDate projectId={project.id} field="cloudAddingStart" value={project.cloudAddingStart ?? null} />
                    <div className="text-xs text-gray-400 mt-1">End</div>
                    <EditableDate projectId={project.id} field="cloudAddingEnd" value={project.cloudAddingEnd ?? null} />
                    <button onClick={(e) => { e.stopPropagation(); openColumnNotes(project, 'Cloud Adding'); }} className="mt-1 flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors text-teal-600 bg-teal-50 hover:bg-teal-100" title="Daily tracking notes">
                      <MessageSquare size={11} /><span>Notes</span>
                    </button>
                  </div>
                </td>

                {/* Pilot Migration */}
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <div className="text-xs text-gray-400">Start</div>
                    <EditableDate projectId={project.id} field="pilotMigrationStart" value={project.pilotMigrationStart ?? null} />
                    <div className="text-xs text-gray-400 mt-1">End</div>
                    <EditableDate projectId={project.id} field="pilotMigrationEnd" value={project.pilotMigrationEnd ?? null} />
                    <button onClick={(e) => { e.stopPropagation(); openColumnNotes(project, 'Pilot Migration'); }} className="mt-1 flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors text-teal-600 bg-teal-50 hover:bg-teal-100" title="Daily tracking notes">
                      <MessageSquare size={11} /><span>Notes</span>
                    </button>
                  </div>
                </td>

                {/* Onetime Migration */}
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <div className="text-xs text-gray-400">Start</div>
                    <EditableDate projectId={project.id} field="onetimeMigrationStart" value={project.onetimeMigrationStart ?? null} />
                    <div className="text-xs text-gray-400 mt-1">End</div>
                    <EditableDate projectId={project.id} field="onetimeMigrationEnd" value={project.onetimeMigrationEnd ?? null} />
                    <button onClick={(e) => { e.stopPropagation(); openColumnNotes(project, 'Onetime Migration'); }} className="mt-1 flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors text-teal-600 bg-teal-50 hover:bg-teal-100" title="Daily tracking notes">
                      <MessageSquare size={11} /><span>Notes</span>
                    </button>
                  </div>
                </td>

                {/* Delta Migration */}
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <div className="text-xs text-gray-400">Start</div>
                    <EditableDate projectId={project.id} field="deltaMigrationStart" value={project.deltaMigrationStart ?? null} />
                    <div className="text-xs text-gray-400 mt-1">End</div>
                    <EditableDate projectId={project.id} field="deltaMigrationEnd" value={project.deltaMigrationEnd ?? null} />
                    <button onClick={(e) => { e.stopPropagation(); openColumnNotes(project, 'Delta Migration'); }} className="mt-1 flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors text-teal-600 bg-teal-50 hover:bg-teal-100" title="Daily tracking notes">
                      <MessageSquare size={11} /><span>Notes</span>
                    </button>
                  </div>
                </td>

                {/* Final Validation */}
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <div className="text-xs text-gray-400">Start</div>
                    <EditableDate projectId={project.id} field="finalValidationStart" value={project.finalValidationStart ?? null} />
                    <div className="text-xs text-gray-400 mt-1">End</div>
                    <EditableDate projectId={project.id} field="finalValidationEnd" value={project.finalValidationEnd ?? null} />
                    <button onClick={(e) => { e.stopPropagation(); openColumnNotes(project, 'Final Validation'); }} className="mt-1 flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors text-teal-600 bg-teal-50 hover:bg-teal-100" title="Daily tracking notes">
                      <MessageSquare size={11} /><span>Notes</span>
                    </button>
                  </div>
                </td>

                {/* Actual End - Editable */}
                <td className="px-4 py-3">
                  <EditableDate
                    projectId={project.id}
                    field="actualEnd"
                    value={project.actualEnd}
                  />
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/projects/${project.id}`);
                      }}
                      className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                      title="View Details"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/projects/${project.id}/edit`);
                      }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Full Edit"
                    >
                      <Edit size={16} />
                    </button>
                    {onDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Are you sure you want to delete this project?')) {
                            onDelete(project.id);
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {paginatedProjects.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No projects found
        </div>
      )}

      {/* Daily Notes Modal */}
      {dailyNotesProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setDailyNotesProject(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 bg-teal-600 text-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare size={18} />
                <div>
                  <p className="font-bold text-sm">{dailyNotesProject.project.name}</p>
                  <p className="text-xs opacity-80">{dailyNotesProject.project.customerName} · {dailyNotesProject.columnName} Notes</p>
                </div>
              </div>
              <button onClick={() => setDailyNotesProject(null)} className="p-1.5 rounded hover:bg-white/20 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {loadingNotes ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-teal-600" size={24} /></div>
              ) : dailyNotes.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No daily notes yet. Add the first note below.</p>
                </div>
              ) : (
                (() => {
                  const grouped: Record<string, any[]> = {};
                  dailyNotes.forEach((n: any) => {
                    const d = n.noteDate?.split('T')[0] || n.noteDate;
                    if (!grouped[d]) grouped[d] = [];
                    grouped[d].push(n);
                  });
                  return Object.entries(grouped).map(([date, notes]) => (
                    <div key={date}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
                          {format(new Date(date + 'T12:00:00'), 'EEE, MMM d, yyyy')}
                        </span>
                        <div className="flex-1 h-px bg-gray-100" />
                      </div>
                      <div className="space-y-2 pl-2">
                        {notes.map((n: any) => (
                          <div key={n.id} className="flex items-start gap-3 bg-gray-50 rounded-lg p-3 group border border-gray-100">
                            <div className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.note}</p>
                              {n.author && <p className="text-xs text-gray-400 mt-1">— {n.author} · {n.createdAt ? format(new Date(n.createdAt), 'HH:mm') : ''}</p>}
                            </div>
                            <button
                              onClick={() => deleteDailyNote.mutate({ projectId: dailyNotesProject.project.id, noteId: n.id })}
                              className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all flex-shrink-0 p-0.5"
                              title="Delete note"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()
              )}
            </div>

            <div className="border-t border-gray-200 p-4 bg-gray-50 flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs font-medium text-gray-600">Date:</label>
                <input
                  type="date"
                  value={dailyNoteDate}
                  onChange={(e) => setDailyNoteDate(e.target.value)}
                  className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white text-gray-900"
                />
              </div>
              <div className="flex gap-2">
                <textarea
                  value={newDailyNote}
                  onChange={(e) => setNewDailyNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddDailyNote(); }}
                  placeholder="Write today's tracking note… (Ctrl+Enter to submit)"
                  rows={3}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <button
                  onClick={handleAddDailyNote}
                  disabled={addDailyNote.isPending || !newDailyNote.trim()}
                  className="px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-60 transition-colors self-end flex items-center gap-1.5 text-sm font-medium"
                >
                  {addDailyNote.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {filteredAndSortedProjects.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredAndSortedProjects.length)} of {filteredAndSortedProjects.length} results
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
