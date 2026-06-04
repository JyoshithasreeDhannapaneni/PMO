'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Card } from '@/components/ui/Card';
import { format } from 'date-fns';
import {
  Bell, Mail, AlertTriangle, CheckCircle, Clock, Send,
  RefreshCw, Play, Eye, X, Info, Zap,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function authFetch(url: string, options?: RequestInit) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers },
  }).then(r => r.json());
}

const ALERT_CFG = {
  active:  { label: 'Active',   color: 'bg-blue-100 text-blue-700',   icon: CheckCircle,     border: 'border-blue-300' },
  warning: { label: 'Warning',  color: 'bg-amber-100 text-amber-700', icon: AlertTriangle,   border: 'border-amber-300' },
  overdue: { label: 'Overdue',  color: 'bg-red-100 text-red-700',     icon: AlertTriangle,   border: 'border-red-300' },
};

export default function ServerAlertsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'ADMIN';
  const qc = useQueryClient();
  const [showLogs, setShowLogs] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  const { data: statusData, isLoading, refetch } = useQuery({
    queryKey: ['server-alerts-status'],
    queryFn: () => authFetch(`${API_BASE}/api/server-alerts/status`),
    staleTime: 30_000,
  });

  const { data: logsData } = useQuery({
    queryKey: ['server-alerts-logs'],
    queryFn: () => authFetch(`${API_BASE}/api/server-alerts/logs?limit=100`),
    enabled: showLogs,
    staleTime: 30_000,
  });

  const runNowMutation = useMutation({
    mutationFn: () => authFetch(`${API_BASE}/api/server-alerts/run-now`, { method: 'POST' }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['server-alerts-status'] });
      qc.invalidateQueries({ queryKey: ['server-alerts-logs'] });
      if (result?.success) showToast('success', `Job complete — Sent: ${result.data?.sent}, Skipped: ${result.data?.skipped}, Failed: ${result.data?.failed}`);
    },
    onError: (err: any) => showToast('error', 'Job failed', err.message),
  });

  async function handleSend(id: string) {
    setSending(id);
    try {
      const result = await authFetch(`${API_BASE}/api/server-alerts/${id}/send`, { method: 'POST' });
      console.log('[ServerAlerts] sendManual result:', result);
      if (result.success) {
        showToast('success', 'Email sent successfully');
        qc.invalidateQueries({ queryKey: ['server-alerts-status'] });
        qc.invalidateQueries({ queryKey: ['server-alerts-logs'] });
      } else {
        const errMsg = result.error || result.message || 'Unknown error — check browser console and backend logs';
        console.error('[ServerAlerts] Send failed:', errMsg);
        showToast('error', 'Failed to send email', errMsg);
      }
    } catch (err: any) {
      console.error('[ServerAlerts] Fetch/parse error:', err);
      showToast('error', 'Failed to send email', err.message || 'Network error');
    } finally {
      setSending(null);
    }
  }

  const projects: any[] = statusData?.data || [];
  const logs: any[] = logsData?.data || [];

  const stats = {
    total: projects.length,
    noEmail: projects.filter(p => !p.hasEmail).length,
    active: projects.filter(p => p.alertType === 'active').length,
    warning: projects.filter(p => p.alertType === 'warning').length,
    overdue: projects.filter(p => p.alertType === 'overdue').length,
    idle: projects.filter(p => !p.alertType).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell size={24} className="text-primary-600" /> Server Alerts
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Automated SOW usage emails — active every 7 days, warning at &lt;7 days, overdue daily
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
          {isAdmin && (
            <button
              onClick={() => runNowMutation.mutate()}
              disabled={runNowMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-60"
            >
              {runNowMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              Run Daily Job Now
            </button>
          )}
        </div>
      </div>

      {/* Run result */}
      {runNowMutation.data && (
        <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <CheckCircle size={16} />
          Job complete — Sent: {runNowMutation.data.data?.sent}, Skipped: {runNowMutation.data.data?.skipped}, Failed: {runNowMutation.data.data?.failed}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Projects', value: stats.total, color: 'text-gray-900', bg: 'bg-gray-100' },
          { label: 'No Email Set', value: stats.noEmail, color: 'text-gray-500', bg: 'bg-gray-100' },
          { label: 'Active Alerts', value: stats.active, color: 'text-blue-700', bg: 'bg-blue-100' },
          { label: 'Warning', value: stats.warning, color: 'text-amber-700', bg: 'bg-amber-100' },
          { label: 'Overdue', value: stats.overdue, color: 'text-red-700', bg: 'bg-red-100' },
          { label: 'Idle (no alert)', value: stats.idle, color: 'text-gray-500', bg: 'bg-gray-100' },
        ].map(s => (
          <Card key={s.label} padding="sm">
            <div className={`w-8 h-8 rounded-full ${s.bg} flex items-center justify-center mb-2`}>
              <Bell size={14} className={s.color} />
            </div>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* How it works info */}
      <div className="flex items-start gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <Info size={16} className="mt-0.5 flex-shrink-0" />
        <div>
          <strong>How automated alerts work:</strong> Every day at 8:00 AM, the system checks all active projects that have a Customer Email, a Kickoff Start Date, and a Project End Date.
          It sends an <strong>Active</strong> update every 7 days from the Kickoff Start Date, switches to a daily <strong>Warning</strong> email when &le;7 days remain, and sends a daily <strong>Overdue</strong> email once the Project End Date has passed.
          Duplicate emails on the same day are automatically skipped. Set the customer email in the project form on the Timeline step.
        </div>
      </div>

      {/* Projects table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Zap size={16} className="text-primary-600" /> Project Alert Status
          </h2>
          <button onClick={() => setShowLogs(!showLogs)} className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700">
            <Eye size={14} /> {showLogs ? 'Hide' : 'View'} Send History
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12 text-gray-400"><RefreshCw size={24} className="animate-spin" /></div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Bell size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No active projects with SOW dates found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Project', 'Customer Email', 'Kickoff Date', 'Project End', 'Days Remaining', 'Alert Type', 'Last Sent', 'Action'].map(h => (
                    <th key={h} className={`py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap ${h === 'Project' ? 'text-left' : 'text-center'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projects.map((p: any) => {
                  const cfg = p.alertType ? ALERT_CFG[p.alertType as keyof typeof ALERT_CFG] : null;
                  const AlertIcon = cfg?.icon || Clock;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="py-3 px-3">
                        <div className="font-medium text-gray-900 truncate max-w-[180px]">{p.name}</div>
                        <div className="text-xs text-gray-400">{p.customerName}</div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {p.hasEmail ? (
                          <div className="flex items-center justify-center gap-1 text-xs text-gray-600">
                            <Mail size={11} className="text-green-500" />
                            <span className="truncate max-w-[140px]">{p.customerContact}</span>
                          </div>
                        ) : (
                          <span className="flex items-center justify-center gap-1 text-xs text-red-400">
                            <X size={11} /> No email
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center text-xs text-gray-500">
                        {p.plannedStart ? format(new Date(p.plannedStart), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="py-3 px-3 text-center text-xs text-gray-500">
                        {p.plannedEnd ? format(new Date(p.plannedEnd), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {p.daysRemaining < 0 ? (
                          <span className="text-xs font-bold text-red-600">{Math.abs(p.daysRemaining)}d overdue</span>
                        ) : (
                          <span className={`text-xs font-semibold ${p.daysRemaining <= 7 ? 'text-amber-600' : 'text-gray-700'}`}>{p.daysRemaining}d left</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {cfg ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
                            <AlertIcon size={10} /> {cfg.label}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center text-xs text-gray-500">
                        {p.lastSentAt ? (
                          <div>
                            <div>{format(new Date(p.lastSentAt), 'MMM d, HH:mm')}</div>
                            <div className={p.lastAlertType === 'overdue' ? 'text-red-500' : p.lastAlertType === 'warning' ? 'text-amber-500' : 'text-blue-500'}>
                              {p.lastAlertType}
                            </div>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {p.hasEmail ? (
                          <button
                            onClick={() => handleSend(p.id)}
                            disabled={sending === p.id}
                            title="Send alert email now"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-100 disabled:opacity-50 transition-colors"
                          >
                            {sending === p.id ? <RefreshCw size={11} className="animate-spin" /> : <Send size={11} />}
                            Send
                          </button>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Send History */}
      {showLogs && (
        <Card>
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Clock size={16} className="text-primary-600" /> Send History (last 100)
          </h2>
          {logs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No emails sent yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Project', 'Type', 'Sent To', 'Days Remaining', 'Status', 'Sent At'].map(h => (
                      <th key={h} className={`py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase ${h === 'Project' ? 'text-left' : 'text-center'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-medium text-gray-900 truncate max-w-[160px]">{log.project_name}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          log.alert_type === 'overdue' ? 'bg-red-100 text-red-700' :
                          log.alert_type === 'warning' ? 'bg-amber-100 text-amber-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>{log.alert_type}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-xs text-gray-500 truncate max-w-[160px]">{log.sent_to}</td>
                      <td className="py-2.5 px-3 text-center text-xs text-gray-600">
                        {log.days_overdue > 0 ? <span className="text-red-600">{log.days_overdue}d overdue</span> : `${log.days_remaining}d`}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {log.success
                          ? <span className="text-xs text-green-600 flex items-center justify-center gap-1"><CheckCircle size={11} /> Sent</span>
                          : <span className="text-xs text-red-600 flex items-center justify-center gap-1" title={log.error_message}><X size={11} /> Failed</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center text-xs text-gray-500">
                        {log.sent_at ? format(new Date(log.sent_at), 'MMM d, yyyy HH:mm') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
