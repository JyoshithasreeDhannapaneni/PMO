'use client';

import { Card, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DelayIndicator } from '@/components/ui/DelayIndicator';
import { Button } from '@/components/ui/Button';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Project, ProjectPhaseRecord } from '@/types';
import {
  Calendar,
  User,
  Building2,
  DollarSign,
  ArrowRight,
  CheckCircle,
  Clock,
  Circle,
  Settings,
  AlertTriangle,
  Users,
  FileText
} from 'lucide-react';
import Link from 'next/link';
import { WeeklyReport } from './WeeklyReport';

interface ProjectDetailProps {
  project: Project;
}

export function ProjectDetail({ project }: ProjectDetailProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <p className="text-gray-500 mt-1">{project.customerName}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={project.status} variant="status" />
          <StatusBadge status={project.phase} variant="phase" />
          <Link href={`/projects/${project.id}/tasks`}>
            <Button variant="primary">View Tasks & Gantt</Button>
          </Link>
          <Link href={`/projects/${project.id}/manage`}>
            <Button variant="secondary">
              <Settings size={16} className="mr-2" />
              Manage
            </Button>
          </Link>
          <Link href={`/projects/${project.id}/edit`}>
            <Button variant="outline">Edit Project</Button>
          </Link>
        </div>
      </div>

      {/* Delay Status Banner */}
      {project.delayStatus !== 'NOT_DELAYED' && (
        <div className={`rounded-lg p-4 ${
          project.delayStatus === 'DELAYED' ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'
        }`}>
          <DelayIndicator status={project.delayStatus} days={project.delayDays} size="lg" />
          {project.delayDays > 0 && (
            <p className="mt-2 text-sm text-gray-600">
              This project is {project.delayDays} days behind schedule.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Info */}
          <Card>
            <CardHeader title="Customer Information" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoItem icon={Building2} label="Customer" value={project.customerName} />
              <InfoItem icon={User} label="Account Manager" value={project.accountManager} />
            </div>
          </Card>

          {/* Project Info */}
          <Card>
            <CardHeader title="Project Information" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoItem icon={User} label="Project Manager" value={project.projectManager} />
              <div>
                <span className="text-sm text-gray-500">Plan Type</span>
                <div className="mt-1">
                  <StatusBadge status={project.planType} variant="plan" />
                </div>
              </div>
              <InfoItem label="Source Platform" value={project.sourcePlatform || 'N/A'} />
              <InfoItem label="Target Platform" value={project.targetPlatform || 'N/A'} />
            </div>
            {project.description && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <span className="text-sm text-gray-500">Description</span>
                <p className="mt-1 text-gray-900">{project.description}</p>
              </div>
            )}
          </Card>

          {/* Migration Phases */}
          <Card>
            <CardHeader title="Migration Phases" />
            <PhaseTimeline phases={project.phases || []} currentPhase={project.phase} />
          </Card>

          {/* Notes */}
          {project.notes && (
            <Card>
              <CardHeader title="Notes & Updates" />
              <p className="text-gray-700 whitespace-pre-wrap">{project.notes}</p>
            </Card>
          )}

          {/* Weekly Reports */}
          <WeeklyReport projectId={project.id} />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Timeline */}
          <Card>
            <CardHeader title="Timeline" />
            <div className="space-y-3">
              <TimelineItem
                icon={Calendar}
                label="Planned Start"
                value={formatDate(project.plannedStart)}
              />
              <TimelineItem
                icon={Calendar}
                label="Planned End"
                value={formatDate(project.plannedEnd)}
              />
              {project.actualStart && (
                <TimelineItem
                  icon={Calendar}
                  label="Actual Start"
                  value={formatDate(project.actualStart)}
                  highlight
                />
              )}
              {project.actualEnd && (
                <TimelineItem
                  icon={Calendar}
                  label="Actual End"
                  value={formatDate(project.actualEnd)}
                  highlight
                />
              )}
            </div>
          </Card>

          {/* Cost Summary */}
          <Card>
            <CardHeader title="Cost Summary" />
            <div className="space-y-3">
              <CostItem
                label="Estimated Cost"
                value={formatCurrency(project.estimatedCost)}
              />
              <CostItem
                label="Actual Cost"
                value={formatCurrency(project.actualCost)}
                highlight={project.actualCost !== null}
              />
              {project.estimatedCost && project.actualCost && (
                <div className="pt-3 border-t border-gray-100">
                  <CostItem
                    label="Variance"
                    value={formatCurrency(project.actualCost - project.estimatedCost)}
                    highlight
                    isNegative={project.actualCost > project.estimatedCost}
                  />
                </div>
              )}
            </div>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader title="Quick Stats" />
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Delay Days</span>
                <span className={`font-semibold ${project.delayDays > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {project.delayDays} days
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Created</span>
                <span className="text-sm text-gray-900">{formatDate(project.createdAt)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Last Updated</span>
                <span className="text-sm text-gray-900">{formatDate(project.updatedAt)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon?: any; label: string; value: string }) {
  return (
    <div>
      <span className="text-sm text-gray-500">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        {Icon && <Icon size={16} className="text-gray-400" />}
        <span className="text-gray-900">{value}</span>
      </div>
    </div>
  );
}

function TimelineItem({ icon: Icon, label, value, highlight }: { icon: any; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-gray-400" />
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <span className={`text-sm font-medium ${highlight ? 'text-primary-600' : 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  );
}

function CostItem({ label, value, highlight, isNegative }: { label: string; value: string; highlight?: boolean; isNegative?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`font-semibold ${
        isNegative ? 'text-red-600' : highlight ? 'text-primary-600' : 'text-gray-900'
      }`}>
        {value}
      </span>
    </div>
  );
}

function PhaseTimeline({ phases, currentPhase }: { phases: ProjectPhaseRecord[]; currentPhase: string }) {
  const phaseOrder = ['KICKOFF', 'MIGRATION', 'VALIDATION', 'CLOSURE', 'COMPLETED'];
  const currentIndex = phaseOrder.indexOf(currentPhase);

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        {phaseOrder.slice(0, -1).map((phase, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const phaseRecord = phases.find(p => p.phaseName === phase);

          return (
            <div key={phase} className="flex flex-col items-center flex-1">
              <div className="relative flex items-center w-full">
                {/* Connector line */}
                {index > 0 && (
                  <div className={`absolute left-0 right-1/2 h-0.5 -translate-y-1/2 top-1/2 ${
                    isCompleted ? 'bg-green-500' : 'bg-gray-200'
                  }`} />
                )}
                {index < phaseOrder.length - 2 && (
                  <div className={`absolute left-1/2 right-0 h-0.5 -translate-y-1/2 top-1/2 ${
                    isCompleted ? 'bg-green-500' : 'bg-gray-200'
                  }`} />
                )}
                
                {/* Phase circle */}
                <div className="relative z-10 mx-auto">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isCompleted 
                      ? 'bg-green-500 text-white' 
                      : isCurrent 
                        ? 'bg-primary-500 text-white ring-4 ring-primary-100' 
                        : 'bg-gray-200 text-gray-400'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle size={20} />
                    ) : isCurrent ? (
                      <Clock size={20} />
                    ) : (
                      <Circle size={20} />
                    )}
                  </div>
                </div>
              </div>
              
              {/* Phase label */}
              <div className="mt-2 text-center">
                <span className={`text-xs font-medium ${
                  isCurrent ? 'text-primary-600' : isCompleted ? 'text-green-600' : 'text-gray-500'
                }`}>
                  {phase}
                </span>
                {phaseRecord?.actualDate && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDate(phaseRecord.actualDate)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
