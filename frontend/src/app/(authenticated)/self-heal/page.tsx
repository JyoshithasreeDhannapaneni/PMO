'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Card } from '@/components/ui/Card';
import { format } from 'date-fns';
import {
  ShieldCheck, AlertTriangle, CheckCircle, RefreshCw, Play, Info, Zap,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function authFetch(url: string, options?: RequestInit) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers },
  }).then(r => r.json());
}

const SOURCE_LABEL: Record<string, string> = {
  uncaught_exception: 'Crash — uncaught exception',
  unhandled_rejection: 'Crash — unhandled rejection',
  http_5xx: 'Unexpected server error (5xx)',
  process_crash: 'Process crash',
};

export default function SelfHealPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'ADMIN';
  const qc = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['self-heal-incidents'],
    queryFn: () => authFetch(`${API_BASE}/api/self-heal/incidents?limit=200`),
    staleTime: 30_000,
    enabled: isAdmin,
  });

  const diagnoseMutation = useMutation({
    mutationFn: () => authFetch(`${API_BASE}/api/self-heal/diagnose`, { method: 'POST' }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['self-heal-incidents'] });
      if (!result?.success) return;
      if (result.data?.skipped) showToast('error', 'Diagnosis skipped', result.data.reason);
      else showToast('success', `Diagnosis complete — ${result.data?.diagnosed ?? 0} incident group(s) analyzed`);
    },
    onError: (err: any) => showToast('error', 'Diagnosis pass failed', err.message),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => authFetch(`${API_BASE}/api/self-heal/incidents/${id}/resolve`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['self-heal-incidents'] });
      showToast('success', 'Marked resolved');
    },
    onError: (err: any) => showToast('error', 'Failed to resolve', err.message),
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        This page is admin-only.
      </div>
    );
  }

  const incidents: any[] = data?.data?.incidents ?? [];
  const isConfigured: boolean = data?.data?.isConfigured ?? false;
  const visible = showResolved ? incidents : incidents.filter((i) => !i.resolved);
  const unresolvedCount = incidents.filter((i) => !i.resolved).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck size={24} className="text-primary-600" /> Self-Heal
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Crashes and unexpected server errors — process-level recovery is automatic (systemd);
            AI diagnosis below is a suggestion only, nothing is ever applied automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            onClick={() => diagnoseMutation.mutate()}
            disabled={diagnoseMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-60"
          >
            {diagnoseMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            Diagnose now
          </button>
        </div>
      </div>

      {!isConfigured && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <Info size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            <strong>ANTHROPIC_API_KEY</strong> isn't configured — incidents are still being captured below,
            but the AI diagnosis pass (and the "Diagnose now" button) will no-op until a key is added to backend/.env.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-red-50 rounded-xl p-4 border border-white">
          <div className="text-2xl font-bold text-red-700">{unresolvedCount}</div>
          <div className="text-xs text-gray-500 mt-0.5">Unresolved</div>
        </div>
        <div className="bg-teal-50 rounded-xl p-4 border border-white">
          <div className="text-2xl font-bold text-teal-700">{incidents.filter((i) => i.diagnosis).length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Diagnosed</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 border border-white">
          <div className="text-2xl font-bold text-gray-700">{incidents.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total (last 200)</div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
        Show resolved
      </label>

      <Card>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
            <CheckCircle size={28} className="text-green-400" />
            No unresolved incidents.
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((incident) => (
              <div key={incident.id} className={`rounded-xl border p-4 ${incident.resolved ? 'border-gray-100 bg-gray-50/50' : 'border-red-100 bg-red-50/30'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                        incident.severity === 'fatal' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        <AlertTriangle size={11} /> {SOURCE_LABEL[incident.source] ?? incident.source}
                      </span>
                      {incident.auto_healed && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                          <Zap size={11} /> Auto-healed
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{format(new Date(incident.created_at), 'MMM d, yyyy HH:mm')}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800 mt-1.5">{incident.message}</p>
                    {incident.diagnosis && (
                      <div className="mt-2 text-xs bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                        <p><span className="font-semibold text-gray-700">Diagnosis:</span> <span className="text-gray-600">{incident.diagnosis}</span></p>
                        {incident.suggested_fix && (
                          <p><span className="font-semibold text-gray-700">Suggested fix:</span> <span className="text-gray-600">{incident.suggested_fix}</span></p>
                        )}
                      </div>
                    )}
                  </div>
                  {!incident.resolved && (
                    <button
                      onClick={() => resolveMutation.mutate(incident.id)}
                      disabled={resolveMutation.isPending}
                      className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 whitespace-nowrap"
                    >
                      Mark resolved
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
