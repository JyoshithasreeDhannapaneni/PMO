'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useProjects, useClientSummary } from '@/hooks/useProjects';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DelayIndicator } from '@/components/ui/DelayIndicator';
import { formatCurrency } from '@/lib/utils';
import {
  ArrowLeft,
  Building2,
  Loader2,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Users,
  DollarSign,
  RefreshCw,
} from 'lucide-react';

type StatusFilter = 'all' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';

export default function ClientProfilePage() {
  const params = useParams();
  const rawClientName = params.clientName as string;
  const clientName = decodeURIComponent(rawClientName);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data: projectsData, isLoading: projectsLoading } = useProjects({
    clientName,
    limit: 200,
  });

  const { data: summaryData, isLoading: summaryLoading } = useClientSummary(clientName);

  const projects = projectsData?.data ?? [];
  const summary = summaryData?.data;

  const filtered = projects.filter(p => {
    if (statusFilter === 'all') return true;
    return p.status === statusFilter;
  });

  const isLoading = projectsLoading || summaryLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/projects"
          className="mt-1 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Building2 size={22} className="text-indigo-500 shrink-0" />
            <h1 className="text-2xl font-bold text-gray-900 truncate">{clientName}</h1>
          </div>
          {summary && (
            <p className="text-sm text-gray-500 mt-1">
              {summary.totalProjects} project{summary.totalProjects !== 1 ? 's' : ''}
              {summary.managers ? ` · PM: ${summary.managers}` : ''}
              {summary.escalated > 0 ? ` · ${summary.escalated} escalated` : ''}
              {summary.totalBudget ? ` · ${formatCurrency(summary.totalBudget)} budget` : ''}
            </p>
          )}
        </div>
      </div>

      {/* KPI Row */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-indigo-50 rounded-xl p-4 border border-white">
            <div className="text-2xl font-bold text-indigo-700">{summary.totalProjects}</div>
            <div className="text-xs text-indigo-500 mt-0.5">Total Projects</div>
          </div>
          <div className="bg-green-50 rounded-xl p-4 border border-white">
            <div className="text-2xl font-bold text-green-700">{summary.active}</div>
            <div className="text-xs text-green-500 mt-0.5">Active</div>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-white">
            <div className="text-2xl font-bold text-blue-700">{summary.completed}</div>
            <div className="text-xs text-blue-500 mt-0.5">Completed</div>
          </div>
          <div className="bg-yellow-50 rounded-xl p-4 border border-white">
            <div className="text-2xl font-bold text-yellow-700">{summary.onHold}</div>
            <div className="text-xs text-yellow-500 mt-0.5">On Hold</div>
          </div>
          <div className="bg-red-50 rounded-xl p-4 border border-white">
            <div className="text-2xl font-bold text-red-700">{summary.escalated}</div>
            <div className="text-xs text-red-500 mt-0.5">Escalated</div>
          </div>
          <div className="bg-orange-50 rounded-xl p-4 border border-white">
            <div className="text-2xl font-bold text-orange-700">{summary.overaged}</div>
            <div className="text-xs text-orange-500 mt-0.5">Overaged</div>
          </div>
        </div>
      )}

      {/* Budget summary */}
      {summary && (summary.totalBudget || summary.totalActualCost) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {summary.totalBudget != null && (
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex items-center gap-3">
              <DollarSign size={18} className="text-gray-400" />
              <div>
                <div className="text-sm text-gray-500">Total Budget</div>
                <div className="font-semibold text-gray-900">{formatCurrency(summary.totalBudget)}</div>
              </div>
            </div>
          )}
          {summary.totalActualCost != null && (
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex items-center gap-3">
              <TrendingUp size={18} className="text-gray-400" />
              <div>
                <div className="text-sm text-gray-500">Actual Cost</div>
                <div className="font-semibold text-gray-900">{formatCurrency(summary.totalActualCost)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 font-medium">Projects ({filtered.length})</span>
        <div className="ml-auto flex gap-1.5">
          {(['all', 'ACTIVE', 'ON_HOLD', 'COMPLETED'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s === 'all' ? 'All' : s === 'ON_HOLD' ? 'On Hold' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Project cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Building2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No projects found for {clientName}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(project => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="block bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all p-5 group"
            >
              {/* Top: name + status */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors leading-tight capitalize">
                  {project.name}
                </h3>
                <StatusBadge status={project.status} />
              </div>

              {/* Migration type */}
              {project.migrationTypes && (
                <div className="text-xs text-gray-500 mb-2">
                  {project.migrationTypes}
                </div>
              )}

              {/* Source → Target */}
              {(project.sourcePlatform || project.targetPlatform) && (
                <div className="text-xs text-gray-600 mb-3">
                  {project.sourcePlatform} {project.sourcePlatform && project.targetPlatform ? '→' : ''} {project.targetPlatform}
                </div>
              )}

              {/* Delay + PM row */}
              <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
                <div className="flex items-center gap-1.5">
                  {project.delayStatus && project.delayStatus !== 'NOT_DELAYED' ? (
                    <DelayIndicator status={project.delayStatus} days={project.delayDays} />
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle size={12} /> On Time
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Users size={11} />
                  {project.projectManager}
                </div>
              </div>

              {/* Escalation / Overage badges */}
              {(project.isEscalated || project.isOveraged) && (
                <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                  {project.isEscalated && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full">
                      <AlertTriangle size={10} /> Escalated
                    </span>
                  )}
                  {project.isOveraged && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full">
                      <RefreshCw size={10} /> Overaged
                    </span>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
