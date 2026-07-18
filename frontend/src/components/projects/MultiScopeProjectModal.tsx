'use client';

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useCreateProject } from '@/hooks/useProjects';
import { useSettings } from '@/context/SettingsContext';
import { X, Loader2 } from 'lucide-react';
import type { PlanType } from '@/types';

const LABEL = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1';
const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white transition-colors';

type ScopeKey = 'Content Migration' | 'Messaging' | 'Email';

const SCOPES: { key: ScopeKey; label: string; textColor: string; ringColor: string; chipBg: string; chipText: string }[] = [
  { key: 'Content Migration', label: 'Content',   textColor: 'text-blue-700',    ringColor: 'ring-blue-400',   chipBg: 'bg-blue-50',    chipText: 'text-blue-700'    },
  { key: 'Messaging',         label: 'Messaging',  textColor: 'text-purple-700',  ringColor: 'ring-purple-400', chipBg: 'bg-purple-50',  chipText: 'text-purple-700'  },
  { key: 'Email',             label: 'Email',      textColor: 'text-emerald-700', ringColor: 'ring-emerald-400',chipBg: 'bg-emerald-50', chipText: 'text-emerald-700' },
];

interface ScopeConfig {
  projectName: string;
  selectedTypes: string[];
  projectManager: string;
  plannedStart: string;
  plannedEnd: string;
}

const makeDefault = (clientName: string, scope: ScopeKey): ScopeConfig => ({
  projectName: clientName ? `${clientName} — ${scope}` : '',
  selectedTypes: [],
  projectManager: '',
  plannedStart: '',
  plannedEnd: '',
});

export function MultiScopeProjectModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [clientName, setClientName]         = useState('');
  const [customerName, setCustomerName]     = useState('');
  const [accountManager, setAccountManager] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<Set<ScopeKey>>(new Set());
  const [scopeConfigs, setScopeConfigs]     = useState<Record<ScopeKey, ScopeConfig>>({
    'Content Migration': makeDefault('', 'Content Migration'),
    'Messaging':         makeDefault('', 'Messaging'),
    'Email':             makeDefault('', 'Email'),
  });
  const [sharedSettings, setSharedSettings] = useState({
    planType: 'BRONZE' as PlanType,
    segment: '' as '' | 'ENT' | 'SMB',
    estimatedCost: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const createProject = useCreateProject();
  const { settings }  = useSettings();

  const typesByCategory = useMemo(() => {
    const map: Record<string, typeof settings.migrationTypes> = {};
    for (const mt of settings.migrationTypes.filter(t => t.enabled)) {
      const cat = mt.category || 'Other';
      if (!map[cat]) map[cat] = [];
      map[cat].push(mt);
    }
    return map;
  }, [settings.migrationTypes]);

  const selectedScopeList = SCOPES.filter(s => selectedScopes.has(s.key));

  function onClientNameChange(name: string) {
    setClientName(name);
    setScopeConfigs(prev => {
      const updated = { ...prev };
      for (const s of SCOPES) {
        if (!prev[s.key].projectName || prev[s.key].projectName === makeDefault(clientName, s.key).projectName) {
          updated[s.key] = { ...prev[s.key], projectName: name ? `${name} — ${s.key}` : '' };
        }
      }
      return updated;
    });
  }

  function toggleScope(scope: ScopeKey) {
    setSelectedScopes(prev => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else {
        next.add(scope);
        setScopeConfigs(p => ({
          ...p,
          [scope]: { ...p[scope], projectName: clientName ? `${clientName} — ${scope}` : p[scope].projectName },
        }));
      }
      return next;
    });
  }

  function updateConfig(scope: ScopeKey, field: keyof ScopeConfig, value: string | string[]) {
    setScopeConfigs(prev => ({ ...prev, [scope]: { ...prev[scope], [field]: value } }));
  }

  function toggleType(scope: ScopeKey, typeName: string) {
    const current = scopeConfigs[scope].selectedTypes;
    const next = current.includes(typeName) ? current.filter(t => t !== typeName) : [...current, typeName];
    updateConfig(scope, 'selectedTypes', next);
  }

  const step1Valid = clientName.trim() && customerName.trim() && accountManager.trim() && selectedScopes.size > 0;
  const step2Valid = selectedScopeList.every(s => {
    const cfg = scopeConfigs[s.key];
    return cfg.projectName.trim() && cfg.selectedTypes.length > 0 && cfg.projectManager.trim() && cfg.plannedStart && cfg.plannedEnd;
  });

  async function handleCreate() {
    setSubmitting(true);
    setSubmitError('');
    try {
      for (const scope of selectedScopeList) {
        const cfg = scopeConfigs[scope.key];
        await createProject.mutateAsync({
          name: cfg.projectName,
          clientName,
          customerName,
          accountManager,
          projectManager: cfg.projectManager,
          migrationTypes: cfg.selectedTypes.join(', '),
          plannedStart: cfg.plannedStart,
          plannedEnd: cfg.plannedEnd,
          planType: sharedSettings.planType,
          segment: sharedSettings.segment || undefined,
          estimatedCost: sharedSettings.estimatedCost ? parseFloat(sharedSettings.estimatedCost) : undefined,
          status: 'ACTIVE',
          phase: 'KICKOFF',
        });
      }
      onClose();
    } catch (err: any) {
      setSubmitError(err?.response?.data?.error || 'Failed to create projects. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const STEPS = ['Client & Scopes', 'Scope Details', 'Shared Settings'];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">New Client Projects</h2>
            <p className="text-xs text-slate-400 mt-0.5">Create multiple migration scopes for one client in one flow</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step bar */}
        <div className="flex items-center gap-0 px-6 py-3 border-b border-gray-100 flex-shrink-0">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
                  step > i + 1 ? 'bg-emerald-500 text-white' : step === i + 1 ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-400'
                }`}>
                  {step > i + 1 ? '✓' : i + 1}
                </div>
                <span className={`text-xs font-medium whitespace-nowrap ${step === i + 1 ? 'text-indigo-700' : 'text-gray-400'}`}>{label}</span>
              </div>
              {i < 2 && <span className="mx-3 text-gray-300 text-xs">›</span>}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Step 1: Client & Scopes ───────────────────────────────── */}
          {step === 1 && (
            <>
              <div className="space-y-4">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Client Information</p>
                <div>
                  <label className={LABEL}>Client / Account Name *</label>
                  <input
                    value={clientName}
                    onChange={e => onClientNameChange(e.target.value)}
                    placeholder="e.g. Peak Mining"
                    className={INPUT}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Customer Contact *</label>
                    <input
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      placeholder="Contact person name"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Account Manager *</label>
                    <input
                      value={accountManager}
                      onChange={e => setAccountManager(e.target.value)}
                      placeholder="AM name"
                      className={INPUT}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Select Migration Scopes *</p>
                <p className="text-xs text-gray-500">Each selected scope becomes a separate project under this client.</p>
                <div className="grid grid-cols-3 gap-3">
                  {SCOPES.map(s => {
                    const selected = selectedScopes.has(s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => toggleScope(s.key)}
                        className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                          selected
                            ? `ring-2 ${s.ringColor} border-transparent bg-white`
                            : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                        }`}
                      >
                        <p className={`font-semibold text-sm mb-0.5 ${selected ? s.textColor : 'text-gray-600'}`}>{s.label}</p>
                        <p className="text-xs text-gray-400">{s.key}</p>
                        <div className={`absolute top-3 right-3 w-4 h-4 rounded border-2 flex items-center justify-center text-[10px] font-bold ${
                          selected ? `${s.chipBg} ${s.chipText} border-current` : 'border-gray-300 bg-white text-transparent'
                        }`}>
                          {selected ? '✓' : ''}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ── Step 2: Per-scope details ─────────────────────────────── */}
          {step === 2 && selectedScopeList.map(scope => {
            const cfg   = scopeConfigs[scope.key];
            const types = typesByCategory[scope.key] || [];
            return (
              <div key={scope.key} className="rounded-xl border border-gray-200 overflow-hidden">
                <div className={`px-4 py-2.5 ${scope.chipBg}`}>
                  <span className={`text-xs font-bold uppercase tracking-wider ${scope.textColor}`}>{scope.label} Scope</span>
                </div>
                <div className="p-4 space-y-3 bg-white">
                  <div>
                    <label className={LABEL}>Project Name *</label>
                    <input
                      value={cfg.projectName}
                      onChange={e => updateConfig(scope.key, 'projectName', e.target.value)}
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Migration Type Combinations * (select all that apply)</label>
                    <div className="grid grid-cols-2 gap-0.5 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-gray-50">
                      {types.length === 0 ? (
                        <p className="col-span-2 text-xs text-gray-400 text-center py-4">No migration types configured for this scope</p>
                      ) : types.map(t => (
                        <label key={t.id} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-white cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={cfg.selectedTypes.includes(t.name)}
                            onChange={() => toggleType(scope.key, t.name)}
                            className="w-3.5 h-3.5 rounded accent-indigo-600"
                          />
                          <span className="text-xs text-gray-700 truncate">{t.name}</span>
                        </label>
                      ))}
                    </div>
                    {cfg.selectedTypes.length > 0 && (
                      <p className="text-xs text-indigo-600 mt-1">{cfg.selectedTypes.length} selected</p>
                    )}
                  </div>
                  <div>
                    <label className={LABEL}>Project Manager *</label>
                    <input
                      value={cfg.projectManager}
                      onChange={e => updateConfig(scope.key, 'projectManager', e.target.value)}
                      placeholder="PM name"
                      className={INPUT}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL}>Planned Start *</label>
                      <input
                        type="date"
                        value={cfg.plannedStart}
                        onChange={e => updateConfig(scope.key, 'plannedStart', e.target.value)}
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Planned End *</label>
                      <input
                        type="date"
                        value={cfg.plannedEnd}
                        onChange={e => updateConfig(scope.key, 'plannedEnd', e.target.value)}
                        className={INPUT}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* ── Step 3: Shared settings + review ─────────────────────── */}
          {step === 3 && (
            <>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Shared Settings</p>
              <p className="text-xs text-gray-500">These settings apply to all {selectedScopes.size} project{selectedScopes.size !== 1 ? 's' : ''} being created.</p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Plan Type *</label>
                  <select
                    value={sharedSettings.planType}
                    onChange={e => setSharedSettings(p => ({ ...p, planType: e.target.value as PlanType }))}
                    className={INPUT}
                  >
                    <option value="BRONZE">Bronze</option>
                    <option value="SILVER">Silver</option>
                    <option value="GOLD">Gold</option>
                    <option value="PLATINUM">Platinum</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Segment</label>
                  <select
                    value={sharedSettings.segment}
                    onChange={e => setSharedSettings(p => ({ ...p, segment: e.target.value as '' | 'ENT' | 'SMB' }))}
                    className={INPUT}
                  >
                    <option value="">Not specified</option>
                    <option value="ENT">Enterprise (ENT)</option>
                    <option value="SMB">SMB</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={LABEL}>Estimated Budget (USD)</label>
                <input
                  type="number"
                  value={sharedSettings.estimatedCost}
                  onChange={e => setSharedSettings(p => ({ ...p, estimatedCost: e.target.value }))}
                  placeholder="e.g. 50000"
                  className={INPUT}
                />
              </div>

              {/* Review card */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-indigo-800 uppercase tracking-wide">Review</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                    {selectedScopes.size} project{selectedScopes.size !== 1 ? 's' : ''} will be created
                  </span>
                </div>
                <div className="text-xs text-indigo-700">
                  <span className="font-medium">Client:</span> {clientName} &nbsp;·&nbsp;
                  <span className="font-medium">Contact:</span> {customerName} &nbsp;·&nbsp;
                  <span className="font-medium">AM:</span> {accountManager}
                </div>
                <div className="space-y-2">
                  {selectedScopeList.map(s => {
                    const cfg = scopeConfigs[s.key];
                    return (
                      <div key={s.key} className="flex items-start gap-2 bg-white/70 rounded-lg px-3 py-2">
                        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold ${s.chipBg} ${s.chipText}`}>{s.label}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{cfg.projectName}</p>
                          <p className="text-xs text-slate-400">{cfg.selectedTypes.length} combo{cfg.selectedTypes.length !== 1 ? 's' : ''} · PM: {cfg.projectManager} · {cfg.plannedStart} → {cfg.plannedEnd}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {submitError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{submitError}</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <button
            onClick={step === 1 ? onClose : () => setStep(s => s - 1)}
            className="px-4 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          {step < 3 ? (
            <button
              disabled={step === 1 ? !step1Valid : !step2Valid}
              onClick={() => setStep(s => s + 1)}
              className="px-5 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="flex items-center gap-1.5 px-5 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating...</>
              ) : (
                `Create ${selectedScopes.size} Project${selectedScopes.size !== 1 ? 's' : ''}`
              )}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
