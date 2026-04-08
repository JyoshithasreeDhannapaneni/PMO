'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DelayIndicator } from '@/components/ui/DelayIndicator';
import { formatDate } from '@/lib/utils';
import type { Project } from '@/types';
import { MoreHorizontal, Eye, Edit, Trash2 } from 'lucide-react';

interface ProjectsTableProps {
  projects: Project[];
  onDelete?: (id: string) => void;
}

export function ProjectsTable({ projects, onDelete }: ProjectsTableProps) {
  const router = useRouter();

  const columns: ColumnDef<Project>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Project Name',
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-gray-900">{row.original.name}</div>
            <div className="text-xs text-gray-500">{row.original.customerName}</div>
          </div>
        ),
      },
      {
        accessorKey: 'projectManager',
        header: 'Project Manager',
      },
      {
        accessorKey: 'accountManager',
        header: 'Account Manager',
      },
      {
        accessorKey: 'planType',
        header: 'Plan',
        cell: ({ row }) => <StatusBadge status={row.original.planType} variant="plan" />,
      },
      {
        accessorKey: 'delayStatus',
        header: 'Delay Status',
        cell: ({ row }) => (
          <DelayIndicator
            status={row.original.delayStatus}
            days={row.original.delayDays}
            size="sm"
          />
        ),
      },
      {
        accessorKey: 'phase',
        header: 'Current Phase',
        cell: ({ row }) => <StatusBadge status={row.original.phase} variant="phase" />,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} variant="status" />,
      },
      {
        accessorKey: 'plannedStart',
        header: 'Planned Start',
        cell: ({ row }) => formatDate(row.original.plannedStart),
      },
      {
        accessorKey: 'plannedEnd',
        header: 'Planned End',
        cell: ({ row }) => formatDate(row.original.plannedEnd),
      },
      {
        accessorKey: 'actualEnd',
        header: 'Actual End',
        cell: ({ row }) => formatDate(row.original.actualEnd),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/projects/${row.original.id}`);
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              title="View"
            >
              <Eye size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/projects/${row.original.id}/edit`);
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              title="Edit"
            >
              <Edit size={16} />
            </button>
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Are you sure you want to delete this project?')) {
                    onDelete(row.original.id);
                  }
                }}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ),
      },
    ],
    [router, onDelete]
  );

  return (
    <DataTable
      data={projects}
      columns={columns}
      searchPlaceholder="Search projects..."
      onRowClick={(project) => router.push(`/projects/${project.id}`)}
    />
  );
}
