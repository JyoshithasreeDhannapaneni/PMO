'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, startOfMonth, endOfMonth, subMonths, subDays } from 'date-fns';
import { useAuth } from '@/context/AuthContext';
import { useSlaBreachAlerts, useSlaBreachAlertMessage, useSlaBreachAlertPeople } from '@/hooks/useProjects';
import { Card } from '@/components/ui/Card';
import {
  AlertCircle, Loader2, ChevronLeft, ChevronRight, ChevronDown, Search, Siren, CheckCircle2, User, X,
} from 'lucide-react';

interface AlertRow {
  id: string;
  message_id: string;
  conversation_id: string | null;
  user_email: string;
  user_name: string | null;
  customer_email: string | null;
  subject: string | null;
  received_at: string;
  overdue_minutes: number;
  manager_email: string | null;
  recipients: { email: string; name: string }[];
  alerted_at: string;
  resolved_at: string | null;
}

interface EmailChainEntry {
  sender: 'customer' | 'cloudfuze' | 'unknown';
  name: string | null;
  email: string | null;
  timestamp: string | null;
  body: string;
}

interface MessageResult {
  found: boolean;
  text?: string;
  chain?: EmailChainEntry[];
  subject?: string;
  customerEmail?: string;
  receivedAt?: string;
  mailboxUsed?: string;
  error?: string;
}

interface Person {
  name: string;
  email: string;
  total: number;
  open: number;
}

function overdueLabel(minutes: number): string {
  return minutes >= 120 ? `${Math.round(minutes / 60)}h` : `${minutes}m`;
}

// Entry 0's timestamp is the ISO string Graph gave us for the outer message itself; every
// other entry's timestamp came from a quoted "Sent:"/"On ... wrote:" header inside the body,
// already human-readable text in whatever format that sender's own mail client wrote it in
// -- left as-is rather than reparsed, since those spans multiple senders' timezones/formats.
function formatChainTimestamp(ts: string | null): string | null {
  if (!ts) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(ts)) {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? ts : d.toLocaleString();
  }
  return ts;
}

function senderBadge(sender: EmailChainEntry['sender']): { label: string; className: string } {
  if (sender === 'cloudfuze') return { label: 'CloudFuze', className: 'bg-indigo-100 text-indigo-700' };
  if (sender === 'customer') return { label: 'Customer', className: 'bg-amber-100 text-amber-700' };
  return { label: 'Unknown sender', className: 'bg-gray-200 text-gray-600' };
}

function ChainEntryBlock({ entry }: { entry: EmailChainEntry }) {
  const badge = senderBadge(entry.sender);
  const timestamp = formatChainTimestamp(entry.timestamp);
  return (
    <div className={`rounded px-3 py-2 border-l-2 ${entry.sender === 'cloudfuze' ? 'bg-indigo-50/60 border-indigo-300' : 'bg-gray-50 border-gray-300'}`}>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${badge.className}`}>
          {badge.label}
        </span>
        {entry.name && <span className="text-xs font-medium text-gray-700">{entry.name}</span>}
        {entry.email && <span className="text-[11px] text-gray-400">{entry.email}</span>}
        {timestamp && <span className="text-[11px] text-gray-400 ml-auto whitespace-nowrap">{timestamp}</span>}
      </div>
      <p className="text-xs text-gray-700 whitespace-pre-wrap">{entry.body || '(empty message body)'}</p>
    </div>
  );
}

// One expandable row -- the customer message text is never stored, so it's fetched live
// from Microsoft Graph only when this row is actually opened, and cached here afterward
// so re-toggling the same row doesn't re-fetch.
function AlertRowItem({ row }: { row: AlertRow }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<MessageResult | null>(null);
  const fetchMessage = useSlaBreachAlertMessage();

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !result) {
      fetchMessage.mutate(row.id, {
        onSuccess: (res) => setResult(res.data),
        onError: () => setResult({ found: false, error: 'Request failed — try again.' }),
      });
    }
  };

  const namesList = (row.recipients ?? []).map((r) => r.name).join(', ') || row.user_name || row.user_email;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition"
      >
        <ChevronDown size={15} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800 truncate">{row.subject || '(no subject)'}</span>
            {row.resolved_at ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 ring-1 ring-green-200 rounded-full px-2 py-0.5">
                <CheckCircle2 size={11} /> Resolved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 ring-1 ring-red-200 rounded-full px-2 py-0.5">
                <Siren size={11} /> Open
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {row.customer_email || 'unknown customer'} · responsible: {namesList} · {overdueLabel(row.overdue_minutes)} overdue
          </p>
        </div>
        <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">
          {new Date(row.alerted_at).toLocaleString()}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 pl-11">
          {fetchMessage.isPending ? (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 size={13} className="animate-spin" /> Fetching the original message from Microsoft Graph…
            </div>
          ) : result?.found ? (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">
                {(result.chain?.length ?? 0) > 1 ? 'Message history (newest first):' : 'What the customer sent:'}
              </p>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {result.chain && result.chain.length > 0 ? (
                  result.chain.map((entry, i) => <ChainEntryBlock key={i} entry={entry} />)
                ) : (
                  <blockquote className="text-xs text-gray-700 bg-gray-50 border-l-2 border-gray-300 rounded px-3 py-2 whitespace-pre-wrap">
                    {result.text || '(empty message body)'}
                  </blockquote>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Recovered from {result.mailboxUsed} · received {result.receivedAt ? new Date(result.receivedAt).toLocaleString() : '—'}
              </p>
            </div>
          ) : (
            <p className="text-xs text-red-500">{result?.error || 'Could not recover this message.'}</p>
          )}
        </div>
      )}
    </div>
  );
}

// One responsible person's section -- collapsed by default, fetches its own paginated,
// searchable alert list (filtered server-side to just this person's recipient email) only
// once expanded.
function PersonSection({
  person, expanded, onToggle, startDate, endDate,
}: {
  person: Person;
  expanded: boolean;
  onToggle: () => void;
  startDate?: string;
  endDate?: string;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const limit = 20;

  const { data, isLoading, isFetching } = useSlaBreachAlerts(page, limit, search, person.email, expanded, startDate, endDate);
  const rows: AlertRow[] = expanded ? (data?.data ?? []) : [];
  const total: number = data?.total ?? person.total;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <Card padding="none" className="overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ChevronDown size={15} className={`text-gray-400 flex-shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`} />
          <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
            <User size={15} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{person.name}</p>
            <p className="text-[11px] text-gray-400 truncate">{person.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {person.open > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 ring-1 ring-red-200 rounded-full px-2 py-0.5">
              <Siren size={11} /> {person.open} open
            </span>
          )}
          <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">{person.total}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          <div className="p-3 border-b border-gray-100">
            <div className="relative max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search customer or subject…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No alerts found.</p>
          ) : (
            <div>{rows.map((row) => <AlertRowItem key={row.id} row={row} />)}</div>
          )}

          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
            <span>{total.toLocaleString()} total{isFetching ? ' · refreshing…' : ''}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronLeft size={14} />
              </button>
              <span>Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

type DatePreset = 'all' | 'this-month' | 'last-month' | 'last-7-days' | 'custom';

export default function SlaBreachAlertsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [personSearch, setPersonSearch] = useState('');
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [preset, setPreset] = useState<DatePreset>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const applyPreset = (p: DatePreset) => {
    setPreset(p);
    setExpandedEmail(null); // collapse -- a stale expanded section would otherwise keep showing the old range's page state
    const today = new Date();
    if (p === 'all') { setStartDate(''); setEndDate(''); }
    else if (p === 'this-month') { setStartDate(format(startOfMonth(today), 'yyyy-MM-dd')); setEndDate(format(today, 'yyyy-MM-dd')); }
    else if (p === 'last-month') {
      const lastMonth = subMonths(today, 1);
      setStartDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
    } else if (p === 'last-7-days') { setStartDate(format(subDays(today, 6), 'yyyy-MM-dd')); setEndDate(format(today, 'yyyy-MM-dd')); }
  };

  const { data: peopleData, isLoading: peopleLoading } = useSlaBreachAlertPeople(startDate || undefined, endDate || undefined);
  const people: Person[] = peopleData?.data ?? [];
  const filteredPeople = people.filter((p) =>
    p.name.toLowerCase().includes(personSearch.toLowerCase()) || p.email.toLowerCase().includes(personSearch.toLowerCase())
  );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
      </div>
    );
  }

  if (user?.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-lg font-semibold text-gray-700">Access Denied</p>
        <p className="text-sm text-gray-400">This page is only accessible to administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <nav className="text-xs text-gray-500 mb-1 flex items-center gap-1">
          <Link href="/" className="hover:text-primary-600">Dashboard</Link>
          <span>/</span>
          <span className="text-gray-700">SLA Breach Alerts</span>
        </nav>
        <h1 className="text-2xl font-bold text-gray-900">SLA Breach Alerts</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Segregated by the responsible person on each alert. Expand a name, then a row, to fetch what the customer actually sent, straight from Microsoft Graph — this isn't stored, so it's recovered live and only when you ask.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative max-w-sm flex-shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={personSearch}
            onChange={(e) => setPersonSearch(e.target.value)}
            placeholder="Find a person…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            ['all', 'All time'], ['this-month', 'This month'], ['last-month', 'Last month'], ['last-7-days', 'Last 7 days'],
          ] as [DatePreset, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border whitespace-nowrap ${
                preset === key ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPreset('custom'); setExpandedEmail(null); }}
            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPreset('custom'); setExpandedEmail(null); }}
            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {(startDate || endDate) && (
            <button
              onClick={() => applyPreset('all')}
              title="Clear date range"
              className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {peopleLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </div>
      ) : filteredPeople.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-16">No one found.</p>
      ) : (
        <div className="space-y-2">
          {filteredPeople.map((person) => (
            <PersonSection
              key={`${person.email}:${startDate}:${endDate}`}
              person={person}
              expanded={expandedEmail === person.email}
              onToggle={() => setExpandedEmail((cur) => (cur === person.email ? null : person.email))}
              startDate={startDate || undefined}
              endDate={endDate || undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
