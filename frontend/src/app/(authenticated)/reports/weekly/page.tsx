'use client';

import { useState } from 'react';
import { useWeeklyReport } from '@/hooks/useProjects';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';
import {
  FileText, Download, RefreshCw, Calendar, User, Users,
  Plus, X, ChevronRight, BarChart2, Loader2, AlertCircle,
} from 'lucide-react';
import { format, subDays } from 'date-fns';

function downloadCSV(rows: any[][], filename: string) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
}

export default function WeeklyReportPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'PROJECT_MANAGER';

  const today = new Date();
  const [startDate, setStartDate] = useState(format(subDays(today, 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(today, 'yyyy-MM-dd'));
  const [activeTab, setActiveTab] = useState<'summary' | 'added' | 'closed' | 'changes'>('summary');

  const managerFilter = isAdmin ? undefined : (user?.name ?? '');
  const { data, isLoading, refetch } = useWeeklyReport(managerFilter, startDate, endDate);
  const wr = data?.data;

  const tabs = [
    { id: 'summary', label: 'Summary' },
    { id: 'added', label: `Newly Added (${wr?.newlyAdded?.length ?? wr?.summary?.newlyAdded ?? 0})` },
    { id: 'closed', label: `Closed (${wr?.closedThisWeek?.length ?? wr?.summary?.closedDecommissioned ?? 0})` },
    { id: 'changes', label: `Changes (${wr?.changedThisWeek?.length ?? wr?.summary?.changedProjects ?? 0})` },
  ] as const;

  function handleExport() {
    if (!wr) return;
    if (activeTab === 'added') {
      downloadCSV(
        [['Project Name', 'Customer', 'Manager', 'Migration Type', 'Created At'],
         ...(wr.newlyAdded || []).map((p: any) => [p.name, p.customerName, p.projectManager, p.migrationTypes || '', p.createdAt ? format(new Date(p.createdAt), 'yyyy-MM-dd') : ''])],
        `weekly-added-${startDate}.csv`
      );
    } else if (activeTab === 'closed') {
      downloadCSV(
        [['Project Name', 'Customer', 'Manager', 'Status', 'Updated At'],
         ...(wr.closedThisWeek || []).map((p: any) => [p.name, p.customerName, p.projectManager, p.status, p.updatedAt ? format(new Date(p.updatedAt), 'yyyy-MM-dd') : ''])],
        `weekly-closed-${startDate}.csv`
      );
    } else if (activeTab === 'changes') {
      downloadCSV(
        [['Project Name', 'Customer', 'Manager', 'Change Type', 'Updated At'],
         ...(wr.changedThisWeek || []).map((p: any) => [p.name, p.customerName, p.projectManager, p.changeType || '', p.updatedAt ? format(new Date(p.updatedAt), 'yyyy-MM-dd') : ''])],
        `weekly-changes-${startDate}.csv`
      );
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <nav className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Link href="/" className="hover:text-primary-600">Dashboard</Link>
            <span>/</span>
            <span className="text-gray-700">Weekly Report</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 size={22} className="text-primary-600" /> Weekly Report
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isManager ? `Showing projects for ${user?.name}` : 'All managers'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={handleExport} disabled={!wr || activeTab === 'summary'} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Date range picker */}
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-400" />
            <span className="text-sm text-gray-600">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-900"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-900"
            />
          </div>
          <button onClick={() => refetch()} className="px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors">
            Apply
          </button>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-primary-600" /></div>
      ) : !wr ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <AlertCircle size={32} className="mr-3" /> Failed to load report
        </div>
      ) : (
        <>
          {/* Summary KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Newly Added', value: wr.newlyAdded?.length ?? 0, color: 'text-green-600', bg: 'bg-green-50', icon: Plus },
              { label: 'Closed', value: wr.closedThisWeek?.length ?? 0, color: 'text-blue-600', bg: 'bg-blue-50', icon: X },
              { label: 'Changed', value: wr.changedThisWeek?.length ?? 0, color: 'text-orange-600', bg: 'bg-orange-50', icon: RefreshCw },
              { label: 'Managers Active', value: wr.summary?.managersWithChanges ?? 0, color: 'text-purple-600', bg: 'bg-purple-50', icon: Users },
            ].map((item) => (
              <Card key={item.label} className="text-center py-3">
                <div className={`w-10 h-10 rounded-lg ${item.bg} flex items-center justify-center mx-auto mb-2`}>
                  <item.icon size={18} className={item.color} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{item.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
              </Card>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1 w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <Card>
            {activeTab === 'summary' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">Period Summary</h3>
                <p className="text-sm text-gray-600">
                  From <strong>{format(new Date(startDate), 'MMM d, yyyy')}</strong> to <strong>{format(new Date(endDate), 'MMM d, yyyy')}</strong>
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-gray-50">
                    <p className="text-gray-500 text-xs mb-1">New projects added</p>
                    <p className="text-xl font-bold text-green-600">{wr.newlyAdded?.length ?? 0}</p>
                    {(wr.summary?.newlyAddedVsLastWeek ?? 0) !== 0 && (
                      <p className={`text-xs mt-1 ${wr.summary.newlyAddedVsLastWeek > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {wr.summary.newlyAddedVsLastWeek > 0 ? '+' : ''}{wr.summary.newlyAddedVsLastWeek} vs prev period
                      </p>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50">
                    <p className="text-gray-500 text-xs mb-1">Projects closed / cancelled</p>
                    <p className="text-xl font-bold text-blue-600">{wr.closedThisWeek?.length ?? 0}</p>
                    {(wr.summary?.closedVsLastWeek ?? 0) !== 0 && (
                      <p className={`text-xs mt-1 ${wr.summary.closedVsLastWeek > 0 ? 'text-blue-500' : 'text-gray-400'}`}>
                        {wr.summary.closedVsLastWeek > 0 ? '+' : ''}{wr.summary.closedVsLastWeek} vs prev period
                      </p>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50">
                    <p className="text-gray-500 text-xs mb-1">Projects with changes</p>
                    <p className="text-xl font-bold text-orange-600">{wr.changedThisWeek?.length ?? 0}</p>
                    {(wr.summary?.changesVsLastWeek ?? 0) !== 0 && (
                      <p className={`text-xs mt-1 ${wr.summary.changesVsLastWeek > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                        {wr.summary.changesVsLastWeek > 0 ? '+' : ''}{wr.summary.changesVsLastWeek} vs prev period
                      </p>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50">
                    <p className="text-gray-500 text-xs mb-1">Managers active</p>
                    <p className="text-xl font-bold text-purple-600">{wr.summary?.managersWithChanges ?? 0}</p>
                  </div>
                </div>
                {wr.summary?.byManager && wr.summary.byManager.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">By Manager</h4>
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                      <table className="w-full text-sm">
                        <thead className="bg-blue-50/60">
                          <tr>
                            {['Manager', 'Added', 'Closed', 'Changed'].map((h) => (
                              <th key={h} className={`py-2 px-3 text-xs font-medium text-gray-500 ${h === 'Manager' ? 'text-left' : 'text-center'}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {wr.summary.byManager.map((m: any) => (
                            <tr key={m.manager} className="border-t border-gray-100 hover:bg-gray-50">
                              <td className="py-2 px-3 font-medium text-gray-800 flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700">
                                  {m.manager?.charAt(0)?.toUpperCase()}
                                </div>
                                {m.manager}
                              </td>
                              <td className="py-2 px-3 text-center text-green-600 font-semibold">{m.added ?? 0}</td>
                              <td className="py-2 px-3 text-center text-blue-600 font-semibold">{m.closed ?? 0}</td>
                              <td className="py-2 px-3 text-center text-orange-600 font-semibold">{m.changed ?? 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'added' && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Newly Added Projects</h3>
                {(!wr.newlyAdded || wr.newlyAdded.length === 0) ? (
                  <p className="text-sm text-gray-400 py-8 text-center">No projects added in this period</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-blue-50/60">
                        <tr>
                          {['Project Name', 'Customer', 'Manager', 'Migration Type', 'Added On'].map((h) => (
                            <th key={h} className={`py-2 px-3 text-xs font-medium text-gray-500 ${h === 'Project Name' ? 'text-left' : 'text-center'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {wr.newlyAdded.map((p: any) => (
                          <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="py-2.5 px-3">
                              <Link href={`/projects/${p.id}`} className="font-medium text-primary-600 hover:underline">{p.name}</Link>
                            </td>
                            <td className="py-2.5 px-3 text-center text-gray-600">{p.customerName}</td>
                            <td className="py-2.5 px-3 text-center text-gray-600">{p.projectManager}</td>
                            <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{p.migrationTypes || '—'}</span></td>
                            <td className="py-2.5 px-3 text-center text-gray-500">{p.createdAt ? format(new Date(p.createdAt), 'MMM d, yyyy') : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'closed' && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Closed / Cancelled Projects</h3>
                {(!wr.closedThisWeek || wr.closedThisWeek.length === 0) ? (
                  <p className="text-sm text-gray-400 py-8 text-center">No projects closed in this period</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-blue-50/60">
                        <tr>
                          {['Project Name', 'Customer', 'Manager', 'Status', 'Closed On'].map((h) => (
                            <th key={h} className={`py-2 px-3 text-xs font-medium text-gray-500 ${h === 'Project Name' ? 'text-left' : 'text-center'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {wr.closedThisWeek.map((p: any) => (
                          <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="py-2.5 px-3">
                              <Link href={`/projects/${p.id}`} className="font-medium text-primary-600 hover:underline">{p.name}</Link>
                            </td>
                            <td className="py-2.5 px-3 text-center text-gray-600">{p.customerName}</td>
                            <td className="py-2.5 px-3 text-center text-gray-600">{p.projectManager}</td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{p.status}</span>
                            </td>
                            <td className="py-2.5 px-3 text-center text-gray-500">{p.updatedAt ? format(new Date(p.updatedAt), 'MMM d, yyyy') : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'changes' && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Projects with Changes</h3>
                {(!wr.changedThisWeek || wr.changedThisWeek.length === 0) ? (
                  <p className="text-sm text-gray-400 py-8 text-center">No project changes in this period</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-blue-50/60">
                        <tr>
                          {['Project Name', 'Customer', 'Manager', 'Status', 'Delay', 'Phase', 'Last Updated'].map((h) => (
                            <th key={h} className={`py-2 px-3 text-xs font-medium text-gray-500 ${h === 'Project Name' ? 'text-left' : 'text-center'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {wr.changedThisWeek.map((p: any, i: number) => (
                          <tr key={`${p.id}-${i}`} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="py-2.5 px-3">
                              <Link href={`/projects/${p.id}`} className="font-medium text-primary-600 hover:underline">{p.name}</Link>
                              <p className="text-xs text-gray-400">{p.migrationTypes || ''}</p>
                            </td>
                            <td className="py-2.5 px-3 text-center text-gray-600">{p.customerName}</td>
                            <td className="py-2.5 px-3 text-center text-gray-600">{p.projectManager}</td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                p.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                                p.status === 'ON_HOLD' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>{p.status}</span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {p.delayStatus && p.delayStatus !== 'ON_TRACK' ? (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  p.delayStatus === 'DELAYED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                }`}>{p.delayStatus}</span>
                              ) : <span className="text-gray-400 text-xs">—</span>}
                            </td>
                            <td className="py-2.5 px-3 text-center text-gray-500 text-xs">{p.phase || '—'}</td>
                            <td className="py-2.5 px-3 text-center text-gray-500">{p.updatedAt ? format(new Date(p.updatedAt), 'MMM d, yyyy') : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
