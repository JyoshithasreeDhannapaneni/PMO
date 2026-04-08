'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useProjects, useDeleteProject } from '@/hooks/useProjects';
import { ProjectsTable } from '@/components/projects/ProjectsTable';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Loader2, Plus, Filter } from 'lucide-react';
import Link from 'next/link';

export default function ProjectsPage() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') || '';
  const initialDelayStatus = searchParams.get('delayStatus') || '';

  const [filters, setFilters] = useState({
    status: initialStatus,
    phase: '',
    delayStatus: initialDelayStatus,
  });

  const { data, isLoading, error } = useProjects({
    status: filters.status || undefined,
    phase: filters.phase || undefined,
    delayStatus: filters.delayStatus || undefined,
  });

  const deleteProject = useDeleteProject();

  const handleDelete = async (id: string) => {
    try {
      await deleteProject.mutateAsync(id);
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'ON_HOLD', label: 'On Hold' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  const phaseOptions = [
    { value: '', label: 'All Phases' },
    { value: 'KICKOFF', label: 'Kickoff' },
    { value: 'MIGRATION', label: 'Migration' },
    { value: 'VALIDATION', label: 'Validation' },
    { value: 'CLOSURE', label: 'Closure' },
    { value: 'COMPLETED', label: 'Completed' },
  ];

  const delayOptions = [
    { value: '', label: 'All Delay Status' },
    { value: 'NOT_DELAYED', label: 'On Track' },
    { value: 'AT_RISK', label: 'At Risk' },
    { value: 'DELAYED', label: 'Delayed' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-500 mt-1">Manage and track all migration projects</p>
        </div>
        <Link href="/projects/new">
          <Button>
            <Plus size={20} className="mr-2" />
            New Project
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-gray-500">
            <Filter size={18} />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Select
              options={statusOptions}
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-40"
            />
            <Select
              options={phaseOptions}
              value={filters.phase}
              onChange={(e) => setFilters({ ...filters, phase: e.target.value })}
              className="w-40"
            />
            <Select
              options={delayOptions}
              value={filters.delayStatus}
              onChange={(e) => setFilters({ ...filters, delayStatus: e.target.value })}
              className="w-44"
            />
          </div>
          {(filters.status || filters.phase || filters.delayStatus) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters({ status: '', phase: '', delayStatus: '' })}
            >
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {/* Projects Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : error ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-red-600">Failed to load projects</p>
            <p className="text-sm text-gray-500 mt-2">Please check if the backend server is running</p>
          </div>
        </Card>
      ) : (
        <Card padding="none">
          <ProjectsTable 
            projects={data?.data || []} 
            onDelete={handleDelete}
          />
        </Card>
      )}
    </div>
  );
}
