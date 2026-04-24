'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useStatusReports, useGenerateWeeklyReport } from '@/hooks/useProjects';
import { useAuth } from '@/context/AuthContext';
import {
  FileText,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Calendar,
  TrendingUp,
  ClipboardList,
} from 'lucide-react';
import { format } from 'date-fns';

interface WeeklyReportProps {
  projectId: string;
}

const statusColor: Record<string, string> = {
  GREEN: 'text-green-600 bg-green-50 border-green-200',
  YELLOW: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  RED: 'text-red-600 bg-red-50 border-red-200',
};

const statusIcon: Record<string, JSX.Element> = {
  GREEN: <CheckCircle size={14} className="text-green-600" />,
  YELLOW: <AlertTriangle size={14} className="text-yellow-600" />,
  RED: <AlertCircle size={14} className="text-red-600" />,
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${statusColor[status] || statusColor.GREEN}`}>
      {statusIcon[status]}
      {status}
    </span>
  );
}

function ReportCard({ report }: { report: any }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <FileText size={16} className="text-gray-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {report.reportType} Report — {format(new Date(report.reportDate), 'MMM d, yyyy')}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {report.completionPercentage ?? 0}% complete · {report.tasksCompleted ?? 0}/{report.tasksTotal ?? 0} tasks done
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={report.overallStatus || 'GREEN'} />
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-4 py-4 space-y-4">
          {/* Health indicators */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Overall', status: report.overallStatus },
              { label: 'Schedule', status: report.scheduleStatus },
              { label: 'Budget', status: report.budgetStatus },
              { label: 'Resources', status: report.resourceStatus },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <span className="text-xs text-gray-500 dark:text-gray-400">{item.label}</span>
                <StatusBadge status={item.status || 'GREEN'} />
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Completion</span>
              <span className="text-xs font-bold text-gray-900 dark:text-white">{report.completionPercentage ?? 0}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
              <div
                className="bg-primary-500 h-2 rounded-full transition-all"
                style={{ width: `${report.completionPercentage ?? 0}%` }}
              />
            </div>
          </div>

          {/* Text sections */}
          {[
            { label: 'Accomplishments', value: report.accomplishments, icon: <CheckCircle size={14} className="text-green-500" /> },
            { label: 'Planned Activities', value: report.plannedActivities, icon: <ClipboardList size={14} className="text-blue-500" /> },
            { label: 'Issues', value: report.issues, icon: <AlertCircle size={14} className="text-red-500" /> },
            { label: 'Risks', value: report.risks, icon: <AlertTriangle size={14} className="text-yellow-500" /> },
            { label: 'Decisions', value: report.decisions, icon: <TrendingUp size={14} className="text-purple-500" /> },
          ].filter((s) => s.value).map((section) => (
            <div key={section.label}>
              <div className="flex items-center gap-1.5 mb-1">
                {section.icon}
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{section.label}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line pl-5">{section.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WeeklyReport({ projectId }: WeeklyReportProps) {
  const { user } = useAuth();
  const { data, isLoading, error } = useStatusReports(projectId);
  const generateReport = useGenerateWeeklyReport(projectId);

  const reports: any[] = data?.data ?? [];

  const handleGenerate = async () => {
    try {
      await generateReport.mutateAsync(user?.name || 'system');
    } catch (err) {
      console.error('Failed to generate report:', err);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-primary-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Weekly Reports</h3>
          {reports.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 rounded-full">
              {reports.length}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleGenerate}
          isLoading={generateReport.isPending}
        >
          <RefreshCw size={14} className="mr-1.5" />
          Generate Report
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8 text-gray-500">
          <RefreshCw size={18} className="animate-spin mr-2" />
          Loading reports...
        </div>
      )}

      {!isLoading && reports.length === 0 && (
        <div className="text-center py-8">
          <Calendar size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No reports yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Click "Generate Report" to create the first weekly report</p>
        </div>
      )}

      {!isLoading && reports.length > 0 && (
        <div className="space-y-2">
          {reports.map((report: any) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </Card>
  );
}
