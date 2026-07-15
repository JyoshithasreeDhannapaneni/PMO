'use client';

import React, { useState } from 'react';
import { useDealDeskDeals, useDealDeskStats, useDealDeskConfig, useTriggerDealDeskPoll, useImportSendGridHistory } from '@/hooks/useProjects';
import { RefreshCw, FileText, CheckCircle, AlertCircle, DollarSign, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_COLORS: Record<string, string> = {
  Signed: 'bg-green-100 text-green-700',
  Completed: 'bg-blue-100 text-blue-700',
  Approved: 'bg-emerald-100 text-emerald-700',
  Sent: 'bg-yellow-100 text-yellow-700',
  Declined: 'bg-red-100 text-red-700',
  Voided: 'bg-gray-100 text-gray-600',
};

const MATCH_COLORS: Record<string, string> = {
  ps_sow: 'bg-purple-100 text-purple-700',
  ps_customer: 'bg-indigo-100 text-indigo-700',
  ps_manual: 'bg-indigo-100 text-indigo-700',
  project_customer: 'bg-blue-100 text-blue-700',
  project_manual: 'bg-blue-100 text-blue-700',
  none: 'bg-gray-100 text-gray-500',
};

const MATCH_LABELS: Record<string, string> = {
  ps_sow: 'PS (SOW)',
  ps_customer: 'PS (Name)',
  ps_manual: 'PS (Manual)',
  project_customer: 'Project',
  project_manual: 'Project (Manual)',
  none: 'Unmatched',
};

function formatCurrency(v: number | null | undefined) {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function formatDate(s: string | null | undefined) {
  if (!s) return '—';
  try { return format(new Date(s), 'MMM d, yyyy'); } catch { return s; }
}

interface Deal {
  id: string;
  source_filename: string;
  customer_name: string | null;
  sow_ref: string | null;
  deal_value: number | null;
  deal_status: string;
  signer_name: string | null;
  signed_at: string | null;
  line_items: { description: string; quantity?: number; unitPrice?: number; total?: number }[];
  match_type: string;
  match_confidence: string;
  matched_ps_id: string | null;
  matched_project_id: string | null;
  extracted_text: string | null;
  subject: string;
  sender_email: string | null;
  sender_name: string | null;
  received_at: string | null;
  created_at: string;
  project_customer_name: string | null;
  ps_client_name: string | null;
  ps_sow_ref: string | null;
}

export default function DealDeskPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [matchFilter, setMatchFilter] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reparsing, setReparsing] = useState(false);
  const [reparseResult, setReparseResult] = useState<{ updated: number } | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState<{ processed: number; skipped: number; errors: number; found: number } | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok?: boolean; error?: string; mailboxReachable?: boolean; mailboxError?: string; diagnostics?: Record<string, string | number | boolean> } | null>(null);
  const [testing, setTesting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ found: number; imported: number; skipped: number; errors: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importDays, setImportDays] = useState(0);

  const configQuery = useDealDeskConfig();
  const statsQuery = useDealDeskStats();
  const dealsQuery = useDealDeskDeals({ page, limit: 25, search, status: statusFilter, matchType: matchFilter });
  const triggerPoll = useTriggerDealDeskPoll();
  const importHistory = useImportSendGridHistory();

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  async function handleTestAuth() {
    setTesting(true);
    setTestResult(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      const res = await fetch(`${API_BASE}/api/deal-desk/test-auth`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      setTestResult(json.data);
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  }

  const isConfigured = configQuery.data?.data?.configured ?? false;
  const configMode: string = configQuery.data?.data?.mode ?? 'none';
  const isSendGridMode = configMode === 'sendgrid';
  const stats = statsQuery.data?.data;
  const deals: Deal[] = dealsQuery.data?.data || [];
  const total: number = dealsQuery.data?.total || 0;
  const totalPages = Math.ceil(total / 25);

  async function handleReparse() {
    setReparsing(true);
    setReparseResult(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      const res = await fetch(`${API_BASE}/api/deal-desk/reparse`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json.success) {
        setReparseResult(json.data);
        dealsQuery.refetch();
        statsQuery.refetch();
      }
    } finally {
      setReparsing(false);
    }
  }

  async function handlePoll() {
    setPolling(true);
    setPollResult(null);
    setPollError(null);
    try {
      const res = await triggerPoll.mutateAsync();
      if (res.success) setPollResult(res.data);
      else setPollError(res.error || 'Unknown error');
    } catch (e: any) {
      setPollError(e.message || 'Poll failed');
    } finally {
      setPolling(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const res = await importHistory.mutateAsync(importDays);
      if (res.success) {
        setImportResult(res.data);
        dealsQuery.refetch();
        statsQuery.refetch();
      } else {
        setImportError(res.error || 'Import failed');
      }
    } catch (e: any) {
      setImportError(e.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deal Desk</h1>
          <p className="text-sm text-gray-500 mt-1">
            Signed agreements and quotes from <span className="font-medium">dealdesk@zenop.ai</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isSendGridMode && (
            <button
              onClick={handleTestAuth}
              disabled={testing || !isConfigured}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircle size={15} className={testing ? 'animate-pulse text-blue-500' : 'text-gray-400'} />
              {testing ? 'Testing…' : 'Test connection'}
            </button>
          )}
          <button
            onClick={handleReparse}
            disabled={reparsing}
            className="flex items-center gap-2 px-3 py-2 border border-purple-300 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Re-extract fields from already-imported documents without re-fetching emails"
          >
            <RefreshCw size={15} className={reparsing ? 'animate-spin' : ''} />
            {reparsing ? 'Reparsing…' : 'Reparse docs'}
          </button>
          {isSendGridMode && (
            <div className="flex items-center gap-1">
              <select
                value={importDays}
                onChange={e => setImportDays(parseInt(e.target.value, 10))}
                disabled={importing}
                className="px-2 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white disabled:opacity-50"
              >
                <option value={0}>All time</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value={365}>Last 365 days</option>
              </select>
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Pull past emails from SendGrid Email Activity API and import into database"
              >
                <RefreshCw size={16} className={importing ? 'animate-spin' : ''} />
                {importing ? 'Importing…' : 'Import history'}
              </button>
            </div>
          )}
          {!isSendGridMode && (
            <button
              onClick={handlePoll}
              disabled={polling || !isConfigured}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw size={16} className={polling ? 'animate-spin' : ''} />
              {polling ? 'Checking inbox…' : 'Check inbox now'}
            </button>
          )}
        </div>
      </div>

      {isSendGridMode ? (
        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
          <CheckCircle size={18} className="mt-0.5 shrink-0 text-green-600" />
          <div>
            <p className="font-medium">SendGrid Inbound Parse active</p>
            <p className="mt-0.5">Emails sent to <code className="bg-green-100 px-1 rounded">dealdesk@zenop.ai</code> are automatically delivered here via webhook. In SendGrid, set Inbound Parse → Hostname: <code className="bg-green-100 px-1 rounded">zenop.ai</code> → URL: <code className="bg-green-100 px-1 rounded">http://&lt;server&gt;:3001/api/deal-desk/inbound?secret=dd-sg-webhook-2024</code></p>
          </div>
        </div>
      ) : !isConfigured ? (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Email integration not configured</p>
            <p className="mt-0.5">Set <code className="bg-amber-100 px-1 rounded">SENDGRID_WEBHOOK_ENABLED=true</code> in <code className="bg-amber-100 px-1 rounded">backend/.env</code> to use SendGrid Inbound Parse, or configure <code className="bg-amber-100 px-1 rounded">MS_GRAPH_TENANT_ID</code>, <code className="bg-amber-100 px-1 rounded">MS_GRAPH_CLIENT_ID</code>, and <code className="bg-amber-100 px-1 rounded">MS_GRAPH_CLIENT_SECRET</code> for Microsoft Graph polling.</p>
          </div>
        </div>
      ) : null}

      {testResult && (
        <div className={`p-4 rounded-xl border text-sm space-y-2 ${testResult.ok && testResult.mailboxReachable ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {testResult.diagnostics && (
            <div className="font-mono text-xs bg-white bg-opacity-60 rounded-lg p-3 space-y-0.5">
              <p className="font-semibold text-gray-600 mb-1">What the backend loaded from .env</p>
              {Object.entries(testResult.diagnostics).map(([k, v]) => (
                <div key={k}><span className="text-gray-500">{k}:</span> <span className="text-gray-900">{String(v)}</span></div>
              ))}
            </div>
          )}
          {testResult.ok === false ? (
            <div>
              <p className="font-semibold">Token acquisition failed</p>
              <p className="mt-1 font-mono text-xs break-all">{testResult.error}</p>
              <p className="mt-2 text-xs">If secretLen is 0 or secretFirst4 is "(empty)", the backend did not load the .env — restart it. If length looks correct but still failing, regenerate the secret in Azure.</p>
            </div>
          ) : testResult.mailboxReachable ? (
            <div className="flex items-center gap-2"><CheckCircle size={16} /> Token OK and mailbox reachable — credentials are working correctly.</div>
          ) : (
            <div>
              <p className="font-semibold">Token OK but mailbox access denied</p>
              <p className="mt-1 font-mono text-xs break-all">{testResult.mailboxError}</p>
              <p className="mt-2 text-xs">Fix: In Azure Portal → App Registrations → API Permissions → Add <strong>Mail.Read</strong> (Application, not Delegated) → Grant admin consent.</p>
            </div>
          )}
        </div>
      )}

      {reparseResult && (
        <div className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-xl text-sm text-purple-800">
          <CheckCircle size={16} />
          Reparse complete — updated <strong>{reparseResult.updated}</strong> deal record{reparseResult.updated !== 1 ? 's' : ''} with re-extracted fields.
        </div>
      )}

      {importError && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Import failed</p>
            <p className="mt-1 font-mono text-xs break-all">{importError}</p>
            {importError.includes('IMAP') && (
              <p className="mt-2 text-xs">Add IMAP credentials to <code className="bg-red-100 px-1 rounded">backend/.env</code>: <code className="bg-red-100 px-1 rounded">IMAP_HOST</code>, <code className="bg-red-100 px-1 rounded">IMAP_USER</code>, <code className="bg-red-100 px-1 rounded">IMAP_PASSWORD</code>, then restart the backend.</p>
            )}
          </div>
        </div>
      )}

      {importResult && (
        <div className={`p-3 rounded-xl border text-sm ${importResult.imported === 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
          <div className="flex items-center gap-2">
            <CheckCircle size={16} />
            <span>
              History import complete — found <strong>{importResult.found}</strong> email{importResult.found !== 1 ? 's' : ''} in mailbox,{' '}
              <strong>{importResult.imported}</strong> newly imported,{' '}
              <strong>{importResult.skipped}</strong> already in database
              {importResult.errors > 0 && <>, <strong className="text-red-700">{importResult.errors}</strong> error{importResult.errors !== 1 ? 's' : ''}</>}
            </span>
          </div>
          {importResult.found === 0 && (
            <p className="mt-1 text-xs">No emails found in INBOX for the selected date range. Try a longer range (365 days) or check that IMAP access is enabled for the mailbox in Microsoft 365 admin.</p>
          )}
          {importResult.imported > 0 && (
            <p className="mt-1 text-xs">Full email bodies and PDF/DOCX attachments were read directly from the mailbox. Use <strong>Reparse docs</strong> to re-extract fields if needed.</p>
          )}
        </div>
      )}

      {pollError && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Poll failed</p>
            <p className="mt-1 font-mono text-xs break-all">{pollError}</p>
          </div>
        </div>
      )}

      {pollResult && (
        <div className={`p-3 rounded-xl border text-sm ${pollResult.found === 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
          <div className="flex items-center gap-2">
            <CheckCircle size={16} />
            <span>
              Poll complete — found <strong>{pollResult.found}</strong> e-sign email{pollResult.found !== 1 ? 's' : ''},{' '}
              <strong>{pollResult.processed}</strong> new document{pollResult.processed !== 1 ? 's' : ''} imported,{' '}
              <strong>{pollResult.skipped}</strong> already in database
              {pollResult.errors > 0 && <>, <strong className="text-red-700">{pollResult.errors}</strong> error{pollResult.errors !== 1 ? 's' : ''}</>}
            </span>
          </div>
          {pollResult.found === 0 && (
            <p className="mt-1 text-xs">No emails found with e-sign subject keywords. Check the backend terminal logs for details on what was fetched.</p>
          )}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-blue-50 rounded-xl p-4 flex items-center gap-3 border border-white">
            <FileText size={20} className="text-blue-600" />
            <div>
              <p className="text-xs text-blue-600 font-medium">Total Deals</p>
              <p className="text-xl font-bold text-blue-900">{stats.total_deals}</p>
            </div>
          </div>
          <div className="bg-green-50 rounded-xl p-4 flex items-center gap-3 border border-white">
            <CheckCircle size={20} className="text-green-600" />
            <div>
              <p className="text-xs text-green-600 font-medium">Signed</p>
              <p className="text-xl font-bold text-green-900">{stats.signed_deals}</p>
            </div>
          </div>
          <div className="bg-purple-50 rounded-xl p-4 flex items-center gap-3 border border-white">
            <CheckCircle size={20} className="text-purple-600" />
            <div>
              <p className="text-xs text-purple-600 font-medium">Matched</p>
              <p className="text-xl font-bold text-purple-900">{stats.matched_deals}</p>
            </div>
          </div>
          <div className="bg-orange-50 rounded-xl p-4 flex items-center gap-3 border border-white">
            <AlertCircle size={20} className="text-orange-600" />
            <div>
              <p className="text-xs text-orange-600 font-medium">Unmatched</p>
              <p className="text-xl font-bold text-orange-900">{stats.unmatched_deals}</p>
            </div>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 flex items-center gap-3 border border-white">
            <DollarSign size={20} className="text-emerald-600" />
            <div>
              <p className="text-xs text-emerald-600 font-medium">Signed Value</p>
              <p className="text-lg font-bold text-emerald-900">{formatCurrency(parseFloat(stats.total_signed_value || '0'))}</p>
            </div>
          </div>
          <div className="bg-indigo-50 rounded-xl p-4 flex items-center gap-3 border border-white">
            <FileText size={20} className="text-indigo-600" />
            <div>
              <p className="text-xs text-indigo-600 font-medium">Customers</p>
              <p className="text-xl font-bold text-indigo-900">{stats.unique_customers}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search customer, SOW, subject…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All statuses</option>
            <option value="Signed">Signed</option>
            <option value="Completed">Completed</option>
            <option value="Approved">Approved</option>
            <option value="Sent">Sent</option>
            <option value="Declined">Declined</option>
          </select>
          <select
            value={matchFilter}
            onChange={e => { setMatchFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All matches</option>
            <option value="ps_sow">PS (SOW exact)</option>
            <option value="ps_customer">PS (Name)</option>
            <option value="project_customer">Project</option>
            <option value="none">Unmatched</option>
          </select>
        </div>

        {dealsQuery.isLoading ? (
          <div className="py-16 text-center text-sm text-gray-500">Loading deals…</div>
        ) : deals.length === 0 ? (
          <div className="py-16 text-center">
            <FileText size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No deals found</p>
            {!isConfigured && (
              <p className="text-gray-400 text-xs mt-1">Configure MS Graph credentials and click "Check inbox now" to start importing</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-8"></th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">SOW / Quote Ref</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">File</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Value</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Signer</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Match</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {deals.map(deal => (
                  <React.Fragment key={deal.id}>
                    <tr
                      key={deal.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleExpand(deal.id)}
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {expandedId === deal.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {deal.customer_name || <span className="text-gray-400 italic">Unknown</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                        {deal.sow_ref || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate" title={deal.source_filename}>
                        {deal.source_filename}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[deal.deal_status] || 'bg-gray-100 text-gray-600'}`}>
                          {deal.deal_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {formatCurrency(deal.deal_value)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {deal.signer_name || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${MATCH_COLORS[deal.match_type] || 'bg-gray-100 text-gray-500'}`}>
                          {MATCH_LABELS[deal.match_type] || deal.match_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {formatDate(deal.received_at)}
                      </td>
                    </tr>
                    {expandedId === deal.id && (
                      <tr key={`${deal.id}-detail`}>
                        <td colSpan={9} className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-3">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email Info</h4>
                                <div className="space-y-1 text-sm">
                                  <div><span className="text-gray-500">Subject: </span><span className="text-gray-800">{deal.subject}</span></div>
                                  <div><span className="text-gray-500">From: </span><span className="text-gray-800">{deal.sender_name} {deal.sender_email ? `<${deal.sender_email}>` : ''}</span></div>
                                  <div><span className="text-gray-500">Signed date: </span><span className="text-gray-800">{formatDate(deal.signed_at)}</span></div>
                                </div>
                                {deal.match_type !== 'none' && (
                                  <div className="mt-3">
                                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Matched To</h4>
                                    <div className="text-sm text-gray-800">
                                      {deal.ps_client_name && <div>PS Engagement: <strong>{deal.ps_client_name}</strong> {deal.ps_sow_ref ? `(${deal.ps_sow_ref})` : ''}</div>}
                                      {deal.project_customer_name && <div>Project: <strong>{deal.project_customer_name}</strong></div>}
                                      <div className="text-xs text-gray-500 mt-0.5">Confidence: {deal.match_confidence}</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                              {deal.line_items && deal.line_items.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Line Items</h4>
                                  <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                                    <thead className="bg-gray-100">
                                      <tr>
                                        <th className="px-3 py-2 text-left text-gray-600">Description</th>
                                        <th className="px-3 py-2 text-right text-gray-600">Qty</th>
                                        <th className="px-3 py-2 text-right text-gray-600">Unit</th>
                                        <th className="px-3 py-2 text-right text-gray-600">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                      {deal.line_items.map((li, idx) => (
                                        <tr key={idx}>
                                          <td className="px-3 py-1.5 text-gray-700">{li.description}</td>
                                          <td className="px-3 py-1.5 text-right text-gray-600">{li.quantity ?? '—'}</td>
                                          <td className="px-3 py-1.5 text-right text-gray-600">{li.unitPrice != null ? formatCurrency(li.unitPrice) : '—'}</td>
                                          <td className="px-3 py-1.5 text-right text-gray-600">{li.total != null ? formatCurrency(li.total) : '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                            {/* Raw extracted text — PDF content or email body fallback */}
                            <div>
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                {deal.extracted_text?.startsWith('[') ? 'Email Body' : 'Extracted Document Text'}
                                {deal.extracted_text?.startsWith('[PDF encrypted') && (
                                  <span className="ml-2 text-amber-600 normal-case font-normal">— PDF encrypted, fields read from email body</span>
                                )}
                                {deal.extracted_text?.startsWith('[Extracted from email body') && (
                                  <span className="ml-2 text-blue-600 normal-case font-normal">— fields read from email body</span>
                                )}
                                {(!deal.extracted_text || deal.extracted_text.trim().length < 20) && (
                                  <span className="ml-2 text-red-500 normal-case font-normal">— no text available</span>
                                )}
                              </h4>
                              {deal.extracted_text && deal.extracted_text.trim().length >= 20 ? (
                                <pre className="bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap break-words max-h-64 overflow-y-auto font-mono leading-relaxed">
                                  {deal.extracted_text}
                                </pre>
                              ) : (
                                <p className="text-xs text-gray-400 italic">No text available. Try clicking "Reparse docs" after the next poll.</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">{total} total deals</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="text-xs text-gray-600">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
