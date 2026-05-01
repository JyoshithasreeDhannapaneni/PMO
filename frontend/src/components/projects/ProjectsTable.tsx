'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUpdateProject } from '@/hooks/useProjects';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DelayIndicator } from '@/components/ui/DelayIndicator';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Project } from '@/types';
import { useSettings } from '@/context/SettingsContext';
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
  ChevronRight
} from 'lucide-react';

interface ProjectsTableProps {
  projects: Project[];
  onDelete?: (id: string) => void;
}

interface EditingCell {
  projectId: string;
  field: string;
}

type SortField = 'name' | 'projectManager' | 'accountManager' | 'planType' | 'status' | 'phase' | 'delayStatus' | 'plannedStart' | 'plannedEnd';
type SortOrder = 'asc' | 'desc';

export function ProjectsTable({ projects, onDelete }: ProjectsTableProps) {
  const router = useRouter();
  const updateProject = useUpdateProject();
  const { settings } = useSettings();

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
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Filter and sort projects
  const filteredAndSortedProjects = useMemo(() => {
    let filtered = projects;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.name?.toLowerCase().includes(term) ||
        p.customerName?.toLowerCase().includes(term) ||
        p.projectManager?.toLowerCase().includes(term) ||
        p.accountManager?.toLowerCase().includes(term)
      );
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      let aVal = a[sortField] || '';
      let bVal = b[sortField] || '';
      
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [projects, searchTerm, sortField, sortOrder]);

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
    } catch (error) {
      console.error('Failed to update:', error);
    }
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th 
      className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none"
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
            className="text-xs px-2 py-1 border border-primary-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800"
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
        className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1 py-0.5 -mx-1 transition-colors"
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
            className="text-sm px-2 py-1 border border-primary-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 w-32 bg-white dark:bg-gray-800"
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
        className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1 py-0.5 -mx-1 transition-colors text-sm text-gray-900 dark:text-gray-100"
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
    value: string;
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
            className="text-xs px-2 py-1 border border-primary-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800"
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
        className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1 py-0.5 -mx-1 transition-colors flex items-center gap-1 text-sm"
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
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <SortHeader field="name" label="Project Name" />
              <SortHeader field="projectManager" label="Project Manager" />
              <SortHeader field="accountManager" label="Account Manager" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Migration Types</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Source</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Target</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Budget</th>
              <SortHeader field="planType" label="Plan" />
              <SortHeader field="delayStatus" label="Delay Status" />
              <SortHeader field="phase" label="Current Phase" />
              <SortHeader field="status" label="Status" />
              <SortHeader field="plannedStart" label="SOW Start" />
              <SortHeader field="plannedEnd" label="SOW End" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Kickoff Start Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Project End Date
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {paginatedProjects.map((project) => (
              <tr 
                key={project.id} 
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                {/* Project Name */}
                <td className="px-4 py-3">
                  <div 
                    className="cursor-pointer"
                    onClick={() => router.push(`/projects/${project.id}`)}
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400">
                      {project.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{project.customerName}</div>
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

                {/* Source Platform - Editable */}
                <td className="px-4 py-3">
                  <EditableText projectId={project.id} field="sourcePlatform" value={project.sourcePlatform || ''} />
                </td>

                {/* Target Platform - Editable */}
                <td className="px-4 py-3">
                  <EditableText projectId={project.id} field="targetPlatform" value={project.targetPlatform || ''} />
                </td>

                {/* Budget - Editable */}
                <td className="px-4 py-3">
                  <EditableText
                    projectId={project.id}
                    field="estimatedCost"
                    value={project.estimatedCost != null ? String(project.estimatedCost) : ''}
                  />
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
                      className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors"
                      title="View Details"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/projects/${project.id}/edit`);
                      }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
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
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
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
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          {searchTerm ? 'No projects match your search criteria' : 'No projects found'}
        </div>
      )}

      {/* Pagination */}
      {filteredAndSortedProjects.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredAndSortedProjects.length)} of {filteredAndSortedProjects.length} results
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
