'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useProjects, useDeleteProject } from '@/hooks/useProjects';
import { ProjectsTable } from '@/components/projects/ProjectsTable';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import {
  Loader2,
  Plus,
  Filter,
  X,
  ChevronDown,
  Search,
  RefreshCw,
  Download,
  SlidersHorizontal,
  User,
} from 'lucide-react';
import Link from 'next/link';

interface FilterState {
  status: string;
  phase: string;
  delayStatus: string;
  planType: string;
  search: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  
  // Initialize filters from URL params
  const [filters, setFilters] = useState<FilterState>({
    status: searchParams.get('status') || '',
    phase: searchParams.get('phase') || '',
    delayStatus: searchParams.get('delayStatus') || '',
    planType: searchParams.get('planType') || '',
    search: searchParams.get('search') || '',
  });

  const [searchInput, setSearchInput] = useState(filters.search);
  const [showFilters, setShowFilters] = useState(true);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.phase) params.set('phase', filters.phase);
    if (filters.delayStatus) params.set('delayStatus', filters.delayStatus);
    if (filters.planType) params.set('planType', filters.planType);
    if (filters.search) params.set('search', filters.search);
    
    const queryString = params.toString();
    router.replace(`/projects${queryString ? `?${queryString}` : ''}`, { scroll: false });
  }, [filters, router]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, error, refetch } = useProjects({
    status: filters.status || undefined,
    phase: filters.phase || undefined,
    delayStatus: filters.delayStatus || undefined,
    planType: filters.planType || undefined,
    search: filters.search || undefined,
    // MANAGER role always sees only their own projects
    projectManager: isManager ? (user?.name ?? undefined) : undefined,
  });

  const deleteProject = useDeleteProject();

  const handleDelete = async (id: string) => {
    try {
      await deleteProject.mutateAsync(id);
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearAllFilters = () => {
    setFilters({
      status: '',
      phase: '',
      delayStatus: '',
      planType: '',
      search: '',
    });
    setSearchInput('');
  };

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  const statusOptions = [
    { value: '', label: 'All Statuses', color: 'gray' },
    { value: 'ACTIVE', label: 'Active', color: 'green' },
    { value: 'ON_HOLD', label: 'On Hold', color: 'yellow' },
    { value: 'COMPLETED', label: 'Completed', color: 'blue' },
    { value: 'CANCELLED', label: 'Cancelled', color: 'red' },
  ];

  const phaseOptions = [
    { value: '', label: 'All Phases', color: 'gray' },
    { value: 'KICKOFF', label: 'Kickoff', color: 'purple' },
    { value: 'MIGRATION', label: 'Migration', color: 'blue' },
    { value: 'VALIDATION', label: 'Validation', color: 'yellow' },
    { value: 'CLOSURE', label: 'Closure', color: 'orange' },
    { value: 'COMPLETED', label: 'Completed', color: 'green' },
  ];

  const delayOptions = [
    { value: '', label: 'All Delay Status', color: 'gray' },
    { value: 'NOT_DELAYED', label: 'On Track', color: 'green' },
    { value: 'AT_RISK', label: 'At Risk', color: 'yellow' },
    { value: 'DELAYED', label: 'Delayed', color: 'red' },
  ];

  const planOptions = [
    { value: '', label: 'All Plans', color: 'gray' },
    { value: 'BRONZE', label: 'Bronze', color: 'amber' },
    { value: 'SILVER', label: 'Silver', color: 'slate' },
    { value: 'GOLD', label: 'Gold', color: 'yellow' },
    { value: 'PLATINUM', label: 'Platinum', color: 'indigo' },
  ];

  const FilterDropdown = ({ 
    label, 
    value, 
    options, 
    onChange 
  }: { 
    label: string;
    value: string;
    options: { value: string; label: string; color: string }[];
    onChange: (value: string) => void;
  }) => {
    const selectedOption = options.find(o => o.value === value) || options[0];
    
    return (
      <div className="relative">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          {label}
        </label>
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`
              appearance-none w-full px-3 py-2 pr-8 text-sm font-medium rounded-lg border
              bg-white dark:bg-gray-800 
              border-gray-200 dark:border-gray-700
              text-gray-900 dark:text-gray-100
              hover:border-primary-400 dark:hover:border-primary-500
              focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
              transition-all cursor-pointer
              ${value ? 'border-primary-300 bg-primary-50 dark:bg-primary-900/20' : ''}
            `}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown 
            size={16} 
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" 
          />
          {value && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="absolute right-7 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Projects</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {isManager ? `Your projects as ${user?.name}` : 'Manage and track all migration projects'}
            {data?.pagination?.total !== undefined && (
              <span className="ml-2 text-primary-600 dark:text-primary-400 font-medium">
                ({data.pagination.total} total)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="hidden sm:flex"
          >
            <RefreshCw size={16} className="mr-1" />
            Refresh
          </Button>
          <Link href="/projects/new">
            <Button>
              <Plus size={20} className="mr-2" />
              New Project
            </Button>
          </Link>
        </div>
      </div>

      {/* Manager View Banner */}
      {isManager && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">
          <User size={14} className="flex-shrink-0" />
          <span>
            <strong>Manager View</strong> — Showing only projects where you ({user?.name}) are the Project Manager.
            Projects you create will automatically be assigned to you.
          </span>
        </div>
      )}

      {/* Filters Section */}
      <Card padding="sm" className="dark:bg-gray-800">
        {/* Filter Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <SlidersHorizontal size={18} />
              <span className="font-medium">Filters</span>
              {activeFilterCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-semibold bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
          
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              <X size={14} />
              Clear all
            </button>
          )}
        </div>

        {/* Filter Controls */}
        {showFilters && (
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by project name, customer, or manager..."
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
              />
              {searchInput && (
                <button
                  onClick={() => {
                    setSearchInput('');
                    setFilters(prev => ({ ...prev, search: '' }));
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <FilterDropdown
                label="Status"
                value={filters.status}
                options={statusOptions}
                onChange={(value) => handleFilterChange('status', value)}
              />
              <FilterDropdown
                label="Phase"
                value={filters.phase}
                options={phaseOptions}
                onChange={(value) => handleFilterChange('phase', value)}
              />
              <FilterDropdown
                label="Delay Status"
                value={filters.delayStatus}
                options={delayOptions}
                onChange={(value) => handleFilterChange('delayStatus', value)}
              />
              <FilterDropdown
                label="Plan Type"
                value={filters.planType}
                options={planOptions}
                onChange={(value) => handleFilterChange('planType', value)}
              />
            </div>

            {/* Active Filters Tags */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-500 dark:text-gray-400">Active filters:</span>
                {filters.status && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
                    Status: {statusOptions.find(o => o.value === filters.status)?.label}
                    <button onClick={() => handleFilterChange('status', '')} className="hover:text-green-900">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.phase && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                    Phase: {phaseOptions.find(o => o.value === filters.phase)?.label}
                    <button onClick={() => handleFilterChange('phase', '')} className="hover:text-blue-900">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.delayStatus && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full">
                    Delay: {delayOptions.find(o => o.value === filters.delayStatus)?.label}
                    <button onClick={() => handleFilterChange('delayStatus', '')} className="hover:text-orange-900">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.planType && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full">
                    Plan: {planOptions.find(o => o.value === filters.planType)?.label}
                    <button onClick={() => handleFilterChange('planType', '')} className="hover:text-purple-900">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filters.search && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
                    Search: "{filters.search}"
                    <button onClick={() => { setSearchInput(''); handleFilterChange('search', ''); }} className="hover:text-gray-900">
                      <X size={12} />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Projects Table */}
      {isLoading ? (
        <Card>
          <div className="flex flex-col items-center justify-center h-64">
            <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
            <p className="mt-4 text-gray-500 dark:text-gray-400">Loading projects...</p>
          </div>
        </Card>
      ) : error ? (
        <Card>
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <X size={32} className="text-red-600 dark:text-red-400" />
            </div>
            <p className="text-red-600 dark:text-red-400 font-medium">Failed to load projects</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Please check if the backend server is running</p>
            <Button variant="outline" onClick={() => refetch()} className="mt-4">
              <RefreshCw size={16} className="mr-2" />
              Try Again
            </Button>
          </div>
        </Card>
      ) : data?.data?.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Filter size={32} className="text-gray-400" />
            </div>
            <p className="text-gray-600 dark:text-gray-300 font-medium">No projects found</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              {activeFilterCount > 0 
                ? 'Try adjusting your filters or search criteria'
                : 'Get started by creating your first project'
              }
            </p>
            {activeFilterCount > 0 ? (
              <Button variant="outline" onClick={clearAllFilters} className="mt-4">
                Clear Filters
              </Button>
            ) : (
              <Link href="/projects/new">
                <Button className="mt-4">
                  <Plus size={16} className="mr-2" />
                  Create Project
                </Button>
              </Link>
            )}
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
