'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useCustomerSuccess, useUpdateCustomerSuccess } from '@/hooks/useProjects';
import type {
  CustomerSuccessEntry, CfProductSignal, CfSignalLevel,
  SignalItem, RenewalDueItem, CustomerSuccessPageData,
} from '@/types';
import {
  HeartHandshake, Loader2, AlertTriangle, User, X, Search,
  Smile, Meh, Frown, TrendingUp, RefreshCw, ArrowUpRight,
  ChevronDown, ChevronUp, Edit3, Save, Calendar, Zap,
} from 'lucide-react';

// ── Signal level config ────────────────────────────────────────────────────
const SIGNAL_CFG: Record<CfSignalLevel, { badge: string; label: string }> = {
  active:   { badge: 'bg-green-100 text-green-700 border-green-200',  label: 'Active'    },
  strong:   { badge: 'bg-blue-100 text-blue-700 border-blue-200',     label: 'Strong'    },
  moderate: { badge: 'bg-amber-100 text-amber-700 border-amber-200',  label: 'Moderate'  },
  none:     { badge: 'bg-gray-100 text-gray-400 border-gray-200',     label: 'No signal' },
};

// ── CSAT helpers ───────────────────────────────────────────────────────────
function csatMood(score: number | null): { icon: ReactNode; color: string; label: string } {
  if (score === null) return { icon: <Meh className="w-8 h-8" />,   color: 'text-gray-400', label: 'No data' };
  if (score >= 8)     return { icon: <Smile className="w-8 h-8" />, color: 'text-green-500', label: 'Happy'   };
  if (score >= 6)     return { icon: <Meh className="w-8 h-8" />,   color: 'text-amber-500', label: 'Neutral' };
  return { icon: <Frown className="w-8 h-8" />, color: 'text-red-500', label: 'At Risk' };
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const pct   = value !== null ? Math.min(100, (value / 10) * 100) : 0;
  const color = value === null ? 'bg-gray-200' : value >= 8 ? 'bg-green-400' : value >= 6 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[11px] text-gray-500">
        <span>{label}</span>
        <span className="font-medium">{value !== null ? value.toFixed(1) : '—'}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SignalCell({ label, signal }: { label: string; signal: CfProductSignal }) {
  const cfg = SIGNAL_CFG[signal.level];
  return (
    <div className={`p-3 rounded-xl border ${cfg.badge} flex flex-col gap-1.5`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold leading-tight">{label}</span>
        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${cfg.badge} border whitespace-nowrap`}>
          {cfg.label}
        </span>
      </div>
      <p className="text-[11px] opacity-75 leading-snug">{signal.reason}</p>
    </div>
  );
}

// ── Edit form types & constants ────────────────────────────────────────────
const SIGNAL_OPTS: CfSignalLevel[] = ['none', 'moderate', 'strong', 'active'];

const PRODUCT_SIGNALS = [
  { key: 'cfMigrate', label: 'CF Migrate',            levelKey: 'cfMigrateSignal',  reasonKey: 'cfMigrateSignalReason'  },
  { key: 'cfManage',  label: 'CF Manage',             levelKey: 'cfManageSignal',   reasonKey: 'cfManageSignalReason'   },
  { key: 'cfPs',      label: 'Professional Services', levelKey: 'cfPsSignal',       reasonKey: 'cfPsSignalReason'       },
  { key: 'cfMs',      label: 'Managed Services',      levelKey: 'cfMsSignal',       reasonKey: 'cfMsSignalReason'       },
] as const;

interface EditForm {
  csatScore: string;
  csatVerbatim: string;
  csatDate: string;
  csatMigrationQuality: string;
  csatSupportExperience: string;
  csatOnboarding: string;
  cfMigrateSignal: CfSignalLevel;
  cfMigrateSignalReason: string;
  cfManageSignal: CfSignalLevel;
  cfManageSignalReason: string;
  cfPsSignal: CfSignalLevel;
  cfPsSignalReason: string;
  cfMsSignal: CfSignalLevel;
  cfMsSignalReason: string;
}

function buildEditForm(account: CustomerSuccessEntry): EditForm {
  return {
    csatScore:             account.csat.score            !== null ? String(account.csat.score)             : '',
    csatVerbatim:          account.csat.verbatim         ?? '',
    csatDate:              account.csat.date             ? account.csat.date.substring(0, 10)              : '',
    csatMigrationQuality:  account.csat.migrationQuality !== null ? String(account.csat.migrationQuality)  : '',
    csatSupportExperience: account.csat.supportExperience !== null ? String(account.csat.supportExperience) : '',
    csatOnboarding:        account.csat.onboarding       !== null ? String(account.csat.onboarding)        : '',
    cfMigrateSignal:       (account.cfMigrate.level            || 'none') as CfSignalLevel,
    cfMigrateSignalReason:  account.cfMigrate.reason            ?? '',
    cfManageSignal:        (account.cfManage.level             || 'none') as CfSignalLevel,
    cfManageSignalReason:   account.cfManage.reason             ?? '',
    cfPsSignal:            (account.professionalServices.level || 'none') as CfSignalLevel,
    cfPsSignalReason:       account.professionalServices.reason ?? '',
    cfMsSignal:            (account.managedServices.level      || 'none') as CfSignalLevel,
    cfMsSignalReason:       account.managedServices.reason      ?? '',
  };
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

// ── Account card ──────────────────────────────────────────────────────────
function AccountCard({
  account,
  canEdit,
  onEdit,
}: {
  account: CustomerSuccessEntry;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const mood = csatMood(account.csat.score);

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50 transition"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={`flex-shrink-0 ${mood.color}`}>{mood.icon}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">{account.customerName}</h3>
              {account.accountManager && (
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <User className="w-3 h-3" /> {account.accountManager}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {account.csat.score !== null && (
                <span className={`text-sm font-bold ${mood.color}`}>
                  {account.csat.score.toFixed(1)}
                </span>
              )}
              {canEdit && (
                <button
                  onClick={e => { e.stopPropagation(); onEdit(); }}
                  className="p-1 rounded hover:bg-gray-200 transition text-gray-400 hover:text-gray-700"
                  title="Edit CSAT & signals"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
              {expanded
                ? <ChevronUp className="w-4 h-4 text-gray-400" />
                : <ChevronDown className="w-4 h-4 text-gray-400" />
              }
            </div>
          </div>

          {account.workloadTypes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {account.workloadTypes.map(w => (
                <span key={w} className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded-full">
                  {w}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
            <span>{account.completedProjects} completed</span>
            {account.activeProjects > 0 && <span>· {account.activeProjects} active</span>}
          </div>

          {account.csat.verbatim && (
            <p className="mt-1.5 text-xs text-gray-500 italic line-clamp-1">
              &ldquo;{account.csat.verbatim}&rdquo;
            </p>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">CSAT</p>
            {account.csat.score !== null ? (
              <div className="space-y-2">
                {account.csat.verbatim && (
                  <blockquote className="text-sm italic text-gray-600 border-l-2 border-blue-300 pl-3 py-1">
                    &ldquo;{account.csat.verbatim}&rdquo;
                  </blockquote>
                )}
                <div className="space-y-1.5">
                  <ScoreBar label="Migration Quality"  value={account.csat.migrationQuality} />
                  <ScoreBar label="Support Experience" value={account.csat.supportExperience} />
                  <ScoreBar label="Onboarding"         value={account.csat.onboarding} />
                </div>
                {account.csat.date && (
                  <p className="text-[11px] text-gray-400">
                    Captured {new Date(account.csat.date).toLocaleDateString()}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">
                {canEdit ? 'Click the edit icon to add CSAT scores.' : 'No CSAT data recorded yet.'}
              </p>
            )}
          </div>

          {account.hasEscalations && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active Escalations</p>
              {account.escalations.map(e => (
                <div
                  key={e.projectId}
                  className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700"
                >
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium">{e.projectName}</span>
                    {e.priority && <span className="ml-1 opacity-60">· {e.priority}</span>}
                    {e.notes && <p className="opacity-75 mt-0.5">{e.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">CF Product Signals</p>
            <div className="grid grid-cols-2 gap-2">
              <SignalCell label="CF Migrate"            signal={account.cfMigrate} />
              <SignalCell label="CF Manage"             signal={account.cfManage} />
              <SignalCell label="Professional Services" signal={account.professionalServices} />
              <SignalCell label="Managed Services"      signal={account.managedServices} />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Edit modal ─────────────────────────────────────────────────────────────
function EditModal({
  account,
  onClose,
  onSave,
  saving,
}: {
  account: CustomerSuccessEntry;
  onClose: () => void;
  onSave: (f: EditForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<EditForm>(() => buildEditForm(account));

  function set(k: keyof EditForm, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col"
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 bg-indigo-600 text-white rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <HeartHandshake className="w-5 h-5" />
            <div>
              <h2 className="text-base font-bold leading-tight">Edit CS Entry</h2>
              <p className="text-xs text-indigo-200">{account.customerName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-indigo-500 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2 mb-4">
              CSAT Scores
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Overall Score (0–10)</label>
                <input
                  type="number" min="0" max="10" step="0.1"
                  value={form.csatScore}
                  onChange={e => set('csatScore', e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 8.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date Captured</label>
                <input
                  type="date"
                  value={form.csatDate}
                  onChange={e => set('csatDate', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Migration Quality (0–10)</label>
                <input
                  type="number" min="0" max="10" step="0.1"
                  value={form.csatMigrationQuality}
                  onChange={e => set('csatMigrationQuality', e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 9.0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Support Experience (0–10)</label>
                <input
                  type="number" min="0" max="10" step="0.1"
                  value={form.csatSupportExperience}
                  onChange={e => set('csatSupportExperience', e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 7.5"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Onboarding (0–10)</label>
                <input
                  type="number" min="0" max="10" step="0.1"
                  value={form.csatOnboarding}
                  onChange={e => set('csatOnboarding', e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 8.0"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Customer Quote / Verbatim</label>
                <textarea
                  value={form.csatVerbatim}
                  rows={3}
                  onChange={e => set('csatVerbatim', e.target.value)}
                  placeholder='e.g. "The migration was seamless. The team was incredibly responsive."'
                  className={`${inputCls} resize-none`}
                />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2 mb-4">
              CF Product Signal Overrides
            </p>
            <div className="space-y-4">
              {PRODUCT_SIGNALS.map(s => (
                <div key={s.key} className="grid grid-cols-3 gap-3 items-start">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{s.label}</label>
                    <select
                      value={form[s.levelKey]}
                      onChange={e => set(s.levelKey, e.target.value)}
                      className={inputCls}
                    >
                      {SIGNAL_OPTS.map(o => (
                        <option key={o} value={o}>{SIGNAL_CFG[o].label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Reason / Talking Point</label>
                    <input
                      type="text"
                      value={form[s.reasonKey]}
                      onChange={e => set(s.reasonKey, e.target.value)}
                      placeholder="Why this signal? What triggered it?"
                      className={inputCls}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Signal rows (upsell / cross-sell tables) ──────────────────────────────
function SignalTable({ signals }: { signals: SignalItem[] }) {
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Account Manager</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Signal</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Talking Point</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {signals.map((s, i) => {
            const cfg = SIGNAL_CFG[s.level];
            return (
              <tr key={i} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 font-medium text-gray-900">{s.customerName}</td>
                <td className="px-4 py-3 text-gray-600">{s.accountManager || '—'}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1.5 font-medium text-gray-800">
                    <Zap className="w-3.5 h-3.5 text-blue-500" /> {s.product}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 max-w-xs">{s.reason}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function CustomerSuccessPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'ACCOUNT_MANAGER';

  const [search, setSearch] = useState('');
  const [amFilter, setAmFilter] = useState('');
  const [signalFilter, setSignalFilter] = useState<CfSignalLevel | ''>('');
  const [editingAccount, setEditingAccount] = useState<CustomerSuccessEntry | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const { data, isLoading, error } = useCustomerSuccess();
  const updateCS = useUpdateCustomerSuccess();

  const pageData = (data?.data ?? null) as CustomerSuccessPageData | null;
  const accounts: CustomerSuccessEntry[] = pageData?.accounts ?? [];
  const renewalDue: RenewalDueItem[]     = pageData?.renewalDue ?? [];
  const upsellSignals: SignalItem[]      = pageData?.upsellSignals ?? [];
  const crossSellSignals: SignalItem[]   = pageData?.crossSellSignals ?? [];

  const allAMs           = Array.from(new Set(accounts.map(a => a.accountManager).filter(Boolean)));
  const escalatedAccounts = accounts.filter(a => a.hasEscalations);

  const filtered = accounts.filter(a => {
    if (search && !a.customerName.toLowerCase().includes(search.toLowerCase())) return false;
    if (amFilter && a.accountManager !== amFilter) return false;
    if (signalFilter) {
      const levels = [a.cfMigrate.level, a.cfManage.level, a.professionalServices.level, a.managedServices.level];
      if (!levels.includes(signalFilter)) return false;
    }
    return true;
  });

  async function handleSave(form: EditForm) {
    if (!editingAccount) return;
    try {
      await updateCS.mutateAsync({
        customerName: editingAccount.customerName,
        data: {
          csatScore:             form.csatScore             ? Number(form.csatScore)             : null,
          csatVerbatim:          form.csatVerbatim          || null,
          csatMigrationQuality:  form.csatMigrationQuality  ? Number(form.csatMigrationQuality)  : null,
          csatSupportExperience: form.csatSupportExperience ? Number(form.csatSupportExperience) : null,
          csatOnboarding:        form.csatOnboarding        ? Number(form.csatOnboarding)        : null,
          csatDate:              form.csatDate              || null,
          cfMigrateSignal:       form.cfMigrateSignal,
          cfMigrateSignalReason: form.cfMigrateSignalReason || null,
          cfManageSignal:        form.cfManageSignal,
          cfManageSignalReason:  form.cfManageSignalReason  || null,
          cfPsSignal:            form.cfPsSignal,
          cfPsSignalReason:      form.cfPsSignalReason      || null,
          cfMsSignal:            form.cfMsSignal,
          cfMsSignalReason:      form.cfMsSignalReason      || null,
        },
      });
      showToast('success', 'Customer Success entry saved');
      setEditingAccount(null);
    } catch {
      showToast('error', 'Failed to save entry');
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) return <div className="p-6 text-red-500">Failed to load customer success data</div>;

  const modal = editingAccount && mounted
    ? createPortal(
        <EditModal
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSave={handleSave}
          saving={updateCS.isPending}
        />,
        document.body
      )
    : null;

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center gap-3">
        <HeartHandshake className="w-7 h-7 text-pink-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer Success</h1>
          <p className="text-sm text-gray-500">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { icon: <HeartHandshake className="w-4 h-4" />, label: 'Total Accounts', value: accounts.length,          color: 'text-pink-600',  bg: 'bg-pink-50'  },
          { icon: <AlertTriangle   className="w-4 h-4" />, label: 'Escalations',   value: escalatedAccounts.length,  color: 'text-red-600',   bg: 'bg-red-50'   },
          { icon: <TrendingUp      className="w-4 h-4" />, label: 'Upsell Opps',  value: upsellSignals.length,      color: 'text-blue-600',  bg: 'bg-blue-50'  },
          { icon: <RefreshCw       className="w-4 h-4" />, label: 'Renewal Due',  value: renewalDue.length,         color: 'text-amber-600', bg: 'bg-amber-50' },
        ] as const).map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-3 flex items-center gap-3`}>
            <div className={s.color}>{s.icon}</div>
            <div>
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search customer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white w-48"
          />
        </div>
        <select
          value={amFilter}
          onChange={e => setAmFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="">All Account Managers</option>
          {allAMs.map(am => <option key={am} value={am}>{am}</option>)}
        </select>
        <select
          value={signalFilter}
          onChange={e => setSignalFilter(e.target.value as CfSignalLevel | '')}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="">All Signal Levels</option>
          {(Object.keys(SIGNAL_CFG) as CfSignalLevel[]).map(l => (
            <option key={l} value={l}>{SIGNAL_CFG[l].label}</option>
          ))}
        </select>
        {(search || amFilter || signalFilter) && (
          <button
            onClick={() => { setSearch(''); setAmFilter(''); setSignalFilter(''); }}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Section 1 — Account cards */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-gray-400">
          <HeartHandshake className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No accounts found</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(account => (
            <AccountCard
              key={account.customerName}
              account={account}
              canEdit={canEdit}
              onEdit={() => setEditingAccount(account)}
            />
          ))}
        </div>
      )}

      {/* Section 2 — Escalations */}
      {escalatedAccounts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" /> Active Escalations
          </h2>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Account Manager</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Count</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Projects</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {escalatedAccounts.map(a => (
                  <tr key={a.customerName} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-medium text-gray-900">{a.customerName}</td>
                    <td className="px-4 py-3 text-gray-600">{a.accountManager || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-red-600 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" /> {a.escalationCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {a.escalations.map(e => (
                          <span
                            key={e.projectId}
                            className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full border border-red-100"
                          >
                            {e.projectName}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* Section 3 — Upsell Signals */}
      {upsellSignals.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" /> Upsell Signals
            <span className="text-sm font-normal text-gray-400">— accounts ready to expand</span>
          </h2>
          <SignalTable signals={upsellSignals} />
        </div>
      )}

      {/* Section 4 — Cross-sell Signals */}
      {crossSellSignals.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ArrowUpRight className="w-5 h-5 text-emerald-500" /> Cross-sell Signals
            <span className="text-sm font-normal text-gray-400">— existing customers, new products</span>
          </h2>
          <SignalTable signals={crossSellSignals} />
        </div>
      )}

      {/* Section 5 — Renewal Due */}
      {renewalDue.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-amber-500" /> Renewal Due
            <span className="text-sm font-normal text-gray-400">— active projects past planned end date</span>
          </h2>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Project</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Account Manager</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">PM</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Planned End</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Overdue</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Phase</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {renewalDue.map((r: RenewalDueItem) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-medium text-gray-900 capitalize">{r.name}</td>
                    <td className="px-4 py-3 text-gray-700">{r.customerName}</td>
                    <td className="px-4 py-3 text-gray-600">{r.accountManager || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.projectManager || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(r.plannedEnd).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${r.daysOverdue > 30 ? 'text-red-600' : r.daysOverdue > 7 ? 'text-amber-600' : 'text-gray-700'}`}>
                        {r.daysOverdue}d
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full">
                        {r.phase}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                        {r.planType}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {modal}
    </div>
  );
}
