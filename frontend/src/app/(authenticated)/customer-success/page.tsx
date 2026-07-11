'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useCustomerSuccess, useUpdateCustomerSuccess, useHubspotSignals } from '@/hooks/useProjects';
import type {
  CustomerSuccessEntry, CfProductSignal, CfSignalLevel,
  SignalItem, RenewalDueItem, CustomerSuccessPageData,
  HubspotCustomerDeals, HubspotDeal, HubspotDealCategory, HubspotSignalsData,
} from '@/types';
import {
  HeartHandshake, Loader2, AlertTriangle, User, X, Search,
  Smile, Meh, Frown, TrendingUp, RefreshCw,
  ChevronDown, ChevronUp, Edit3, Save, Calendar, Zap, FlaskConical, FolderKanban,
  SlidersHorizontal,
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

const INTEREST_BAR_CFG: Record<CfSignalLevel, { width: string; bg: string }> = {
  active:   { width: '100%', bg: 'bg-emerald-400' },
  strong:   { width: '72%',  bg: 'bg-blue-400'    },
  moderate: { width: '44%',  bg: 'bg-amber-400'   },
  none:     { width: '8%',   bg: 'bg-gray-200'    },
};

const SIGNAL_SORT_ORDER: Record<CfSignalLevel, number> = { active: 0, strong: 1, moderate: 2, none: 3 };

function ProductInterestRow({ label, signal }: { label: string; signal: CfProductSignal }) {
  const cfg = SIGNAL_CFG[signal.level];
  const bar = INTEREST_BAR_CFG[signal.level];
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-700 shrink-0" style={{ width: '140px' }}>{label}</span>
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${bar.bg}`} style={{ width: bar.width }} />
        </div>
        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border whitespace-nowrap ml-1 ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>
      {signal.reason && signal.level !== 'none' && (
        <p className="text-[11px] text-gray-500 leading-snug" style={{ paddingLeft: '148px' }}>{signal.reason}</p>
      )}
    </div>
  );
}

const CATEGORY_ORDER: HubspotDealCategory[] = ['upsell', 'cross_sell', 'renewal', 'new_business', 'other'];
const CATEGORY_LABELS: Record<HubspotDealCategory, string> = {
  upsell:       'Upsell',
  cross_sell:   'Cross-sell',
  renewal:      'Renewal',
  new_business: 'New Business',
  other:        'Other',
};

function GrowthCard({
  account, hubspot, canEdit, onEdit,
}: {
  account: CustomerSuccessEntry;
  hubspot?: HubspotCustomerDeals | null;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const openDeals = hubspot?.deals.filter((d: HubspotDeal) => d.isOpen) ?? [];
  const wonDeals  = hubspot?.deals.filter((d: HubspotDeal) => d.isClosedWon) ?? [];
  const hasHubspot = openDeals.length > 0 || wonDeals.length > 0;

  // Group open deals by category
  const grouped: Partial<Record<HubspotDealCategory, HubspotDeal[]>> = {};
  for (const d of openDeals) {
    if (!grouped[d.category]) grouped[d.category] = [];
    grouped[d.category]!.push(d);
  }

  // PMO signals (non-none, sorted by strength)
  const pmoSignals = [
    { label: 'CF Migrate',            signal: account.cfMigrate            },
    { label: 'Professional Services', signal: account.professionalServices  },
    { label: 'CF Manage',             signal: account.cfManage              },
    { label: 'Managed Services',      signal: account.managedServices       },
  ]
    .filter(p => p.signal.level !== 'none')
    .sort((a, b) => SIGNAL_SORT_ORDER[a.signal.level] - SIGNAL_SORT_ORDER[b.signal.level]);

  return (
    <Card className="overflow-hidden">
      <div className="p-4 space-y-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-gray-900 capitalize">{account.customerName}</p>
            {account.accountManager && (
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <User className="w-3 h-3" /> {account.accountManager}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasHubspot ? (
              <div className="text-right">
                {(hubspot?.openValue ?? 0) > 0 && (
                  <p className="text-sm font-bold text-blue-600">{currencyFmt.format(hubspot!.openValue)}</p>
                )}
                <p className="text-[10px] text-gray-400">{openDeals.length} open deal{openDeals.length !== 1 ? 's' : ''}</p>
              </div>
            ) : (
              pmoSignals.length > 0 && (
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${SIGNAL_CFG[pmoSignals[0].signal.level].badge}`}>
                  {pmoSignals[0].label}
                </span>
              )
            )}
            {canEdit && (
              <button
                onClick={onEdit}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400 hover:text-gray-700"
                title="Edit signals"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* PRIMARY: HubSpot live pipeline (if data exists) */}
        {hasHubspot ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Live Pipeline</p>
              <div className="flex gap-2 text-[11px] font-medium">
                {(hubspot?.openValue ?? 0) > 0 && <span className="text-blue-600">{currencyFmt.format(hubspot!.openValue)} open</span>}
                {(hubspot?.wonValue  ?? 0) > 0 && <span className="text-emerald-600">{currencyFmt.format(hubspot!.wonValue)} won</span>}
              </div>
            </div>

            {CATEGORY_ORDER.map(cat => {
              const deals = grouped[cat];
              if (!deals?.length) return null;
              const catValue = deals.reduce((s, d) => s + (d.amount ?? 0), 0);
              const cfg = DEAL_CATEGORY_CFG[cat];
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                      {CATEGORY_LABELS[cat]} · {deals.length}
                    </span>
                    {catValue > 0 && <span className="text-[11px] font-semibold text-gray-600">{currencyFmt.format(catValue)}</span>}
                  </div>
                  <div className="space-y-1">
                    {deals.map(d => (
                      <div key={d.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-800 truncate">{d.name}</p>
                          <p className="text-[11px] text-gray-400">
                            {d.stage}
                            {d.closeDate ? ` · ${new Date(d.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                          </p>
                        </div>
                        {d.amount !== null && (
                          <span className="text-xs font-semibold text-gray-700 shrink-0">{currencyFmt.format(d.amount)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {wonDeals.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                <p className="text-[10px] font-bold text-emerald-700 uppercase mb-1">
                  Closed Won{(hubspot?.wonValue ?? 0) > 0 ? ` · ${currencyFmt.format(hubspot!.wonValue)}` : ''}
                </p>
                {wonDeals.slice(0, 2).map(d => (
                  <p key={d.id} className="text-xs text-emerald-800 truncate">{d.name}</p>
                ))}
                {wonDeals.length > 2 && <p className="text-[11px] text-emerald-600">+{wonDeals.length - 2} more</p>}
              </div>
            )}
          </div>
        ) : (
          /* FALLBACK: PMO signals when no HubSpot match */
          pmoSignals.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">PMO Signals · No HubSpot match</p>
              {pmoSignals.map(p => (
                <ProductInterestRow key={p.label} label={p.label} signal={p.signal} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic text-center py-2">No active pipeline or signals</p>
          )
        )}

        {/* CONTEXT: PMO signals below HubSpot data */}
        {hasHubspot && pmoSignals.length > 0 && (
          <div className="pt-2 border-t border-gray-100 space-y-1.5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">PMO Product Signals</p>
            {pmoSignals.map(p => (
              <ProductInterestRow key={p.label} label={p.label} signal={p.signal} />
            ))}
          </div>
        )}

      </div>
    </Card>
  );
}

// ── HubSpot deal helpers ───────────────────────────────────────────────────
const DEAL_CATEGORY_CFG: Record<HubspotDealCategory, { badge: string; label: string }> = {
  upsell:       { badge: 'bg-blue-100 text-blue-700 border-blue-200',       label: 'Upsell'     },
  cross_sell:   { badge: 'bg-purple-100 text-purple-700 border-purple-200', label: 'Cross-sell' },
  renewal:      { badge: 'bg-amber-100 text-amber-700 border-amber-200',    label: 'Renewal'    },
  new_business: { badge: 'bg-green-100 text-green-700 border-green-200',    label: 'New'        },
  other:        { badge: 'bg-gray-100 text-gray-600 border-gray-200',       label: 'Deal'       },
};

const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function normalizeCustomerKey(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function HubspotDealsPanel({ hubspot }: { hubspot: HubspotCustomerDeals }) {
  const openDeals = hubspot.deals.filter(d => d.isOpen);
  const wonDeals  = hubspot.deals.filter(d => d.isClosedWon);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">HubSpot Pipeline</p>
        <div className="flex items-center gap-3 text-[11px] font-medium">
          {hubspot.openValue > 0 && <span className="text-blue-600">{currencyFmt.format(hubspot.openValue)} open</span>}
          {hubspot.wonValue  > 0 && <span className="text-emerald-600">{currencyFmt.format(hubspot.wonValue)} won</span>}
        </div>
      </div>
      {openDeals.length > 0 && (
        <div className="space-y-1.5">
          {openDeals.map(d => {
            const cfg = DEAL_CATEGORY_CFG[d.category];
            return (
              <div key={d.id} className="flex items-start justify-between gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{d.name}</p>
                  <p className="text-[11px] text-gray-400">
                    {d.stage}{d.closeDate ? ` · closes ${new Date(d.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${cfg.badge}`}>{cfg.label}</span>
                  {d.amount !== null && <span className="text-xs font-semibold text-gray-700">{currencyFmt.format(d.amount)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {wonDeals.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Closed Won</p>
          {wonDeals.map(d => (
            <div key={d.id} className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5">
              <p className="text-xs text-emerald-800 truncate flex-1">{d.name}</p>
              {d.amount !== null && <span className="text-xs font-semibold text-emerald-700 shrink-0">{currencyFmt.format(d.amount)}</span>}
            </div>
          ))}
        </div>
      )}
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
  projectNames,
  canEdit,
  onEdit,
  hubspot,
}: {
  account: CustomerSuccessEntry;
  projectNames: string[];
  canEdit: boolean;
  onEdit: () => void;
  hubspot?: HubspotCustomerDeals | null;
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
            {/* Left: project name(s) */}
            <div className="min-w-0 flex-1">
              {projectNames.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  {projectNames.map(name => (
                    <span key={name} className="font-semibold text-gray-900 capitalize text-sm">{name}</span>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-gray-400 italic">No projects</span>
              )}
              {account.accountManager && (
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <User className="w-3 h-3" /> {account.accountManager}
                </p>
              )}
            </div>
            {/* Right: customer name + actions */}
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full capitalize">
                  {account.customerName}
                </span>
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
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Product Interest</p>
            <div className="space-y-2">
              {[
                { label: 'CF Migrate',            signal: account.cfMigrate            },
                { label: 'Professional Services', signal: account.professionalServices  },
                { label: 'CF Manage',             signal: account.cfManage              },
                { label: 'Managed Services',      signal: account.managedServices       },
              ]
                .sort((a, b) => SIGNAL_SORT_ORDER[a.signal.level] - SIGNAL_SORT_ORDER[b.signal.level])
                .map(p => <ProductInterestRow key={p.label} label={p.label} signal={p.signal} />)}
            </div>
          </div>

          {hubspot && hubspot.deals.length > 0 && <HubspotDealsPanel hubspot={hubspot} />}
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

// ── Read-only signal table (cross-sell) ───────────────────────────────────
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


// ── Filter dropdown (matches All Projects style) ───────────────────────────
function FilterDropdown({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`appearance-none w-full px-3 py-2 pr-8 text-sm font-medium rounded-lg border bg-white text-gray-900 hover:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all cursor-pointer ${value ? 'border-primary-300 bg-primary-50' : 'border-gray-200'}`}
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        {value && (
          <button
            onClick={e => { e.stopPropagation(); onChange(''); }}
            className="absolute right-7 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function CustomerSuccessPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'ACCOUNT_MANAGER';

  const [activeTab, setActiveTab] = useState<'migration' | 'poc' | 'escalations' | 'growth' | 'renewal'>('migration');
  const [search, setSearch] = useState('');
  const [amFilter, setAmFilter] = useState('');
  const [signalFilter, setSignalFilter] = useState<CfSignalLevel | ''>('');
  const [editingAccount, setEditingAccount] = useState<CustomerSuccessEntry | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const { data, isLoading, error } = useCustomerSuccess();
  const updateCS = useUpdateCustomerSuccess();

  const { data: hubspotResponse } = useHubspotSignals();
  const hubspotData = (hubspotResponse?.data ?? null) as HubspotSignalsData | null;

  function hubspotFor(customerName: string): HubspotCustomerDeals | null {
    if (!hubspotData?.configured) return null;
    const customers = hubspotData.customers;
    const pmoKey = normalizeCustomerKey(customerName);
    if (!pmoKey) return null;

    // Tier 1: exact normalized match
    if (customers[pmoKey]) return customers[pmoKey];

    // Tier 2: substring — PMO key inside HubSpot key, or HubSpot key inside PMO key (min 4 chars)
    if (pmoKey.length >= 4) {
      for (const [hsKey, data] of Object.entries(customers)) {
        if (hsKey.includes(pmoKey) || (hsKey.length >= 4 && pmoKey.includes(hsKey))) {
          return data;
        }
      }
    }

    // Tier 3: word-level — split on whitespace/punctuation, match significant words (≥4 chars)
    const pmoWords = customerName.toLowerCase().split(/[\s\-_.,&/()]+/).filter(w => w.length >= 4);
    if (pmoWords.length > 0) {
      for (const data of Object.values(customers)) {
        const hsWords = data.companyName.toLowerCase().split(/[\s\-_.,&/()]+/).filter((w: string) => w.length >= 4);
        if (pmoWords.some(pw => hsWords.some((hw: string) => hw === pw))) {
          return data;
        }
      }
    }

    return null;
  }

  function getProjectNames(account: CustomerSuccessEntry): string[] {
    if (activeTab === 'poc') return account.pocProjectNames ?? [];
    return account.migrationProjectNames ?? account.projectNames ?? [];
  }

  function customerHasType(account: CustomerSuccessEntry, type: 'migration' | 'poc'): boolean {
    if (type === 'poc') return account.hasPocProjects ?? false;
    return account.hasMigrationProjects ?? true;
  }

  const pageData = (data?.data ?? null) as CustomerSuccessPageData | null;
  const totalProjects: number = (data as any)?.meta?.totalProjects ?? 0;
  const accounts: CustomerSuccessEntry[] = pageData?.accounts ?? [];
  const renewalDue: RenewalDueItem[]     = pageData?.renewalDue ?? [];
  const upsellSignals: SignalItem[]      = pageData?.upsellSignals ?? [];

  // Effective project tab type ('escalations'/'growth'/'renewal' tabs behave like 'migration' for filtering)
  const effectiveTab = activeTab === 'poc' ? 'poc' : 'migration';

  function applyTabFilter(account: CustomerSuccessEntry, tab: 'migration' | 'poc'): CustomerSuccessEntry {
    const tabEscalations = account.escalations.filter(e =>
      tab === 'poc' ? e.projectType === 'POC' : e.projectType !== 'POC'
    );
    return {
      ...account,
      activeProjects:    tab === 'poc' ? (account.pocActiveCount    ?? 0) : (account.migrationActiveCount    ?? account.activeProjects),
      completedProjects: tab === 'poc' ? (account.pocCompletedCount ?? 0) : (account.migrationCompletedCount ?? account.completedProjects),
      escalations:       tabEscalations,
      hasEscalations:    tabEscalations.length > 0,
      escalationCount:   tabEscalations.length,
    };
  }

  const allAMs = Array.from(new Set(accounts.map(a => a.accountManager).filter(Boolean)));
  const activeFilterCount = [search, amFilter, signalFilter].filter(Boolean).length;

  function clearAllFilters() {
    setSearch(''); setAmFilter(''); setSignalFilter('');
  }

  const filtered = accounts
    .filter(a => {
      if (!customerHasType(a, effectiveTab)) return false;
      if (search && !a.customerName.toLowerCase().includes(search.toLowerCase())) return false;
      if (amFilter && a.accountManager !== amFilter) return false;
      if (signalFilter) {
        const levels = [a.cfMigrate.level, a.cfManage.level, a.professionalServices.level, a.managedServices.level];
        if (!levels.includes(signalFilter)) return false;
      }
      return true;
    })
    .map(a => applyTabFilter(a, effectiveTab));

  // Standalone tab data (not filtered by search/AM)
  const allEscalatedAccounts = accounts.filter(a => a.hasEscalations);

  const growthAccounts = accounts
    .filter(a => customerHasType(a, 'migration'))
    .filter(a => {
      const hs = hubspotFor(a.customerName);
      const hasHubspot = (hs?.deals.length ?? 0) > 0;
      const hasPmoSignals = a.cfMigrate.level !== 'none' || a.professionalServices.level !== 'none' || a.cfManage.level !== 'none' || a.managedServices.level !== 'none';
      return hasHubspot || hasPmoSignals;
    })
    .sort((a, b) => (hubspotFor(b.customerName)?.openValue ?? 0) - (hubspotFor(a.customerName)?.openValue ?? 0));

  const migrationCount = accounts.filter(a => customerHasType(a, 'migration')).length;
  const pocCount       = accounts.filter(a => customerHasType(a, 'poc')).length;

  // POC-specific upsell signals: conversion opportunities derived from POC outcomes
  const pocUpsellSignals: SignalItem[] = (() => {
    const signals: SignalItem[] = [];
    for (const account of accounts) {
      const pocProjects = account.pocProjectDetails ?? [];
      if (pocProjects.length === 0) continue;

      const won        = pocProjects.filter(p => p.pocOutcome === 'won');
      const extended   = pocProjects.filter(p => p.pocOutcome === 'extended' || p.pocOutcome === 'on_hold');
      const inProgress = pocProjects.filter(p => !p.pocOutcome);

      if (won.length > 0) {
        signals.push({ customerName: account.customerName, accountManager: account.accountManager,
          product: 'CF Migrate', level: 'active',
          reason: `${won.length} POC won — ready to convert to full migration` });
      } else if (extended.length > 0) {
        signals.push({ customerName: account.customerName, accountManager: account.accountManager,
          product: 'CF Migrate', level: 'moderate',
          reason: `POC ${extended[0].pocOutcome === 'extended' ? 'extended' : 'on hold'} — re-engage to close` });
      } else if (inProgress.length > 0) {
        signals.push({ customerName: account.customerName, accountManager: account.accountManager,
          product: 'CF Migrate', level: 'moderate',
          reason: `${inProgress.length} POC in progress — nurture toward conversion` });
      }
    }

    return signals.sort((a, b) => {
      const order: Record<CfSignalLevel, number> = { active: 0, strong: 1, moderate: 2, none: 3 };
      return order[a.level] - order[b.level];
    });
  })();

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
          <p className="text-sm text-gray-500">
            {accounts.length} customer account{accounts.length !== 1 ? 's' : ''}
            {totalProjects > 0 && (
              <span className="ml-2 text-pink-600 font-medium">· {totalProjects} total project{totalProjects !== 1 ? 's' : ''}</span>
            )}
          </p>
        </div>
      </div>

      {hubspotData && !hubspotData.configured && (
        <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700">
          <Zap className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            <strong>HubSpot not connected</strong> — add <code className="font-mono">HUBSPOT_ACCESS_TOKEN</code> to
            backend/.env, then restart the backend server to show live upsell &amp; cross-sell deals.
          </span>
        </div>
      )}
      {hubspotData && hubspotData.configured && hubspotData.error && (
        <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-800">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            <strong>HubSpot connected but data fetch failed</strong> — {hubspotData.error}
          </span>
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {([
          { icon: <HeartHandshake className="w-4 h-4" />, label: 'Customer Accounts', value: accounts.length,              color: 'text-pink-600',   bg: 'bg-pink-50',   tab: null             },
          { icon: <FolderKanban   className="w-4 h-4" />, label: 'Total Projects',    value: totalProjects,                color: 'text-indigo-600', bg: 'bg-indigo-50', tab: null             },
          { icon: <AlertTriangle  className="w-4 h-4" />, label: 'Escalations',       value: allEscalatedAccounts.length,  color: 'text-red-600',    bg: 'bg-red-50',    tab: 'escalations'    },
          { icon: <TrendingUp     className="w-4 h-4" />, label: 'Growth Opps',       value: growthAccounts.length,        color: 'text-blue-600',   bg: 'bg-blue-50',   tab: 'growth'         },
          { icon: <RefreshCw      className="w-4 h-4" />, label: 'Renewal Due',       value: renewalDue.length,            color: 'text-amber-600',  bg: 'bg-amber-50',  tab: 'renewal'        },
        ] as const).map(s => (
          <div key={s.label}
            onClick={() => s.tab && setActiveTab(s.tab)}
            className={`${s.bg} rounded-xl p-3 flex items-center gap-3 ${s.tab ? 'cursor-pointer hover:brightness-95 transition' : ''}`}
          >
            <div className={s.color}>{s.icon}</div>
            <div>
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {([
          { key: 'migration',  label: 'Projects',             icon: <FolderKanban  className="w-4 h-4" />, count: migrationCount             },
          { key: 'poc',        label: 'POC Projects',         icon: <FlaskConical   className="w-4 h-4" />, count: pocCount                   },
          { key: 'escalations',label: 'Active Escalations',   icon: <AlertTriangle  className="w-4 h-4" />, count: allEscalatedAccounts.length },
          { key: 'growth',     label: 'Growth Opportunities', icon: <TrendingUp     className="w-4 h-4" />, count: growthAccounts.length       },
          { key: 'renewal',    label: 'Renewal Due',          icon: <RefreshCw      className="w-4 h-4" />, count: renewalDue.length           },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSearch(''); setAmFilter(''); setSignalFilter(''); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.icon}
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Projects / POC Projects tab ─────────────────────────────────── */}
      {(activeTab === 'migration' || activeTab === 'poc') && (
        <>
          {/* Filters */}
          <Card padding="sm" className="bg-white">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 text-gray-700 hover:text-primary-600 transition-colors"
              >
                <SlidersHorizontal size={18} />
                <span className="font-medium">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-primary-100 text-primary-700 rounded-full">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 transition-colors"
                >
                  <X size={14} />
                  Clear all
                </button>
              )}
            </div>
            {showFilters && (
              <div className="space-y-4">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by customer name..."
                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <FilterDropdown
                    label="Account Manager"
                    value={amFilter}
                    options={[
                      { value: '', label: 'All Account Managers' },
                      ...allAMs.map(am => ({ value: am, label: am })),
                    ]}
                    onChange={setAmFilter}
                  />
                  <FilterDropdown
                    label="Signal Level"
                    value={signalFilter}
                    options={[
                      { value: '', label: 'All Signal Levels' },
                      ...(Object.keys(SIGNAL_CFG) as CfSignalLevel[]).map(l => ({ value: l, label: SIGNAL_CFG[l].label })),
                    ]}
                    onChange={v => setSignalFilter(v as CfSignalLevel | '')}
                  />
                </div>
                {activeFilterCount > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200">
                    <span className="text-xs text-gray-500">Active filters:</span>
                    {search && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
                        Search: {search}
                        <button onClick={() => setSearch('')} className="hover:text-gray-900"><X size={12} /></button>
                      </span>
                    )}
                    {amFilter && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-teal-100 text-teal-700 rounded-full">
                        AM: {amFilter}
                        <button onClick={() => setAmFilter('')} className="hover:text-teal-900"><X size={12} /></button>
                      </span>
                    )}
                    {signalFilter && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                        Signal: {SIGNAL_CFG[signalFilter as CfSignalLevel]?.label}
                        <button onClick={() => setSignalFilter('')} className="hover:text-blue-900"><X size={12} /></button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Accounts table */}
          {filtered.length === 0 ? (
            <Card className="p-12 text-center text-gray-400">
              <HeartHandshake className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No accounts found</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Account Manager</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Projects</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Workloads</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Active</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Completed</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">CSAT</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Top Signal</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(account => {
                    const projectNames = getProjectNames(account);
                    const signals = [
                      { label: 'CF Migrate', signal: account.cfMigrate },
                      { label: 'CF Manage',  signal: account.cfManage  },
                      { label: 'PS',         signal: account.professionalServices },
                      { label: 'MS',         signal: account.managedServices },
                    ].sort((a, b) => SIGNAL_SORT_ORDER[a.signal.level] - SIGNAL_SORT_ORDER[b.signal.level]);
                    const topSignal = signals[0];
                    const csatScore = account.csat.score;
                    const csatColor = csatScore === null ? 'text-gray-400' : csatScore >= 8 ? 'text-green-600' : csatScore >= 6 ? 'text-amber-600' : 'text-red-600';
                    return (
                      <tr key={account.customerName} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 font-semibold text-gray-900 capitalize">{account.customerName}</td>
                        <td className="px-4 py-3 text-gray-600">{account.accountManager || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            {projectNames.length > 0
                              ? projectNames.map(n => <span key={n} className="text-sm text-gray-800 capitalize">{n}</span>)
                              : <span className="text-sm text-gray-400 italic">No projects</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {account.workloadTypes.map(w => (
                              <span key={w} className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded-full">{w}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-700">{account.activeProjects}</td>
                        <td className="px-4 py-3 text-gray-600">{account.completedProjects}</td>
                        <td className="px-4 py-3">
                          {csatScore !== null
                            ? <span className={`text-sm font-bold ${csatColor}`}>{csatScore.toFixed(1)}</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {topSignal.signal.level !== 'none' && (
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${SIGNAL_CFG[topSignal.signal.level].badge}`}>
                              {topSignal.label} · {SIGNAL_CFG[topSignal.signal.level].label}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {canEdit && (
                            <button
                              onClick={() => setEditingAccount(account)}
                              className="p-1 rounded hover:bg-gray-200 transition text-gray-400 hover:text-gray-700"
                              title="Edit CSAT & signals"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          {/* POC conversion opportunities (within POC tab) */}
          {activeTab === 'poc' && pocUpsellSignals.length > 0 && (
            <div className="space-y-3 mt-2">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" /> Conversion Opportunities
                <span className="text-sm font-normal text-gray-400">— POC outcomes ready to progress</span>
              </h2>
              <SignalTable signals={pocUpsellSignals} />
            </div>
          )}
        </>
      )}

      {/* ── Active Escalations tab ───────────────────────────────────────── */}
      {activeTab === 'escalations' && (
        allEscalatedAccounts.length === 0 ? (
          <Card className="p-12 text-center text-gray-400">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">No active escalations</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Account Manager</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Count</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Projects</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allEscalatedAccounts.map(a => (
                  <tr key={a.customerName} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-semibold text-gray-900 capitalize">{a.customerName}</td>
                    <td className="px-4 py-3 text-gray-600">{a.accountManager || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-red-600 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" /> {a.escalationCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {a.escalations.map(e => (
                          <span key={e.projectId} className="text-sm text-gray-800 capitalize">{e.projectName}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {a.escalations.map(e => (
                          e.priority
                            ? <span key={e.projectId} className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full border border-red-100 w-fit">{e.priority}</span>
                            : null
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {/* ── Growth Opportunities tab ─────────────────────────────────────── */}
      {activeTab === 'growth' && (
        growthAccounts.length === 0 ? (
          <Card className="p-12 text-center text-gray-400">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">No growth opportunities found</p>
          </Card>
        ) : (
          <>
            {hubspotData?.configured && (
              <div className="flex justify-end">
                <span className="text-[11px] text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  HubSpot live
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {growthAccounts.map(account => (
                <GrowthCard
                  key={account.customerName}
                  account={account}
                  hubspot={hubspotFor(account.customerName)}
                  canEdit={canEdit}
                  onEdit={() => setEditingAccount(account)}
                />
              ))}
            </div>
          </>
        )
      )}

      {/* ── Renewal Due tab ──────────────────────────────────────────────── */}
      {activeTab === 'renewal' && (
        renewalDue.length === 0 ? (
          <Card className="p-12 text-center text-gray-400">
            <RefreshCw className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">No renewal items due</p>
          </Card>
        ) : (
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
              <tbody className="divide-y divide-gray-100">
                {renewalDue.map((r: RenewalDueItem) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-semibold text-gray-900 capitalize">{r.name}</td>
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
                      <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full">{r.phase}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{r.planType}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {modal}
    </div>
  );
}
