'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { format, addDays, startOfWeek } from 'date-fns';
import { useProjects, useEscalationMails } from '@/hooks/useProjects';
import { segmentOfManager } from '@/lib/segments';
import {
  Loader2, AlertCircle, Star, AlertTriangle, CheckCircle, RotateCcw,
  ClipboardList, Smile, ShieldCheck, Handshake, Phone, Mail, Calendar,
  ChevronDown, ChevronRight, Plus, Trash2, X, Database, type LucideIcon,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Shift = 'DAY' | 'NIGHT';
type LeaderKey = 'ajay' | 'abhishek' | 'ankit';
type LeaderProfile = 'STANDARD' | 'ANKIT';

interface StandardChecks {
  onTime: boolean;        // delivered <= SOW date — good
  fiveStar: boolean;       // 5-star review — good
  escalation: boolean;     // escalation happened — bad
  slaBreach: boolean;      // SLA breach — bad
}

interface AnkitChecks {
  resolved4hr: boolean;        // good
  reopened: boolean;           // bad
  requirementAccurate: boolean; // good
  csat: boolean;                // good
  rcaOnTime: boolean;           // good
  escalationPrevented: boolean; // good
  handoffQuality: boolean;      // good
  callAttendance: boolean;      // good
  escalationMail: boolean;      // bad
}

type Checks = StandardChecks | AnkitChecks;

interface Entry {
  id: string;
  name: string;
  shift: Shift;
  dateField: string;      // SOW date (Ajay/Abhishek) or plain Date (Ankit) — yyyy-mm-dd
  resolvedDate: string;   // yyyy-mm-dd or ''
  checks: Checks;
}

interface LeaderState {
  entries: Entry[];
  cycleStart: string; // yyyy-mm-dd — the date treated as "Week 1, Day 1"
}

// ── Leader config ─────────────────────────────────────────────────────────────

const LEADERS: { key: LeaderKey; label: string; profile: LeaderProfile }[] = [
  { key: 'ajay',     label: 'Ajay',     profile: 'STANDARD' },
  { key: 'abhishek', label: 'Abhishek', profile: 'STANDARD' },
  { key: 'ankit',    label: 'Ankit',    profile: 'ANKIT' },
];

// Ajay/Abhishek lead a whole PMO segment (see frontend/src/lib/segments.ts) —
// their "On Time"/"SLA Breach"/"Escalation" numbers roll up every project in
// that segment, not just ones where they're personally listed as PM. This
// matches how Manager Dashboard already treats them as segment leads.
const LEADER_SEGMENT: Record<'ajay' | 'abhishek', 'SMB' | 'ENT'> = {
  ajay: 'SMB',
  abhishek: 'ENT',
};

// Escalation Mails' `escalationOwner` field uses these exact first names for
// all three leaders (see backend/src/services/escalationMailService.ts).
const LEADER_ESCALATION_OWNER: Record<LeaderKey, string> = {
  ajay: 'Ajay',
  abhishek: 'Abhishek',
  ankit: 'Ankit',
};

interface MetricDef {
  key: string;
  label: string;
  icon: LucideIcon;
  target: number;       // percent
  direction: 'higher' | 'lower'; // whether target is a floor (>=) or ceiling (<=)
  // Whether ticking the checkbox on an entry records a GOOD outcome (e.g. "On
  // Time" happened) or a BAD one (e.g. "SLA Breach" happened). The scorecard %
  // is always "checked ÷ total", so a "bad" metric's percentage is the failure
  // rate and its target is a ceiling — this flag only controls checkbox UI
  // (hint text, tag color) so data entry can't be backwards by accident.
  checkedIsGood: boolean;
  // 'pmo': computed live from real project/escalation-mail records — no manual
  // entry needed and none is possible (the checkbox is disabled in the form).
  // 'manual': no corresponding PMO data exists, so it stays hand-logged.
  source: 'pmo' | 'manual';
}

const STANDARD_METRICS: MetricDef[] = [
  { key: 'onTime',     label: 'On Time',        icon: CheckCircle,    target: 70, direction: 'higher', checkedIsGood: true,  source: 'pmo' },
  { key: 'fiveStar',   label: '5-Star Reviews', icon: Star,           target: 50, direction: 'higher', checkedIsGood: true,  source: 'manual' },
  { key: 'escalation', label: 'Escalation',     icon: AlertTriangle,  target: 5,  direction: 'lower',  checkedIsGood: false, source: 'pmo' },
  { key: 'slaBreach',  label: 'SLA Breach',     icon: AlertCircle,    target: 5,  direction: 'lower',  checkedIsGood: false, source: 'pmo' },
];

const ANKIT_METRICS: MetricDef[] = [
  { key: 'resolved4hr',          label: 'Issue Resolution Rate (≤4hr SLA)', icon: CheckCircle,   target: 90, direction: 'higher', checkedIsGood: true,  source: 'manual' },
  { key: 'reopened',              label: 'Reopen Rate',                      icon: RotateCcw,     target: 5,  direction: 'lower',  checkedIsGood: false, source: 'manual' },
  { key: 'requirementAccurate',   label: 'Requirement Capture Accuracy',     icon: ClipboardList, target: 90, direction: 'higher', checkedIsGood: true,  source: 'manual' },
  { key: 'csat',                  label: 'Customer Satisfaction (CSAT)',     icon: Smile,         target: 90, direction: 'higher', checkedIsGood: true,  source: 'manual' },
  { key: 'rcaOnTime',             label: 'RCA Submission Timeliness (≤24hrs)', icon: ClipboardList, target: 90, direction: 'higher', checkedIsGood: true,  source: 'pmo' },
  { key: 'escalationPrevented',   label: 'Escalation Prevention Rate',       icon: ShieldCheck,   target: 95, direction: 'higher', checkedIsGood: true,  source: 'manual' },
  { key: 'handoffQuality',        label: 'Handoff Quality to CS/Migration',  icon: Handshake,     target: 90, direction: 'higher', checkedIsGood: true,  source: 'manual' },
  { key: 'callAttendance',        label: 'Call Attendance / Responsiveness', icon: Phone,         target: 95, direction: 'higher', checkedIsGood: true,  source: 'manual' },
  { key: 'escalationMail',        label: 'Escalation Mail from Customer/Anthony', icon: Mail,     target: 5,  direction: 'lower',  checkedIsGood: false, source: 'pmo' },
];

const metricsFor = (profile: LeaderProfile): MetricDef[] => profile === 'ANKIT' ? ANKIT_METRICS : STANDARD_METRICS;
const metricDef = (profile: LeaderProfile, key: string): MetricDef | undefined =>
  metricsFor(profile).find((m) => m.key === key);

function defaultChecks(profile: LeaderProfile): Checks {
  if (profile === 'ANKIT') {
    return {
      resolved4hr: true, reopened: false, requirementAccurate: true, csat: true,
      rcaOnTime: true, escalationPrevented: true, handoffQuality: true,
      callAttendance: true, escalationMail: false,
    };
  }
  return { onTime: true, fiveStar: true, escalation: false, slaBreach: false };
}

// ── localStorage persistence ──────────────────────────────────────────────────

const STORAGE_PREFIX = 'pmo_leader_metrics_v1_';

function loadLeaderState(key: LeaderKey): LeaderState {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_PREFIX + key) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.entries)) return parsed;
    }
  } catch { /* corrupt or missing — fall through to default */ }
  return { entries: [], cycleStart: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd') };
}

function saveLeaderState(key: LeaderKey, state: LeaderState) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(state));
  } catch { /* storage full/unavailable — edits stay in memory for this session */ }
}

// ── Date/week helpers ─────────────────────────────────────────────────────────

const fmtDate = (d: string) => {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return d;
  return format(new Date(y, m - 1, day), 'MMM d, yyyy');
};

// Returns 0-based week index (0-3) and day index within week (0-6) relative to
// cycleStart, or null if the date falls before cycleStart or beyond week 4.
function weekOf(dateStr: string, cycleStart: string): number | null {
  if (!dateStr || !cycleStart) return null;
  const [cy, cm, cd] = cycleStart.split('-').map(Number);
  const [dy, dm, dd] = dateStr.split('-').map(Number);
  if (!cy || !dy) return null;
  const start = new Date(cy, cm - 1, cd);
  const target = new Date(dy, dm - 1, dd);
  const diffDays = Math.floor((target.getTime() - start.getTime()) / 86400000);
  if (diffDays < 0 || diffDays >= 28) return null;
  return Math.floor(diffDays / 7);
}

// ── PMO auto-pull ──────────────────────────────────────────────────────────────
// Weekly percentages computed straight from real projects / escalation mails
// for metrics that have a genuine data source — no manual entry involved.

interface PmoWeekStats {
  onTimePct: number | null;
  slaBreachPct: number | null;
  escalationPct: number | null;
  rcaOnTimePct: number | null;
  escalationMailPct: number | null; // share of that leader's escalation mails vs. total mails that week
}

const EMPTY_PMO_WEEK: PmoWeekStats = {
  onTimePct: null, slaBreachPct: null, escalationPct: null, rcaOnTimePct: null, escalationMailPct: null,
};

function computePmoWeeks(
  leaderKey: LeaderKey,
  cycleStart: string,
  allProjects: any[],
  allMails: any[],
): PmoWeekStats[] {
  const weeks: PmoWeekStats[] = [0, 1, 2, 3].map(() => ({ ...EMPTY_PMO_WEEK }));

  if (leaderKey === 'ajay' || leaderKey === 'abhishek') {
    const segment = LEADER_SEGMENT[leaderKey];
    // Projects "due" (plannedEnd) in a given week determine that week's
    // On Time / SLA Breach rate — a project isn't judged until its SOW window
    // for the week has actually passed.
    const segmentProjects = allProjects.filter((p) => segment === (p.segment || segmentOfManager(p.projectManager)));
    for (let w = 0; w < 4; w++) {
      const dueThisWeek = segmentProjects.filter((p) => weekOf((p.plannedEnd || '').slice(0, 10), cycleStart) === w);
      if (dueThisWeek.length > 0) {
        const onTime = dueThisWeek.filter((p) => p.delayStatus === 'NOT_DELAYED').length;
        const breached = dueThisWeek.filter((p) => p.delayStatus === 'DELAYED').length;
        weeks[w].onTimePct = Math.round((onTime / dueThisWeek.length) * 100);
        weeks[w].slaBreachPct = Math.round((breached / dueThisWeek.length) * 100);
      }
      // Escalation % = mails owned by this leader that week, as a share of
      // their segment's total project count (a rough "how much of the book
      // of business needed escalation" reading, not a per-project rate).
      const ownerMailsThisWeek = allMails.filter((m) =>
        m.escalationOwner === LEADER_ESCALATION_OWNER[leaderKey] && weekOf((m.receivedAt || '').slice(0, 10), cycleStart) === w
      );
      if (segmentProjects.length > 0) {
        weeks[w].escalationPct = Math.round((ownerMailsThisWeek.length / segmentProjects.length) * 100);
      }
    }
  }

  if (leaderKey === 'ankit') {
    const ownerMails = allMails.filter((m) => m.escalationOwner === LEADER_ESCALATION_OWNER.ankit);
    for (let w = 0; w < 4; w++) {
      const receivedThisWeek = ownerMails.filter((m) => weekOf((m.receivedAt || '').slice(0, 10), cycleStart) === w);
      if (receivedThisWeek.length > 0) {
        const resolved = receivedThisWeek.filter((m) => m.resolvedAt && m.rca);
        const onTimeRca = resolved.filter((m) => {
          const received = new Date(m.receivedAt).getTime();
          const resolvedAt = new Date(m.resolvedAt).getTime();
          return (resolvedAt - received) <= 24 * 60 * 60 * 1000;
        });
        // RCA timeliness is judged only against mails that have actually been
        // resolved — an open mail hasn't missed the window yet, so counting it
        // as a miss would understate the rate for a week still in progress.
        if (resolved.length > 0) {
          weeks[w].rcaOnTimePct = Math.round((onTimeRca.length / resolved.length) * 100);
        }
      }
      weeks[w].escalationMailPct = allMails.length > 0
        ? Math.round((receivedThisWeek.length / allMails.length) * 100)
        : null;
    }
  }

  return weeks;
}

// Maps a metric's key to the PmoWeekStats field that holds its computed %.
// Only metrics with source: 'pmo' have an entry here.
const PMO_METRIC_FIELD: Partial<Record<string, keyof PmoWeekStats>> = {
  onTime: 'onTimePct',
  slaBreach: 'slaBreachPct',
  escalation: 'escalationPct',
  rcaOnTime: 'rcaOnTimePct',
  escalationMail: 'escalationMailPct',
};

function pmoMetricPct(week: PmoWeekStats, metric: MetricDef): number | null {
  const field = PMO_METRIC_FIELD[metric.key];
  return field ? week[field] : null;
}

// Month-to-date PMO stats = weighted average of the 4 weekly stats, weighted
// by each week's actual sample count so a week with 1 project doesn't count
// as much as a week with 20 — the weekly computers below build the same
// counts, so this re-derives them rather than reusing computePmoWeeks' output
// (which only returns percentages, not the underlying counts).
function computePmoMonthToDate(
  leaderKey: LeaderKey,
  cycleStart: string,
  allProjects: any[],
  allMails: any[],
): PmoWeekStats {
  if (leaderKey === 'ajay' || leaderKey === 'abhishek') {
    const segment = LEADER_SEGMENT[leaderKey];
    const segmentProjects = allProjects.filter((p) => segment === (p.segment || segmentOfManager(p.projectManager)));
    const dueInCycle = segmentProjects.filter((p) => weekOf((p.plannedEnd || '').slice(0, 10), cycleStart) !== null);
    const ownerMailsInCycle = allMails.filter((m) =>
      m.escalationOwner === LEADER_ESCALATION_OWNER[leaderKey] && weekOf((m.receivedAt || '').slice(0, 10), cycleStart) !== null
    );
    return {
      onTimePct: dueInCycle.length > 0 ? Math.round((dueInCycle.filter((p) => p.delayStatus === 'NOT_DELAYED').length / dueInCycle.length) * 100) : null,
      slaBreachPct: dueInCycle.length > 0 ? Math.round((dueInCycle.filter((p) => p.delayStatus === 'DELAYED').length / dueInCycle.length) * 100) : null,
      escalationPct: segmentProjects.length > 0 ? Math.round((ownerMailsInCycle.length / segmentProjects.length) * 100) : null,
      rcaOnTimePct: null,
      escalationMailPct: null,
    };
  }

  const ownerMails = allMails.filter((m) => m.escalationOwner === LEADER_ESCALATION_OWNER.ankit);
  const receivedInCycle = ownerMails.filter((m) => weekOf((m.receivedAt || '').slice(0, 10), cycleStart) !== null);
  const resolvedInCycle = receivedInCycle.filter((m) => m.resolvedAt && m.rca);
  const onTimeRca = resolvedInCycle.filter((m) => (new Date(m.resolvedAt).getTime() - new Date(m.receivedAt).getTime()) <= 24 * 60 * 60 * 1000);
  return {
    onTimePct: null,
    slaBreachPct: null,
    escalationPct: null,
    rcaOnTimePct: resolvedInCycle.length > 0 ? Math.round((onTimeRca.length / resolvedInCycle.length) * 100) : null,
    escalationMailPct: allMails.length > 0 ? Math.round((receivedInCycle.length / allMails.length) * 100) : null,
  };
}

// ── Scorecard math ────────────────────────────────────────────────────────────

function computeMetricPct(entries: Entry[], metric: MetricDef): number | null {
  if (entries.length === 0) return null;
  const hits = entries.filter((e) => Boolean((e.checks as any)[metric.key])).length;
  return Math.round((hits / entries.length) * 100);
}

function meetsTarget(pct: number | null, metric: MetricDef): boolean | null {
  if (pct === null) return null;
  return metric.direction === 'higher' ? pct >= metric.target : pct <= metric.target;
}

// ── Small UI atoms ────────────────────────────────────────────────────────────

function ScoreBadge({ pct, metric }: { pct: number | null; metric: MetricDef }) {
  const met = meetsTarget(pct, metric);
  return (
    <div className={cn(
      'rounded-xl p-4 border flex items-center gap-3',
      met === null ? 'bg-gray-50 border-gray-200' : met ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
    )}>
      <metric.icon size={18} className={met === null ? 'text-gray-400' : met ? 'text-emerald-600' : 'text-red-600'} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 truncate flex items-center gap-1.5">
          {metric.label}
          {metric.source === 'pmo' && (
            <span title="Auto-tracked from PMO data" className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Database size={9} /> Auto
            </span>
          )}
        </p>
        <p className={cn('text-lg font-bold', met === null ? 'text-gray-400' : met ? 'text-emerald-700' : 'text-red-700')}>
          {pct === null ? '—' : `${pct}%`}
          <span className="text-xs font-normal text-gray-400 ml-1">
            / {metric.direction === 'higher' ? '≥' : '≤'}{metric.target}%
          </span>
        </p>
      </div>
    </div>
  );
}

function TargetsBar({ metrics }: { metrics: MetricDef[] }) {
  return (
    <div className="flex flex-wrap gap-2 bg-white rounded-xl border border-gray-200 p-3">
      {metrics.map((m) => (
        <span key={m.key} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200 text-gray-600">
          <m.icon size={12} />
          {m.label}: {m.direction === 'higher' ? '≥' : '≤'}{m.target}%
          {m.source === 'pmo' ? (
            <Database size={10} className="text-indigo-400" />
          ) : null}
        </span>
      ))}
    </div>
  );
}

// ── Add Entry form ────────────────────────────────────────────────────────────

function AddEntryForm({ profile, dateLabel, onAdd, onCancel }: {
  profile: LeaderProfile;
  dateLabel: string;
  onAdd: (entry: Entry) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [shift, setShift] = useState<Shift>('DAY');
  const [dateField, setDateField] = useState('');
  const [resolvedDate, setResolvedDate] = useState('');
  const [checks, setChecks] = useState<Checks>(defaultChecks(profile));

  // Only metrics with no real PMO data source are hand-logged here — the rest
  // are computed live from projects/escalation mails and would just be a
  // second, disconnected source of truth if also editable in this form.
  const allMetrics = metricsFor(profile);
  const metrics = allMetrics.filter((m) => m.source === 'manual');
  const autoMetrics = allMetrics.filter((m) => m.source === 'pmo');

  const toggle = (key: string) => setChecks((c) => ({ ...c, [key]: !(c as any)[key] }));

  const markAllGood = () => {
    const good: Checks = profile === 'ANKIT'
      ? { resolved4hr: true, reopened: false, requirementAccurate: true, csat: true, rcaOnTime: true, escalationPrevented: true, handoffQuality: true, callAttendance: true, escalationMail: false }
      : { onTime: true, fiveStar: true, escalation: false, slaBreach: false };
    setChecks(good);
  };

  const isValid = name.trim() && dateField;

  const submit = () => {
    if (!isValid) return;
    onAdd({
      id: `lm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      shift,
      dateField,
      resolvedDate,
      checks,
    });
  };

  return (
    <div className="bg-white rounded-xl border border-indigo-200 p-5 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ticket / project name…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Shift</label>
          <select value={shift} onChange={(e) => setShift(e.target.value as Shift)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white">
            <option value="DAY">Day (1pm–10pm)</option>
            <option value="NIGHT">Night (9pm–6am)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{dateLabel}</label>
          <input type="date" value={dateField} onChange={(e) => setDateField(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Resolved / Delivered</label>
          <input type="date" value={resolvedDate} onChange={(e) => setResolvedDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400" />
        </div>
      </div>

      {autoMetrics.length > 0 && (
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Database size={12} className="text-indigo-400 flex-shrink-0" />
          {autoMetrics.map((m) => m.label).join(', ')} {autoMetrics.length === 1 ? 'is' : 'are'} tracked automatically from PMO data and don't need to be logged here.
        </p>
      )}

      {metrics.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Checklist</label>
            <button type="button" onClick={markAllGood} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
              Mark all good
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            For metrics marked <span className="font-medium text-red-500">(check if it happened)</span>, ticking the box records the bad outcome — leave it unchecked when things went well.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {metrics.map((m) => (
              <label key={m.key} className={cn(
                'flex items-center gap-2 text-sm px-3 py-2 rounded-lg border cursor-pointer',
                m.checkedIsGood ? 'border-gray-200 hover:bg-gray-50' : 'border-red-100 hover:bg-red-50/40'
              )}>
                <input type="checkbox" checked={Boolean((checks as any)[m.key])} onChange={() => toggle(m.key)} className="rounded" />
                <m.icon size={14} className={cn('flex-shrink-0', m.checkedIsGood ? 'text-gray-400' : 'text-red-400')} />
                <span className="truncate">
                  {m.label}
                  {!m.checkedIsGood && <span className="text-red-400 font-normal"> (check if it happened)</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-100">Cancel</button>
        <button onClick={submit} disabled={!isValid}
          className="px-5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">
          Add Entry
        </button>
      </div>
    </div>
  );
}

// ── Weekly summary table ──────────────────────────────────────────────────────

function WeeklySummaryTable({ entries, metrics, cycleStart, pmoWeeks, pmoMtd }: {
  entries: Entry[];
  metrics: MetricDef[];
  cycleStart: string;
  pmoWeeks?: PmoWeekStats[];
  pmoMtd?: PmoWeekStats;
}) {
  const weeks = [0, 1, 2, 3];
  const byWeek = weeks.map((w) => entries.filter((e) => weekOf(e.dateField, cycleStart) === w));

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500">Metric</th>
              {weeks.map((w) => (
                <th key={w} className="text-center py-2.5 px-4 text-xs font-semibold text-gray-500">Week {w + 1}</th>
              ))}
              <th className="text-center py-2.5 px-4 text-xs font-semibold text-gray-500">Month to date</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => {
              const mtdPct = m.source === 'pmo' && pmoMtd ? pmoMetricPct(pmoMtd, m) : computeMetricPct(entries, m);
              const mtdMet = meetsTarget(mtdPct, m);
              return (
                <tr key={m.key} className="border-b border-gray-100 last:border-0 align-middle">
                  <td className="py-2.5 px-4 min-w-[220px]">
                    <span className="flex items-center gap-2">
                      <m.icon size={14} className="text-gray-400 flex-shrink-0" />
                      <span className="text-gray-700">{m.label}</span>
                      {m.source === 'pmo' && (
                        <span title="Auto-tracked from PMO data"><Database size={11} className="text-indigo-400 flex-shrink-0" /></span>
                      )}
                    </span>
                  </td>
                  {weeks.map((w) => {
                    const pct = m.source === 'pmo' && pmoWeeks ? pmoMetricPct(pmoWeeks[w], m) : computeMetricPct(byWeek[w], m);
                    const met = meetsTarget(pct, m);
                    return (
                      <td key={w} className={cn(
                        'text-center py-2.5 px-4 font-medium',
                        met === null ? 'text-gray-300' : met ? 'text-emerald-600' : 'text-red-600'
                      )}>
                        {pct === null ? '—' : `${pct}%`}
                      </td>
                    );
                  })}
                  <td className={cn(
                    'text-center py-2.5 px-4 font-semibold',
                    mtdMet === null ? 'text-gray-300' : mtdMet ? 'text-emerald-700' : 'text-red-700'
                  )}>
                    {mtdPct === null ? '—' : `${mtdPct}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Daily log (expandable week → day) ─────────────────────────────────────────

function DailyLog({ entries, cycleStart, profile, onDelete }: { entries: Entry[]; cycleStart: string; profile: LeaderProfile; onDelete: (id: string) => void }) {
  const [openWeek, setOpenWeek] = useState<number | null>(0);

  const weeks = [0, 1, 2, 3].map((w) => {
    const weekEntries = entries.filter((e) => weekOf(e.dateField, cycleStart) === w);
    const byDate = new Map<string, Entry[]>();
    for (const e of weekEntries) {
      const list = byDate.get(e.dateField) || [];
      list.push(e);
      byDate.set(e.dateField, list);
    }
    const days = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return { week: w, count: weekEntries.length, days };
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
      {weeks.map(({ week, count, days }) => (
        <div key={week}>
          <button
            onClick={() => setOpenWeek((w) => (w === week ? null : week))}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <span className="flex items-center gap-2">
              {openWeek === week ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Week {week + 1}
            </span>
            <span className="text-xs text-gray-400">{count} {count === 1 ? 'entry' : 'entries'}</span>
          </button>
          {openWeek === week && (
            <div className="px-4 pb-3 space-y-3">
              {days.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">No entries logged this week.</p>
              ) : (
                days.map(([date, dayEntries]) => (
                  <div key={date} className="border border-gray-100 rounded-lg">
                    <p className="text-xs font-semibold text-gray-500 px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
                      {fmtDate(date)}
                    </p>
                    <div className="divide-y divide-gray-50">
                      {dayEntries.map((e) => (
                        <div key={e.id} className="flex items-center justify-between px-3 py-2 text-xs gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-700 truncate">{e.name}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(e.checks).map(([k, v]) => {
                                const def = metricDef(profile, k);
                                // A metric reads as a good outcome when: it's a
                                // "checkedIsGood" metric that's checked, or a
                                // "bad-when-checked" metric that's unchecked.
                                const isGoodOutcome = def ? (def.checkedIsGood ? v : !v) : v;
                                return (
                                  <span key={k} className={cn(
                                    'px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                                    isGoodOutcome ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                                  )}>
                                    {def?.label ?? k}: {v ? 'Yes' : 'No'}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                          <button onClick={() => onDelete(e.id)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Calendar range bar ────────────────────────────────────────────────────────

function CalendarRangeBar({ cycleStart, onChange }: { cycleStart: string; onChange: (date: string) => void }) {
  const [cy, cm, cd] = cycleStart.split('-').map(Number);
  const start = cy ? new Date(cy, cm - 1, cd) : new Date();
  const end = addDays(start, 27);

  return (
    <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3">
      <Calendar size={16} className="text-gray-400 flex-shrink-0" />
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">Week 1, Day 1 starts:</span>
        <input
          type="date"
          value={cycleStart}
          onChange={(e) => onChange(e.target.value)}
          className="border border-gray-200 rounded-lg px-2.5 py-1 text-sm outline-none focus:border-indigo-400"
        />
      </div>
      <span className="text-xs text-gray-400 ml-auto">
        Cycle: {format(start, 'MMM d')} – {format(end, 'MMM d, yyyy')}
      </span>
    </div>
  );
}

// ── Leader panel (per-leader tab content) ─────────────────────────────────────

type LeaderView = 'overview' | 'day' | 'night';

function LeaderPanel({ leaderKey, profile }: { leaderKey: LeaderKey; profile: LeaderProfile }) {
  const [state, setState] = useState<LeaderState>(() => loadLeaderState(leaderKey));
  const [view, setView] = useState<LeaderView>('overview');
  const [showAddForm, setShowAddForm] = useState(false);

  const metrics = metricsFor(profile);
  const dateLabel = profile === 'ANKIT' ? 'Date' : 'SOW Date';

  // PMO-sourced metrics (On Time, SLA Breach, Escalation, RCA Timeliness,
  // Escalation Mail volume) come from real projects/escalation-mail records —
  // fetched at high limit so the segment/owner rollup below sees everything,
  // matching how Manager Dashboard's org-chart view already fetches full lists.
  const { data: projectsResp } = useProjects({ limit: 5000 });
  const { data: mailsResp } = useEscalationMails();
  const allProjects: any[] = (projectsResp as any)?.data ?? [];
  const allMails: any[] = (mailsResp as any)?.data ?? [];

  const pmoWeeks = useMemo(
    () => computePmoWeeks(leaderKey, state.cycleStart, allProjects, allMails),
    [leaderKey, state.cycleStart, allProjects, allMails]
  );
  const pmoMtd = useMemo(
    () => computePmoMonthToDate(leaderKey, state.cycleStart, allProjects, allMails),
    [leaderKey, state.cycleStart, allProjects, allMails]
  );

  const persist = (next: LeaderState) => {
    setState(next);
    saveLeaderState(leaderKey, next);
  };

  const addEntry = (entry: Entry) => {
    persist({ ...state, entries: [entry, ...state.entries] });
    setShowAddForm(false);
  };

  const deleteEntry = (id: string) => {
    persist({ ...state, entries: state.entries.filter((e) => e.id !== id) });
  };

  const setCycleStart = (date: string) => {
    persist({ ...state, cycleStart: date });
  };

  const currentWeek = useMemo(
    () => weekOf(format(new Date(), 'yyyy-MM-dd'), state.cycleStart),
    [state.cycleStart]
  );
  const thisWeekEntries = useMemo(() => {
    if (currentWeek === null) return [];
    return state.entries.filter((e) => weekOf(e.dateField, state.cycleStart) === currentWeek);
  }, [state.entries, state.cycleStart, currentWeek]);
  const pmoThisWeek: PmoWeekStats = currentWeek !== null ? pmoWeeks[currentWeek] : EMPTY_PMO_WEEK;

  // Entries whose date falls outside the current 4-week cycle window don't
  // appear in any week table, the daily log, or the scorecard — without this
  // callout they'd look like silently lost data rather than a cycle-range issue.
  const outOfCycleCount = useMemo(
    () => state.entries.filter((e) => weekOf(e.dateField, state.cycleStart) === null).length,
    [state.entries, state.cycleStart]
  );

  const dayEntries = useMemo(() => state.entries.filter((e) => e.shift === 'DAY'), [state.entries]);
  const nightEntries = useMemo(() => state.entries.filter((e) => e.shift === 'NIGHT'), [state.entries]);

  return (
    <div className="space-y-4">
      <CalendarRangeBar cycleStart={state.cycleStart} onChange={setCycleStart} />
      <TargetsBar metrics={metrics} />

      {outOfCycleCount > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-800">
          <AlertTriangle size={15} className="flex-shrink-0" />
          {outOfCycleCount} {outOfCycleCount === 1 ? 'entry falls' : 'entries fall'} outside the current 4-week cycle window and won't
          appear in the tables below — adjust "Week 1, Day 1 starts" above if this looks wrong.
        </div>
      )}

      {currentWeek === null && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-800">
          <AlertTriangle size={15} className="flex-shrink-0" />
          Today's date falls outside the current cycle — the Overview scorecard below has nothing to show until the cycle start is updated.
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-1 border-b border-gray-200">
          {([
            { key: 'overview' as const, label: 'Overview' },
            { key: 'day' as const, label: 'Day Shift' },
            { key: 'night' as const, label: 'Night Shift' },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition -mb-px',
                view === tab.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
        >
          {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAddForm ? 'Cancel' : 'Add entry'}
        </button>
      </div>

      {showAddForm && (
        <AddEntryForm profile={profile} dateLabel={dateLabel} onAdd={addEntry} onCancel={() => setShowAddForm(false)} />
      )}

      {view === 'overview' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {metrics.map((m) => (
              <ScoreBadge
                key={m.key}
                pct={m.source === 'pmo' ? pmoMetricPct(pmoThisWeek, m) : computeMetricPct(thisWeekEntries, m)}
                metric={m}
              />
            ))}
          </div>
          <WeeklySummaryTable entries={state.entries} metrics={metrics} cycleStart={state.cycleStart} pmoWeeks={pmoWeeks} pmoMtd={pmoMtd} />
        </>
      )}

      {view === 'day' && (
        <>
          {/* PMO-sourced metrics can't be split by shift — projects/escalation
              mails aren't tagged Day/Night — so this view only shows the
              manually-logged metrics for entries recorded on the day shift. */}
          <WeeklySummaryTable entries={dayEntries} metrics={metrics.filter((m) => m.source === 'manual')} cycleStart={state.cycleStart} />
          <DailyLog entries={dayEntries} cycleStart={state.cycleStart} profile={profile} onDelete={deleteEntry} />
        </>
      )}

      {view === 'night' && (
        <>
          <WeeklySummaryTable entries={nightEntries} metrics={metrics.filter((m) => m.source === 'manual')} cycleStart={state.cycleStart} />
          <DailyLog entries={nightEntries} cycleStart={state.cycleStart} profile={profile} onDelete={deleteEntry} />
        </>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ManagerMetricsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [activeLeader, setActiveLeader] = useState<LeaderKey>('ajay');

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

  const currentLeader = LEADERS.find((l) => l.key === activeLeader)!;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Metrics</h1>
        <p className="text-sm text-gray-500 mt-0.5">Leader-level scorecards — logged manually per shift lead</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {LEADERS.map((l) => (
          <button
            key={l.key}
            onClick={() => setActiveLeader(l.key)}
            className={cn(
              'px-5 py-2.5 text-sm font-medium border-b-2 transition -mb-px',
              activeLeader === l.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            {l.label}
          </button>
        ))}
      </div>

      <LeaderPanel key={currentLeader.key} leaderKey={currentLeader.key} profile={currentLeader.profile} />
    </div>
  );
}
